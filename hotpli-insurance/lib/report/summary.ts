import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { DetectedKcd, Verdict } from "@/types";
import type { RiskItem } from "@/lib/risk/associations";

/**
 * 병력 요약 — 판정과 별개로 "전체 그림"을 먼저 보여주기 위한 집계.
 * 통계·집계는 전부 코드로 계산한다 (AI는 요약문·해석만).
 */
export interface HealthSummary {
  stats: {
    totalRows: number;
    firstDate: string | null;
    lastDate: string | null;
    /** 발견된 질환 코드 종수 (기관 수는 명칭 조각 병합 특성상 부정확해 미노출) */
    diseaseCount: number;
    providerCount: number;
    hospitalizationCount: number;
    topDiseases: { code: string; name: string; count: number }[];
    topDrugs: { name: string; count: number }[];
  };
  /** 질환 중심 보기: 발견 질환별로 걸린 고지 질문 */
  diseaseMap: { code: string; name: string; questionKeys: string[] }[];
  /** AI가 쓴 2~3문장 병력 요약 (키 없으면 undefined) */
  aiSummary?: string;
  /** 질병 위험 참고 (룰 매칭 + AI 폴백·보강) */
  risk?: {
    items: RiskItem[];
    aiNote?: string;
  };
}

/** 약품명 추정: 제형 접미사(정·캡슐·시럽·주 등)로 끝나는 토큰 추출 */
const DRUG_RE =
  /([가-힣A-Za-z0-9]{2,20}(?:서방정|장용정|츄정|정|캡슐|시럽|현탁액|점안액|주사|주|산|과립|겔|크림|연고|패치|스프레이))(?:_|\s|\(|$)/g;

export function extractDrugNames(rows: TreatmentRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.fileKind !== "prescription" && row.category !== "처방조제") continue;
    for (const m of row.detail.matchAll(DRUG_RE)) {
      const name = m[1];
      // 제형 접미사만 있는 것(예: "주", "정")이나 기관명 오탐 제외
      if (name.length < 3 || /약국|의원|병원/.test(name)) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

export function buildStats(
  rows: TreatmentRow[],
  detectedKcd: DetectedKcd[],
): HealthSummary["stats"] {
  const dates = rows.map((r) => r.date).sort();
  const providers = new Set(
    rows.map((r) => r.provider).filter((p) => p.length >= 2),
  );
  const drugs = [...extractDrugNames(rows).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    totalRows: rows.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    diseaseCount: detectedKcd.length,
    providerCount: providers.size,
    hospitalizationCount: rows.filter((r) => r.category === "입원").length,
    topDiseases: detectedKcd
      .slice(0, 5)
      .map((k) => ({ code: k.code, name: k.name, count: k.count })),
    topDrugs: drugs,
  };
}

/**
 * 질환 중심 보기: 판정 evidence의 행 번호 ↔ 행의 KCD 코드를 역추적해
 * "이 질환 때문에 어떤 질문이 해당/확인필요가 됐는지"를 만든다.
 */
export function buildDiseaseMap(
  rows: TreatmentRow[],
  detectedKcd: DetectedKcd[],
  judgments: {
    question_key: string;
    ai_verdict: Verdict;
    ai_evidence: { sourceRow: number }[] | null;
  }[],
): HealthSummary["diseaseMap"] {
  const rowByNo = new Map(rows.map((r) => [r.sourceRow, r]));
  const questionsByCode = new Map<string, Set<string>>();

  for (const j of judgments) {
    if (j.ai_verdict === "no") continue;
    for (const e of j.ai_evidence ?? []) {
      const row = rowByNo.get(e.sourceRow);
      if (!row) continue;
      for (const code of row.kcdCodes) {
        const set = questionsByCode.get(code) ?? new Set();
        set.add(j.question_key);
        questionsByCode.set(code, set);
      }
    }
  }

  return detectedKcd
    .map((k) => ({
      code: k.code,
      name: k.name,
      questionKeys: [...(questionsByCode.get(k.code) ?? [])],
    }))
    .filter((d) => d.questionKeys.length > 0);
}
