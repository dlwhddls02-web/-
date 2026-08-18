-- hotpli-insurance 초기 스키마 (개발착수 가이드 v1 §3 그대로 + RLS 정책/트리거/Storage 구체화)
-- Supabase SQL Editor에 이 파일 전체를 붙여넣어 실행하면 된다.

-- ============================================================
-- 1. 테이블
-- ============================================================

-- 사용자 프로필 (auth.users 확장)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  phone text,
  free_credits int not null default 3,
  created_at timestamptz not null default now()
);

-- 분석 건
create table analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  customer_name text,
  customer_birth text,              -- 앞자리만, 암호화 검토
  status text not null default 'uploaded',
    -- uploaded → parsing → judging → needs_review → confirmed
  file_path text,                   -- Storage 경로 (비공개 버킷)
  parsed_rows int,                  -- "128건 인식" 표시용
  detected_kcd jsonb,               -- [{code,name,count,firstDate,lastDate}]
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- 질문별 판정 (핵심 테이블)
create table judgments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  question_key text not null,       -- q_3m_medication, q_1y_recheck, ...
  ai_verdict text not null,         -- yes | no | needs_check
  ai_evidence jsonb,                -- [{date, provider, detail, sourceRow}] ← 근거 원문 연결
  ai_reasoning text,
  final_verdict text,               -- 설계사 확정값 (null = 미확정)
  final_memo text,
  decided_by text,                  -- rule | ai  (룰 판정과 AI 판정 구분 저장)
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- 공유 링크 (만료형 서명)
create table share_links (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  token text not null unique,       -- HMAC 서명 토큰
  expires_at timestamptz not null,  -- 기본 7일
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index analyses_owner_idx on analyses (owner_id, created_at desc);
create index judgments_analysis_idx on judgments (analysis_id);

-- ============================================================
-- 2. 프로필 자동 생성 트리거 (가입 시 raw_user_meta_data.name 복사)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. RLS — 전 테이블 활성화. analyses/judgments는 owner_id = auth.uid()만.
--    share_links 조회는 서버 라우트에서 service role로만 (토큰 검증 후).
-- ============================================================

alter table profiles enable row level security;
alter table analyses enable row level security;
alter table judgments enable row level security;
alter table share_links enable row level security;

-- profiles: 본인 것만 조회·수정 (insert는 트리거가 담당)
create policy "profiles_select_own" on profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- analyses: 본인 소유만 전체 조작
create policy "analyses_select_own" on analyses
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "analyses_insert_own" on analyses
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "analyses_update_own" on analyses
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "analyses_delete_own" on analyses
  for delete to authenticated using (owner_id = (select auth.uid()));

-- judgments: 소유한 분석 건에 속한 것만
create policy "judgments_select_own" on judgments
  for select to authenticated using (
    exists (select 1 from analyses a where a.id = analysis_id and a.owner_id = (select auth.uid()))
  );
create policy "judgments_insert_own" on judgments
  for insert to authenticated with check (
    exists (select 1 from analyses a where a.id = analysis_id and a.owner_id = (select auth.uid()))
  );
create policy "judgments_update_own" on judgments
  for update to authenticated
  using (
    exists (select 1 from analyses a where a.id = analysis_id and a.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from analyses a where a.id = analysis_id and a.owner_id = (select auth.uid()))
  );

-- share_links: 정책 없음 = anon/authenticated 접근 불가. service role 전용.

-- ============================================================
-- 4. Storage — 비공개 버킷 'analyses'. 경로 규칙: {user_id}/{analysis_id}.pdf
--    진료 데이터는 민감정보이므로 공개 버킷 금지.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('analyses', 'analyses', false)
on conflict (id) do nothing;

create policy "analyses_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'analyses' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "analyses_storage_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'analyses' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "analyses_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'analyses' and (storage.foldername(name))[1] = (select auth.uid())::text);
