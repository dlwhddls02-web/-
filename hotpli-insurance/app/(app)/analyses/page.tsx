import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import type { Analysis } from "@/types";

/** S6 이력 홈 — Sprint 1에서는 목록만, 카드 상세는 Sprint 3에서 확장 */
export default async function AnalysesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("analyses")
    .select("id, customer_name, status, parsed_rows, created_at")
    .order("created_at", { ascending: false });

  const analyses = (data ?? []) as Pick<
    Analysis,
    "id" | "customer_name" | "status" | "parsed_rows" | "created_at"
  >[];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-[22px]">분석 이력</h1>
        <p className="text-[14px] text-ink/50">
          진행 중이거나 완료된 분석을 확인하세요
        </p>
      </header>

      {analyses.length === 0 ? (
        <Card className="text-center py-10 space-y-3">
          <p className="text-[26px]">🗂️</p>
          <p className="text-[15px] font-semibold">아직 분석 이력이 없어요</p>
          <p className="text-[13px] text-ink/45">
            고객의 진료이력 PDF를 올려 첫 분석을 시작해보세요
          </p>
          <Link
            href="/analyze/new"
            className="inline-flex items-center justify-center grad-violet text-white rounded-full px-6 h-12 font-semibold text-[15px] shadow-deep"
          >
            새 분석 시작
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {analyses.map((a) => (
            <li key={a.id}>
              <Link
                href={
                  a.status === "confirmed"
                    ? `/analyze/${a.id}/report`
                    : a.status === "needs_review"
                      ? `/analyze/${a.id}/review`
                      : `/analyze/${a.id}/progress`
                }
              >
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold truncate">
                      {a.customer_name || "이름 미입력"}
                    </p>
                    <p className="text-[12px] text-ink/40">
                      {new Date(a.created_at).toLocaleDateString("ko-KR")}
                      {a.parsed_rows != null && ` · ${a.parsed_rows}건 인식`}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
