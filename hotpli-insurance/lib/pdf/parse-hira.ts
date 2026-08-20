import "server-only";
import type { PositionedItem } from "./extract";
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
  /** PDF 원문의 주상병명 (기본진료정보 컬럼 복원 결과) */
  diseaseName?: string;
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

/* ------------------------------------------------------------------ */
/* 기본진료정보 — 좌표(컬럼) 기반 파싱: PDF 원문 상병명을 그대로 복원   */
/* ------------------------------------------------------------------ */

/** 심평원 기본진료정보 출력 레이아웃의 컬럼 x 경계 (pt, 여유 포함) */
const BASIC_COL = {
  seqMax: 50,
  dateMax: 105,
  providerMax: 180, // 병·의원&약국
  deptMax: 208, // 진단과
  categoryMax: 240, // 입원/외래
  codeMax: 279, // 주상병코드
  nameMax: 329, // 주상병명
  daysMax: 353, // 내원일수
};

/**
 * 세로로 여러 줄에 걸친 셀 텍스트(상병명·기관명)를 "연속 묶음(run)"으로 모아
 * 행 앵커에 배정한다. 긴 상병명은 행 간격보다 높게 퍼지므로 중점 분할로는 잘린다.
 */
function collectRuns(
  items: PositionedItem[],
  xMin: number,
  xMax: number,
): { yMin: number; yMax: number; center: number; text: string; lineCount: number }[] {
  const col = items
    .filter((it) => it.x >= xMin && it.x < xMax)
    .sort((a, b) => b.y - a.y);
  const runs: { ys: number[]; parts: string[] }[] = [];
  for (const it of col) {
    const cur = runs[runs.length - 1];
    if (cur && cur.ys[cur.ys.length - 1] - it.y <= 16) {
      cur.ys.push(it.y);
      cur.parts.push(it.str);
    } else {
      runs.push({ ys: [it.y], parts: [it.str] });
    }
  }
  return runs.map((r) => ({
    yMax: r.ys[0],
    yMin: r.ys[r.ys.length - 1],
    center: (r.ys[0] + r.ys[r.ys.length - 1]) / 2,
    text: r.parts.join(""),
    lineCount: r.ys.length,
  }));
}

