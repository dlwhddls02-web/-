import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { Evidence, Verdict } from "@/types";
import type { QuestionDef } from "./questions";

/**
 * Claude 판정 — 룰이 못 정한 needs_check 케이스만 담당.
 * 원칙:
 * - Structured Output(zod)으로만 받는다. 자유 텍스트 파싱 금지
 * - 산수 금지: 기간 필터는 rules.ts가 끝냈고, AI는 후보 행의 "해석"만 한다
 * - evidence(원문 행 번호) 없는 yes는 무효 → needs_check로 강등
 * - 확신 없으면 needs_check
 * - 진료 데이터는 민감정보: 프롬프트/응답을 로그에 남기지 않는다
 */
export interface AiJudgment {
  questionKey: string;
  verdict: Verdict;
  evidence: Evidence[];
  reasoning: string;
  decidedBy: "ai";
}

const ResultSchema = z.object({
  verdict: z.enum(["yes", "no", "needs_check"]),
  /** 근거가 된 행의 sourceRow 번호들 — yes/no 판단의 근거 행 */
  evidenceRows: z.array(z.number().int()),
  /** 판단 이유 (한국어, 2문장 이내) */
  reasoning: z.string(),
});

const SYSTEM = `너는 한국 보험설계사의 고지의무 확인을 돕는 분석 보조다.
심평원 진료이력에서 추출된 행들을 보고, 주어진 고지 질문에 해당하는지 판단한다.

규칙:
1. 날짜·기간·횟수 계산은 이미 시스템이 끝냈다. 너는 계산하지 말고 행의 "내용 해석"만 한다.
2. 판정은 yes(해당) / no(비해당) / needs_check(설계사 확인 필요) 셋 중 하나다.
3. yes 또는 no로 판단하려면 반드시 근거 행 번호(evidenceRows)를 제시해야 한다.
4. 기록만으로 확신할 수 없으면 반드시 needs_check를 반환한다. 추측으로 yes/no를 만들지 않는다.
5. 고객에게 불리한 오판(누락)이 가장 위험하다. 애매하면 needs_check.`;

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function rowsToPromptTable(rows: TreatmentRow[]): string {
  return rows
    .map(
      (r) =>
        `[행 ${r.sourceRow}] ${r.date} | ${r.category || "구분미상"} | ${
          r.provider || "기관미상"
        } | ${r.detail}`,
    )
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* 병력 요약 + 질병 위험 참고 (판정과 분리 — 해석·요약만 AI가 담당)      */
/* ------------------------------------------------------------------ */

export interface RiskAiInput {
  diseases: { code: string; name: string; count: number }[];
  drugs: { name: string; count: number }[];
  hospitalizationCount: number;
  /** 룰 매칭으로 이미 나온 연관질환명 (중복 생성 방지) */
  existingRiskNames: string[];
}

const SummarySchema = z.object({
  /** 2~3문장 한국어 병력 요약 */
  summary: z.string(),
});

const RiskAiSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string(), // 연관 질환명
        reason: z.string(), // 이 고객의 어떤 병력과 연관되는지 1문장
        relatedCodes: z.array(z.string()), // 대표 KCD 코드
        basedOn: z.string(), // 근거가 된 보유 질환/약물
      }),
    )
    .max(3),
  note: z.string(), // 전체 병력 맥락 1~2문장 (없으면 빈 문자열)
});

/** 집계된 병력 통계로 2~3문장 요약 생성. 키 없으면 null. */
export async function summarizeHistoryByAi(
  input: RiskAiInput,
): Promise<string | null> {
  if (!isAiConfigured()) return null;
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 1000,
    system:
      "너는 보험설계사가 고객 병력의 전체 그림을 빠르게 파악하도록 돕는 요약가다. 주어진 집계(질환·약물·입원 횟수)만 근거로 한국어 2~3문장으로 요약하라. 숫자를 새로 계산하지 말고 주어진 값만 언급하라. 의학적 진단·단정 표현은 금지.",
    messages: [
      {
        role: "user",
        content: `주요 질환: ${input.diseases.map((d) => `${d.name}(${d.count}회)`).join(", ") || "없음"}
주요 약물: ${input.drugs.map((d) => d.name).join(", ") || "없음"}
입원 기록: ${input.hospitalizationCount}건`,
      },
    ],
    output_config: { format: zodOutputFormat(SummarySchema) },
  });
  return response.parsed_output?.summary ?? null;
}

