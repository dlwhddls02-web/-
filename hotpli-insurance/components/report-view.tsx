import { Card } from "@/components/ui/card";
import { VerdictBadge } from "@/components/verdict-badge";
import { QUESTIONS } from "@/lib/judge/questions";
import type { HealthSummary } from "@/lib/report/summary";
import type { Analysis, Evidence, Judgment, Verdict } from "@/types";

const questionLabel = (key: string) =>
  QUESTIONS.find((q) => q.key === key)?.label ?? key;

/** 질환 중심 보기에서 쓰는 짧은 질문 이름 */
const SHORT_LABEL: Record<string, string> = {
  q_3m_medication: "3개월 진료",
  q_3m_drug: "약물 복용",
  q_1y_recheck: "재검사",
  q_5y_hospitalization: "입원",
  q_5y_surgery: "수술",
  q_5y_long_treatment: "장기치료·투약",
  q_5y_major_disease: "10대 질병",
};

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
  summary,
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
  summary?: HealthSummary | null;
  showEvidence?: boolean;
}) {
  const sorted = sortJudgments(judgments);
  const counts = {
    yes: sorted.filter((j) => finalVerdictOf(j) === "yes").length,
    no: sorted.filter((j) => finalVerdictOf(j) === "no").length,
    needs_check: sorted.filter((j) => finalVerdictOf(j) === "needs_check")
      .length,
  };

  const stats = summary?.stats;

  return (
    <div className="space-y-6">
      {/* 병력 요약 — 판정 전에 전체 그림부터 */}
      {stats && (
        <Card className="space-y-3">
          <p className="text-[13px] font-semibold text-ink/60">병력 요약</p>
          {summary?.aiSummary && (
            <p className="text-[14px] leading-relaxed">{summary.aiSummary}</p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-inner bg-canvas py-2.5">
              <p className="font-display font-bold text-[18px]">
                {stats.totalRows}
              </p>
              <p className="text-[11px] text-ink/45">진료 기록</p>
            </div>
            <div className="rounded-inner bg-canvas py-2.5">
              <p className="font-display font-bold text-[18px]">
                {stats.diseaseCount}
              </p>
              <p className="text-[11px] text-ink/45">질환 코드</p>
            </div>
            <div className="rounded-inner bg-canvas py-2.5">
              <p
                className={`font-display font-bold text-[18px] ${stats.hospitalizationCount > 0 ? "text-violet" : ""}`}
              >
                {stats.hospitalizationCount}
              </p>
              <p className="text-[11px] text-ink/45">입원</p>
            </div>
          </div>
          {stats.firstDate && stats.lastDate && (
            <p className="text-[12px] text-ink/45">
              조회 기간 {stats.firstDate} ~ {stats.lastDate}
            </p>
          )}
          {stats.topDiseases.length > 0 && (
            <p className="text-[13px] leading-relaxed">
              <span className="text-ink/45">주요 질환 · </span>
              {stats.topDiseases
                .map((d) => `${d.name} ${d.count}회`)
                .join(", ")}
            </p>
          )}
          {stats.topDrugs.length > 0 && (
            <p className="text-[13px] leading-relaxed">
              <span className="text-ink/45">주요 약물 · </span>
              {stats.topDrugs.map((d) => d.name).join(", ")}
            </p>
          )}
        </Card>
      )}

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

      {/* 질환 중심 보기: 질환별로 어떤 고지 질문에 걸리는지 */}
      {summary?.diseaseMap && summary.diseaseMap.length > 0 && (
        <Card className="space-y-3">
          <p className="text-[13px] font-semibold text-ink/60">
            질환별 고지 관련
          </p>
          <ul className="space-y-2.5">
            {summary.diseaseMap.map((d) => (
              <li key={d.code} className="space-y-1">
                <p className="text-[14px] font-semibold">
                  {d.name}{" "}
                  <span className="text-[12px] text-ink/40 font-normal">
                    {d.code}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {d.questionKeys.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center rounded-full bg-violet-soft/10 text-violet px-2.5 py-0.5 text-[11px] font-semibold"
                    >
                      {SHORT_LABEL[k] ?? k}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 질병 위험 참고 — 설계사용 화면에서만 */}
      {showEvidence &&
        summary?.risk &&
        summary.risk.items.length > 0 && (
          <Card className="space-y-3">
            <p className="text-[13px] font-semibold text-ink/60">
              함께 살펴볼 질환 연관성{" "}
              <span className="font-normal text-ink/35">(참고용)</span>
            </p>
            <ul className="space-y-2.5">
              {summary.risk.items.map((item) => (
                <li key={item.name} className="rounded-inner bg-canvas px-4 py-3">
                  <p className="text-[13px] font-semibold">
                    {item.name}{" "}
                    <span className="text-[11px] text-ink/40 font-normal">
                      {item.relatedCodes.join(", ")} ·{" "}
                      {item.source === "ai" ? "AI 분석" : "일반 연관성"}
                    </span>
                  </p>
                  <p className="text-[12px] text-ink/55 leading-relaxed">
                    {item.basedOn} 병력 기준 — {item.reason}
                  </p>
                </li>
              ))}
            </ul>
            {summary.risk.aiNote && (
              <p className="text-[12px] text-ink/55 leading-relaxed">
                {summary.risk.aiNote}
              </p>
            )}
            <p className="text-[11px] text-warn/90 leading-relaxed">
              위 내용은 일반적으로 알려진 질환 연관성 정보이며, 의학적
              진단·예측이 아닙니다. 보장 설계 참고 용도로만 사용하세요.
            </p>
          </Card>
        )}

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
