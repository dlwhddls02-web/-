# Supabase 설정 (Sprint 1)

## 1. 새 프로젝트 생성
supabase.com 대시보드에서 새 프로젝트 생성 (기존 supabase-lifegame 계정에 추가).

## 2. 스키마 적용
대시보드 → SQL Editor → `migrations/0001_init.sql` 전체를 붙여넣고 Run.
(테이블 4개 + RLS 정책 + 프로필 자동생성 트리거 + 비공개 Storage 버킷 `analyses`까지 한 번에 생성된다)

## 3. 키 복사
대시보드 → Settings → API에서 아래 값을 `.env.local`에 채운다:

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon public key
- `SUPABASE_SERVICE_ROLE_KEY` — service_role key (서버 전용, 절대 노출 금지)

## 4. 이메일 인증 설정 (선택)
Authentication → Providers → Email은 기본 활성.
개발 중 메일 확인 없이 바로 로그인하려면 "Confirm email"을 끄면 된다.
켜 둔 경우 확인 메일 링크는 `/auth/confirm` 라우트가 처리한다 —
Authentication → URL Configuration에서 Site URL(`http://localhost:3000` 또는 배포 URL)을 맞춰줄 것.

## 5. 카카오 로그인 (키 발급 후)
1. 카카오 개발자 앱 등록 → REST API 키 + Client Secret 발급
2. Authentication → Providers → Kakao 활성화, 키 입력
3. 카카오 앱의 Redirect URI에 `https://<프로젝트>.supabase.co/auth/v1/callback` 등록
4. 코드 쪽은 `/auth/callback` 라우트가 이미 준비되어 있음 — 로그인 페이지의 카카오 버튼 활성화만 하면 된다
