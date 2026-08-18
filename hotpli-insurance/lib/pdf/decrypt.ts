import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import initQpdf from "@jspawn/qpdf-wasm/qpdf.js";

/**
 * qpdf(WASM)로 PDF 비밀번호를 해제한다. 시스템 바이너리 불필요 — Vercel 서버리스에서 동작.
 * 주의: 입력은 진료 데이터일 수 있다. 내용·비밀번호를 절대 로그에 남기지 말 것.
 */

export type DecryptFailure = "password_required" | "wrong_password" | "invalid_pdf";

export type DecryptResult =
  | { ok: true; data: Uint8Array; wasEncrypted: boolean }
  | { ok: false; reason: DecryptFailure };

const WASM_PATH = path.join(
  process.cwd(),
  "node_modules/@jspawn/qpdf-wasm/qpdf.wasm",
);

let wasmBinaryPromise: Promise<Buffer> | null = null;
function loadWasmBinary(): Promise<Buffer> {
  wasmBinaryPromise ??= readFile(WASM_PATH);
  return wasmBinaryPromise;
}

/** %PDF- 헤더 확인 (헤더 앞 잡음 허용: 첫 1KB 내 검색) */
export function looksLikePdf(data: Uint8Array): boolean {
  return Buffer.from(data.subarray(0, 1024)).includes("%PDF-");
}

/**
 * 암호화 여부 휴리스틱: trailer의 /Encrypt 참조 탐색.
 * 파일 전체를 스캔하므로 오탐 가능성이 낮진 않지만, 최종 판단은 qpdf 실행 결과가 한다.
 */
export function hasEncryptMarker(data: Uint8Array): boolean {
  return Buffer.from(data).includes("/Encrypt");
}

async function runQpdf(
  args: string[],
  input: Uint8Array,
): Promise<{ code: number; output: Uint8Array | null }> {
  const wasmBinary = await loadWasmBinary();
  // 모듈 인스턴스는 호출마다 새로 만든다 (가상 FS 상태 공유 방지)
  const mod = await initQpdf({
    instantiateWasm: (imports, receiveInstance) => {
      WebAssembly.instantiate(wasmBinary as BufferSource, imports).then((r) => {
        const src = r as WebAssembly.WebAssemblyInstantiatedSource;
        receiveInstance(src.instance, src.module);
      });
      return {};
    },
    noInitialRun: true,
    print: () => {},
    printErr: () => {},
  });

  mod.FS.writeFile("in.pdf", input);
  let code: number;
  try {
    code = mod.callMain([...args, "in.pdf", "out.pdf"]);
  } catch (e) {
    // emscripten이 ExitStatus를 던지는 경우
    code =
      typeof e === "object" && e !== null && "status" in e
        ? Number((e as { status: unknown }).status)
        : 2;
  }
  let output: Uint8Array | null = null;
  // qpdf exit 0 = 성공, 3 = 경고와 함께 성공
  if (code === 0 || code === 3) {
    try {
      output = mod.FS.readFile("out.pdf");
    } catch {
      output = null;
    }
  }
  return { code, output };
}

/**
 * PDF 비밀번호 해제 (암호화되지 않은 파일은 그대로 재작성되어 통과).
 * - password 없이 암호화 파일 → password_required
 * - password가 틀림 → wrong_password
 * - PDF가 아니거나 손상 → invalid_pdf
 */
export async function decryptPdf(
  input: Uint8Array,
  password?: string,
): Promise<DecryptResult> {
  if (!looksLikePdf(input)) return { ok: false, reason: "invalid_pdf" };

  const args = ["--decrypt"];
  if (password) args.unshift(`--password=${password}`);

  const { output } = await runQpdf(args, input);
  const encrypted = hasEncryptMarker(input);

  if (output && looksLikePdf(output)) {
    return { ok: true, data: output, wasEncrypted: encrypted };
  }

  // 실패 원인 분류 — qpdf(wasm)는 stderr 캡처가 안 되므로 마커 기반으로 구분
  if (encrypted) {
    return { ok: false, reason: password ? "wrong_password" : "password_required" };
  }
  return { ok: false, reason: "invalid_pdf" };
}
