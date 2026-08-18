@AGENTS.md

# 프로젝트: hotpli-insurance (서비스명 미정, 코드명) — 보험설계사용 AI 고지사항 분석

## 절대 규칙
- (주)바틀/보비의 코드·프롬프트·DB·디자인 자산을 참조하거나 재현하지 않는다
- 날짜·횟수·기간 계산은 코드로만. AI에게 산수 시키지 않는다
- AI 판정은 3-상태(yes/no/needs_check) + evidence 필수. 확신 없으면 needs_check
- 진료 데이터는 민감정보: 로그에 남기지 않고, Storage는 비공개 버킷만

## 디자인 (화면설계 v3 확정)
- 색: violet #0825C6→#6B6CE0 (주 행동+해당 판정), ink #12141F, bg #F3F4FA,
  warn #C26A09 (확인필요·경고 전용 — 다른 색 추가 금지)
- 폰트: Gmarket Sans(제목·큰 숫자), Pretendard(본문·UI)
- 라운드: 모달 40px > 카드 22px > 내부 16px > 버튼·인풋·배지 9999px
- 그림자: 소프트 2단. 집중 요소만 딥. 카드는 흰색, 배경 위에 떠 있게
- 모바일(360px) 우선 → 데스크톱 확장

## 스택
Next.js App Router + TS + Tailwind v4 + Supabase + Claude API + Vercel

## 구현 메모 (이 레포의 결정사항)
- Next.js 16: `middleware.ts`는 deprecated → 루트 `proxy.ts` 사용 (세션 갱신 + 라우트 보호)
- 디자인 토큰: `app/globals.css`의 `@theme` + `lib/design/tokens.ts` (동기 유지)
- PDF 비밀번호 해제: `@jspawn/qpdf-wasm` (서버리스 호환 WASM). 시스템 qpdf 바이너리에 의존하지 않는다.
  wasm 파일은 `next.config.ts`의 `outputFileTracingIncludes` + `serverExternalPackages`로 배포에 포함
- DB 스키마: `supabase/migrations/0001_init.sql` — Supabase SQL Editor에 그대로 적용 (적용법: `supabase/README.md`)
- 업로드는 심평원 자료 3종 슬롯: 기본진료내역(basic, 필수) / 세부진료정보(detail) / 처방조제정보(prescription).
  `analyses.files` jsonb에 kind→경로 맵 저장, 3종은 같은 비밀번호 하나로 일괄 해제
- Storage 버킷 `analyses` (비공개). 경로 규칙: `{user_id}/{analysis_id}/{kind}.pdf` — RLS가 첫 폴더=auth.uid()만 허용
- 카카오 로그인: 키 발급 전까지 버튼 비활성. 발급 후 Supabase Auth Provider 설정 + `/auth/callback` 사용
- 명령: `npm run dev` / `npm run build` / `npm run lint`
