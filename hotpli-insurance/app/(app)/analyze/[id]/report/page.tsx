import { Card } from "@/components/ui/card";

/** S4 리포트 — Sprint 3 구현 예정 (근거 원문 연결 포함) */
export default async function ReportPage({
  params,
}: PageProps<"/analyze/[id]/report">) {
  await params;
  return (
    <Card className="text-center py-10 space-y-2">
      <p className="text-[15px] font-semibold">리포트</p>
      <p className="text-[13px] text-ink/45">Sprint 3에서 구현 예정이에요.</p>
    </Card>
  );
}
