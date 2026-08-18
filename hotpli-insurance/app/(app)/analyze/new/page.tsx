"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

const MAX_SIZE_MB = 20;

/** 브라우저에서 /Encrypt 마커를 찾아 비밀번호 입력란을 미리 보여주기 위한 휴리스틱 */
async function detectEncrypted(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const marker = new TextEncoder().encode("/Encrypt");
  outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker[j]) continue outer;
    }
    return true;
  }
  return false;
}

export default function NewAnalysisPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerBirth, setCustomerBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function pickFile(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 업로드할 수 있어요.");
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`파일이 너무 커요. ${MAX_SIZE_MB}MB 이하만 가능합니다.`);
      return;
    }
    setFile(f);
    setPassword("");
    setNeedsPassword(await detectEncrypted(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);

    if (customerBirth && !/^\d{6}$/.test(customerBirth)) {
      setError("생년월일은 주민번호 앞 6자리로 입력해주세요.");
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    if (password) form.append("password", password);
    if (customerName) form.append("customer_name", customerName);
    if (customerBirth) form.append("customer_birth", customerBirth);

    const res = await fetch("/api/analyses", { method: "POST", body: form });
    setUploading(false);

    if (res.ok) {
      const { id } = await res.json();
      router.push(`/analyze/${id}/progress`);
      return;
    }

    const body = await res.json().catch(() => ({}));
    switch (body.error) {
      case "password_required":
        setNeedsPassword(true);
        setError("비밀번호가 걸린 PDF예요. 비밀번호를 입력해주세요.");
        break;
      case "wrong_password":
        setNeedsPassword(true);
        setError("비밀번호가 맞지 않아요. 다시 확인해주세요.");
        break;
      case "invalid_pdf":
        setError("PDF를 읽을 수 없어요. 심평원에서 받은 원본 파일인지 확인해주세요.");
        break;
      case "unauthorized":
        router.push("/login");
        break;
      default:
        setError("업로드에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-[22px]">새 분석</h1>
        <p className="text-[14px] text-ink/50">
          심평원 진료이력 PDF를 올리면 고지사항을 분석해드려요
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4">
          {/* 파일 선택 영역 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className={`rounded-inner border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-violet-soft bg-violet-soft/5"
                : "border-ink/15 hover:border-violet-soft/60"
            }`}
          >
            {file ? (
              <div className="space-y-1">
                <p className="text-[15px] font-semibold break-all">{file.name}</p>
                <p className="text-[12px] text-ink/40">
                  {(file.size / 1024 / 1024).toFixed(1)}MB · 눌러서 다른 파일 선택
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-[26px]">📄</p>
                <p className="text-[15px] font-semibold">
                  진료이력 PDF 올리기
                </p>
                <p className="text-[12px] text-ink/40">
                  탭하거나 파일을 끌어다 놓으세요 (최대 {MAX_SIZE_MB}MB)
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>

          {needsPassword && (
            <Field
              label="PDF 비밀번호"
              hint="심평원 PDF는 보통 생년월일 6자리예요. 비밀번호는 저장하지 않아요."
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="문서 열람 비밀번호"
                autoComplete="off"
              />
            </Field>
          )}
        </Card>

        <Card className="space-y-4">
          <p className="text-[13px] font-semibold text-ink/60">
            고객 정보 <span className="font-normal text-ink/35">(선택)</span>
          </p>
          <Field label="고객 이름">
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="예: 김민수"
            />
          </Field>
          <Field label="생년월일" hint="주민번호 앞 6자리만 (뒷자리는 받지 않아요)">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={customerBirth}
              onChange={(e) =>
                setCustomerBirth(e.target.value.replace(/\D/g, ""))
              }
              placeholder="900101"
            />
          </Field>
        </Card>

        {error && (
          <p className="text-[13px] text-warn font-medium px-1">{error}</p>
        )}

        <Button
          type="submit"
          disabled={!file || uploading}
          className="w-full"
        >
          {uploading ? "업로드 중…" : "분석 시작하기"}
        </Button>
      </form>
    </div>
  );
}
