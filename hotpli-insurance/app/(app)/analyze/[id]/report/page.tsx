import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { VerdictBadge } from "@/components/verdict-badge";
import { QUESTIONS } from "@/lib/judge/questions";
import type { Analysis, Evidence, Judgment, Verdict } from "@/types";

const questionLabel = (key: string) =>
  QUESTIONS.find((q) => q.key === key)?.label ?? key;

/** S4 리포트 — 확정(또는 AI) 판정을 근거 원문과 함께 보여준다 */
export default async function ReportPage({
  params,
}: PageProps<"/analyze/[id]/report">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: analysisData } = await supabase
    .from("analyses")
    .select(
      "id, customer_name, customer_birth, status, parsed_rows, detected_kcd, created_at, confirmed_at",
    )
    .eq("id", id)
    .single();
  if (!analysisData) notFound();
  const analysis = analysisData as unknown as Analysis;

  const { data: judgmentsData } = await supabase
    .from("judgments")
    .select(
      "id, question_key, ai_verdict, ai_evidence, ai_reasoning, final_verdict, final_memo, decided_by",
    )
    .eq("analysis_id", id);
  const judgments = ((judgmentsData ?? []) as unknown as Judgment[]).sort(
    (a, b) =>
      QUESTIONS.findIndex((q) => q.key === a.question_key) -
      QUESTIONS.findIndex((q) => q.key === b.question_key),
  );

  const finalOf = (j: Judgment): Verdict => j.final_verdict ?? j.ai_verdict;
  const counts = {
    yes: judgments.filter((j) => finalOf(j) === "yes").length,
    no: judgments.filter((j) => finalOf(j) === "no").length,
    needs_check: judgments.filter((j) => finalOf(j) === "needs_check").length,
  };
  const confirmed = analysis.status === "confirmed";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display font-bold text-[22px]">고지사항 리포트</h1>
        <div className="flex items-center gap-2 text-[14px] text-ink/50">
          <span>
            {analysis.customer_name || "이름 미입력"}
            {analysis.customer_birth && ` (${analysis.customer_birth})`} ·{" "}
            {new Date(analysis.created_at).toLocaleDateString("ko-KR")}
          </span>
          <StatusBadge status={analysis.status} />
        </div>
        {analysis.parsed_rows != null && (
          <p className="text-[13px] text-ink/45">
            진료 기록 {analysis.parsed_rows}건 분석
            {analysis.detected_kcd &&
              ` · 질환 코드 ${analysis.detected_kcd.length}종 발견`}
          </p>
        )}
      </header>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="py-4 !p-3">
          <p className="font-display font-bold text-[26px] text-violet">
            {counts.yes}
          </p>
          <p className="text-[12px] text-ink/50">해당</p>
        </Card>
        <Card className="py-4 !p-3">
          <p className="font-display font-bold text-[26px]">{counts.no}</p>
          <p className="text-[12px] text-ink/50">비해당</p>
        </Card>
        <Card className="py-4 !p-3">
          <p className="font-display font-bold text-[26px] text-warn">
            {counts.needs_check}
          </p>
          <p className="text-[12px] text-ink/50">확인 필요</p>
        </Card>
      </div>

      {!confirmed && judgments.length > 0 && (
        <Card className="!py-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-warn font-medium">
            아직 설계사 확정 전이에요
          </p>
          <Link
            href={`/analyze/${id}/review`}
            className="shrink-0 text-[13px] font-bold text-violet"
          >
            확인·수정하기 →
          </Link>
        </Card>
      )}

      {/* 질문별 판정 */}
      <div className="space-y-4">
        {judgments.map((j) => {
          const verdict = finalOf(j);
          const edited =
            j.final_verdict != null && j.final_verdict !== j.ai_verdict;
          const evidence = (j.ai_evidence ?? []) as Evidence[];
          return (
            <Card key={j.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-semibold leading-snug">
                  {questionLabel(j.question_key)}
                </p>
                <VerdictBadge verdict={verdict} />
              </div>

              {j.ai_reasoning && (
                <p className="text-[13px] text-ink/55 leading-relaxed">
                  {j.ai_reasoning}
                  <span className="text-ink/35">
                    {" "}
                    · {j.decided_by === "ai" ? "AI 판정" : "규칙 판정"}
                    {edited && " · 설계사 수정"}
                  </span>
                </p>
              )}

              {j.final_memo && (
                <p className="text-[13px] rounded-inner bg-canvas px-4 py-2.5">
                  <span className="font-semibold">설계사 메모</span> ·{" "}
                  {j.final_memo}
                </p>
              )}

              {evidence.length > 0 && (
                <details className="rounded-inner bg-canvas px-4 py-3">
                  <summary className="text-[13px] font-semibold text-violet cursor-pointer">
                    근거 원문 {evidence.length}건 보기
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {evidence.map((e, i) => (
                      <li key={i} className="text-[12px] leading-relaxed">
                        <span className="font-semibold">{e.date}</span>
                        {" · "}
                        <span>{e.provider}</span>
                        <span className="text-ink/40">
                          {" "}
                          (원문 {e.sourceRow}행)
                        </span>
                        <p className="text-ink/55 break-all">{e.detail}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
      </div>

      {/* 발견 질환 요약 */}
      {analysis.detected_kcd && analysis.detected_kcd.length > 0 && (
        <Card className="space-y-3">
          <p className="text-[13px] font-semibold text-ink/60">
            발견된 질환 코드
          </p>
          <ul className="space-y-1.5">
            {analysis.detected_kcd.slice(0, 12).map((k) => (
              <li
                key={k.code}
                className="flex items-baseline justify-between text-[13px]"
              >
                <span>
                  <span className="font-semibold">{k.name}</span>{" "}
                  <span className="text-ink/40">{k.code}</span>
                </span>
                <span className="text-ink/45 text-[12px]">
                  {k.count}회 · {k.firstDate}~{k.lastDate}
                </span>
              </li>
            ))}
            {analysis.detected_kcd.length > 12 && (
              <li className="text-[12px] text-ink/40">
                외 {analysis.detected_kcd.length - 12}종
              </li>
            )}
          </ul>
        </Card>
      )}

      <p className="text-[11px] text-ink/35 leading-relaxed px-1">
        본 리포트는 심평원 진료이력 기반 참고 자료이며, 고지 여부의 최종 판단과
        책임은 설계사와 계약자에게 있습니다. 진료 데이터는 암호화된 비공개
        저장소에 보관됩니다.
      </p>
    </div>
  );
}
