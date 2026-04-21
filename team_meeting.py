"""
팀 자율 회의 엔진

에이전트들이 DB 데이터를 기반으로 현황을 분석하고,
총괄 디렉터 AI가 전략을 결정한 뒤 각 에이전트에게 실행을 지시합니다.
사용자에게는 최종 보고서만 전달됩니다.
"""

import json
from datetime import datetime
import anthropic

from config import ANTHROPIC_API_KEY, MODEL
from storage.database import get_connection

MODERATOR_PROMPT = """당신은 영업팀 AI 총괄 디렉터입니다.

5개 전문 에이전트(마케팅, 고객관리, 실적관리, 온보딩, 커뮤니케이션)의 현황 보고를 받아
팀의 성장을 위한 최적의 전략을 결정하고 각 에이전트에게 실행 지시를 내립니다.

결정 기준:
1. 지금 당장 가장 시급한 문제가 무엇인가?
2. 팀 매출과 성장에 가장 큰 레버리지를 줄 수 있는 액션은?
3. 각 에이전트가 구체적으로 무엇을 실행해야 하는가?

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "situation_summary": "현황 요약 2-3문장",
  "key_issues": ["핵심 문제 1", "핵심 문제 2", "핵심 문제 3"],
  "decisions": [
    {
      "agent": "에이전트키(marketing/customer_management/performance/onboarding/communication)",
      "action": "구체적 실행 지시문 (에이전트가 바로 수행할 수 있도록 상세하게)",
      "priority": "high/medium/low",
      "reason": "이 결정의 근거"
    }
  ],
  "expected_outcome": "이번 회의 실행 후 기대 효과"
}"""


def gather_team_state() -> dict:
    """DB에서 팀 전체 현황 데이터를 수집합니다."""
    conn = get_connection()
    c = conn.cursor()
    now = datetime.now()
    period = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")

    state = {}
    try:
        # 팀원 현황
        c.execute("SELECT COUNT(*) as cnt FROM team_members WHERE is_active=1")
        state["team_size"] = c.fetchone()["cnt"]

        # 마케팅 현황
        c.execute("SELECT COUNT(*) as cnt FROM customers")
        total = c.fetchone()["cnt"]
        c.execute("SELECT COUNT(*) as cnt FROM customers WHERE assigned_to IS NULL AND status='prospect'")
        unassigned = c.fetchone()["cnt"]
        c.execute("SELECT COUNT(*) as cnt FROM customers WHERE lead_score >= 70 AND status='prospect'")
        high_leads = c.fetchone()["cnt"]
        c.execute("SELECT COUNT(*) as cnt FROM customers WHERE status='prospect'")
        prospects = c.fetchone()["cnt"]
        state["marketing"] = {
            "총 고객수": total,
            "미배정 잠재고객": unassigned,
            "고리드(70점+) 고객": high_leads,
            "잠재고객": prospects,
        }

        # 고객관리 현황
        c.execute(
            "SELECT status, COUNT(*) as cnt FROM customers GROUP BY status"
        )
        pipeline = {r["status"]: r["cnt"] for r in c.fetchall()}
        c.execute(
            "SELECT COUNT(*) as cnt FROM followups WHERE status='pending' AND followup_date < ?",
            (today,),
        )
        overdue_followups = c.fetchone()["cnt"]
        c.execute(
            "SELECT COUNT(*) as cnt FROM followups WHERE status='pending' AND followup_date = ?",
            (today,),
        )
        today_followups = c.fetchone()["cnt"]
        state["customer_management"] = {
            "파이프라인": pipeline,
            "오늘 팔로업": today_followups,
            "기한초과 팔로업": overdue_followups,
        }

        # 실적 현황
        c.execute(
            """SELECT tm.name, tm.role,
               COALESCE(pr.sales_amount, 0) as sales,
               COALESCE(pr.deals_closed, 0) as deals,
               COALESCE(pr.calls_made, 0) as calls,
               COALESCE(pt.target_sales_amount, 0) as target
               FROM team_members tm
               LEFT JOIN performance_records pr ON tm.id=pr.member_id AND pr.period=?
               LEFT JOIN performance_targets pt ON tm.id=pt.member_id AND pt.period=?
               WHERE tm.is_active=1""",
            (period, period),
        )
        members = [dict(r) for r in c.fetchall()]
        total_sales = sum(m["sales"] for m in members)
        total_target = sum(m["target"] for m in members)
        team_rate = round(total_sales / total_target * 100) if total_target else 0
        underperformers = [m["name"] for m in members if m["target"] > 0 and m["sales"] / m["target"] < 0.7]
        state["performance"] = {
            "기간": period,
            "팀 매출 달성률": f"{team_rate}%",
            "팀 총매출": f"{total_sales:,.0f}만원",
            "팀 목표": f"{total_target:,.0f}만원",
            "팀원별_실적": members,
            "목표70%미달_팀원": underperformers,
        }

        # 온보딩 현황
        c.execute("SELECT COUNT(*) as cnt FROM onboarding_plans WHERE status='active'")
        active = c.fetchone()["cnt"]
        c.execute("SELECT AVG(overall_progress) as avg FROM onboarding_plans WHERE status='active'")
        avg_prog = round(c.fetchone()["avg"] or 0)
        c.execute(
            "SELECT COUNT(*) as cnt FROM team_members WHERE "
            "hire_date >= date('now', '-90 days') AND is_active=1"
        )
        new_members = c.fetchone()["cnt"]
        state["onboarding"] = {
            "온보딩 진행중": active,
            "평균 진행률": f"{avg_prog}%",
            "최근90일 입사자": new_members,
        }

        # 커뮤니케이션 현황
        c.execute("SELECT COUNT(*) as cnt FROM messages WHERE is_read=0 AND recipient_id IS NULL")
        unread_announcements = c.fetchone()["cnt"]
        c.execute(
            "SELECT COUNT(*) as cnt FROM meetings WHERE status='scheduled' AND scheduled_at >= ?",
            (today,),
        )
        upcoming_meetings = c.fetchone()["cnt"]
        state["communication"] = {
            "읽지않은 공지": unread_announcements,
            "예정된 미팅": upcoming_meetings,
        }

    finally:
        conn.close()

    return state


