import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** OAuth(카카오 등) 코드 교환 — 카카오 키 발급 후 이 라우트를 redirectTo로 사용 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/analyses", request.url));
    }
  }
  return NextResponse.redirect(
    new URL("/login?error=oauth_failed", request.url),
  );
}
