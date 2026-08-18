import "server-only";

/**
 * KCD(한국표준질병사인분류) 코드 사전.
 * - 대분류(장, chapter)는 KCD/ICD-10 공식 구조라 코드로 내장
 * - 세부 코드명은 공공데이터(KOICD/공공데이터포털) CSV로 직접 구축한다 → scripts/build-kcd.mjs
 * - 바틀/보비 DB를 참조·재현하지 않는다
 * - 사전에 없는 코드는 "사전 미등재"로 표시하고 장 분류만 제공 (판정을 막지 않는다)
 */
export interface KcdEntry {
  code: string; // 예: J06.9
  name: string; // 한글 질환명
  chapter: string; // 대분류
}

/** KCD 대분류 (ICD-10 장 구조 — 공식 분류 체계) */
const CHAPTERS: { re: RegExp; name: string }[] = [
  { re: /^[AB]/, name: "감염성 및 기생충성 질환" },
  { re: /^C|^D[0-4]/, name: "신생물(종양)" },
  { re: /^D[5-8]/, name: "혈액 및 조혈기관 질환·면역 장애" },
  { re: /^E/, name: "내분비·영양·대사 질환" },
  { re: /^F/, name: "정신 및 행동 장애" },
  { re: /^G/, name: "신경계통 질환" },
  { re: /^H[0-5]/, name: "눈 및 눈 부속기 질환" },
  { re: /^H[6-9]/, name: "귀 및 유돌 질환" },
  { re: /^I/, name: "순환계통 질환" },
  { re: /^J/, name: "호흡계통 질환" },
  { re: /^K/, name: "소화계통 질환" },
  { re: /^L/, name: "피부 및 피하조직 질환" },
  { re: /^M/, name: "근골격계통 및 결합조직 질환" },
  { re: /^N/, name: "비뇨생식계통 질환" },
  { re: /^O/, name: "임신·출산 및 산후기" },
  { re: /^P/, name: "출생전후기 병태" },
  { re: /^Q/, name: "선천 기형·변형 및 염색체 이상" },
  { re: /^R/, name: "증상·징후 및 임상·검사 이상소견" },
  { re: /^[ST]/, name: "손상·중독 및 외인의 특정 결과" },
  { re: /^U/, name: "특수목적 코드" },
  { re: /^[VWXY]/, name: "질병이환 및 사망의 외인" },
  { re: /^Z/, name: "건강상태 및 보건서비스 접촉 요인" },
];

export function chapterOf(code: string): string {
  return CHAPTERS.find((c) => c.re.test(code))?.name ?? "분류 미상";
}

/**
 * 시드 사전 — 빈발 코드 일부만 내장.
 * TODO(공공데이터): KOICD 마스터 CSV → scripts/build-kcd.mjs 로 kcd-dict.json 생성해 교체
 */
const SEED: [string, string][] = [
  ["J00", "급성 비인두염(감기)"],
  ["J01", "급성 부비동염"],
  ["J02", "급성 인두염"],
  ["J03", "급성 편도염"],
  ["J06", "급성 상기도감염"],
  ["J06.9", "상세불명의 급성 상기도감염"],
  ["J20", "급성 기관지염"],
  ["J30", "혈관운동성 및 앨러지성 비염"],
  ["J45", "천식"],
  ["A09", "감염성 위장염 및 결장염"],
  ["K21", "위-식도역류병"],
  ["K25", "위궤양"],
  ["K29", "위염 및 십이지장염"],
  ["K30", "기능성 소화불량"],
  ["K52", "기타 비감염성 위장염 및 결장염"],
  ["K02", "치아우식"],
  ["K05", "치은염 및 치주질환"],
  ["E11", "2형 당뇨병"],
  ["E78", "지질단백질대사 장애(고지혈증 등)"],
  ["E03", "기타 갑상선기능저하증"],
  ["E05", "갑상선독증(갑상선기능항진증)"],
  ["I10", "본태성(원발성) 고혈압"],
  ["I20", "협심증"],
  ["I63", "뇌경색증"],
  ["M17", "무릎관절증"],
  ["M25", "달리 분류되지 않은 기타 관절 장애"],
  ["M54", "등통증(요통 등)"],
  ["M75", "어깨병변"],
  ["M79", "달리 분류되지 않은 기타 연조직 장애"],
  ["S33", "요추 및 골반의 관절·인대의 탈구, 염좌"],
  ["S93", "발목·발 부위의 탈구, 염좌"],
  ["L20", "아토피성 피부염"],
  ["L23", "앨러지성 접촉피부염"],
  ["L30", "기타 피부염"],
  ["H10", "결막염"],
  ["H52", "굴절 및 조절의 장애"],
  ["H66", "화농성 및 상세불명의 중이염"],
  ["N30", "방광염"],
  ["N39", "비뇨계통의 기타 장애"],
  ["F41", "기타 불안장애"],
  ["F32", "우울에피소드"],
  ["G43", "편두통"],
  ["G47", "수면장애"],
  ["R10", "복부 및 골반 통증"],
  ["R51", "두통"],
  ["Z00", "일반적 검사 및 조사(건강검진 등)"],
  ["K80", "담석증"],
  ["S43", "어깨 관절·인대의 탈구 및 염좌"],
  ["S13", "목 부위의 탈구 및 염좌"],
  ["S92", "발의 골절"],
  ["J04", "급성 후두염 및 기관염"],
  ["M62", "기타 근육 장애"],
];

/**
 * 표준 계약전 알릴의무의 "10대 질병" — KCD 코드 범위 매칭.
 * (암, 백혈병, 고혈압, 협심증, 심근경색, 심장판막증, 간경화증, 뇌졸중증, 당뇨병, 에이즈·HIV)
 * 판정은 코드 매칭(코드로만) — AI에게 맡기지 않는다.
 */
export const MAJOR_DISEASES: { name: string; re: RegExp }[] = [
  { name: "암", re: /^C\d{2}/ },
  { name: "백혈병", re: /^C9[1-5]/ },
  { name: "고혈압", re: /^I1[0-5]/ },
  { name: "협심증", re: /^I20/ },
  { name: "심근경색", re: /^I2[1-3]/ },
  { name: "심장판막증", re: /^I0[5-8]|^I3[4-7]/ },
  { name: "간경화증", re: /^K74/ },
  { name: "뇌졸중증(뇌출혈·뇌경색)", re: /^I6[0-3]/ },
  { name: "당뇨병", re: /^E1[0-4]/ },
  { name: "에이즈(HIV)", re: /^B2[0-4]|^Z21/ },
];

/** 코드가 10대 질병에 해당하면 질병명 반환 */
export function majorDiseaseOf(code: string): string | null {
  return MAJOR_DISEASES.find((d) => d.re.test(code))?.name ?? null;
}

export const KCD_CODES: ReadonlyMap<string, KcdEntry> = new Map(
  SEED.map(([code, name]) => [
    code,
    { code, name, chapter: chapterOf(code) },
  ]),
);

/** 코드 → 사전 조회. 미등재면 소수점 앞 3자리로 재시도 후 장 분류만 반환 */
export function lookupKcd(code: string): KcdEntry {
  const exact = KCD_CODES.get(code);
  if (exact) return exact;
  const base = KCD_CODES.get(code.split(".")[0]);
  if (base) return { ...base, code };
  return { code, name: "사전 미등재", chapter: chapterOf(code) };
}
