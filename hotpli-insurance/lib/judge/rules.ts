import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { Evidence, Verdict } from "@/types";
import { majorDiseaseOf } from "@/lib/kcd/codes";
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
      // 강한 수술 신호: "수술-OO술" 표기, OO절제술/봉합술 등 구체적 술식명
      // (심평원 세부내역의 "처치 및 수술료" 항목명은 부목·드레싱 같은 단순 처치도
      //  포함하므로, '수술' 단어만으로는 확정하지 않는다)
      const STRONG_SURGERY_RE =
        /수술\s*-|절제술|절개술|봉합술|적출술|성형술|이식술|절단술|문합술|고정술|치환술|제거술(?!.*치석)|조성술|복강경|관혈적/;
      const strong = inWindow.filter((r) => STRONG_SURGERY_RE.test(r.detail));
      if (strong.length > 0) {
        return {
          ...base,
          verdict: "yes",
          evidence: toEvidence(strong),
          reasoning: `기간 내 구체적 술식명 기록 ${strong.length}건 확인`,
        };
      }
      // 약한 신호: '수술' 단어 포함(처치·수술료 항목 등) 또는 입원 기록
      //  → 실제 수술인지 단순 처치인지 기록 해석 필요 (AI/설계사)
      const weak = inWindow.filter(
        (r) => /수술/.test(r.detail) || r.category === "입원",
      );
      if (weak.length > 0) {
        return {
          ...base,
          verdict: "needs_check",
          evidence: toEvidence(weak),
          reasoning:
            "수술 관련 항목 또는 입원 기록 존재 — 실제 수술 여부 기록 확인 필요",
          candidateRows: weak,
        };
      }
      return {
        ...base,
        verdict: "no",
        evidence: [],
        reasoning: "기간 내 수술 관련 기록 없음",
      };
    }

    case "drug": {
      // 마약·수면제 등 '상시 복용'은 처방 내역만으로 확정 불가 → 약품명 해석은 AI로
      const rx = inWindow.filter(
        (r) => r.category === "처방조제" || r.fileKind === "prescription",
      );
      if (rx.length === 0) {
        return {
          ...base,
          verdict: "no",
          evidence: [],
          reasoning: "기간 내 처방·조제 기록 없음",
        };
      }
      return {
        ...base,
        verdict: "needs_check",
        evidence: toEvidence(rx),
        reasoning: `기간 내 처방 기록 ${rx.length}건 — 상시 복용 약물 해당 여부 해석 필요`,
        candidateRows: rx,
      };
    }

    case "major_disease": {
      // 10대 질병은 KCD 코드 범위 매칭으로만 판정 (코드가 판단, AI 아님)
      const hits = inWindow
        .map((r) => ({
          row: r,
          diseases: r.kcdCodes
            .map((c) => majorDiseaseOf(c))
            .filter((n): n is string => !!n),
        }))
        .filter((h) => h.diseases.length > 0);
      if (hits.length > 0) {
        const names = [...new Set(hits.flatMap((h) => h.diseases))];
        return {
          ...base,
          verdict: "yes",
          evidence: toEvidence(hits.map((h) => h.row)),
          reasoning: `10대 질병 해당 코드 확인: ${names.join(", ")} (${hits.length}건)`,
        };
      }
      return {
        ...base,
        verdict: "no",
        evidence: [],
        reasoning: "기간 내 10대 질병 해당 상병코드 없음",
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

      // 단일 행에 30일 이상 투약이 기록된 경우 (세부·처방 파일의 총투약일수)
      const single30 = inWindow.find(
        (r) => r.days != null && r.days >= 30 && r.fileKind !== "basic",
      );
      if (single30) {
        return {
          ...base,
          verdict: "yes",
          evidence: toEvidence([single30]),
          reasoning: `단일 처방 투약일수 ${single30.days}일 (≥30일 투약)`,
        };
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
