import { useState } from "react";
import axios from "axios";

export default function RunButton({ api, activeMeeting, agents }) {
  const [phase, setPhase] = useState("home");   // home | planning | form | executing | done
  const [topic, setTopic] = useState("");
  const [planData, setPlanData] = useState(null);
  const [meetingId, setMeetingId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const agentLabel = key => agents.find(a => a.key === key)?.label || key;

  // Phase 1: 전략 수립
  const startPlanning = async (fromScheduled = false) => {
    if (fromScheduled && activeMeeting) {
      setPlanData(activeMeeting.plan_data);
      setMeetingId(activeMeeting.id);
      setPhase("form");
      return;
    }
    setBusy(true);
    setPhase("planning");
    try {
      const res = await axios.post(`${api}/api/meeting/plan`, { topic: topic || null });
      setPlanData(res.data);
      setMeetingId(null);
      setPhase("form");
    } catch (e) {
      alert(`오류: ${e.message}`);
      setPhase("home");
    } finally {
      setBusy(false);
    }
  };

  // Phase 2: 실행
  const execute = async () => {
    const assignments = planData?.assignments || [];
    setBusy(true);
    setPhase("executing");
    try {
      const res = await axios.post(
        `${api}/api/meeting/execute`,
        {
          meeting_id: meetingId ?? 0,
          assignments,
          answers,
        },
        { timeout: 300000 }   // 5분 타임아웃
      );
      setResult(res.data);
      setPhase("done");
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || "알 수 없는 오류";
      alert(`실행 오류: ${msg}`);
      setPhase("form");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setPhase("home"); setPlanData(null); setAnswers({}); setResult(null); setMeetingId(null); };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>

      {/* 스케줄러가 준비한 회의 배너 */}
      {activeMeeting && phase === "home" && (
        <div style={{ background: "linear-gradient(135deg,#dc2626,#7c3aed)", borderRadius: 16, padding: "16px 18px", color: "white", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🏢 자율 회의가 준비됐습니다!</div>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5, marginBottom: 12 }}>
            에이전트들이 주간 전략을 수립했습니다.<br />
            팀장님이 참여하면 더 정확하게 실행됩니다.
          </div>
          <button onClick={() => startPlanning(true)}
            style={{ background: "white", color: "#dc2626", border: "none", borderRadius: 20, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            참여하기 →
          </button>
        </div>
      )}

      {/* 홈 */}
      {phase === "home" && (
        <div>
          <div style={{ fontWeight: 700, color: "#1e3a5f", fontSize: 16, marginBottom: 4 }}>🏢 팀 자율 회의</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, lineHeight: 1.6 }}>
            에이전트들이 팀 현황을 분석하고 전략을 수립합니다.<br />
            팀장님의 의견을 반영해 각 에이전트가 실제로 업무를 실행합니다.
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>오늘의 안건 (선택)</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="예: 이번달 계약 목표 달성 전략"
              style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 14, outline: "none" }}
            />
          </div>
          <button onClick={() => startPlanning(false)} disabled={busy}
            style={{ width: "100%", background: "linear-gradient(135deg,#1e3a5f,#2563eb)", color: "white", border: "none", borderRadius: 14, padding: "14px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            🚀 회의 시작
          </button>
          <div style={{ marginTop: 16, background: "white", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>⏰ 자동 운영 일정</div>
            {[
              { time: "월·수·금 09:00", action: "📸 인스타그램 보험 콘텐츠 자동 게시" },
              { time: "화·목 19:00",    action: "📘 페이스북 보험 콘텐츠 자동 게시" },
              { time: "매주 월요일 08:30", action: "🏢 주간 자율 회의 준비 (팀장 참여 대기)" },
              { time: "매일 08:00",    action: "📋 팔로업 기한 초과 점검 + 카카오 알림" },
              { time: "매월 1일 09:00", action: "📊 월간 성과 보고서 자동 생성" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: "#6b7280", minWidth: 110, flexShrink: 0 }}>{s.time}</span>
                <span style={{ color: "#374151" }}>{s.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전략 수립 중 */}
      {phase === "planning" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", gap: 16 }}>
          <div style={{ fontSize: 40 }}>🤔</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f" }}>전략 수립 중...</div>
          <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>총괄 디렉터가 팀 현황을 분석하고<br />각 에이전트에게 업무를 배분하고 있습니다.</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", display: "inline-block", animation: `bounce 1.2s ${i*0.2}s infinite` }} />)}
          </div>
        </div>
      )}

      {/* 폼 (팀장 정보 입력) */}
      {phase === "form" && planData && (
        <div>
          <div style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", borderRadius: 16, padding: "14px 16px", color: "white", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>📋 전략 개요</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.9 }}>{planData.strategy_overview}</div>
            {planData.priority_order?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {planData.priority_order.map((p, i) => (
                  <div key={i} style={{ fontSize: 11, marginTop: 3 }}>
                    <span style={{ opacity: 0.7 }}>{i+1}순위</span> {p}
                  </div>
                ))}
              </div>
            )}
          </div>

          {planData.assignments?.map((asgn, ai) => (
            <div key={ai} style={{ background: "white", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 4 }}>
                {agentLabel(asgn.agent)} — {asgn.task_title}
              </div>
              {asgn.why && <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>{asgn.why}</div>}
              {(asgn.requirements || []).map(req => (
                <div key={req.key} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    {req.label} {req.required && <span style={{ color: "#dc2626" }}>*</span>}
                  </label>
                  <input
                    placeholder={req.placeholder || ""}
                    value={answers[asgn.agent]?.[req.key] || ""}
                    onChange={e => setAnswers(prev => ({
                      ...prev,
                      [asgn.agent]: { ...(prev[asgn.agent] || {}), [req.key]: e.target.value },
                    }))}
                    style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }}
                  />
                  {req.question && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>💬 {req.question}</div>}
                </div>
              ))}
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={reset} style={{ flex: 1, background: "#f3f4f6", border: "none", borderRadius: 12, padding: "12px", fontSize: 13, cursor: "pointer", color: "#374151" }}>취소</button>
            <button onClick={execute} disabled={busy}
              style={{ flex: 2, background: "linear-gradient(135deg,#dc2626,#d97706)", color: "white", border: "none", borderRadius: 12, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              🚀 에이전트 실행
            </button>
          </div>
        </div>
      )}

      {/* 실행 중 */}
      {phase === "executing" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", gap: 16 }}>
          <div style={{ fontSize: 40 }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f" }}>에이전트 실행 중...</div>
          <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>각 에이전트가 업무를 실행하고 있습니다.<br />실시간 탭에서 진행 상황을 확인할 수 있습니다.</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", display: "inline-block", animation: `bounce 1.2s ${i*0.2}s infinite` }} />)}
          </div>
        </div>
      )}

      {/* 결과 */}
      {phase === "done" && result && (
        <div>
          <div style={{ background: "linear-gradient(135deg,#059669,#0891b2)", borderRadius: 16, padding: "14px 16px", color: "white", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>✅ 회의 완료</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {result.executed?.length || 0}개 업무 실행 · {result.duration || 0}초 소요
            </div>
          </div>
          <div style={{ background: "white", borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#1f2937" }}>
            {result.report}
          </div>
          <button onClick={reset} style={{ width: "100%", background: "#f3f4f6", border: "none", borderRadius: 12, padding: 12, fontSize: 14, cursor: "pointer", color: "#374151", fontWeight: 600 }}>
            새 회의 시작
          </button>
        </div>
      )}

      <style>{`@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}`}</style>
    </div>
  );
}