/**
 * 질병 위험 "참고" 항목 — 룰 매칭이 0건이어도 AI가 병력 기반으로 직접 생성(폴백),
 * 룰 매칭이 있으면 맥락 노트만 보강. 의학적 진단이 아님을 전제로 한다.
 */
export async function riskReportByAi(
  input: RiskAiInput,
): Promise<{ items: z.infer<typeof RiskAiSchema>["items"]; note: string } | null> {
  if (!isAiConfigured() || input.diseases.length === 0) return null;
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 1500,
    system: `너는 보험설계사에게 "현재 병력과 관련해 함께 살펴볼 만한 질환 연관성 정보"를 제공하는 보조다.
규칙:
1. 위험도 수치·확률·예측 표현 금지. "연관이 알려져 있다" 수준의 일반 의학 상식만.
2. 반드시 이 고객의 보유 질환/약물(basedOn)과 연결해서 설명한다. 근거 없는 항목 금지.
3. 이미 제시된 연관질환(existing)과 중복 금지. 추가할 것이 없으면 items를 비워라.
4. 진단·처방·치료 권고 금지. 이것은 의학적 진단이 아니다.`,
    messages: [
      {
        role: "user",
        content: `보유 질환: ${input.diseases.map((d) => `${d.name}[${d.code}]`).join(", ")}
복용 약물: ${input.drugs.map((d) => d.name).join(", ") || "정보 없음"}
입원: ${input.hospitalizationCount}건
이미 제시된 연관질환(existing): ${input.existingRiskNames.join(", ") || "없음"}

추가로 살펴볼 연관 질환(최대 3개)과 전체 병력 맥락 노트를 제시하라.`,
      },
    ],
    output_config: { format: zodOutputFormat(RiskAiSchema) },
  });
  const parsed = response.parsed_output;
  if (!parsed) return null;
  return { items: parsed.items, note: parsed.note };
}

/**
 * needs_check 질문 1건을 Claude로 판정.
 * candidateRows는 rules.ts가 기간 필터를 끝낸 행들이다.
 */
export async function judgeByAi(
  question: QuestionDef,
  candidateRows: TreatmentRow[],
): Promise<AiJudgment | null> {
  if (!isAiConfigured() || candidateRows.length === 0) return null;

  // 프롬프트 크기 제한: 최근 기록 우선 (재검 권고 등은 최근 기록에 있을 확률이 높다)
  const MAX_ROWS = 120;
  if (candidateRows.length > MAX_ROWS) {
    candidateRows = [...candidateRows]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, MAX_ROWS);
  }

  const client = new Anthropic();

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `고지 질문: "${question.label}"
(조회 기간 ${question.windowMonths}개월 — 아래 행들은 이미 기간 내로 필터된 것만이다)

진료 기록:
${rowsToPromptTable(candidateRows)}

이 기록이 위 질문에 해당하는지 판정하라.`,
      },
    ],
    output_config: { format: zodOutputFormat(ResultSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) return null;

  const byRow = new Map(candidateRows.map((r) => [r.sourceRow, r]));
  const evidence: Evidence[] = parsed.evidenceRows
    .map((n) => byRow.get(n))
    .filter((r): r is TreatmentRow => !!r)
    .map((r) => ({
      date: r.date,
      provider: r.provider || "기관명 미상",
      detail: r.detail,
      sourceRow: r.sourceRow,
    }));

  // evidence 없는 확정 판정은 무효 — needs_check로 강등
  const verdict: Verdict =
    parsed.verdict !== "needs_check" && evidence.length === 0
      ? "needs_check"
      : parsed.verdict;

  return {
    questionKey: question.key,
    verdict,
    evidence,
    reasoning: parsed.reasoning,
    decidedBy: "ai",
  };
}
