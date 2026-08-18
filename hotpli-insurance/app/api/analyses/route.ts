import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptPdf } from "@/lib/pdf/decrypt";

// qpdf WASM은 Node 런타임 필요
export const runtime = "nodejs";

const MAX_SIZE = 20 * 1024 * 1024;
const STORAGE_BUCKET = "analyses";

/**
 * S2 업로드 처리: PDF 수신 → (비밀번호 해제) → 비공개 Storage 저장 → analyses 행 생성.
 * 진료 데이터는 민감정보 — 파일 내용·비밀번호를 로그에 남기지 않는다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const password = form.get("password")?.toString() || undefined;
  const customerName = form.get("customer_name")?.toString().trim() || null;
  const customerBirthRaw = form.get("customer_birth")?.toString().trim() || null;
  // 생년월일은 앞 6자리만 받는다 (주민번호 뒷자리 수집 금지)
  if (customerBirthRaw && !/^\d{6}$/.test(customerBirthRaw)) {
    return NextResponse.json({ error: "invalid_birth" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await decryptPdf(bytes, password);
  if (!result.ok) {
    const status = result.reason === "invalid_pdf" ? 400 : 422;
    return NextResponse.json({ error: result.reason }, { status });
  }

  // 1) 분석 행 생성 (RLS: owner_id = auth.uid())
  const { data: inserted, error: insertError } = await supabase
    .from("analyses")
    .insert({
      owner_id: user.id,
      customer_name: customerName,
      customer_birth: customerBirthRaw,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const analysisId = inserted.id as string;

  // 2) 해제된 PDF를 비공개 버킷에 저장 — 경로 첫 폴더가 auth.uid()여야 RLS 통과
  const filePath = `${user.id}/${analysisId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, new Blob([result.data as BlobPart], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    // 저장 실패 시 고아 행을 남기지 않는다
    await supabase.from("analyses").delete().eq("id", analysisId);
    return NextResponse.json({ error: "storage_error" }, { status: 500 });
  }

  // 3) 파일 경로 연결
  const { error: updateError } = await supabase
    .from("analyses")
    .update({ file_path: filePath })
    .eq("id", analysisId);

  if (updateError) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json(
    { id: analysisId, wasEncrypted: result.wasEncrypted },
    { status: 201 },
  );
}
