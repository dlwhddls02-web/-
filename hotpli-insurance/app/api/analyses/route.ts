import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptPdf } from "@/lib/pdf/decrypt";
import type { AnalysisFiles, FileKind } from "@/types";

// qpdf WASM은 Node 런타임 필요
export const runtime = "nodejs";

const MAX_SIZE = 20 * 1024 * 1024;
const STORAGE_BUCKET = "analyses";

/** 심평원 자료 3종 — basic(기본진료내역)만 필수 */
const SLOTS: { kind: FileKind; required: boolean }[] = [
  { kind: "basic", required: true },
  { kind: "detail", required: false },
  { kind: "prescription", required: false },
];

/**
 * S2 업로드 처리: PDF 3종 수신 → (비밀번호 해제) → 비공개 Storage 저장 → analyses 행 생성.
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

  // 무료 크레딧 확인 (차감은 저장 성공 후)
  const { data: profile } = await supabase
    .from("profiles")
    .select("free_credits")
    .eq("id", user.id)
    .single();
  if (!profile || profile.free_credits <= 0) {
    return NextResponse.json({ error: "no_credits" }, { status: 402 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const password = form.get("password")?.toString() || undefined;
  const customerName = form.get("customer_name")?.toString().trim() || null;
  const customerBirthRaw = form.get("customer_birth")?.toString().trim() || null;
  // 생년월일은 앞 6자리만 받는다 (주민번호 뒷자리 수집 금지)
  if (customerBirthRaw && !/^\d{6}$/.test(customerBirthRaw)) {
    return NextResponse.json({ error: "invalid_birth" }, { status: 400 });
  }

  // 1) 파일 수집·검증
  const incoming: { kind: FileKind; file: File }[] = [];
  for (const slot of SLOTS) {
    const value = form.get(`file_${slot.kind}`);
    if (!(value instanceof File)) {
      if (slot.required) {
        return NextResponse.json(
          { error: "bad_request", slot: slot.kind },
          { status: 400 },
        );
      }
      continue;
    }
    if (value.size === 0 || value.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "file_too_large", slot: slot.kind },
        { status: 413 },
      );
    }
    incoming.push({ kind: slot.kind, file: value });
  }

  // 2) 전부 해제 성공한 뒤에만 저장 시작 (부분 저장 방지).
  //    심평원 3종은 같은 비밀번호이므로 하나의 password를 전 파일에 적용한다.
  const decrypted: { kind: FileKind; data: Uint8Array }[] = [];
  for (const { kind, file } of incoming) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await decryptPdf(bytes, password);
    if (!result.ok) {
      const status = result.reason === "invalid_pdf" ? 400 : 422;
      return NextResponse.json(
        { error: result.reason, slot: kind },
        { status },
      );
    }
    decrypted.push({ kind, data: result.data });
  }

  // 3) 분석 행 생성 (RLS: owner_id = auth.uid())
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

  // 4) 비공개 버킷에 저장 — 경로 첫 폴더가 auth.uid()여야 RLS 통과
  const filesMap: AnalysisFiles = {};
  const uploadedPaths: string[] = [];
  for (const { kind, data } of decrypted) {
    const filePath = `${user.id}/${analysisId}/${kind}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, new Blob([data as BlobPart], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      // 부분 저장·고아 행을 남기지 않는다
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      }
      await supabase.from("analyses").delete().eq("id", analysisId);
      return NextResponse.json(
        { error: "storage_error", slot: kind },
        { status: 500 },
      );
    }
    filesMap[kind] = filePath;
    uploadedPaths.push(filePath);
  }

  // 5) 파일 경로 연결 (file_path는 기본진료내역 경로 — 하위 호환용)
  const { error: updateError } = await supabase
    .from("analyses")
    .update({ files: filesMap, file_path: filesMap.basic ?? null })
    .eq("id", analysisId);

  if (updateError) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // 저장까지 성공했을 때만 크레딧 차감
  await supabase
    .from("profiles")
    .update({ free_credits: profile.free_credits - 1 })
    .eq("id", user.id)
    .gt("free_credits", 0);

  return NextResponse.json(
    { id: analysisId, files: Object.keys(filesMap) },
    { status: 201 },
  );
}
