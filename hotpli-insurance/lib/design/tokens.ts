/**
 * 화면설계 v3 디자인 토큰 (확정) — app/globals.css의 @theme와 동기 유지.
 * 색 추가 금지: warn은 "확인필요·경고" 전용이다.
 */
export const tokens = {
  color: {
    violet: "#0825C6", // 주 행동(그라데이션 시작) + "해당" 판정
    violetSoft: "#6B6CE0", // 그라데이션 끝
    ink: "#12141F", // 본문 텍스트
    canvas: "#F3F4FA", // 페이지 배경
    warn: "#C26A09", // 확인필요·경고 전용
    white: "#FFFFFF", // 카드 표면
  },
  gradient: {
    violet: "linear-gradient(135deg, #0825C6 0%, #6B6CE0 100%)",
  },
  font: {
    display: '"Gmarket Sans", "Pretendard Variable", Pretendard, sans-serif', // 제목·큰 숫자
    sans: '"Pretendard Variable", Pretendard, sans-serif', // 본문·UI
  },
  radius: {
    modal: 40,
    card: 22,
    inner: 16,
    pill: 9999, // 버튼·인풋·배지
  },
  shadow: {
    soft: "0 2px 8px rgb(18 20 31 / 0.05), 0 10px 28px rgb(18 20 31 / 0.07)",
    deep: "0 8px 20px rgb(8 37 198 / 0.22), 0 20px 48px rgb(18 20 31 / 0.14)",
  },
  breakpoint: {
    mobile: 360, // 모바일 우선 기준 폭
  },
} as const;
