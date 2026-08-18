-- 분석 1건 = 심평원 파일 3종 (기본진료내역 / 세부진료정보 / 처방조제정보)
-- files 예시: {"basic": "uid/analysisId/basic.pdf", "detail": "...", "prescription": "..."}
alter table analyses add column if not exists files jsonb;
