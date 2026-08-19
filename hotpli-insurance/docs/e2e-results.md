# 클라우드 E2E 테스트 결과 (2026-08-19)

## 상태: `network_blocked`

클라우드 세션 컨테이너의 네트워크 정책이 `*.supabase.co`로의 아웃바운드 연결을
차단하고 있어 E2E 테스트를 진행할 수 없었다.

## 확인 내역

- 검사 명령: `curl -sS -o /dev/null -w "%{http_code}" https://ncvgnxucotbbkhvxttcz.supabase.co/auth/v1/health`
- 결과: `curl: (56) CONNECT tunnel failed, response 403` (2회 반복 확인, 3초 간격)
- 에이전트 프록시 상태 조회 결과: `connect_rejected — gateway answered 403 to CONNECT
  (policy denial or upstream failure)`, host `ncvgnxucotbbkhvxttcz.supabase.co:443`
- 판단: 프록시 게이트웨이의 정책 거부. DEV-STATUS.md에는 "네트워크 정책은 사용자가
  설정→기능에서 완화함 — 새 세션 컨테이너부터 적용됨"이라 기록되어 있으나,
  이 세션 컨테이너(2026-08-19 02:53 UTC 기준)에는 아직 완화된 정책이 적용되지 않았다.

## 진행하지 못한 단계

1. ~~회원가입~~
2. ~~심평원 PDF 3종 업로드 (비밀번호 해제)~~
3. ~~자동 판정 파이프라인~~
4. ~~확인·수정 → 확정~~
5. ~~리포트 → 이력~~

`.env.local` 작성, 테스트 PDF 다운로드, dev 서버 기동 등 후속 단계는 네트워크
차단이 확인된 시점에서 모두 생략했다 (Supabase 연결 없이는 가입 단계부터 불가).

## 다음 단계

- 클라우드 환경 설정에서 `*.supabase.co` (최소한 `ncvgnxucotbbkhvxttcz.supabase.co:443`)
  아웃바운드 허용 후 **새 세션 컨테이너**에서 재시도 필요
  (환경 네트워크 정책은 컨테이너 시작 시점에 적용되므로 기존 컨테이너에는 반영되지 않음).
- 재시도 시 절차는 `docs/DEV-STATUS.md`의 "진행 중 — 클라우드 E2E 테스트" 항목과
  `scripts/e2e-test.mjs` 참조.
