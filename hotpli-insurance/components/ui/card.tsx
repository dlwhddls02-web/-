import type { HTMLAttributes } from "react";

/** 카드: 흰색 표면 22px 라운드, 배경 위에 소프트 섀도우로 떠 있게 */
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white rounded-card shadow-soft p-5 ${className}`}
      {...props}
    />
  );
}
