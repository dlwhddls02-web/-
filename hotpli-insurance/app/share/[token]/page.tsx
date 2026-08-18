/** 공유 리포트 (비로그인, 만료형) — Sprint 4 구현 예정 */
export default async function SharePage({
  params,
}: PageProps<"/share/[token]">) {
  await params;
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="bg-white rounded-card shadow-soft px-8 py-10 text-center space-y-2 max-w-sm">
        <p className="text-[15px] font-semibold">공유 리포트</p>
        <p className="text-[13px] text-ink/45">Sprint 4에서 구현 예정이에요.</p>
      </div>
    </div>
  );
}
