-- 병력 요약·질환별 질문 맵·위험 참고 리포트 저장
-- 형태: lib/report/summary.ts 의 HealthSummary (stats/diseaseMap/aiSummary/risk)
alter table analyses add column if not exists summary jsonb;
