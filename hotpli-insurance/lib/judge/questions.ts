/**
 * 고지의무 질문 정의.
 * 기간(windowMonths)·횟수(threshold) 판정은 전부 lib/judge/rules.ts의 코드가 계산한다.
 * AI에게 산수를 시키지 않는다.
 *
 * TODO(Sprint 2): 실제 청약서 고지사항 문안 기준으로 질문 세트·문구 확정
 */
export interface QuestionDef {
  key: string;
  label: string; // 설계사에게 보여줄 질문 요약
  windowMonths: number; // 조회 기간 (개월)
  kind: "medication" | "diagnosis" | "recheck" | "hospitalization" | "surgery" | "long_treatment";
}

export const QUESTIONS: readonly QuestionDef[] = [
  {
    key: "q_3m_medication",
    label: "최근 3개월 이내 의료행위(진찰·검사·투약·처방) 여부",
    windowMonths: 3,
    kind: "medication",
  },
  {
    key: "q_1y_recheck",
    label: "최근 1년 이내 추가검사(재검사) 필요 소견 여부",
    windowMonths: 12,
    kind: "recheck",
  },
  {
    key: "q_5y_hospitalization",
    label: "최근 5년 이내 입원 여부",
    windowMonths: 60,
    kind: "hospitalization",
  },
  {
    key: "q_5y_surgery",
    label: "최근 5년 이내 수술 여부",
    windowMonths: 60,
    kind: "surgery",
  },
  {
    key: "q_5y_long_treatment",
    label: "최근 5년 이내 7일 이상 계속 치료 또는 30일 이상 투약 여부",
    windowMonths: 60,
    kind: "long_treatment",
  },
] as const;
