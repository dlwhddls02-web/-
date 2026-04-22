import { useRef, useEffect } from "react";
import AgentCard from "./AgentCard";

const AGENTS = [
  { key: "customer", label: "👥 고객",    color: "#0891b2" },
  { key: "contract", label: "📋 계약",    color: "#059669" },
  { key: "report",   label: "📈 실적",    color: "#d97706" },
  { key: "schedule", label: "📅 일정",    color: "#2563eb" },
  { key: "sns",      label: "📱 SNS",     color: "#7c3aed" },
];

const STATUS_COLOR = { success: "#059669", error: "#dc2626", warning: "#d97706", info: "#6b7280" };
const STATUS_BG    = { success: "#dcfce7", error: "#fee2e2", warning: "#fef9c3", info: "#f1f5f9" };

export default function LogFeed({ logs }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const lastByAgent = {};
  logs.forEach(l => {
    const key = AGENTS.find(a => l.agent.includes(a.label.replace(/.*\s/,"")) || l.agent.toLowerCase().includes(a.key))?.key;
    if (key && !lastByAgent[key]) lastByAgent[key] = l;
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

      {/* 에이전트 상태 카드 */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>⚡ 에이전트 현황</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {AGENTS.map(a => (
            <AgentCard key={a.key} agent={a} lastLog={lastByAgent[a.key]} />
          ))}
        </div>
      </div>

      {/* 실시간 로그 */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
          📋 실시간 활동 로그 ({logs.length}건)
        </div>
        {logs.length === 0 && (
          <div style={{ background: "white", borderRadius: 12, padding: "20px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            아직 활동 로그가 없습니다.<br />에이전트가 작업을 시작하면 여기에 표시됩니다.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[...logs].reverse().map(log => (
            <div key={log.id} style={{
              background: STATUS_BG[log.status] || "#f1f5f9",
              borderRadius: 10,
              padding: "8px 12px",
              borderLeft: `3px solid ${STATUS_COLOR[log.status] || "#6b7280"}`,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}>
              <div style={{ flexShrink: 0, minWidth: 90 }}>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>{log.created_at?.slice(11, 19)}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[log.status] || "#6b7280" }}>{log.agent}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#1f2937", lineHeight: 1.4 }}>{log.action}</div>
                {log.detail && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{log.detail.slice(0, 100)}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
