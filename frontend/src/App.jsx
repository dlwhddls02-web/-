import { useState, useEffect, useRef } from "react";
import axios from "axios";
import Dashboard from "./Dashboard";
import AgentCard from "./AgentCard";
import LogFeed from "./LogFeed";
import RunButton from "./RunButton";

const API = "";          // 같은 origin (FastAPI)
const AGENTS = [
  { key: "auto",     label: "🤖 자동",    color: "#4b5563" },
  { key: "customer", label: "👥 고객",    color: "#0891b2" },
  { key: "contract", label: "📋 계약",    color: "#059669" },
  { key: "report",   label: "📈 실적",    color: "#d97706" },
  { key: "schedule", label: "📅 일정",    color: "#2563eb" },
  { key: "sns",      label: "📱 SNS",     color: "#7c3aed" },
];

export default function App() {
  const [tab, setTab] = useState("chat");           // chat | dashboard | live
  const [activeAgent, setActiveAgent] = useState("auto");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [schedulerOn, setSchedulerOn] = useState(false);
  const bottomRef = useRef(null);
  const prevLogLen = useRef(0);

  // 3초마다 활동 로그 + 대기 회의 폴링
  useEffect(() => {
    const poll = async () => {
      try {
        const [logRes, meetRes, schRes] = await Promise.all([
          axios.get(`${API}/api/activity/recent?limit=80`),
          axios.get(`${API}/api/meeting/active`),
          axios.get(`${API}/api/scheduler/status`).catch(() => ({ data: { running: false } })),
        ]);
        const newLogs = logRes.data.logs || [];
        if (newLogs.length > prevLogLen.current) {
          setUnread(u => u + (newLogs.length - prevLogLen.current));
        }
        prevLogLen.current = newLogs.length;
        setLogs(newLogs);
        setActiveMeeting(meetRes.data.meeting || null);
        setSchedulerOn(schRes.data.running || false);
      } catch (_) {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // 채팅 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const agentColor = AGENTS.find(a => a.key === activeAgent)?.color || "#4b5563";

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/chat`, { message: text, agent: activeAgent });
      const d = res.data;
      setMessages(m => [...m, {
        role: "agent",
        content: d.response,
        agent: d.agent,
        desc: d.agent_description,
        reason: d.route_reason,
      }]);
    } catch (e) {
      setMessages(m => [...m, { role: "agent", content: `오류: ${e.message}`, agent: "auto" }]);
    } finally {
      setLoading(false);
    }
  };

  const resetConv = async () => {
    await axios.post(`${API}/api/reset`, { agent: activeAgent === "auto" ? null : activeAgent });
    setMessages([]);
  };

  const handleLiveTabClick = () => {
    setTab("live");
    setUnread(0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", fontFamily: "system-ui, sans-serif", background: "#f1f5f9" }}>

      {/* 헤더 */}
      <header style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", color: "white", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🏢 보험영업팀 AI 에이전트</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            {schedulerOn ? "⚙️ 24시간 자동 운영 중" : "⚙️ 서버 연결 중..."}
          </div>
        </div>
        {activeMeeting && (
          <button onClick={() => setTab("meeting")}
            style={{ background: "#dc2626", border: "none", color: "white", borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", animation: "pulse 1.5s infinite" }}>
            🏢 회의 참여
          </button>
        )}
        <button onClick={resetConv}
          style={{ background: "rgba(255,255,255,.2)", border: "none", color: "white", borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>
          초기화
        </button>
      </header>

      {/* 탭 */}
      <nav style={{ background: "white", padding: "8px 10px", display: "flex", gap: 7, borderBottom: "1px solid #e5e7eb", flexShrink: 0, overflowX: "auto" }}>
        {[
          { id: "chat",      label: "💬 채팅" },
          { id: "dashboard", label: "📊 대시보드" },
          { id: "live",      label: `⚡ 실시간${unread > 0 ? ` (${unread})` : ""}` },
          { id: "meeting",   label: "🏢 회의" },
        ].map(t => (
          <button key={t.id}
            onClick={() => t.id === "live" ? handleLiveTabClick() : setTab(t.id)}
            style={{
              padding: "6px 14px", borderRadius: 20, border: "2px solid",
              borderColor: tab === t.id ? "#2563eb" : "#e5e7eb",
              background: tab === t.id ? "#2563eb" : "white",
              color: tab === t.id ? "white" : "#6b7280",
              fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
              position: "relative",
            }}>
            {t.label}
            {t.id === "live" && unread > 0 && tab !== "live" && (
              <span style={{ position: "absolute", top: -4, right: -4, background: "#dc2626", color: "white", borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{unread > 9 ? "9+" : unread}</span>
            )}
          </button>
        ))}
      </nav>

      {/* 콘텐츠 영역 */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* 채팅 */}
        {tab === "chat" && (
          <>
            {/* 에이전트 선택 */}
            <div style={{ background: "white", padding: "6px 10px", display: "flex", gap: 6, overflowX: "auto", borderBottom: "1px solid #f3f4f6" }}>
              {AGENTS.map(a => (
                <button key={a.key} onClick={() => setActiveAgent(a.key)}
                  style={{ padding: "4px 12px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0,
                    background: activeAgent === a.key ? a.color : "#f3f4f6",
                    color: activeAgent === a.key ? "white" : "#4b5563" }}>
                  {a.label}
                </button>
              ))}
            </div>

            {/* 메시지 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "40px 20px" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🏢</div>
                  <div style={{ fontWeight: 700, color: "#374151", marginBottom: 6 }}>보험영업팀 AI에 오신 것을 환영합니다</div>
                  <div style={{ fontSize: 13 }}>에이전트를 선택하거나 자동으로 대화를 시작하세요</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
                    {["고객 추가해줘", "이번달 실적 조회", "인스타 게시물 올려줘", "팀원 등록", "계약 현황 보여줘"].map(q => (
                      <button key={q} onClick={() => { setInput(q); }}
                        style={{ padding: "7px 12px", borderRadius: 20, border: "1.5px solid #e5e7eb", background: "white", fontSize: 12, cursor: "pointer", color: "#374151" }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 8, flexDirection: m.role === "user" ? "row-reverse" : "row", alignItems: "flex-end" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: m.role === "user" ? "#2563eb" : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                    {m.role === "user" ? "👤" : "🤖"}
                  </div>
                  <div style={{ maxWidth: "calc(100% - 46px)" }}>
                    {m.desc && <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, paddingLeft: 4 }}>{m.desc}</div>}
                    <div style={{
                      padding: "10px 14px", borderRadius: 18, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      background: m.role === "user" ? "#2563eb" : "white",
                      color: m.role === "user" ? "white" : "#1f2937",
                      borderBottomRightRadius: m.role === "user" ? 4 : 18,
                      borderBottomLeftRadius: m.role === "user" ? 18 : 4,
                      boxShadow: m.role === "user" ? "none" : "0 1px 4px rgba(0,0,0,.08)",
                      borderLeft: m.role === "agent" && m.agent ? `3px solid ${AGENTS.find(a=>a.key===m.agent)?.color||"#e5e7eb"}` : "none",
                    }}>
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>🤖</div>
                  <div style={{ background: "white", borderRadius: 18, borderBottomLeftRadius: 4, padding: "12px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.08)", display: "flex", gap: 5 }}>
                    {[0,1,2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#9ca3af", display: "inline-block", animation: `bounce 1.2s ${i*0.2}s infinite` }} />)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* 입력 */}
            <div style={{ background: "white", borderTop: "1px solid #e5e7eb", padding: "10px 12px", display: "flex", gap: 8, flexShrink: 0 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder={`${AGENTS.find(a=>a.key===activeAgent)?.label || "자동"} 에이전트에게 메시지...`}
                style={{ flex: 1, border: "1.5px solid #e5e7eb", borderRadius: 24, padding: "10px 16px", fontSize: 14, outline: "none", background: "#f9fafb" }}
              />
              <button onClick={sendMessage} disabled={loading || !input.trim()}
                style={{ background: loading || !input.trim() ? "#e5e7eb" : agentColor, border: "none", borderRadius: "50%", width: 44, height: 44, color: "white", fontSize: 18, cursor: "pointer", flexShrink: 0, transition: "background .2s" }}>
                ➤
              </button>
            </div>
          </>
        )}

        {/* 대시보드 */}
        {tab === "dashboard" && <Dashboard api={API} />}

        {/* 실시간 활동 */}
        {tab === "live" && <LogFeed logs={logs} />}

        {/* 회의 */}
        {tab === "meeting" && <RunButton api={API} activeMeeting={activeMeeting} agents={AGENTS} />}

      </main>

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.7} }
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
    </div>
  );
}
