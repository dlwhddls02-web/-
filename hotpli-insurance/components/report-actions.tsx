"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** 리포트 상단 액션 — 공유 링크 발급(확정 후) + 인쇄/PDF 저장 */
export function ReportActions({
  analysisId,
  confirmed,
}: {
  analysisId: string;
  confirmed: boolean;
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createShareLink() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "not_confirmed"
          ? "확정한 뒤에 공유할 수 있어요."
          : "공유 링크 발급에 실패했어요.",
      );
      return;
    }
    const { url } = await res.json();
    const full = `${window.location.origin}${url}`;
    setShareUrl(full);
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex gap-2">
        {confirmed && (
          <Button
            onClick={createShareLink}
            disabled={loading}
            className="flex-1"
          >
            {loading ? "발급 중…" : "고객에게 공유 링크 보내기"}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => window.print()}
          className={confirmed ? "shrink-0" : "flex-1"}
        >
          인쇄 · PDF 저장
        </Button>
      </div>

      {shareUrl && (
        <div className="rounded-inner bg-canvas px-4 py-3 space-y-1">
          <p className="text-[12px] font-semibold text-violet">
            {copied ? "링크가 복사됐어요! (유효기간 7일)" : "공유 링크 (유효기간 7일)"}
          </p>
          <p className="text-[12px] text-ink/55 break-all select-all">
            {shareUrl}
          </p>
          <p className="text-[11px] text-ink/40">
            고객에게는 판정 요약만 보이고, 진료 상세 내역은 보이지 않아요.
          </p>
        </div>
      )}
      {error && (
        <p className="text-[13px] text-warn font-medium px-1">{error}</p>
      )}
    </div>
  );
}
