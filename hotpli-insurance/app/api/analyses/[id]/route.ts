import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 분석 건 조회·상태 (RLS가 본인 소유만 반환) */
export async function GET(
  _request: Request,
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

  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, customer_name, customer_birth, status, file_path, files, parsed_rows, detected_kcd, created_at, confirmed_at",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: judgments } = await supabase
    .from("judgments")
    .select(
      "id, question_key, ai_verdict, ai_evidence, ai_reasoning, final_verdict, final_memo, decided_by",
    )
    .eq("analysis_id", id);

  return NextResponse.json({ ...data, judgments: judgments ?? [] });
}
