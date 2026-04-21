"""
팀 자율 회의 엔진 v2

Phase 1 (Plan):  총괄 디렉터가 전략 수립 → 각 에이전트가 필요 정보 목록 반환
Phase 2 (Execute): 사용자 입력값 + 지시로 에이전트 실제 실행 → 보고서
"""

import json
from datetime import datetime
import anthropic

from config import ANTHROPIC_API_KEY, MODEL
from storage.database import get_connection

# ── 전략 수립 프롬프트 ─────────────────────────────────────────────────────
STRATEGY_PROMPT = """당신은 영업팀 AI 총괄 디렉터입니다.

팀 현황 데이터를 분석하고 성장 전략을 수립합니다.
각 에이전트에게 업무를 배분하되, 업무 실행에 필요한 정보를 사용자(팀장)에게 요청합니다.

중요: 사용자가 제공할 수 있는 현실적인 정보만 요청하세요.
(예: 타겟 업종, 월 목표 매출, 고객 예산 범위, 팀원 이름/연락처 등)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "strategy_overview": "현황 분석과 전략 방향 3-4문장",
  "priority_order": ["1순위 목표", "2순위 목표", "3순위 목표"],
  "assignments": [
    {
      "agent": "에이전트키(marketing/customer_management/performance/onboarding/communication)",
      "task_title": "업무 제목",
      "task_description": "수행할 업무 상세 설명",
      "why": "이 업무가 팀 성장에 중요한 이유",
      "execution_prompt": "정보를 받은 후 에이전트에게 전달할 지시문 템플릿 ({{변수명}} 형태로 사용자 입력값 삽입)",
      "requirements": [
        {
          "key": "변수명",
          "label": "항목명",
          "question": "팀장에게 물어볼 질문",
          "placeholder": "예시 답변",
          "required": true,
          "type": "text"
        }
      ]
    }
  ]
}"""

# ── DB 현황 수집 ──────────────────────────────────────────────────────────
def gather_team_state() -> dict:
    conn = get_connection()
    c = conn.cursor()
    now = datetime.now()
    period = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")
    state = {}
    try:
        c.execute("SELECT COUNT(*) as cnt FROM team_members WHERE is_active=1")
        state["team_size"] = c.fetchone()["cnt"]

        c.execute("SELECT id, name, role FROM team_members WHERE is_active=1")
        state["team_members"] = [dict(r) for r in c.fetchall()]

        c.execute("SELECT COUNT(*) as cnt FROM customers")
        total = c.fetchone()["cnt"]
        c.execute("SELECT COUNT(*) as cnt FROM customers WHERE assigned_to IS NULL")
        unassigned = c.fetchone()["cnt"]
        state["marketing"] = {"총 고객수": total, "미배정 고객": unassigned}

        c.execute("SELECT status, COUNT(*) as cnt FROM customers GROUP BY status")
        state["pipeline"] = {r["status"]: r["cnt"] for r in c.fetchall()}

        c.execute("""SELECT tm.name, COALESCE(pr.sales_amount,0) as sales,
               COALESCE(pt.target_sales_amount,0) as target
               FROM team_members tm
               LEFT JOIN performance_records pr ON tm.id=pr.member_id AND pr.period=?
               LEFT JOIN performance_targets pt ON tm.id=pt.member_id AND pt.period=?
               WHERE tm.is_active=1""", (period, period))
        perf = [dict(r) for r in c.fetchall()]
        total_sales = sum(p["sales"] for p in perf)
        total_target = sum(p["target"] for p in perf)
        state["performance"] = {
            "기간": period,
            "팀 총매출": f"{total_sales:,.0f}만원",
            "팀 목표": f"{total_target:,.0f}만원",
            "달성률": f"{round(total_sales/total_target*100) if total_target else 0}%",
            "팀원별": perf,
        }

        c.execute("SELECT COUNT(*) as cnt FROM onboarding_plans WHERE status='active'")
        state["onboarding_active"] = c.fetchone()["cnt"]

        c.execute("SELECT COUNT(*) as cnt FROM followups WHERE status='pending' AND followup_date <= ?", (today,))
        state["overdue_followups"] = c.fetchone()["cnt"]

    finally:
        conn.close()
    return state


