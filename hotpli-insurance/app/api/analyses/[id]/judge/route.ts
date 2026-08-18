import { NextResponse } from "next/server";

/** AI 판정 실행 — Sprint 2 구현 예정 (룰 1차 → Claude 2차, evidence 필수) */
export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", sprint: 2 },
    { status: 501 },
  );
}
