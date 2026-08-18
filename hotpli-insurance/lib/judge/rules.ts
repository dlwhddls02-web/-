import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { Evidence, Verdict } from "@/types";
import { QUESTIONS, type QuestionDef } from "./questions";

/**
 * 룰 기반 1차 판정 — 기간·횟수·일수 계산은 100% 여기(코드)서 한다.
 * AI에게 산수를 절대 시키지 않는다.
 * 룰이 확정 못 하는 해석성 케이스만 needs_check로 남겨 lib/judge/ai.ts로 넘긴다.
 */
export interface RuleJudgment {
  questionKey: string;
  verdict: Verdict;
  evidence: Evidence[];
  reasoning: string;
  decidedBy: "rule";
  /** needs_check일 때 AI에 넘길 후보 행 (이미 기간 필터 완료) */
  candidateRows: TreatmentRow[];
}

const MAX_EVIDENCE = 10;

/** 기준일에서 n개월 전 날짜 (YYYY-MM-DD) — Date 산술로만 계산 */
export function monthsBefore(base: Date, months: number): string {
  const d = new Date(Date.UTC(base.getFullYear(), base.getMonth() - months, base.getDate()));
  return d.toISOString().slice(0, 10);
}

function toEvidence(rows: TreatmentRow[]): Evidence[] {
  return rows.slice(0, MAX_EVIDENCE).map((r) => ({
    date: r.date,
    provider: r.provider || "기관명 미상",
    detail: r.detail,
    sourceRow: r.sourceRow,
  }));
}

/** 그룹 키: KCD 코드가 있으면 코드, 없으면 기관명 (동일 질환 추정 단위) */
function groupKeyOf(row: TreatmentRow): string[] {
  if (row.kcdCodes.length > 0) return row.kcdCodes.map((c) => `kcd:${c}`);
  if (row.provider) return [`provider:${row.provider}`];
  return [];
}

function judgeOne(
  q: QuestionDef,
  rows: TreatmentRow[],
  baseDate: Date,
): RuleJudgment {
  const from = monthsBefore(baseDate, q.windowMonths);
  const inWindow = rows.filter((r) => r.date >= from);
  const base = {
    questionKey: q.key,
    decidedBy: "rule" as const,
    candidateRows: [],
  };

  // 기간 내 진료 기록 자체가 없으면 모든 질문이 '아니오'
  if (inWindow.length === 0) {
    return {
      ...base,
      verdict: "no",
      evidence: [],
      reasoning: `기준일로부터 ${q.windowMonths}개월(${from} 이후) 내 진료 기록 없음`,
    };
  }

  switch (q.kind) {
    case "diagnosis":
    case "medication": {
      // 3개월 내 진찰·검사·투약·처방 — 기간 내 기록이 있으면 해당
      return {
        ...base,
        verdict: "yes",
        evidence: toEvidence(inWindow),
        reasoning: `${from} 이후 진료·처방 기록 ${inWindow.length}건 확인`,
      };
    }

    case "recheck": {
      // 재검사(추가검사) 필요 소견은 청구 데이터만으로 확정 불가 → 문구 해석은 AI로
      return {
        ...base,
        verdict: "needs_check",
        evidence: toEvidence(inWindow),
        reasoning: `기간 내 기록 ${inWindow.length}건 존재 — 재검사 권고 여부는 기록 해석 필요`,
        candidateRows: inWindow,
      };
    }

    case "hospitalization": {
      const hosp = inWindow.filter((r) => r.category === "입원");
      if (hosp.length > 0) {
        return {
          ...base,
          verdict: "yes",
          evidence: toEvidence(hosp),
          reasoning: `기간 내 입원 기록 ${hosp.length}건 확인`,
        };
      }
      return {
        ...base,
        verdict: "no",
        evidence: [],
        reasoning: "기간 내 입원 구분 기록 없음",
      };
    }

    case "surgery": {
      const surgery = inWindow.filter((r) => /수술/.test(r.detail));
      if (surgery.length > 0) {
        return {
          ...base,
          verdict: "yes",
          evidence: toEvidence(surgery),
          reasoning: `기간 내 수술 표기 기록 ${surgery.length}건 확인`,
        };
      }
      const hosp = inWindow.filter((r) => r.category === "입원");
      if (hosp.length > 0) {
        // 입원 기록은 있는데 수술 여부가 명시되지 않음 → 기록 해석은 AI로
        return {
          ...base,
          verdict: "needs_check",
          evidence: toEvidence(hosp),
          reasoning: "입원 기록이 있으나 수술 여부 미표기 — 기록 확인 필요",
          candidateRows: hosp,
        };
      }
      return {
        ...base,
        verdict: "no",
        evidence: [],
        reasoning: "기간 내 수술 표기·입원 기록 없음",
      };
    }

    case "long_treatment": {
      // (a) 30일 이상 투약: 동일 그룹(질환/기관)의 처방일수 합 ≥ 30
      // (b) 7일 이상 계속 치료: 동일 그룹의 서로 다른 진료일 ≥ 7
      const dayssByGroup = new Map<string, { days: number; rows: TreatmentRow[] }>();
      const datesByGroup = new Map<string, { dates: Set<string>; rows: TreatmentRow[] }>();

      for (const row of inWindow) {
        for (const key of groupKeyOf(row)) {
          if (row.days != null && row.category === "처방조제") {
            const g = dayssByGroup.get(key) ?? { days: 0, rows: [] };
            g.days += row.days;
            g.rows.push(row);
            dayssByGroup.set(key, g);
          }
          const d = datesByGroup.get(key) ?? { dates: new Set(), rows: [] };
          d.dates.add(row.date);
          d.rows.push(row);
          datesByGroup.set(key, d);
        }
      }

      const medication30 = [...dayssByGroup.entries()].find(([, g]) => g.days >= 30);
      if (medication30) {
        return {
          ...base,
          verdict: "yes",
          evidence: toEvidence(medication30[1].rows),
          reasoning: `동일 질환/기관 처방일수 합계 ${medication30[1].days}일 (≥30일 투약)`,
        };
      }

      const treat7 = [...datesByGroup.entries()].find(([, g]) => g.dates.size >= 7);
      if (treat7) {
        return {
          ...base,
          verdict: "yes",
          evidence: toEvidence(treat7[1].rows),
          reasoning: `동일 질환/기관 진료일 ${treat7[1].dates.size}일 (≥7일 계속 치료)`,
        };
      }

      return {
        ...base,
        verdict: "no",
        evidence: [],
        reasoning: "동일 질환 기준 30일 이상 투약·7일 이상 계속 치료 없음",
      };
    }
  }
}

/** 전 질문 룰 판정. baseDate 기준 기간 계산은 전부 이 파일의 코드가 수행. */
export function judgeByRules(
  rows: TreatmentRow[],
  baseDate: Date,
  questions: readonly QuestionDef[] = QUESTIONS,
): RuleJudgment[] {
  return questions.map((q) => judgeOne(q, rows, baseDate));
}
