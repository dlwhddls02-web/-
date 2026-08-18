import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EXPIRES_DAYS = 7;

/**
 * 공유 링크 발급 — 소유 확인 후 만료형 랜덤 토큰 발급.
 * share_links는 RLS 정책이 없으므로(전면 차단) service role로만 접근한다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { analysisId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.analysisId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // 소유 확인 (사용자 클라이언트 = RLS 적용)
  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, status")
    .eq("id", body.analysisId)
    .single();
  if (!analysis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (analysis.status !== "confirmed") {
    return NextResponse.json({ error: "not_confirmed" }, { status: 409 });
  }

  // 192비트 랜덤 토큰 — 추측 불가, 서버 조회로 검증 (만료·회수 가능)
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const admin = createAdminClient();
  const { error } = await admin.from("share_links").insert({
    analysis_id: body.analysisId,
    token,
    expires_at: expiresAt,
  });
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json(
    { url: `/share/${token}`, expiresAt },
    { status: 201 },
  );
}
