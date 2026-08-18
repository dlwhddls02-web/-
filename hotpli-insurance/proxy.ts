import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: middleware.ts 대신 proxy.ts — 세션 갱신 + 로그인 필요 라우트 보호
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/analyses/:path*",
    "/analyze/:path*",
    "/settings/:path*",
    "/login",
    "/signup",
  ],
};
