import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 h-13 font-semibold text-[15px] transition-opacity disabled:opacity-40 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  // 주 행동: 바이올렛 그라데이션 + 딥 섀도우 (집중 요소)
  primary: "grad-violet text-white shadow-deep active:opacity-90",
  secondary: "bg-white text-ink shadow-soft border border-ink/10 active:opacity-80",
  ghost: "text-ink/60 hover:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
