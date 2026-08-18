import "server-only";
import type { FileKind } from "@/types";

/**
 * 심평원 진료이력 PDF 파서 — 실제 샘플(2026-08) 양식 기준.
 *
 * 관찰된 구조:
 * - 모든 데이터 행은 "순번 + 진료시작일(YYYY-MM-DD)"로 시작한다
 *   예) 기본:  "1 2026-04-21 취통증의학과 증의학 외래 AS9290 1 22,030 15,430 6,600"
 *   예) 세부:  "2 2026-04-21 표층열치료(심층열동시) 1 1 1"
 * - 셀 텍스트(병원명·상병명)가 위아래 줄에 조각으로 쪼개져 나온다 → 직전 행에 병합
 *   (다음 행의 선행 조각이 이전 행에 붙는 소량의 번짐은 허용 — 판정 필드는 본행에 있음)
 * - 기본진료정보: 입원/외래 | 주상병코드(양방표기 A+KCD, 무점) | 내원일수 | 금액들(콤마)
 * - 세부진료정보: 진료내역 | 1회투약량 | 1일투여횟수 | 총투약일수 (끝 숫자 3개)
 * - 처방조제정보: 세부와 유사 구조로 가정 (샘플 확보 시 보정)
 *
 * 진료 데이터는 민감정보 — 파싱 결과를 로그에 남기지 말 것.
 */

export interface TreatmentRow {
  /** 전체 문서 기준 행 번호 — 판정 evidence가 반드시 이 번호로 원문과 연결된다 */
  sourceRow: number;
  fileKind: FileKind;
  provider: string; // 병·의원&약국 (조각 병합 결과, 불완전할 수 있음)
  date: string; // 진료시작일 YYYY-MM-DD
  category: string; // 입원 | 외래 | 처방조제 | "" (미상)
  days: number | null; // 내원일수(기본) / 총투약일수(세부·처방)
  kcdCodes: string[]; // 주상병 KCD 코드 (기본진료정보에서 추출)
  detail: string; // 본행 + 병합된 조각 원문
}

export interface ParseResult {
  rows: TreatmentRow[];
  /** "128건 인식" 표시용 */
  totalRows: number;
  /** 어느 행에도 못 붙인 줄 수 (품질 지표) */
  unparsedLines: number;
}

/** 데이터 행 앵커: 순번 + 날짜로 시작 */
const ROW_ANCHOR_RE = /^(\d{1,4})\s+(\d{4})-(\d{1,2})-(\d{1,2})\s+(.*)$/;

/** 표 헤더·타이틀·출력 시각 등 어느 행에도 붙이면 안 되는 줄 */
const NOISE_RE =
  /^(기본진료정보|세부진료정보|처방조제정보|순번|진료시작일|병·의원|입원\/|처방\/|조제\s|외래\s*코드|내원\s|총\s*진료비|약품명|성분명|투약량|투여횟수|투약일수|1회\s|1일\s|페이지|Page|\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})/;

/** 병원·약국명 접미 (조각 판별용) */
const PROVIDER_SUFFIX_RE = /(병원|의원|약국|한의원|치과|보건소|보건지소|의료원|클리닉|센터)$/;

/**
 * 심평원 상병코드 → KCD 표준 표기.
 * "AS9290" → S92.90, "AF329" → F32.9 (선행 A/B는 양방/한방 구분자), "J00"류는 그대로.
 */
export function normalizeKcd(token: string): string | null {
  const m = token.match(/^([A-Z])?([A-Z])(\d{2,4})$/);
  if (!m) return null;
  const [, , letter, digits] = m;
  if (digits.length <= 2) return `${letter}${digits}`;
  return `${letter}${digits.slice(0, 2)}.${digits.slice(2)}`;
}

/** 콤마 없는 순수 정수 토큰인지 (금액 "22,030"과 구분) */
function isPlainInt(token: string): boolean {
  return /^\d{1,3}$/.test(token);
}

function pad2(n: string): string {
  return n.padStart(2, "0");
}

interface ParsedFields {
  provider: string;
  category: string;
  days: number | null;
  kcdCodes: string[];
}

