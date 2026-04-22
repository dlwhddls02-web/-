"""
팀 자율 회의 엔진 v3

Phase 1 (Plan):  총괄 디렉터가 팀 현황 분석 → 전략 수립 → 팀장에게 필요 정보 요청
Phase 2 (Execute): 팀장 입력 + 에이전트 실행 → 결과 보고서
"""

import json
from datetime import datetime
import anthropic

from config import ANTHROPIC_API_KEY, MODEL
from backend.memory import gather_team_state

STRATEGY_PROMPT = """당신은 보험 영업팀 AI 총괄 디렉터입니다.

팀 현황 데이터를 분석하고 이번 주 실행 전략을 수립합니다.
각 에이전트에게 업무를 배분하되, 실행에 필요한 정보를 팀장에게 요청합니다.

사용 가능한 에이전트:
- customer   : 고객 추가·리드 스코어링·팔로업·CRM
- contract   : 보험 계약 등록·현황 분석
- schedule   : 팀 미팅·온보딩·공지·일정
- report     : 팀원 실적·목표·AI 피드백·보고서
- sns        : 인스타그램·페이스북 자동 포스팅·콘텐츠 캘린더

중요: 팀장이 실제로 제공할 수 있는 정보만 요청하세요.
(예: 이번 주 목표 계약 건수, 집중 타겟 업종, 특별 공지 내용 등)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "strategy_overview": "팀 현황 분석 + 이번 주 핵심 전략 3~4문장",
  "priority_order": ["1순위 목표", "2순위 목표", "3순위 목표"],
  "assignments": [
    {
      "agent": "에이전트키(customer/contract/schedule/report/sns)",
      "task_title": "업무 제목",
      "task_description": "수행할 업무 상세 설명",
      "why": "이 업무가 팀 성장에 중요한 이유",
      "execution_prompt": "에이전트에게 전달할 지시문 ({{변수명}} 형태로 팀장 입력값 삽입)",
      "requirements": [
        {
          "key": "변수명",
          "label": "항목명",
          "question": "팀장에게 물어볼 질문",
          "placeholder": "예시 답변",
          "required": true
        }
      ]
    }
  ]
}"""


class TeamMeeting:
    def __init__(self, orchestrator):
        self.orchestrator = orchestrator
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    AGENT_LABELS = {
        "customer":  "👥 고객관리 에이전트",
        "contract":  "📋 계약관리 에이전트",
        "schedule":  "📅 일정관리 에이전트",
        "report":    "📈 실적관리 에이전트",
        "sns":       "📱 SNS 에이전트",
    }

    # ── Phase 1: 전략 수립 ──────────────────────────────────────────────────
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
                    "이 팀이 이번 주 성장하기 위한 전략을 수립하고, "
                    "각 에이전트 업무 실행에 필요한 정보를 팀장에게 요청해 주세요."
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

    # ── Phase 2: 팀장 답변 받아 에이전트 실행 ─────────────────────────────
    def execute(self, assignments: list, answers: dict) -> dict:
        log = []
        start = datetime.now()

        def note(speaker, msg):
            log.append({"speaker": speaker, "message": msg, "time": datetime.now().strftime("%H:%M:%S")})

        note("🏢 시스템", "에이전트 실행을 시작합니다.")
        executed = []

        for asgn in assignments:
            agent_key = asgn.get("agent", "")
            if agent_key not in self.orchestrator.agents:
                note("🏢 시스템", f"⚠️ 알 수 없는 에이전트: {agent_key}")
                continue

            label = self.AGENT_LABELS.get(agent_key, agent_key)
            task_title = asgn.get("task_title", "")
            exec_template = asgn.get("execution_prompt", asgn.get("task_description", ""))
            agent_answers = answers.get(agent_key, {})

            # 템플릿에 팀장 답변 삽입
            exec_prompt = exec_template
            for k, v in agent_answers.items():
                exec_prompt = exec_prompt.replace(f"{{{{{k}}}}}", str(v))

            note(label, f"업무 시작: {task_title}")

            try:
                result = self.orchestrator.agents[agent_key].run(exec_prompt)
                response_text = result.get("response", "")
                note(label, f"✅ 완료: {response_text[:200]}")
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
        note("🏢 시스템", f"전체 실행 완료 — {duration}초, {len(executed)}건")

        return {
            "log": log,
            "report": self._build_report(executed, duration),
            "executed": executed,
            "duration": duration,
        }

    def _build_report(self, executed: list, duration: int) -> str:
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
