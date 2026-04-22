export default function AgentCard({ agent, lastLog }) {
  const statusColor = {
    success: "#059669",
    error:   "#dc2626",
    warning: "#d97706",
    info:    "#2563eb",
  }[lastLog?.status || "info"] || "#2563eb";

  const statusIcon = {
    success: "✅",
    error:   "❌",
    warning: "⚠️",
    info:    "🔵",
  }[lastLog?.status || "info"];

  return (
    <div style={{
      background: "white",
      borderRadius: 14,
      padding: "12px 14px",
      borderLeft: `3px solid ${agent.color}`,
      boxShadow: "0 1px 4px rgba(0,0,0,.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: agent.color }}>{agent.label}</div>
        {lastLog && (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{lastLog.created_at?.slice(11, 16)}</span>
        )}
      </div>
      {lastLog ? (
        <div>
          <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.4 }}>
            {statusIcon} {lastLog.action}
          </div>
          {lastLog.detail && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3, lineHeight: 1.3 }}>
              {lastLog.detail.slice(0, 60)}{lastLog.detail.length > 60 ? "..." : ""}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#9ca3af" }}>대기 중</div>
      )}
    </div>
  );
}