class TeamMeeting:
    def __init__(self, orchestrator):
        self.orchestrator = orchestrator
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    AGENT_LABELS = {
        "marketing": "📊 마케팅",
        "customer_management": "👥 고객관리",
        "performance": "📈 실적관리",
        "onboarding": "🎓 온보딩",
        "communication": "💬 커뮤니케이션",
    }

    def run(self, topic: str = None) -> dict:
        log = []
        start = datetime.now()

        def note(speaker: str, msg: str):
            entry = {"speaker": speaker, "message": msg, "time": datetime.now().strftime("%H:%M:%S")}
            log.append(entry)

        # ── 1단계: 현황 수집 ────────────────────────────────
        note("🏢 시스템", "팀 회의를 시작합니다. 현황 데이터를 수집합니다...")
        state = gather_team_state()

        if state["team_size"] == 0:
            return {
                "log": log,
                "report": "등록된 팀원이 없습니다. 먼저 팀원을 등록해 주세요.",
                "executed": [],
                "duration": 0,
            }

        for key, label in self.AGENT_LABELS.items():
            data = state.get(key, {})
            note(label, "현황 보고: " + json.dumps(data, ensure_ascii=False))

        # ── 2단계: 총괄 디렉터 전략 결정 ─────────────────────
        note("🎯 총괄 디렉터", "모든 현황을 분석하고 전략을 수립합니다...")
        state_text = json.dumps(state, ensure_ascii=False, indent=2)
        topic_line = f"\n\n오늘의 특별 안건: {topic}" if topic else ""

        resp = self.client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=[{"type": "text", "text": MODERATOR_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{
                "role": "user",
                "content": f"현재 팀 현황:\n{state_text}{topic_line}\n\n팀 성장을 위한 전략을 결정하고 실행 지시를 내려주세요.",
            }],
        )

        raw = resp.content[0].text.strip()
        try:
            if "```" in raw:
                raw = raw.split("```")[1] if "```json" not in raw else raw.split("```json")[1]
                raw = raw.split("```")[0].strip()
            data = json.loads(raw)
        except Exception:
            data = {"situation_summary": raw[:300], "key_issues": [], "decisions": [], "expected_outcome": ""}

        summary = data.get("situation_summary", "")
        key_issues = data.get("key_issues", [])
        decisions = data.get("decisions", [])
        expected = data.get("expected_outcome", "")

        note("🎯 총괄 디렉터", f"현황 분석 완료: {summary}")
        for issue in key_issues:
            note("🎯 총괄 디렉터", f"⚠️ 핵심 문제: {issue}")
        note("🎯 총괄 디렉터", f"총 {len(decisions)}개 실행 지시 결정")

        # ── 3단계: 각 에이전트 실행 ──────────────────────────
        executed = []
        for dec in sorted(decisions, key=lambda d: {"high": 0, "medium": 1, "low": 2}.get(d.get("priority", "low"), 1)):
            agent_key = dec.get("agent", "")
            action = dec.get("action", "")
            priority = dec.get("priority", "medium")
            reason = dec.get("reason", "")

            if not agent_key or agent_key not in self.orchestrator.agents:
                continue

            label = self.AGENT_LABELS.get(agent_key, agent_key)
            note(label, f"[{priority.upper()}] 지시 수신 → {action[:80]}...")
            note(label, f"근거: {reason}")

            try:
                result = self.orchestrator.agents[agent_key].run(action)
                response_text = result.get("response", "")
                note(label, f"✅ 실행 완료: {response_text[:120]}...")
                executed.append({
                    "agent": agent_key,
                    "label": label,
                    "action": action,
                    "result": response_text,
                    "priority": priority,
                    "reason": reason,
                })
            except Exception as e:
                note(label, f"❌ 실행 실패: {e}")

        # ── 4단계: 보고서 작성 ───────────────────────────────
        duration = int((datetime.now() - start).total_seconds())
        note("🏢 시스템", f"회의 완료. 총 소요시간 {duration}초, 실행된 액션 {len(executed)}건")

        report = self._build_report(summary, key_issues, executed, expected, duration, state)
        return {"log": log, "report": report, "executed": executed, "duration": duration}

    def _build_report(self, summary, issues, executed, expected, duration, state):
        now = datetime.now().strftime("%Y년 %m월 %d일 %H:%M")
        lines = [
            f"## 📋 팀 자율 회의 결과 보고  |  {now}",
            "",
            f"### 현황 요약",
            summary,
            "",
        ]
        if issues:
            lines += ["### ⚠️ 핵심 문제점"] + [f"- {i}" for i in issues] + [""]

        high = [e for e in executed if e["priority"] == "high"]
        mid  = [e for e in executed if e["priority"] == "medium"]
        low  = [e for e in executed if e["priority"] == "low"]

        lines.append(f"### ✅ 실행 완료 ({len(executed)}건)")
        for group, label in [(high, "🔴 긴급"), (mid, "🟡 일반"), (low, "🟢 여유")]:
            for e in group:
                lines += [f"**{label} | {e['label']}**", f"- 지시: {e['action']}", f"- 결과: {e['result'][:200]}", ""]

        if expected:
            lines += [f"### 🚀 기대 효과", expected, ""]

        perf = state.get("performance", {})
        lines += [
            f"### 📊 현재 팀 지표",
            f"- 이번 달 매출 달성률: {perf.get('팀 매출 달성률', 'N/A')}",
            f"- 총 고객수: {state.get('marketing', {}).get('총 고객수', 0)}명",
            f"- 진행중 온보딩: {state.get('onboarding', {}).get('온보딩 진행중', 0)}명",
            "",
            f"---",
            f"*소요시간 {duration}초 · 실행 {len(executed)}건 · 자율 회의 시스템*",
        ]
        return "\n".join(lines)
