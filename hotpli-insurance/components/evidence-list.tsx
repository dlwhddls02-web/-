import type { Evidence } from "@/types";

/**
 * 판정 근거 목록 — 날짜 · 질병/상해명(KCD 코드) · (수술명)만 깔끔하게.
 * 구조화 필드가 없는 구버전 데이터는 원문으로 폴백.
 */
export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {evidence.map((e, i) => {
        const structured = e.diseaseNames !== undefined;
        const names = (e.diseaseNames ?? []).filter(Boolean);
        const codes = e.kcdCodes ?? [];
        return (
          <li key={i} className="text-[12px] leading-relaxed">
            <p>
              <span className="font-semibold">{e.date}</span>
              {structured ? (
                <>
                  {" · "}
                  <span className="font-medium">
                    {names.length > 0
                      ? names.join(", ")
                      : (e.category ?? "진료 기록")}
                  </span>
                  {codes.length > 0 && (
                    <span className="text-ink/40"> ({codes.join(", ")})</span>
                  )}
                  {e.days != null && e.days >= 2 && (
                    <span className="text-ink/40"> · {e.days}일</span>
                  )}
                </>
              ) : (
                <>
                  {" · "}
                  <span>{e.provider}</span>
                </>
              )}
              <span className="text-ink/35"> · 원문 {e.sourceRow}행</span>
            </p>
            {e.surgeryName && (
              <p className="text-violet font-semibold">
                수술 · {e.surgeryName}
              </p>
            )}
            {!structured && (
              <p className="text-ink/55 break-all">{e.detail}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
