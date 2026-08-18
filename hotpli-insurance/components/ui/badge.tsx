import type { AnalysisStatus } from "@/types";

/** 상태 배지 — warn 색은 "확인필요" 계열 전용 */
const statusStyle: Record<AnalysisStatus, { label: string; cls: string }> = {
  uploaded: { label: "업로드됨", cls: "bg-ink/5 text-ink/60" },
  parsing: { label: "분석 중", cls: "bg-violet-soft/10 text-violet" },
  judging: { label: "판정 중", cls: "bg-violet-soft/10 text-violet" },
  needs_review: { label: "확인 필요", cls: "bg-warn/10 text-warn" },
  confirmed: { label: "확정됨", cls: "bg-violet/10 text-violet" },
};

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const s = statusStyle[status] ?? statusStyle.uploaded;
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
