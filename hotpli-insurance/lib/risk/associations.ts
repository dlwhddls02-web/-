import "server-only";

/**
 * 질환 연관성 참고 테이블 — 일반 의학 상식 수준의 대표 연관질환만 담는다.
 * 직접 작성 (외부 서비스 자산 미참조). "위험도 예측"이 아니라 "연관성 정보 제공"이며,
 * 화면에는 반드시 의학적 진단이 아니라는 면책 문구와 함께 노출한다.
 */
export interface RiskAssociation {
  /** 보유 질환 매칭 패턴 (KCD 코드) */
  match: RegExp;
  matchName: string; // 매칭된 보유 질환명 (설명용)
  related: { name: string; codes: string[]; reason: string }[];
}

export const RISK_ASSOCIATIONS: RiskAssociation[] = [
  {
    match: /^I1[0-5]/,
    matchName: "고혈압",
    related: [
      {
        name: "허혈성 심장질환(협심증·심근경색)",
        codes: ["I20", "I21", "I25"],
        reason: "고혈압은 관상동맥 부담을 높이는 대표적 위험 요인",
      },
      {
        name: "뇌혈관질환(뇌경색·뇌출혈)",
        codes: ["I60", "I63"],
        reason: "혈압 관리가 안 되면 뇌혈관 사건 위험이 높아짐",
      },
    ],
  },
  {
    match: /^E1[0-4]/,
    matchName: "당뇨병",
    related: [
      {
        name: "당뇨병성 신장 합병증",
        codes: ["N18"],
        reason: "장기간 혈당 관리 문제는 신장 기능 저하로 이어질 수 있음",
      },
      {
        name: "허혈성 심장질환",
        codes: ["I25"],
        reason: "당뇨병은 심혈관질환의 주요 위험 요인",
      },
    ],
  },
  {
    match: /^E78/,
    matchName: "이상지질혈증(고지혈증)",
    related: [
      {
        name: "협심증·심근경색",
        codes: ["I20", "I21"],
        reason: "혈중 지질 이상은 동맥경화·관상동맥질환과 연관",
      },
    ],
  },
  {
    match: /^K80/,
    matchName: "담석증",
    related: [
      {
        name: "담낭염·췌장염",
        codes: ["K81", "K85"],
        reason: "담석은 담낭염·급성 췌장염의 흔한 선행 요인",
      },
    ],
  },
  {
    match: /^F3[2-3]/,
    matchName: "우울에피소드",
    related: [
      {
        name: "수면장애·불안장애",
        codes: ["G47", "F41"],
        reason: "기분장애는 수면·불안 문제와 동반되는 경우가 많음",
      },
    ],
  },
  {
    match: /^J4[45]/,
    matchName: "천식·만성 하기도질환",
    related: [
      {
        name: "만성폐쇄성폐질환(COPD)",
        codes: ["J44"],
        reason: "만성 기도질환은 폐 기능 저하로 진행될 수 있음",
      },
    ],
  },
  {
    match: /^K21/,
    matchName: "위-식도역류병",
    related: [
      {
        name: "식도염·식도 협착",
        codes: ["K22"],
        reason: "장기간 역류는 식도 점막 손상과 연관",
      },
    ],
  },
  {
    match: /^M5[14]/,
    matchName: "허리 통증·추간판 질환",
    related: [
      {
        name: "추간판 장애 진행",
        codes: ["M51"],
        reason: "반복되는 요통은 디스크 질환으로 이어질 수 있음",
      },
    ],
  },
];

export interface RiskItem {
  name: string;
  reason: string;
  relatedCodes: string[];
  /** 보유 질환 중 무엇 때문에 나온 항목인지 */
  basedOn: string;
  source: "rule" | "ai";
}

/** 보유 KCD 코드 목록 → 룰 기반 연관질환 항목 (중복 제거) */
export function matchRiskAssociations(codes: string[]): RiskItem[] {
  const items: RiskItem[] = [];
  const seen = new Set<string>();
  for (const assoc of RISK_ASSOCIATIONS) {
    if (!codes.some((c) => assoc.match.test(c))) continue;
    for (const rel of assoc.related) {
      if (seen.has(rel.name)) continue;
      seen.add(rel.name);
      items.push({
        name: rel.name,
        reason: rel.reason,
        relatedCodes: rel.codes,
        basedOn: assoc.matchName,
        source: "rule",
      });
    }
  }
  return items;
}
