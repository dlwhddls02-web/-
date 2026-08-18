import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { FILE_KIND_LABEL, type Analysis, type FileKind } from "@/types";

const KINDS: FileKind[] = ["basic", "detail", "prescription"];

/** S3 진행 화면 — Sprint 1: 저장 확인까지. 파이프라인 진행 표시는 Sprint 2에서. */
export default async function ProgressPage({
  params,
}: PageProps<"/analyze/[id]/progress">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("analyses")
    .select("id, customer_name, status, file_path, files, created_at")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const analysis = data as Pick<
    Analysis,
    "id" | "customer_name" | "status" | "file_path" | "files" | "created_at"
  >;
  const files = analysis.files ?? {};
  const savedCount = KINDS.filter((k) => files[k]).length;
  const saved = savedCount > 0 || !!analysis.file_path;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-[22px]">분석 진행</h1>
        <p className="text-[14px] text-ink/50">
          {analysis.customer_name || "이름 미입력"} ·{" "}
          {new Date(analysis.created_at).toLocaleDateString("ko-KR")}
        </p>
      </header>

      <Card className="space-y-4 py-6">
        <div className="text-center">
          <StatusBadge status={analysis.status} />
        </div>

        {saved ? (
          <>
            <p className="text-[15px] font-semibold text-center">
              파일 {savedCount || 1}개가 안전하게 저장됐어요
            </p>
            <ul className="space-y-2">
              {KINDS.map((kind) => (
                <li
                  key={kind}
                  className="flex items-center justify-between rounded-inner bg-canvas px-4 py-3"
                >
                  <span className="text-[14px] font-medium">
                    {FILE_KIND_LABEL[kind]}
                  </span>
                  {files[kind] ? (
                    <span className="text-[13px] font-semibold text-violet">
                      저장됨 ✓
                    </span>
                  ) : (
                    <span className="text-[13px] text-ink/35">미제출</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-ink/45 text-center">
              분석 파이프라인(파싱 → 판정)은 Sprint 2에서 연결됩니다.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-warn font-medium text-center">
            파일 저장이 완료되지 않았어요. 업로드를 다시 시도해주세요.
          </p>
        )}
      </Card>
    </div>
  );
}
