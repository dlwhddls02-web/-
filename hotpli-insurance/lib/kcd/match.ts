import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { DetectedKcd } from "@/types";

/**
 * Sprint 2: 진료행 → KCD 매칭 (코드 → 질환명·분류).
 * analyses.detected_kcd 형태([{code,name,count,firstDate,lastDate}])로 집계한다.
 */
export function matchKcd(_rows: TreatmentRow[]): DetectedKcd[] {
  throw new Error("Sprint 2에서 구현: 진료행 → KCD 매칭");
}
