"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { FILE_KIND_LABEL, type FileKind } from "@/types";

import { BackButton } from "@/components/back-button";
const MAX_SIZE_MB = 20;

/** 심평원 자료 3종 — 기본진료내역은 필수, 나머지는 있으면 함께 분석 */
const SLOTS: { kind: FileKind; label: string; desc: string; required: boolean }[] = [
  {
    kind: "basic",
    label: FILE_KIND_LABEL.basic,
    desc: "병원·약국 방문 목록",
    required: true,
  },
  {
    kind: "detail",
    label: FILE_KIND_LABEL.detail,
    desc: "진료 상세 내역",
    required: false,
  },
  {
    kind: "prescription",
    label: FILE_KIND_LABEL.prescription,
    desc: "처방·조제 약 내역",
    required: false,
  },
];

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

type SlotFiles = Partial<Record<FileKind, File>>;

function FileSlot({
  label,
  desc,
  required,
  file,
  onPick,
  onClear,
}: {
  label: string;
  desc: string;
  required: boolean;
  file: File | undefined;
  onPick: (f: File | undefined | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onPick(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-inner border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${
        dragOver
          ? "border-violet-soft bg-violet-soft/5"
          : file
            ? "border-violet-soft/50 bg-violet-soft/5"
            : "border-ink/15 hover:border-violet-soft/60"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-[22px]">{file ? "✅" : "📄"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">
            {label}
            {required ? (
              <span className="text-warn"> *</span>
            ) : (
              <span className="text-ink/35 font-normal"> (선택)</span>
            )}
          </p>
          {file ? (
            <p className="text-[12px] text-ink/50 truncate">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
            </p>
          ) : (
            <p className="text-[12px] text-ink/40">{desc} — 탭해서 PDF 선택</p>
          )}
        </div>
        {file && (
          <button
            type="button"
            aria-label={`${label} 파일 제거`}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-[12px] text-ink/40 hover:text-ink px-2 py-1"
          >
            ✕
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function NewAnalysisPage() {
  const router = useRouter();
  const [files, setFiles] = useState<SlotFiles>({});
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerBirth, setCustomerBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pickFile(kind: FileKind, f: File | undefined | null) {
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
    const next = { ...files, [kind]: f };
    setFiles(next);
    // 하나라도 암호화 파일이면 비밀번호 입력란 표시 (심평원 3종은 보통 같은 비밀번호)
    if (await detectEncrypted(f)) setNeedsPassword(true);
  }

  function clearFile(kind: FileKind) {
    const next = { ...files };
    delete next[kind];
    setFiles(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!files.basic) {
      setError("기본진료내역 파일은 꼭 필요해요.");
      return;
    }
    if (customerBirth && !/^\d{6}$/.test(customerBirth)) {
      setError("생년월일은 주민번호 앞 6자리로 입력해주세요.");
      return;
    }

    setUploading(true);
    const form = new FormData();
    for (const slot of SLOTS) {
      const f = files[slot.kind];
      if (f) form.append(`file_${slot.kind}`, f);
    }
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
    const slotLabel =
      body.slot && body.slot in FILE_KIND_LABEL
        ? FILE_KIND_LABEL[body.slot as FileKind]
        : null;
    switch (body.error) {
      case "password_required":
        setNeedsPassword(true);
        setError(
          `${slotLabel ?? "업로드한"} 파일에 비밀번호가 걸려 있어요. 비밀번호를 입력해주세요.`,
        );
        break;
      case "wrong_password":
        setNeedsPassword(true);
        setError(
          `${slotLabel ?? ""} 파일의 비밀번호가 맞지 않아요. 다시 확인해주세요.`,
        );
        break;
      case "invalid_pdf":
        setError(
          `${slotLabel ?? "업로드한"} 파일을 읽을 수 없어요. 심평원에서 받은 원본 PDF인지 확인해주세요.`,
        );
        break;
      case "no_credits":
        setError(
          "무료 분석 횟수를 모두 사용했어요. 유료 플랜은 준비 중입니다.",
        );
        break;
      case "unauthorized":
        router.push("/login");
        break;
      default:
        setError("업로드에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  const pickedCount = SLOTS.filter((s) => files[s.kind]).length;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <BackButton />
        <h1 className="font-display font-bold text-[22px]">새 분석</h1>
        <p className="text-[14px] text-ink/50">
          심평원에서 받은 진료이력 PDF 3종을 올려주세요
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink/60">진료이력 파일</p>
            <p className="text-[12px] text-ink/40">{pickedCount}/3</p>
          </div>

          {SLOTS.map((slot) => (
            <FileSlot
              key={slot.kind}
              label={slot.label}
              desc={slot.desc}
              required={slot.required}
              file={files[slot.kind]}
              onPick={(f) => pickFile(slot.kind, f)}
              onClear={() => clearFile(slot.kind)}
            />
          ))}

          {pickedCount > 0 && pickedCount < 3 && (
            <p className="text-[12px] text-warn/90 px-1">
              3개를 모두 올려야 놓치는 항목 없이 정확하게 분석할 수 있어요.
            </p>
          )}

          {needsPassword && (
            <Field
              label="PDF 비밀번호"
              hint="심평원 PDF는 보통 생년월일 6자리이고, 3개 파일 모두 같은 비밀번호예요. 비밀번호는 저장하지 않아요."
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

        <Button type="submit" disabled={!files.basic || uploading} className="w-full">
          {uploading ? "업로드 중…" : "분석 시작하기"}
        </Button>
      </form>
    </div>
  );
}
