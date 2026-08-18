import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full h-12 rounded-full border border-ink/10 bg-white px-5 text-[15px] text-ink placeholder:text-ink/35 outline-none focus:border-violet-soft focus:ring-2 focus:ring-violet-soft/25 ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-ink/60 px-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[12px] text-ink/40 px-1">{hint}</span>}
    </label>
  );
}
