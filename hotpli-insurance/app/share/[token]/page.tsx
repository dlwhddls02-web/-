import { createAdminClient } from "@/lib/supabase/admin";
import { ReportView } from "@/components/report-view";
import type { Analysis, Judgment } from "@/types";

export const runtime = "nodejs";

function ExpiredNotice({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="bg-white rounded-card shadow-soft px-8 py-10 text-center space-y-2 max-w-sm">
        <p className="text-[26px]">⏳</p>
        <p className="text-[15px] font-semibold">{message}</p>
        <p className="text-[13px] text-ink/45">
          담당 설계사에게 새 링크를 요청해주세요.
        </p>
      </div>
    </div>
  );
}

/**
 * 공유 리포트 (비로그인, 만료형).
 * 토큰 검증 후 service role로 조회 — RLS 밖이므로 검증 순서가 곧 보안이다.
 * 고객용이므로 근거 원문(진료 상세)은 숨기고 판정 요약만 보여준다.
 */
export default async function SharePage({
  params,
}: PageProps<"/share/[token]">) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("share_links")
    .select("analysis_id, expires_at, revoked")
    .eq("token", token)
    .single();

  if (!link || link.revoked) {
    return <ExpiredNotice message="유효하지 않은 링크예요" />;
  }
  // 서버 컴포넌트의 요청 시점 만료 검사 (렌더 순수성 규칙 예외)
  // eslint-disable-next-line react-hooks/purity
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return <ExpiredNotice message="링크 유효기간이 지났어요" />;
  }

  const { data: analysisData } = await admin
    .from("analyses")
    .select(
      "customer_name, customer_birth, parsed_rows, detected_kcd, created_at, status",
    )
    .eq("id", link.analysis_id)
    .single();
  if (!analysisData) {
    return <ExpiredNotice message="리포트를 찾을 수 없어요" />;
  }
  const analysis = analysisData as unknown as Analysis;

  const { data: judgmentsData } = await admin
    .from("judgments")
    .select(
      "id, question_key, ai_verdict, ai_evidence, ai_reasoning, final_verdict, final_memo, decided_by",
    )
    .eq("analysis_id", link.analysis_id);

  return (
    <div className="flex-1">
      <main className="mx-auto w-full max-w-md px-5 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="font-display font-bold text-[22px]">
            고지사항 확인 리포트
          </h1>
          <p className="text-[14px] text-ink/50">
            {analysis.customer_name || "고객"}님 ·{" "}
            {new Date(analysis.created_at).toLocaleDateString("ko-KR")} 분석
          </p>
          <p className="text-[12px] text-ink/40">
            링크 유효기간 {new Date(link.expires_at).toLocaleDateString("ko-KR")}
            까지
          </p>
        </header>

        <ReportView
          analysis={analysis}
          judgments={(judgmentsData ?? []) as unknown as Judgment[]}
          showEvidence={false}
        />
      </main>
    </div>
  );
}
