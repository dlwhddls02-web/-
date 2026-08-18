import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Verdict } from "@/types";

const VALID_VERDICTS: Verdict[] = ["yes", "no", "needs_check"];

interface ConfirmItem {
  id: string;
  final_verdict: Verdict;
  final_memo?: string | null;
}

/**
 * 설계사 확정: 질문별 final_verdict/메모 저장 + 분석 건 confirmed 처리.
 * ai_verdict vs final_verdict 차이가 곧 오판정 데이터(플라이휠)이므로 원본은 덮지 않는다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { judgments?: ConfirmItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const items = body.judgments ?? [];
  if (
    items.length === 0 ||
    items.some((j) => !j.id || !VALID_VERDICTS.includes(j.final_verdict))
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // 소유 확인 (RLS로도 막히지만 명시적으로 404 처리)
  const { data: analysis } = await supabase
    .from("analyses")
    .select("id")
    .eq("id", id)
    .single();
  if (!analysis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  for (const item of items) {
    const { error } = await supabase
      .from("judgments")
      .update({
        final_verdict: item.final_verdict,
        final_memo: item.final_memo?.trim() || null,
        confirmed_at: now,
      })
      .eq("id", item.id)
      .eq("analysis_id", id);
    if (error) {
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
  }

  const { error: analysisError } = await supabase
    .from("analyses")
    .update({ status: "confirmed", confirmed_at: now })
    .eq("id", id);
  if (analysisError) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
