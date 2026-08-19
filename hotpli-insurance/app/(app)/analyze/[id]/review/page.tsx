"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EvidenceList } from "@/components/evidence-list";
import { VerdictBadge } from "@/components/verdict-badge";
import { QUESTIONS } from "@/lib/judge/questions";
import type { Evidence, Verdict } from "@/types";

interface JudgmentItem {
  id: string;
  question_key: string;
  ai_verdict: Verdict;
  ai_evidence: Evidence[] | null;
  ai_reasoning: string | null;
  final_verdict: Verdict | null;
  final_memo: string | null;
  decided_by: string | null;
}

const VERDICT_OPTIONS: { value: Verdict; label: string }[] = [
  { value: "yes", label: "해당" },
  { value: "no", label: "비해당" },
  { value: "needs_check", label: "확인 필요" },
];

const questionLabel = (key: string) =>
  QUESTIONS.find((q) => q.key === key)?.label ?? key;

/** S5 확인·수정 — AI 판정을 근거와 함께 검토하고 설계사가 확정한다 */
export default function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [judgments, setJudgments] = useState<JudgmentItem[]>([]);
  const [selections, setSelections] = useState<Record<string, Verdict>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/analyses/${id}`);
      if (!res.ok) {
        setError("분석 건을 불러올 수 없어요.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      const items: JudgmentItem[] = data.judgments ?? [];
      // 질문 정의 순서대로 정렬
      items.sort(
        (a, b) =>
          QUESTIONS.findIndex((q) => q.key === a.question_key) -
          QUESTIONS.findIndex((q) => q.key === b.question_key),
      );
      setJudgments(items);
      const sel: Record<string, Verdict> = {};
      const memo: Record<string, string> = {};
      for (const j of items) {
        sel[j.id] = j.final_verdict ?? j.ai_verdict;
        memo[j.id] = j.final_memo ?? "";
      }
      setSelections(sel);
      setMemos(memo);
      setLoading(false);
    })();
  }, [id]);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/analyses/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        judgments: judgments.map((j) => ({
          id: j.id,
          final_verdict: selections[j.id],
          final_memo: memos[j.id] || null,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("확정 저장에 실패했어요. 다시 시도해주세요.");
      return;
    }
    router.push(`/analyze/${id}/report`);
  }

  if (loading) {
    return (
      <Card className="text-center py-10">
        <p className="text-[14px] text-ink/45">불러오는 중…</p>
      </Card>
    );
  }

  if (judgments.length === 0) {
    return (
      <Card className="text-center py-10 space-y-2">
        <p className="text-[15px] font-semibold">아직 판정 결과가 없어요</p>
        <p className="text-[13px] text-ink/45">
          분석이 끝나면 여기서 확인·수정할 수 있습니다.
        </p>
      </Card>
    );
  }

  const changedCount = judgments.filter(
    (j) => selections[j.id] !== j.ai_verdict,
  ).length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-[22px]">확인·수정</h1>
        <p className="text-[14px] text-ink/50">
          AI 판정을 근거와 함께 확인하고, 필요하면 수정한 뒤 확정하세요
        </p>
      </header>

      <div className="space-y-4">
        {judgments.map((j) => {
          const changed = selections[j.id] !== j.ai_verdict;
          return (
            <Card key={j.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-semibold leading-snug">
                  {questionLabel(j.question_key)}
                </p>
                <VerdictBadge verdict={j.ai_verdict} />
              </div>

              {j.ai_reasoning && (
                <p className="text-[13px] text-ink/55 leading-relaxed">
                  {j.ai_reasoning}
                  <span className="text-ink/35">
                    {" "}
                    · {j.decided_by === "ai" ? "AI 판정" : "규칙 판정"}
                  </span>
                </p>
              )}

              {(j.ai_evidence?.length ?? 0) > 0 && (
                <details className="rounded-inner bg-canvas px-4 py-3">
                  <summary className="text-[13px] font-semibold text-violet cursor-pointer">
                    근거 {j.ai_evidence!.length}건 보기
                  </summary>
                  <EvidenceList evidence={j.ai_evidence!} />
                </details>
              )}

              {/* 설계사 확정값 선택 */}
              <div className="flex gap-2">
                {VERDICT_OPTIONS.map((opt) => {
                  const active = selections[j.id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setSelections((s) => ({ ...s, [j.id]: opt.value }))
                      }
                      className={`flex-1 rounded-full py-2 text-[13px] font-semibold border transition-colors ${
                        active
                          ? opt.value === "needs_check"
                            ? "bg-warn/10 text-warn border-warn/40"
                            : opt.value === "yes"
                              ? "grad-violet text-white border-transparent"
                              : "bg-ink/80 text-white border-transparent"
                          : "bg-white text-ink/45 border-ink/10"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {changed && (
                <p className="text-[12px] text-warn font-medium px-1">
                  AI 판정({VERDICT_OPTIONS.find((o) => o.value === j.ai_verdict)?.label})과
                  다르게 수정했어요
                </p>
              )}

              <input
                value={memos[j.id] ?? ""}
                onChange={(e) =>
                  setMemos((m) => ({ ...m, [j.id]: e.target.value }))
                }
                placeholder="메모 (선택) — 수정 이유, 고객 확인 내용 등"
                className="w-full h-10 rounded-full border border-ink/10 bg-white px-4 text-[13px] outline-none focus:border-violet-soft"
              />
            </Card>
          );
        })}
      </div>

      {error && (
        <p className="text-[13px] text-warn font-medium px-1">{error}</p>
      )}

      <div className="space-y-2">
        {changedCount > 0 && (
          <p className="text-[13px] text-ink/50 text-center">
            {changedCount}개 항목을 AI 판정과 다르게 수정했어요
          </p>
        )}
        <Button onClick={handleConfirm} disabled={saving} className="w-full">
          {saving ? "저장 중…" : "이대로 확정하기"}
        </Button>
      </div>
    </div>
  );
}
