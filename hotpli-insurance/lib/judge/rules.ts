import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { Evidence, Verdict } from "@/types";
import type { QuestionDef } from "./questions";

/**
 * 룰 기반 1차 판정 — 기간·횟수 계산은 100% 여기(코드)서 한다.
 * 날짜 비교·기간 계산·횟수 집계에 AI를 절대 쓰지 않는다.
 * 룰이 확정 못 하는 케이스만 needs_check로 남겨 lib/judge/ai.ts로 넘긴다.
 */
export interface RuleJudgment {
  questionKey: string;
  verdict: Verdict;
  evidence: Evidence[];
  decidedBy: "rule";
}

/** Sprint 2: 질문별 기간 필터 + 조건 집계 (예: 3개월 투약, 5년 입원, 7일 이상 치료) */
export function judgeByRules(
  _rows: TreatmentRow[],
  _questions: readonly QuestionDef[],
  _baseDate: Date,
): RuleJudgment[] {
  throw new Error("Sprint 2에서 구현: 룰 기반 기간·횟수 판정");
}
