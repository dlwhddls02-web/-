"use client";

import { useRouter } from "next/navigation";

/** 상단 뒤로가기 — 이전 화면으로, 히스토리가 없으면 이력 홈으로 */
export function BackButton({ fallback = "/analyses" }: { fallback?: string }) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="뒤로가기"
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft border border-ink/5 text-ink/70 active:opacity-70 print:hidden"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
