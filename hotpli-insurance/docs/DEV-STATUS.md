# 개발 진행 상황 (2026-08-19 갱신)

새 세션에서 이어받을 때 이 문서와 CLAUDE.md를 먼저 읽을 것.

## 완료 (전부 실데이터 E2E 검증됨)

- Sprint 1~4: 셋업 / 스키마+RLS / 이메일 로그인 / 심평원 3종 업로드(비밀번호 해제) /
  파싱(1,235행·누락0) / KCD 매칭 / 룰 판정(기간·횟수 100% 코드) / AI 판정(structured output) /
  확인·수정·확정 / 리포트 / 공유 링크(7일 만료) / 인쇄·PDF / 무료 크레딧 / 랜딩
- 추가 개선: 병력 요약 카드(질환·약물·통계) / 질환별 고지 질문 역매핑 / 질병 연관성 참고(면책 포함,
  자체 작성 테이블 + AI 폴백) / 근거 구조화 표시(날짜·병명(KCD)·수술명·약품명·일수)
- 마이그레이션: 0001(필수, 적용됨) / 0002 files / 0004 summary (적용됨) / 0003 선택
- Supabase 프로젝트: ncvgnxucotbbkhvxttcz (Confirm email 꺼짐 — 오픈 전 다시 켤 것)
- E2E: scripts/e2e-test.mjs (클라우드 검증 통과, 더미 계정 hotpli.e2e.*@gmail.com 수 개 생성됨 — 삭제 가능)

## 다음: Vercel 배포 (진행 중)

- 방식: Vercel CLI + 사용자 토큰, 프로젝트 루트 = hotpli-insurance/ 하위 디렉토리
- env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (공개),
  SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (시크릿 — 사용자가 Vercel 대시보드에서 직접 입력)
- 배포 후: Supabase Auth URL Configuration의 Site URL을 배포 도메인으로 변경할 것

## 남은 것

- 카카오 로그인 (개발자 앱 키 발급 후), KCD 전체 사전(공공데이터 CSV), 서비스명·도메인
- AI 판정 실사용 검증은 사용자 로컬(키 보유)에서 확인