class TeamMeeting:
    def __init__(self, orchestrator):
        self.orchestrator = orchestrator
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    AGENT_LABELS = {
        "marketing": "📊 마케팅 에이전트",
        "customer_management": "👥 고객관리 에이전트",
        "performance": "📈 실적관리 에이전트",
        "onboarding": "🎓 온보딩 에이전트",
        "communication": "💬 커뮤니케이션 에이전트",
    }

    # ── Phase 1: 전략 수립 + 필요 정보 요청 ──────────────────────────────
    def plan(self, topic: str = None) -> dict:
        state = gather_team_state()
        state_text = json.dumps(state, ensure_ascii=False, indent=2)
        topic_line = f"\n\n오늘의 특별 안건: {topic}" if topic else ""

        resp = self.client.messages.create(
            model=MODEL,
            max_tokens=3000,
            system=[{"type": "text", "text": STRATEGY_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{
                "role": "user",
                "content": (
                    f"현재 팀 현황:\n{state_text}{topic_line}\n\n"
                    "이 팀이 성장하기 위한 전략을 수립하고, "
                    "각 에이전트 업무 실행에 필요한 정보를 사용자에게 요청해 주세요."
                ),
            }],
        )

        raw = resp.content[0].text.strip()
        try:
            if "```" in raw:
                part = raw.split("```json")[1] if "```json" in raw else raw.split("```")[1]
                raw = part.split("```")[0].strip()
            plan_data = json.loads(raw)
        except Exception:
            plan_data = {
                "strategy_overview": raw[:400],
                "priority_order": [],
                "assignments": [],
            }

        plan_data["state"] = state
        return plan_data

    # ── Phase 2: 사용자 답변 받아 실행 ────────────────────────────────────
    def execute(self, assignments: list, answers: dict) -> dict:
        log = []
        start = datetime.now()

        def note(speaker, msg):
            log.append({"speaker": speaker, "message": msg, "time": datetime.now().strftime("%H:%M:%S")})

        note("🏢 시스템", "준비 완료 신호 수신. 에이전트 실행을 시작합니다.")
        executed = []

        for asgn in assignments:
            agent_key = asgn.get("agent", "")
            if agent_key not in self.orchestrator.agents:
                continue

            label = self.AGENT_LABELS.get(agent_key, agent_key)
            task_title = asgn.get("task_title", "")
            exec_prompt_template = asgn.get("execution_prompt", asgn.get("task_description", ""))
            agent_answers = answers.get(agent_key, {})

            # 템플릿에 사용자 답변 삽입
            exec_prompt = exec_prompt_template
            for k, v in agent_answers.items():
                exec_prompt = exec_prompt.replace(f"{{{{{k}}}}}", str(v))

            note(label, f"업무 시작: {task_title}")
            note(label, f"실행 지시: {exec_prompt[:120]}...")

            try:
                result = self.orchestrator.agents[agent_key].run(exec_prompt)
                response_text = result.get("response", "")
                note(label, f"✅ 완료: {response_text[:150]}")
                executed.append({
                    "agent": agent_key,
                    "label": label,
                    "task_title": task_title,
                    "result": response_text,
                    "why": asgn.get("why", ""),
                })
            except Exception as e:
                note(label, f"❌ 오류: {e}")

        duration = int((datetime.now() - start).total_seconds())
        note("🏢 시스템", f"전체 실행 완료. 소요시간 {duration}초, 실행 {len(executed)}건")

        report = self._build_report(executed, duration)
        return {"log": log, "report": report, "executed": executed, "duration": duration}

    def _build_report(self, executed, duration):
        now = datetime.now().strftime("%Y년 %m월 %d일 %H:%M")
        lines = [f"## ✅ 팀 자율 실행 결과  |  {now}", ""]
        if not executed:
            return "\n".join(lines) + "\n실행된 업무가 없습니다."

        for e in executed:
            lines += [
                f"### {e['label']} — {e['task_title']}",
                f"**왜 중요한가:** {e['why']}",
                f"**실행 결과:**\n{e['result']}",
                "",
            ]
        lines += ["---", f"*총 {len(executed)}개 업무 실행 · {duration}초 소요*"]
        return "\n".join(lines)
