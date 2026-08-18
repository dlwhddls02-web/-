import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** 로그인 필요 영역 — app/(app)/* 라우트의 실제 URL 경로 */
const PROTECTED_PREFIXES = ["/analyses", "/analyze", "/settings"];
/** 로그인 상태로 접근하면 앱으로 돌려보낼 페이지 */
const AUTH_PAGES = ["/login", "/signup"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser()는 세션 토큰을 검증·갱신한다 — createServerClient와 이 호출 사이에
  // 다른 로직을 넣지 말 것 (세션이 유실될 수 있음)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/analyses";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
