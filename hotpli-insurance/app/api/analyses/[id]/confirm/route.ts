import { NextResponse } from "next/server";

/** 설계사 확정 — Sprint 3 구현 예정 (final_verdict 저장 + status=confirmed) */
export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", sprint: 3 },
    { status: 501 },
  );
}
