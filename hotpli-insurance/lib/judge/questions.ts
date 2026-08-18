/**
 * 고지의무 질문 정의 — 표준사업방법서상 "계약전 알릴의무" 기준.
 * (보험사별 청약서는 이 표준 세트의 변형이므로, 표준을 기본으로 두고
 *  회사별 변형은 추후 템플릿으로 확장한다)
 *
 * 기간(windowMonths)·횟수 판정은 전부 lib/judge/rules.ts의 코드가 계산한다.
 * AI에게 산수를 시키지 않는다.
 */
export type QuestionKind =
  | "medication" // 진찰·검사·치료·투약 (3개월)
  | "diagnosis" // (예비 — medication과 동일 처리)
  | "drug" // 마약·수면제 등 약물 상시 복용 (3개월)
  | "recheck" // 추가검사(재검사) (1년)
  | "hospitalization" // 입원 (5년)
  | "surgery" // 수술 (5년)
  | "long_treatment" // 7일 이상 계속 치료 · 30일 이상 투약 (5년)
  | "major_disease"; // 10대 질병 (5년)

export interface QuestionDef {
  key: string;
  label: string; // 설계사에게 보여줄 질문 요약
  windowMonths: number; // 조회 기간 (개월)
  kind: QuestionKind;
}

export const QUESTIONS: readonly QuestionDef[] = [
  {
    key: "q_3m_medication",
    label:
      "최근 3개월 이내 질병 확정진단·의심소견·치료·입원·수술·투약 여부",
    windowMonths: 3,
    kind: "medication",
  },
  {
    key: "q_3m_drug",
    label: "최근 3개월 이내 마약·수면제·진통제 등 약물 상시 복용 여부",
    windowMonths: 3,
    kind: "drug",
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
    label: "최근 5년 이내 수술(제왕절개 포함) 여부",
    windowMonths: 60,
    kind: "surgery",
  },
  {
    key: "q_5y_long_treatment",
    label: "최근 5년 이내 7일 이상 계속 치료 또는 30일 이상 투약 여부",
    windowMonths: 60,
    kind: "long_treatment",
  },
  {
    key: "q_5y_major_disease",
    label:
      "최근 5년 이내 10대 질병(암·백혈병·고혈압·협심증·심근경색·심장판막증·간경화증·뇌졸중·당뇨병·에이즈) 진단·치료 여부",
    windowMonths: 60,
    kind: "major_disease",
  },
] as const;
