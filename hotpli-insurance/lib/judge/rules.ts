import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { Evidence, Verdict } from "@/types";
import { majorDiseaseOf } from "@/lib/kcd/codes";
import {
  buildEvidence,
  diseaseNameOf,
  extractDrugTokens,
  extractSurgeryName,
} from "./evidence";
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

/** 기준일에서 n개월 전 날짜 (YYYY-MM-DD) — Date 산술로만 계산 */
export function monthsBefore(base: Date, months: number): string {
  const d = new Date(Date.UTC(base.getFullYear(), base.getMonth() - months, base.getDate()));
  return d.toISOString().slice(0, 10);
}

/** 그룹 키: KCD 코드가 있으면 코드, 없으면 기관명 (동일 질환 추정 단위) */
function groupKeyOf(row: TreatmentRow): string[] {
  if (row.kcdCodes.length > 0) return row.kcdCodes.map((c) => `kcd:${c}`);
  if (row.provider) return [`provider:${row.provider}`];
  return [];
}

/** 행의 표시용 진단명: PDF 원문 상병명 우선 → KCD 사전 */
function rowName(r: TreatmentRow): string | null {
  if (r.diseaseName) return r.diseaseName;
  if (r.kcdCodes[0]) return diseaseNameOf(r.kcdCodes[0]);
  return null;
}

/** 판정 이유에 쓸 그룹 이름: 질환명(코드) 또는 기관명 */
function groupLabel(key: string, allRows: TreatmentRow[]): string {
  if (key.startsWith("kcd:")) {
    const code = key.slice(4);
    const named = allRows.find(
      (r) => r.kcdCodes.includes(code) && r.diseaseName,
    );
    return `${named?.diseaseName ?? diseaseNameOf(code)}(${code})`;
  }
  return key.slice("provider:".length);
}

/** 기간 내 주요 질환 상위 n개: "이름 x회, ..." */
function topDiseasesText(rows: TreatmentRow[], n = 3): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = rowName(r);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, c]) => `${name} ${c}회`)
    .join(", ");
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
        evidence: buildEvidence(inWindow),
        reasoning: `${from} 이후 진료·처방 기록 ${inWindow.length}건 확인`,
      };
    }

    case "recheck": {
      // 재검사(추가검사) 필요 소견은 청구 데이터만으로 확정 불가 → 문구 해석은 AI로
      const top = topDiseasesText(inWindow);
      return {
        ...base,
        verdict: "needs_check",
        evidence: buildEvidence(inWindow),
        reasoning: `최근 1년 내 진료 ${inWindow.length}건${top ? ` — 주요 진료: ${top}` : ""}. 심평원 자료에는 재검사(추가검사) 권고 여부가 직접 기록되지 않으므로, 검사·건강검진 후 재검 안내를 받았는지 고객 확인이 필요합니다`,
        candidateRows: inWindow,
      };
    }

    case "hospitalization": {
      const hosp = inWindow.filter((r) => r.category === "입원");
      if (hosp.length > 0) {
        const detail = hosp
          .slice(0, 3)
          .map(
            (r) =>
              `${r.date} ${rowName(r) ?? "진단명 미상"}${r.days ? ` ${r.days}일` : ""}`,
          )
          .join(" / ");
        return {
          ...base,
          verdict: "yes",
          evidence: buildEvidence(hosp),
          reasoning: `기간 내 입원 ${hosp.length}건 — ${detail}${hosp.length > 3 ? " 외" : ""}`,
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
        const surgeryNames = [
          ...new Set(
            strong
              .map((r) => extractSurgeryName(r.detail))
              .filter((n): n is string => !!n),
          ),
        ].slice(0, 3);
        return {
          ...base,
          verdict: "yes",
          evidence: buildEvidence(strong, { preferNamedSurgery: true }),
          reasoning: `기간 내 수술 기록 확인${surgeryNames.length ? ` — ${surgeryNames.join(", ")}` : ""} (관련 기록 ${strong.length}건)`,
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
          evidence: buildEvidence(weak),
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
        evidence: buildEvidence(rx),
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
          evidence: buildEvidence(hits.map((h) => h.row)),
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
      // 같은 조건이면 약품명이 읽히는 행을 근거로 우선 선택
      const long30 = inWindow.filter(
        (r) => r.days != null && r.days >= 30 && r.fileKind !== "basic",
      );
      const single30 =
        long30.find((r) => extractDrugTokens(r.detail).length > 0) ?? long30[0];
      if (single30) {
        const drug = extractDrugTokens(single30.detail)[0];
        return {
          ...base,
          verdict: "yes",
          evidence: buildEvidence([single30]),
          reasoning: `${single30.date} ${drug ?? "처방 약물"} 투약일수 ${single30.days}일 — 30일 이상 투약에 해당`,
        };
      }

      const medication30 = [...dayssByGroup.entries()].find(([, g]) => g.days >= 30);
      if (medication30) {
        const drugs = [
          ...new Set(
            medication30[1].rows.flatMap((r) => extractDrugTokens(r.detail)),
          ),
        ].slice(0, 3);
        return {
          ...base,
          verdict: "yes",
          evidence: buildEvidence(medication30[1].rows),
          reasoning: `${groupLabel(medication30[0], rows)} 처방 합계 ${medication30[1].days}일${drugs.length ? ` (${drugs.join(", ")})` : ""} — 30일 이상 투약에 해당`,
        };
      }

      const treat7 = [...datesByGroup.entries()].find(([, g]) => g.dates.size >= 7);
      if (treat7) {
        return {
          ...base,
          verdict: "yes",
          evidence: buildEvidence(treat7[1].rows),
          reasoning: `${groupLabel(treat7[0], rows)} 통원 ${treat7[1].dates.size}일 — 7일 이상 계속 치료에 해당`,
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
