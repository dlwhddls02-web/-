-- 크레딧 체계 정비
-- 1) free_credits = -1 은 "무제한" 계정을 뜻한다
-- 2) 사용자가 자기 크레딧을 임의 수정 못 하게 컬럼 업데이트 권한 회수,
--    차감은 서버가 호출하는 SECURITY DEFINER 함수로만

create or replace function public.consume_credit()
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  update profiles
     set free_credits = free_credits - 1
   where id = auth.uid()
     and free_credits > 0; -- 무제한(-1)·소진(0) 계정은 건드리지 않음
  return found;
end;
$$;

revoke update (free_credits) on public.profiles from authenticated;

-- 운영자 계정 무제한 처리
update profiles
   set free_credits = -1
 where id = (select id from auth.users where email = 'dlwhddls02@gmail.com');
