import "server-only";

/** 텍스트 추출 결과 — 스캔본이면 텍스트가 비어 있고 isScanned=true */
export interface ExtractResult {
  text: string;
  pageCount: number;
  /** 텍스트 레이어가 없는 스캔본 — MVP는 "지원 예정" 안내 */
  isScanned: boolean;
}

/**
 * Sprint 2: PDF 텍스트 추출 + 스캔본 감지.
 * OCR은 스캔본 감지 시에만 (MVP는 미지원 안내).
 */
export async function extractText(_pdf: Uint8Array): Promise<ExtractResult> {
  throw new Error("Sprint 2에서 구현: PDF 텍스트 추출 + 스캔본 감지");
}
