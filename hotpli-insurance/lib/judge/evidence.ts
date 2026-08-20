import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import { chapterOf, lookupKcd } from "@/lib/kcd/codes";
import type { Evidence } from "@/types";

/**
 * 판정 근거를 구조화해 저장한다: 날짜 · KCD 코드 · 질병/상해명 · (수술명).
 * 화면은 이 필드들만 보여주고, 원문(detail)은 내부 참조용으로만 유지.
 */

/** "수술-복강경을 사용한 담낭절제" / "충수절제술" 류에서 수술명 추출 */
const SURGERY_PREFIX_RE = /수술\s*-\s*([가-힣A-Za-z0-9()\[\]·,\s]{2,40}?)(?=\s+\d|\s*$)/;
const SURGERY_WORD_RE =
  /([가-힣]{2,16}(?:절제술|절개술|봉합술|적출술|성형술|이식술|절단술|문합술|고정술|치환술|제거술|조성술|형성술|배액술))/;

export function extractSurgeryName(detail: string): string | undefined {
  // 완전한 술식명(OO절제술 등)을 우선 — "수술-" 접두는 셀 줄바꿈으로 잘릴 수 있다
  const word = detail.match(SURGERY_WORD_RE);
  if (word) return word[1];
  const prefix = detail.match(SURGERY_PREFIX_RE);
  if (prefix) return prefix[1].replace(/\s+/g, " ").trim();
  return undefined;
}

/** 처방 근거용 약품명 (제형 접미사 기반, 최대 2개) */
const DRUG_TOKEN_RE =
  /([가-힣A-Za-z0-9]{2,20}(?:서방정|장용정|츄정|정|캡슐|시럽|현탁액|점안액|주사|주|산|과립|겔|크림|연고|패치|스프레이))(?:_|\s|\(|$)/g;

export function extractDrugTokens(detail: string): string[] {
  const out: string[] = [];
  for (const m of detail.matchAll(DRUG_TOKEN_RE)) {
    const name = m[1];
    if (name.length < 3 || /약국|의원|병원/.test(name)) continue;
    if (!out.includes(name)) out.push(name);
    if (out.length >= 2) break;
  }
  return out;
}

/** KCD 코드 → 표시용 병명 (사전 미등재면 대분류명으로) */
export function diseaseNameOf(code: string): string {
  const entry = lookupKcd(code);
  return entry.name === "사전 미등재" ? chapterOf(code) : entry.name;
}

export function rowToEvidence(row: TreatmentRow): Evidence {
  // PDF 원문 상병명 최우선 → KCD 사전 → 처방·조제 행은 약품명
  const isRx = row.fileKind === "prescription" || row.category === "처방조제";
  const diseaseNames = row.diseaseName
    ? [row.diseaseName]
    : row.kcdCodes.length > 0
      ? row.kcdCodes.map(diseaseNameOf)
      : isRx
        ? extractDrugTokens(row.detail)
        : [];
  return {
    date: row.date,
    provider: row.provider || "기관명 미상",
    detail: row.detail,
    sourceRow: row.sourceRow,
    kcdCodes: row.kcdCodes,
    diseaseNames,
    surgeryName: extractSurgeryName(row.detail),
    days: row.days,
    category: row.category || undefined,
  };
}

const MAX_EVIDENCE = 10;

/**
 * 행 목록 → 근거 목록. 같은 (날짜, 코드/수술명) 중복은 하나로 합쳐 노이즈를 줄인다.
 * preferNamedSurgery: 같은 날짜에 완전한 술식명(…술)이 있으면
 * 잘린 이름·이름 없는 수술 행은 숨긴다 (수술 질문 전용).
 */
export function buildEvidence(
  rows: TreatmentRow[],
  options?: { preferNamedSurgery?: boolean },
): Evidence[] {
  const out: Evidence[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const e = rowToEvidence(row);
    const key = `${e.date}|${e.kcdCodes?.join(",")}|${e.surgeryName ?? ""}|${e.category ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= MAX_EVIDENCE * 2) break;
  }

  let result = out;
  if (options?.preferNamedSurgery) {
    // 1) 같은 날짜에 완전한 술식명(…술)이 있으면 잘린 이름 행은 숨긴다
    const fullNamedDates = new Set(
      out.filter((e) => e.surgeryName?.endsWith("술")).map((e) => e.date),
    );
    // 2) 같은 날짜에 어떤 수술명이라도 있으면 이름 없는 행은 숨긴다
    const anyNamedDates = new Set(
      out.filter((e) => e.surgeryName).map((e) => e.date),
    );
    result = out.filter((e) => {
      if ((e.diseaseNames?.length ?? 0) > 0) return true;
      if (fullNamedDates.has(e.date)) return e.surgeryName?.endsWith("술");
      if (anyNamedDates.has(e.date)) return !!e.surgeryName;
      return true;
    });
  }
  return result.slice(0, MAX_EVIDENCE);
}
