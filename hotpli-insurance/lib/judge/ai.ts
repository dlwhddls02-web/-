import "server-only";
import type { Evidence, Verdict } from "@/types";

/**
 * Claude 판정 — 룰이 못 정하는 애매 케이스만 (재검 권고 문구 해석 등).
 * 원칙:
 * - Structured Output으로만 받는다 (자유 텍스트 파싱 금지)
 * - evidence(원문 행 참조) 없는 판정은 버린다
 * - 확신 없으면 needs_check를 반환하도록 프롬프트 설계
 * - 산수(날짜·횟수·기간 계산)는 시키지 않는다 — rules.ts가 이미 끝낸 상태로 호출
 */
export interface AiJudgment {
  questionKey: string;
  verdict: Verdict;
  evidence: Evidence[];
  reasoning: string;
  decidedBy: "ai";
}

/** Sprint 2: @anthropic-ai/sdk + zod 스키마 기반 structured output */
export async function judgeByAi(): Promise<AiJudgment[]> {
  throw new Error("Sprint 2에서 구현: Claude 판정 (structured output + evidence)");
}
