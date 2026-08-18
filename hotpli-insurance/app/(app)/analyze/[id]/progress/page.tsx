"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnalysisStatus, DetectedKcd, Verdict } from "@/types";

interface JudgmentRow {
  question_key: string;
  ai_verdict: Verdict;
}

interface AnalysisState {
  id: string;
  customer_name: string | null;
  status: AnalysisStatus;
  parsed_rows: number | null;
  detected_kcd: DetectedKcd[] | null;
  created_at: string;
  judgments: JudgmentRow[];
}

const STEPS: { key: string; label: string; activeOn: AnalysisStatus[] }[] = [
  { key: "upload", label: "파일 저장", activeOn: [] },
  { key: "parsing", label: "문서 읽는 중", activeOn: ["parsing"] },
  { key: "judging", label: "고지사항 판정 중", activeOn: ["judging"] },
];

function stepState(
  stepIndex: number,
  status: AnalysisStatus,
): "done" | "active" | "pending" {
  const order: Record<AnalysisStatus, number> = {
    uploaded: 0,
    parsing: 1,
    judging: 2,
    needs_review: 3,
    confirmed: 3,
  };
  const current = order[status] ?? 0;
  if (stepIndex < current) return "done";
  if (stepIndex === current) return "active";
  return "pending";
}

/** S3 진행 화면 — 업로드 직후 자동으로 파이프라인을 시작하고 상태를 폴링한다 */
export default function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const startJudge = useCallback(async () => {
    const res = await fetch(`/api/analyses/${id}/judge`, { method: "POST" });
    if (res.ok) {
      const body = await res.json();
      if (body.warning) setWarning(body.warning);
    } else {
      setError("분석 실행에 실패했어요. 아래 버튼으로 다시 시도해주세요.");
    }
  }, [id]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      const res = await fetch(`/api/analyses/${id}`);
      if (stopped) return;
      if (!res.ok) {
        setError("분석 건을 불러올 수 없어요.");
        return;
      }
      const data: AnalysisState = await res.json();
      setAnalysis(data);

      // 업로드 상태로 머물러 있으면 파이프라인 자동 시작 (1회)
      if (data.status === "uploaded" && !startedRef.current) {
        startedRef.current = true;
        void startJudge();
      }

      if (data.status !== "needs_review" && data.status !== "confirmed") {
        timer = setTimeout(tick, 2500);
      }
    }

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, startJudge]);

  if (!analysis) {
    return (
      <Card className="text-center py-10">
        <p className="text-[14px] text-ink/45">불러오는 중…</p>
      </Card>
    );
  }

  const done =
    analysis.status === "needs_review" || analysis.status === "confirmed";
  const counts = {
    yes: analysis.judgments.filter((j) => j.ai_verdict === "yes").length,
    no: analysis.judgments.filter((j) => j.ai_verdict === "no").length,
    needs_check: analysis.judgments.filter((j) => j.ai_verdict === "needs_check")
      .length,
  };
  const noData = done && (analysis.parsed_rows ?? 0) === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-[22px]">분석 진행</h1>
        <p className="text-[14px] text-ink/50">
          {analysis.customer_name || "이름 미입력"} ·{" "}
          {new Date(analysis.created_at).toLocaleDateString("ko-KR")}
        </p>
      </header>

      <Card className="space-y-5 py-6">
        <div className="text-center">
          <StatusBadge status={analysis.status} />
        </div>

        {/* 단계 표시 */}
        <ul className="space-y-3">
          {STEPS.map((step, i) => {
            const state = done ? "done" : stepState(i, analysis.status);
            return (
              <li key={step.key} className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
                    state === "done"
                      ? "grad-violet text-white"
                      : state === "active"
                        ? "bg-violet-soft/15 text-violet animate-pulse"
                        : "bg-ink/5 text-ink/30"
                  }`}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span
                  className={`text-[14px] ${
                    state === "pending" ? "text-ink/35" : "font-semibold"
                  }`}
                >
                  {step.label}
                </span>
                {step.key === "parsing" &&
                  analysis.parsed_rows != null &&
                  analysis.parsed_rows > 0 && (
                    <span className="ml-auto font-display font-bold text-[15px] text-violet">
                      {analysis.parsed_rows}건 인식
                    </span>
                  )}
              </li>
            );
          })}
        </ul>

        {noData && (
          <p className="text-[13px] text-warn font-medium text-center">
            {warning === "scanned_pdf"
              ? "스캔본 PDF는 아직 지원 준비 중이에요. 심평원에서 받은 원본 PDF로 다시 시도해주세요."
              : "진료 기록을 인식하지 못했어요. 파일이 심평원 원본인지 확인해주세요."}
          </p>
        )}

        {done && !noData && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-inner bg-violet/5 py-3">
                <p className="font-display font-bold text-[22px] text-violet">
                  {counts.yes}
                </p>
                <p className="text-[12px] text-ink/50">해당</p>
              </div>
              <div className="rounded-inner bg-canvas py-3">
                <p className="font-display font-bold text-[22px]">{counts.no}</p>
                <p className="text-[12px] text-ink/50">비해당</p>
              </div>
              <div className="rounded-inner bg-warn/10 py-3">
                <p className="font-display font-bold text-[22px] text-warn">
                  {counts.needs_check}
                </p>
                <p className="text-[12px] text-ink/50">확인 필요</p>
              </div>
            </div>

            {analysis.detected_kcd && analysis.detected_kcd.length > 0 && (
              <p className="text-[13px] text-ink/50 text-center">
                발견된 질환 코드 {analysis.detected_kcd.length}종 —{" "}
                {analysis.detected_kcd
                  .slice(0, 3)
                  .map((k) => k.name)
                  .join(", ")}
                {analysis.detected_kcd.length > 3 && " 외"}
              </p>
            )}

            <Link href={`/analyze/${id}/review`} className="block">
              <Button className="w-full">판정 결과 확인·수정하기</Button>
            </Link>
          </div>
        )}

        {error && (
          <div className="space-y-3 text-center">
            <p className="text-[13px] text-warn font-medium">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                void startJudge();
              }}
            >
              다시 시도
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