/** 기본진료정보 본행 파싱: [기관조각...] [진료과] (입원|외래) [상병코드] [내원일수] [금액...] */
function parseBasicRest(tokens: string[]): ParsedFields {
  const catIdx = tokens.findIndex((t) => /^(입원|외래)$/.test(t));
  const category = catIdx >= 0 ? tokens[catIdx] : "";
  const provider = (catIdx >= 0 ? tokens.slice(0, catIdx) : tokens)
    .filter((t) => /[가-힣]/.test(t))
    .join(" ");

  const kcdCodes: string[] = [];
  let days: number | null = null;
  const after = catIdx >= 0 ? tokens.slice(catIdx + 1) : tokens;
  for (let i = 0; i < after.length; i++) {
    const code = normalizeKcd(after[i]);
    if (code && kcdCodes.length === 0) {
      kcdCodes.push(code);
      // 코드 뒤 첫 번째 콤마 없는 정수 = 내원일수
      // (상병명 조각이 사이에 낄 수 있음: "AK8010 언급이 없 4 4,097,030")
      // 콤마 숫자(금액)가 나오면 중단
      for (let j = i + 1; j < after.length; j++) {
        if (/^\d{1,3},\d/.test(after[j])) break;
        if (isPlainInt(after[j])) {
          days = Number(after[j]);
          break;
        }
      }
      break;
    }
  }
  return { provider, category, days, kcdCodes };
}

/** 세부·처방 본행 파싱: [기관/내역...] [숫자 ≤3개 꼬리] — 꼬리 마지막 = 총투약일수 */
function parseDetailRest(tokens: string[], fileKind: FileKind): ParsedFields {
  let tail = 0;
  while (
    tail < 3 &&
    tokens.length - 1 - tail >= 0 &&
    isPlainInt(tokens[tokens.length - 1 - tail])
  ) {
    tail++;
  }
  const days = tail > 0 ? Number(tokens[tokens.length - 1]) : null;
  const body = tokens.slice(0, tokens.length - tail);
  const provider = body
    .filter((t) => /[가-힣]/.test(t) && PROVIDER_SUFFIX_RE.test(t))
    .join(" ");
  const category =
    fileKind === "prescription" || body.some((t) => /처방|조제/.test(t))
      ? "처방조제"
      : "";
  return { provider, category, days, kcdCodes: [] };
}

/**
 * 한 파일의 줄들을 진료행 배열로 구조화.
 * sourceRowOffset: 여러 파일을 이어 붙일 때 전체 문서 기준 행 번호 유지용.
 */
export function parseHira(
  lines: string[],
  fileKind: FileKind,
  sourceRowOffset = 0,
): ParseResult {
  const rows: TreatmentRow[] = [];
  let unparsedLines = 0;
  /** 본행 등장 전에 나온 셀 조각 (다음 본행에 병합) */
  let pendingFragments: string[] = [];

  const attachFragment = (row: TreatmentRow, fragment: string) => {
    row.detail += ` ${fragment}`;
    // 조각에서 기관명 보강 (예: "아산플러스마" + "의원")
    if (!PROVIDER_SUFFIX_RE.test(row.provider) && /[가-힣]/.test(fragment)) {
      const candidate = `${row.provider} ${fragment}`.trim();
      if (candidate.length <= 40) row.provider = candidate;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || NOISE_RE.test(line)) continue;

    const anchor = line.match(ROW_ANCHOR_RE);
    if (!anchor) {
      // 셀 조각: 직전 행이 있으면 거기에, 없으면 다음 행 대기 버퍼로
      const prev = rows[rows.length - 1];
      if (prev && line.length <= 80) attachFragment(prev, line);
      else if (line.length <= 80) pendingFragments.push(line);
      else unparsedLines++;
      continue;
    }

    const [, , y, mo, d, rest] = anchor;
    const tokens = rest.split(/\s+/).filter(Boolean);
    const fields =
      fileKind === "basic"
        ? parseBasicRest(tokens)
        : parseDetailRest(tokens, fileKind);

    const row: TreatmentRow = {
      sourceRow: sourceRowOffset + rows.length + 1,
      fileKind,
      provider: fields.provider,
      date: `${y}-${pad2(mo)}-${pad2(d)}`,
      category: fields.category,
      days: fields.days,
      kcdCodes: fields.kcdCodes,
      detail: line,
    };
    // 본행 앞에 쌓인 조각 병합
    for (const frag of pendingFragments) attachFragment(row, frag);
    pendingFragments = [];
    rows.push(row);
  }

  unparsedLines += pendingFragments.length;
  return { rows, totalRows: rows.length, unparsedLines };
}
