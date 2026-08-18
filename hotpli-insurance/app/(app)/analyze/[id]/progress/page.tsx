import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import type { Analysis } from "@/types";

/** S3 진행 화면 — Sprint 1: 저장 확인까지. 파이프라인 진행 표시는 Sprint 2에서. */
export default async function ProgressPage({
  params,
}: PageProps<"/analyze/[id]/progress">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("analyses")
    .select("id, customer_name, status, file_path, created_at")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const analysis = data as Pick<
    Analysis,
    "id" | "customer_name" | "status" | "file_path" | "created_at"
  >;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-[22px]">분석 진행</h1>
        <p className="text-[14px] text-ink/50">
          {analysis.customer_name || "이름 미입력"} ·{" "}
          {new Date(analysis.created_at).toLocaleDateString("ko-KR")}
        </p>
      </header>

      <Card className="space-y-4 text-center py-8">
        <StatusBadge status={analysis.status} />
        {analysis.file_path ? (
          <>
            <p className="text-[15px] font-semibold">
              PDF가 안전하게 저장됐어요
            </p>
            <p className="text-[13px] text-ink/45">
              분석 파이프라인(파싱 → 판정)은 Sprint 2에서 연결됩니다.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-warn font-medium">
            파일 저장이 완료되지 않았어요. 업로드를 다시 시도해주세요.
          </p>
        )}
      </Card>
    </div>
  );
}
