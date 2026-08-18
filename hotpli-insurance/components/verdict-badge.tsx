import type { Verdict } from "@/types";

/** 판정 배지 — violet=해당, ink=비해당, warn=확인필요 (색 규칙 고정) */
const styles: Record<Verdict, { label: string; cls: string }> = {
  yes: { label: "해당", cls: "grad-violet text-white" },
  no: { label: "비해당", cls: "bg-ink/5 text-ink/60" },
  needs_check: { label: "확인 필요", cls: "bg-warn/10 text-warn" },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const s = styles[verdict] ?? styles.needs_check;
  return (
    <span
      className={`inline-flex items-center rounded-full px-3.5 py-1 text-[13px] font-bold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
