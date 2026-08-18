import "server-only";
import type { FileKind } from "@/types";

/**
 * 심평원 진료이력 PDF 파서.
 *
 * ⚠️ 실제 심평원 샘플 PDF 확보 전의 방어적 초안이다:
 * - 날짜가 들어간 줄을 진료행 후보로 보고, 키워드·패턴으로 필드를 뽑는다
 * - 양식이 달라도 죽지 않고, 못 읽은 줄은 unparsedLines로 집계해 품질을 드러낸다
 * - 샘플 확보 후 컬럼 위치 기반으로 정밀화할 것 (TODO)
 *
 * 진료 데이터는 민감정보 — 파싱 결과를 로그에 남기지 말 것.
 */

export interface TreatmentRow {
  /** 전체 문서 기준 행 번호 — 판정 evidence가 반드시 이 번호로 원문과 연결된다 */
  sourceRow: number;
  fileKind: FileKind;
  provider: string; // 병원·약국명 (못 찾으면 "")
  date: string; // 진료개시일 YYYY-MM-DD
  category: string; // 입원 | 외래 | 처방조제 | "" (미상)
  days: number | null; // 방문/입원/처방 일수
  kcdCodes: string[]; // 줄에서 발견된 KCD 코드 (없을 수 있음)
  detail: string; // 원문 줄 그대로 (연속 줄 포함)
}

export interface ParseResult {
  rows: TreatmentRow[];
  /** "128건 인식" 표시용 */
  totalRows: number;
  /** 날짜를 못 찾아 진료행으로 못 묶은 줄 수 (헤더·안내문 제외 품질 지표) */
  unparsedLines: number;
}

// 2000-01-01 ~ 2099-12-31, 구분자: - . / 년월일 공백
const DATE_RE =
  /(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?|(20\d{2})(\d{2})(\d{2})(?!\d)/;

// KCD 코드: 영문 1자 + 숫자 2자리 (+ 소수점 세분류). U/V/W/X/Y(외인)는 진단으로 드묾이나 허용
const KCD_RE = /\b([A-Z]\d{2}(?:\.\d{1,2})?)\b/g;

const PROVIDER_RE =
  /([가-힣A-Za-z0-9()·\s]{2,30}?(?:병원|의원|약국|한의원|치과|보건소|보건지소|요양병원|클리닉|메디컬|의료원|센터))/;

// 표 헤더·안내문 등 진료행이 아닌 줄
const NOISE_RE =
  /^(페이지|Page|출력일|발급일|조회기간|주민등록번호|성명|순번|진료개시일|요양기관|합계|총\s*\d+|■|▶|※|-\s*$)/;

function normalizeDate(m: RegExpMatchArray): string | null {
  const [y, mo, d] = m[1]
    ? [m[1], m[2], m[3]]
    : [m[4], m[5], m[6]];
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function detectProvider(line: string): string {
  const m = line.match(PROVIDER_RE);
  if (!m) return "";
  // 앞에 딸려온 숫자(날짜 조각)·구분 키워드 제거
  return m[1]
    .replace(/^[\d\s.\-/]+/, "")
    .replace(/^(외래|입원|처방조제|처방|조제|방문)\s*/, "")
    .trim();
}

function detectCategory(line: string): string {
  if (/입원/.test(line)) return "입원";
  if (/처방|조제|약국/.test(line)) return "처방조제";
  if (/외래|방문/.test(line)) return "외래";
  return "";
}

function detectDays(line: string): number | null {
  // "n일" 패턴 우선 (진료일수/투약일수 표기)
  const dayMatch = line.match(/(\d{1,3})\s*일(?!자)/);
  if (dayMatch) {
    const n = Number(dayMatch[1]);
    if (n >= 1 && n <= 365) return n;
  }
  return null;
}

function detectKcdCodes(line: string): string[] {
  const codes = new Set<string>();
  for (const m of line.matchAll(KCD_RE)) codes.add(m[1]);
  return [...codes];
}

/**
 * 한 파일(기본진료내역/세부진료정보/처방조제정보)의 줄들을 진료행 배열로 구조화.
 * sourceRowOffset: 여러 파일을 이어 붙일 때 전체 문서 기준 행 번호 유지용.
 */
export function parseHira(
  lines: string[],
  fileKind: FileKind,
  sourceRowOffset = 0,
): ParseResult {
  const rows: TreatmentRow[] = [];
  let unparsedLines = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || NOISE_RE.test(line)) continue;

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) {
      // 날짜 없는 줄: 직전 진료행의 연속 줄(상병명 줄바꿈 등)로 취급
      const prev = rows[rows.length - 1];
      if (prev && line.length <= 80) {
        prev.detail += ` ${line}`;
        prev.kcdCodes = [...new Set([...prev.kcdCodes, ...detectKcdCodes(line)])];
        if (!prev.provider) {
          prev.provider = detectProvider(line);
        }
      } else {
        unparsedLines++;
      }
      continue;
    }

    const date = normalizeDate(dateMatch);
    if (!date) {
      unparsedLines++;
      continue;
    }

    rows.push({
      sourceRow: sourceRowOffset + rows.length + 1,
      fileKind,
      provider: detectProvider(line),
      date,
      category:
        detectCategory(line) || (fileKind === "prescription" ? "처방조제" : ""),
      days: detectDays(line),
      kcdCodes: detectKcdCodes(line),
      detail: line,
    });
  }

  return { rows, totalRows: rows.length, unparsedLines };
}
