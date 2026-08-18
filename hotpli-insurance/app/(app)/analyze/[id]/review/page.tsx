import { Card } from "@/components/ui/card";

/** S5 확인·수정 — Sprint 3 구현 예정 (설계사 확정 플로우) */
export default async function ReviewPage({
  params,
}: PageProps<"/analyze/[id]/review">) {
  await params;
  return (
    <Card className="text-center py-10 space-y-2">
      <p className="text-[15px] font-semibold">확인·수정</p>
      <p className="text-[13px] text-ink/45">Sprint 3에서 구현 예정이에요.</p>
    </Card>
  );
}
