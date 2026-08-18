-- 판정 재실행을 멱등하게: 분석 1건 × 질문 1개 = 판정 1행 (upsert 대상)
create unique index if not exists judgments_analysis_question_key
  on judgments (analysis_id, question_key);

-- 재실행 시 정리를 위한 삭제 정책 (본인 소유 분석 건에 한함)
create policy "judgments_delete_own" on judgments
  for delete to authenticated using (
    exists (select 1 from analyses a where a.id = analysis_id and a.owner_id = (select auth.uid()))
  );
