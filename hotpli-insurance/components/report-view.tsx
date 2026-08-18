import { Card } from "@/components/ui/card";
import { VerdictBadge } from "@/components/verdict-badge";
import { QUESTIONS } from "@/lib/judge/questions";
import type { Analysis, Evidence, Judgment, Verdict } from "@/types";

const questionLabel = (key: string) =>
  QUESTIONS.find((q) => q.key === key)?.label ?? key;

export function finalVerdictOf(j: Judgment): Verdict {
  return j.final_verdict ?? j.ai_verdict;
}

export function sortJudgments(judgments: Judgment[]): Judgment[] {
  return [...judgments].sort(
    (a, b) =>
      QUESTIONS.findIndex((q) => q.key === a.question_key) -
      QUESTIONS.findIndex((q) => q.key === b.question_key),
  );
}

/**
 * 리포트 본문 — 설계사용 리포트(S4)와 고객 공유 페이지가 함께 쓴다.
 * showEvidence=false면 근거 원문(진료 상세)을 숨긴다 (고객 공유용 기본).
 */
export function ReportView({
  analysis,
  judgments,
  showEvidence = true,
}: {
  analysis: Pick<
    Analysis,
    | "customer_name"
    | "customer_birth"
    | "parsed_rows"
    | "detected_kcd"
    | "created_at"
    | "status"
  >;
  judgments: Judgment[];
  showEvidence?: boolean;
}) {
  const sorted = sortJudgments(judgments);
  const counts = {
    yes: sorted.filter((j) => finalVerdictOf(j) === "yes").length,
    no: sorted.filter((j) => finalVerdictOf(j) === "no").length,
    needs_check: sorted.filter((j) => finalVerdictOf(j) === "needs_check")
      .length,
  };

  return (
    <div className="space-y-6">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="!p-3 py-4">
          <p className="font-display font-bold text-[26px] text-violet">
            {counts.yes}
          </p>
          <p className="text-[12px] text-ink/50">해당</p>
        </Card>
        <Card className="!p-3 py-4">
          <p className="font-display font-bold text-[26px]">{counts.no}</p>
          <p className="text-[12px] text-ink/50">비해당</p>
        </Card>
        <Card className="!p-3 py-4">
          <p className="font-display font-bold text-[26px] text-warn">
            {counts.needs_check}
          </p>
          <p className="text-[12px] text-ink/50">확인 필요</p>
        </Card>
      </div>

      {/* 질문별 판정 */}
      <div className="space-y-4">
        {sorted.map((j) => {
          const verdict = finalVerdictOf(j);
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

              {showEvidence && evidence.length > 0 && (
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
      {showEvidence &&
        analysis.detected_kcd &&
        analysis.detected_kcd.length > 0 && (
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
