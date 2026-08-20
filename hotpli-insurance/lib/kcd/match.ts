import "server-only";
import type { TreatmentRow } from "@/lib/pdf/parse-hira";
import type { DetectedKcd } from "@/types";
import { lookupKcd } from "./codes";

/**
 * 진료행 → KCD 집계. analyses.detected_kcd 형태로 반환.
 * 날짜 비교는 YYYY-MM-DD 문자열 정렬로 (코드가 계산, AI 아님).
 */
export function matchKcd(rows: TreatmentRow[]): DetectedKcd[] {
  const byCode = new Map<string, DetectedKcd>();

  for (const row of rows) {
    for (const code of row.kcdCodes) {
      const existing = byCode.get(code);
      if (existing) {
        existing.count += 1;
        if (row.date < existing.firstDate) existing.firstDate = row.date;
        if (row.date > existing.lastDate) existing.lastDate = row.date;
        // 사전 미등재였는데 원문 상병명이 있는 행을 만나면 이름 보강
        if (existing.name === "사전 미등재" && row.diseaseName) {
          existing.name = row.diseaseName;
        }
      } else {
        byCode.set(code, {
          code,
          // PDF 원문 상병명 우선, 없으면 KCD 사전
          name: row.diseaseName || lookupKcd(code).name,
          count: 1,
          firstDate: row.date,
          lastDate: row.date,
        });
      }
    }
  }

  return [...byCode.values()].sort((a, b) => b.count - a.count);
}
