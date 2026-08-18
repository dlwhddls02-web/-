import { NextResponse } from "next/server";

/** 공유 링크 발급 — Sprint 4 구현 예정 (HMAC 서명 토큰, 기본 7일 만료) */
export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", sprint: 4 },
    { status: 501 },
  );
}
