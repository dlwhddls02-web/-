import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * service role 클라이언트 — RLS를 우회한다.
 * share_links 조회·발급 등 서버 검증이 선행되는 경로에서만 사용할 것.
 * 절대 클라이언트로 내보내지 않는다.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
