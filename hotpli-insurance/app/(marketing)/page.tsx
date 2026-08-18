import Link from "next/link";

/** S1 랜딩 — Sprint 4에서 ATMOS 문법으로 본격 구현. 지금은 진입용 최소 화면. */
export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="max-w-sm space-y-6">
        <h1 className="font-display font-bold text-[30px] leading-tight">
          고지사항 분석,
          <br />
          <span className="text-violet">AI가 근거까지</span> 찾아드려요
        </h1>
        <p className="text-[15px] text-ink/55 leading-relaxed">
          심평원 진료이력 PDF만 올리면 고지의무 질문별로
          해당 여부와 근거를 정리해드립니다. 보험설계사를 위한 도구예요.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center grad-violet text-white rounded-full h-13 px-6 font-semibold text-[15px] shadow-deep"
          >
            무료로 시작하기 (3회 제공)
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center bg-white text-ink rounded-full h-13 px-6 font-semibold text-[15px] shadow-soft border border-ink/10"
          >
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
