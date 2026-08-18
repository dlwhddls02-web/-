import Link from "next/link";

const FEATURES = [
  {
    icon: "📄",
    title: "PDF만 올리면 끝",
    desc: "심평원 진료이력 3종을 올리면 비밀번호 해제부터 분석까지 자동으로",
  },
  {
    icon: "🔍",
    title: "근거까지 보여주는 판정",
    desc: "고지 질문별 해당/비해당을 진료 원문 근거와 함께 — 날짜·기간 계산은 100% 코드로",
  },
  {
    icon: "✅",
    title: "설계사가 최종 확정",
    desc: "AI가 애매하면 '확인 필요'로 정직하게 표시하고, 마지막 판단은 설계사가",
  },
  {
    icon: "🔗",
    title: "고객에게 바로 전달",
    desc: "확정한 리포트를 만료형 링크로 공유 — 고객에겐 요약만, 상세는 비공개",
  },
] as const;

/** S1 랜딩 — 정식 브랜딩(ATMOS 문법)은 서비스명 확정 후 확장 */
export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center px-6 py-16">
      <div className="max-w-sm w-full space-y-10">
        <div className="text-center space-y-5">
          <h1 className="font-display font-bold text-[30px] leading-tight">
            고지사항 분석,
            <br />
            <span className="text-violet">AI가 근거까지</span> 찾아드려요
          </h1>
          <p className="text-[15px] text-ink/55 leading-relaxed">
            심평원 진료이력 PDF만 올리면 고지의무 질문별로 해당 여부와 근거를
            정리해드립니다. 보험설계사를 위한 도구예요.
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

        <ul className="space-y-3">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="bg-white rounded-card shadow-soft p-5 flex gap-4"
            >
              <span className="text-[24px] leading-none">{f.icon}</span>
              <div className="space-y-1">
                <p className="text-[15px] font-semibold">{f.title}</p>
                <p className="text-[13px] text-ink/50 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-ink/35 text-center leading-relaxed">
          진료 데이터는 암호화된 비공개 저장소에만 보관되며, 분석 목적 외에
          사용하지 않습니다.
        </p>
      </div>
    </div>
  );
}