/** run을 앵커에 배정: 앵커 y가 run 범위 안이면 그 앵커, 아니면 중심 최근접 */
function assignRun(
  run: { yMin: number; yMax: number; center: number },
  anchors: { y: number }[],
): number {
  const inside = anchors.findIndex(
    (a) => a.y <= run.yMax + 6 && a.y >= run.yMin - 6,
  );
  if (inside >= 0) return inside;
  let best = 0;
  let bestDist = Infinity;
  anchors.forEach((a, i) => {
    const d = Math.abs(a.y - run.center);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function cleanDiseaseName(raw: string): string {
  return raw
    .replace(/^\((양방|한방|치과)\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 기본진료정보를 좌표 기반으로 파싱한다.
 * 셀 줄바꿈으로 쪼개진 주상병명·기관명을 컬럼 x범위와 행 y밴드로 복원 —
 * 사용자에게 "PDF에 적힌 진단명 그대로"를 보여주기 위함.
 */
export function parseBasicPositioned(
  pageItems: PositionedItem[][],
  sourceRowOffset = 0,
): ParseResult {
  const rows: TreatmentRow[] = [];
  let unparsedLines = 0;

  for (const items of pageItems) {
    // 1) 행 앵커: 순번(작은 x의 정수) + 같은 y의 날짜
    const anchors: { y: number; seq: string; date: string }[] = [];
    for (const it of items) {
      if (it.x >= BASIC_COL.seqMax || !/^\d{1,4}$/.test(it.str)) continue;
      const dateItem = items.find(
        (d) =>
          Math.abs(d.y - it.y) <= 3 &&
          d.x >= BASIC_COL.seqMax &&
          d.x < BASIC_COL.dateMax &&
          /^\d{4}-\d{1,2}-\d{1,2}$/.test(d.str),
      );
      if (dateItem) anchors.push({ y: it.y, seq: it.str, date: dateItem.str });
    }
    if (anchors.length === 0) continue;
    anchors.sort((a, b) => b.y - a.y);

    // 2) 행 y밴드: 인접 앵커의 중점, 가장자리엔 중앙 간격의 절반
    const gaps = anchors.slice(1).map((a, i) => anchors[i].y - a.y);
    const half =
      (gaps.length > 0 ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 56) / 2;
    const bandTop = (i: number) =>
      i === 0 ? anchors[0].y + half : (anchors[i - 1].y + anchors[i].y) / 2;
    const bandBottom = (i: number) =>
      i === anchors.length - 1
        ? anchors[i].y - half
        : (anchors[i].y + anchors[i + 1].y) / 2;

    // 3) 세로로 긴 셀(기관명·상병명)은 run 단위로 앵커에 배정
    const headerCut = anchors[0].y + half; // 헤더 영역 제외
    const body = items.filter((it) => it.y <= headerCut);
    const providerByAnchor: string[] = anchors.map(() => "");
    for (const run of collectRuns(body, BASIC_COL.dateMax, BASIC_COL.providerMax)) {
      providerByAnchor[assignRun(run, anchors)] += run.text;
    }
    const nameByAnchor: string[] = anchors.map(() => "");
    const nameTruncated: boolean[] = anchors.map(() => false);
    for (const run of collectRuns(body, BASIC_COL.codeMax, BASIC_COL.nameMax)) {
      const idx = assignRun(run, anchors);
      nameByAnchor[idx] += run.text;
      // 셀 높이 한계(5줄)까지 채워진 이름은 PDF 인쇄 자체가 잘린 것
      if (run.lineCount >= 5) nameTruncated[idx] = true;
    }

    // 4) 한 줄짜리 필드(구분·코드·일수)는 y밴드로 수집
    for (let i = 0; i < anchors.length; i++) {
      const top = bandTop(i);
      const bottom = bandBottom(i);
      const inBand = items
        .filter((it) => it.y <= top && it.y > bottom)
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const bucket = (min: number, max: number) =>
        inBand.filter((it) => it.x >= min && it.x < max).map((it) => it.str);

      const category = bucket(BASIC_COL.deptMax, BASIC_COL.categoryMax)
        .join("")
        .includes("입원")
        ? "입원"
        : "외래";
      const codeToken = bucket(BASIC_COL.categoryMax, BASIC_COL.codeMax)
        .join("")
        .trim();
      const daysToken = bucket(BASIC_COL.nameMax, BASIC_COL.daysMax).find((t) =>
        isPlainInt(t),
      );

      const kcd = normalizeKcd(codeToken);
      const dm = anchors[i].date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!dm) {
        unparsedLines++;
        continue;
      }
      const nameBase = cleanDiseaseName(nameByAnchor[i]);
      const name = nameBase ? nameBase + (nameTruncated[i] ? "…" : "") : "";
      const provider = providerByAnchor[i].replace(/\s+/g, " ").trim();

      rows.push({
        sourceRow: sourceRowOffset + rows.length + 1,
        fileKind: "basic",
        provider,
        date: `${dm[1]}-${pad2(dm[2])}-${pad2(dm[3])}`,
        category,
        days: daysToken != null ? Number(daysToken) : null,
        kcdCodes: kcd ? [kcd] : [],
        diseaseName: name || undefined,
        detail: `${anchors[i].seq} ${anchors[i].date} ${provider} ${category} ${codeToken} ${name}`.trim(),
      });
    }
  }

  // 5) 같은 코드의 행들 중 가장 긴 상병명으로 통일 (경계 잘림 보정)
  const bestName = new Map<string, string>();
  for (const r of rows) {
    const code = r.kcdCodes[0];
    if (!code || !r.diseaseName) continue;
    if ((bestName.get(code)?.length ?? 0) < r.diseaseName.length) {
      bestName.set(code, r.diseaseName);
    }
  }
  for (const r of rows) {
    const code = r.kcdCodes[0];
    if (code && bestName.has(code)) r.diseaseName = bestName.get(code);
  }

  return { rows, totalRows: rows.length, unparsedLines };
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
