import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractText } from "@/lib/pdf/extract";
import { parseHira, type TreatmentRow } from "@/lib/pdf/parse-hira";
import { matchKcd } from "@/lib/kcd/match";
import { judgeByRules } from "@/lib/judge/rules";
import { judgeByAi, isAiConfigured } from "@/lib/judge/ai";
import { QUESTIONS } from "@/lib/judge/questions";
import type { AnalysisFiles, FileKind } from "@/types";

export const runtime = "nodejs";
// 파싱 + AI 판정까지 수 분 걸릴 수 있음
export const maxDuration = 300;

const STORAGE_BUCKET = "analyses";
const KIND_ORDER: FileKind[] = ["basic", "detail", "prescription"];

/**
 * 분석 파이프라인 실행: Storage의 PDF → 추출 → 파싱 → KCD → 룰 판정 → (필요시) AI 판정.
 * 재실행 가능(멱등): judgments는 (analysis_id, question_key) 기준 upsert.
 * 진료 데이터는 민감정보 — 내용을 로그에 남기지 않는다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, status, files, created_at")
    .eq("id", id)
    .single();
  if (!analysis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const files = (analysis.files ?? {}) as AnalysisFiles;
  if (!files.basic) {
    return NextResponse.json({ error: "no_files" }, { status: 400 });
  }

  await supabase.from("analyses").update({ status: "parsing" }).eq("id", id);

  // 1) 파일별 추출 + 파싱 (sourceRow는 전체 문서 기준으로 이어짐)
  const allRows: TreatmentRow[] = [];
  let scannedFiles = 0;
  let presentFiles = 0;
  for (const kind of KIND_ORDER) {
    const path = files[kind];
    if (!path) continue;
    presentFiles++;

    const { data: blob, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(path);
    if (downloadError || !blob) {
      await supabase.from("analyses").update({ status: "uploaded" }).eq("id", id);
      return NextResponse.json(
        { error: "storage_error", slot: kind },
        { status: 500 },
      );
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let extracted;
    try {
      extracted = await extractText(bytes);
    } catch {
      await supabase.from("analyses").update({ status: "uploaded" }).eq("id", id);
      return NextResponse.json(
        { error: "extract_failed", slot: kind },
        { status: 500 },
      );
    }
    if (extracted.isScanned) {
      scannedFiles++;
      continue;
    }
    const parsed = parseHira(extracted.lines, kind, allRows.length);
    allRows.push(...parsed.rows);
  }

  // 2) 인식 결과가 없으면 판정하지 않는다 (기록 없음 ≠ 비해당 단정 금지)
  if (allRows.length === 0) {
    await supabase
      .from("analyses")
      .update({ status: "needs_review", parsed_rows: 0 })
      .eq("id", id);
    return NextResponse.json({
      id,
      parsedRows: 0,
      warning: scannedFiles === presentFiles ? "scanned_pdf" : "no_rows",
    });
  }

  // 3) KCD 집계 + 상태 갱신
  const detectedKcd = matchKcd(allRows);
  await supabase
    .from("analyses")
    .update({
      status: "judging",
      parsed_rows: allRows.length,
      detected_kcd: detectedKcd,
    })
    .eq("id", id);

  // 4) 룰 판정 (기간·횟수 계산은 전부 코드) → 애매 케이스만 AI
  const baseDate = new Date(analysis.created_at);
  const ruleResults = judgeByRules(allRows, baseDate);

  const judgments = [];
  for (const rule of ruleResults) {
    let final = {
      verdict: rule.verdict,
      evidence: rule.evidence,
      reasoning: rule.reasoning,
      decidedBy: "rule" as string,
    };

    if (rule.verdict === "needs_check" && rule.candidateRows.length > 0) {
      const question = QUESTIONS.find((q) => q.key === rule.questionKey)!;
      try {
        const ai = await judgeByAi(question, rule.candidateRows);
        if (ai) {
          final = {
            verdict: ai.verdict,
            evidence: ai.evidence.length > 0 ? ai.evidence : rule.evidence,
            reasoning: ai.reasoning,
            decidedBy: "ai",
          };
        } else if (!isAiConfigured()) {
          final.reasoning += " (AI 미설정 — 설계사 직접 확인 필요)";
        }
      } catch {
        // AI 실패 시 룰의 needs_check 유지 — 판정을 잃지 않는다
        final.reasoning += " (AI 판정 실패 — 설계사 직접 확인 필요)";
      }
    }

    judgments.push({
      analysis_id: id,
      question_key: rule.questionKey,
      ai_verdict: final.verdict,
      ai_evidence: final.evidence,
      ai_reasoning: final.reasoning,
      decided_by: final.decidedBy,
    });
  }

  // 재실행 멱등 저장: 기존 행은 update, 없는 질문만 insert
  // (unique 인덱스 없이도 동작 — migrations/0003은 선택 사항)
  const { data: existing } = await supabase
    .from("judgments")
    .select("id, question_key")
    .eq("analysis_id", id);
  const existingByKey = new Map(
    (existing ?? []).map((e) => [e.question_key as string, e.id as string]),
  );

  for (const j of judgments) {
    const existingId = existingByKey.get(j.question_key);
    const { error: saveError } = existingId
      ? await supabase
          .from("judgments")
          .update({
            ai_verdict: j.ai_verdict,
            ai_evidence: j.ai_evidence,
            ai_reasoning: j.ai_reasoning,
            decided_by: j.decided_by,
          })
          .eq("id", existingId)
      : await supabase.from("judgments").insert(j);
    if (saveError) {
      await supabase
        .from("analyses")
        .update({ status: "uploaded" })
        .eq("id", id);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
  }

  await supabase
    .from("analyses")
    .update({ status: "needs_review" })
    .eq("id", id);

  return NextResponse.json({
    id,
    parsedRows: allRows.length,
    kcdCount: detectedKcd.length,
    verdicts: {
      yes: judgments.filter((j) => j.ai_verdict === "yes").length,
      no: judgments.filter((j) => j.ai_verdict === "no").length,
      needs_check: judgments.filter((j) => j.ai_verdict === "needs_check").length,
    },
  });
}
