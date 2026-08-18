import "server-only";

/**
 * 심평원 진료이력 PDF의 진료행 하나.
 * sourceRow는 원문 행 번호 — 판정 evidence가 반드시 이 번호로 원문과 연결된다.
 */
export interface TreatmentRow {
  sourceRow: number;
  provider: string; // 병원·약국명
  date: string; // 진료개시일 YYYY-MM-DD
  category: string; // 구분 (외래/입원/처방조제 등)
  days: number | null; // 방문일수/처방일수
  detail: string; // 원문 그대로의 상세 (진료과목·내역 등)
}

export interface ParseResult {
  rows: TreatmentRow[];
  /** "128건 인식" 표시용 */
  totalRows: number;
}

/**
 * Sprint 2: 심평원 양식 → 구조화 (진료행, 처방행).
 * 실제 심평원 PDF 샘플 기준으로 작성하되, 양식 변형에 깨지지 않게 방어적으로.
 */
export function parseHira(_text: string): ParseResult {
  throw new Error("Sprint 2에서 구현: 심평원 양식 파싱 (샘플 PDF 기준)");
}
