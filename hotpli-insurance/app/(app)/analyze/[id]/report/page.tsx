import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ReportView } from "@/components/report-view";
import { ReportActions } from "@/components/report-actions";
import type { Analysis, Judgment } from "@/types";

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
  const judgments = (judgmentsData ?? []) as unknown as Judgment[];
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

      <ReportActions analysisId={id} confirmed={confirmed} />

      {!confirmed && judgments.length > 0 && (
        <Card className="!py-3 flex items-center justify-between gap-3 print:hidden">
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

      <ReportView analysis={analysis} judgments={judgments} />
    </div>
  );
}
