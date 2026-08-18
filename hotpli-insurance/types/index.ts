/** analyses.status 진행 단계 */
export type AnalysisStatus =
  | "uploaded"
  | "parsing"
  | "judging"
  | "needs_review"
  | "confirmed";

/** AI 판정 3-상태 — 이 외의 값 금지 */
export type Verdict = "yes" | "no" | "needs_check";

/** 판정 주체: 룰(코드 계산) vs AI(해석) */
export type DecidedBy = "rule" | "ai";

export interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
  free_credits: number;
  created_at: string;
}

/** 심평원 자료 3종 구분 */
export type FileKind = "basic" | "detail" | "prescription";

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  basic: "기본진료내역",
  detail: "세부진료정보",
  prescription: "처방조제정보",
};

/** Storage 경로 맵 — {user_id}/{analysis_id}/{kind}.pdf */
export type AnalysisFiles = Partial<Record<FileKind, string>>;

export interface Analysis {
  id: string;
  owner_id: string;
  customer_name: string | null;
  customer_birth: string | null;
  status: AnalysisStatus;
  file_path: string | null;
  files: AnalysisFiles | null;
  parsed_rows: number | null;
  detected_kcd: DetectedKcd[] | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface DetectedKcd {
  code: string;
  name: string;
  count: number;
  firstDate: string; // YYYY-MM-DD
  lastDate: string; // YYYY-MM-DD
}

/** 판정 근거 — 반드시 파싱된 원문 행(sourceRow)과 연결 */
export interface Evidence {
  date: string;
  provider: string;
  detail: string;
  sourceRow: number;
}

export interface Judgment {
  id: string;
  analysis_id: string;
  question_key: string;
  ai_verdict: Verdict;
  ai_evidence: Evidence[] | null;
  ai_reasoning: string | null;
  final_verdict: Verdict | null;
  final_memo: string | null;
  decided_by: DecidedBy | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface ShareLink {
  id: string;
  analysis_id: string;
  token: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}
