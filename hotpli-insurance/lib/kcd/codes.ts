import "server-only";

/**
 * KCD 코드 사전 — 공공데이터(KOICD/공공데이터포털) 기반으로 직접 구축.
 * 바틀/보비 DB를 참조·재현하지 않는다.
 */
export interface KcdEntry {
  code: string; // 예: J06.9
  name: string; // 한글 질환명
  chapter: string; // 대분류 (예: 호흡계통의 질환)
}

/** Sprint 2: 공공데이터 CSV → 이 사전으로 빌드하는 스크립트 추가 예정 */
export const KCD_CODES: ReadonlyMap<string, KcdEntry> = new Map();
