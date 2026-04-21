"""
멀티 에이전트 오케스트레이터

사용자 요청을 분석해 적절한 에이전트로 라우팅하고,
에이전트 간 데이터 흐름을 조율합니다.
"""

import anthropic
from config import ANTHROPIC_API_KEY, MODEL

from agents.marketing_agent import MarketingAgent
from agents.customer_management_agent import CustomerManagementAgent
from agents.performance_agent import PerformanceAgent
from agents.onboarding_agent import OnboardingAgent
from agents.communication_agent import CommunicationAgent

ROUTER_SYSTEM_PROMPT = """당신은 영업팀 멀티 에이전트 시스템의 라우터입니다.

사용자의 요청을 분석하고 아래 에이전트 중 하나를 선택하세요:

- marketing: 고객 DB 구축, 리드 스코어링, 고객 발굴, 영업 스크립트 생성, 고객 배포
- customer_management: 고객 상태 관리, 팔로업, 상담 노트, 파이프라인 리포트
- performance: 팀원 실적 입력/조회, 목표 설정, AI 피드백, 대시보드
- onboarding: 신입/신규 팀원 온보딩, 교육 계획, 멘토 배정, 진행 현황
- communication: 팀 공지, 개인 메시지, 미팅 생성, 실적 리포트 발송

JSON 형식으로만 응답하세요:
{"agent": "<에이전트명>", "reason": "<선택 이유 한 줄>"}"""

AGENT_DESCRIPTIONS = {
    "marketing": "마케팅 에이전트 - 고객 DB 구축 및 배포",
    "customer_management": "고객관리 에이전트 - CRM 및 파이프라인 관리",
    "performance": "실적관리 에이전트 - 실적 추적 및 AI 피드백",
    "onboarding": "온보딩 에이전트 - 신규 팀원 교육 관리",
    "communication": "팀 커뮤니케이션 에이전트 - 공지 및 메시징",
}


class Orchestrator:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.agents = {
            "marketing": MarketingAgent(),
            "customer_management": CustomerManagementAgent(),
            "performance": PerformanceAgent(),
            "onboarding": OnboardingAgent(),
            "communication": CommunicationAgent(),
        }
        self.conversation_histories: dict[str, list] = {k: [] for k in self.agents}

    def route(self, user_message: str) -> str:
        """사용자 메시지를 분석해 담당 에이전트 키를 반환합니다."""
        import json

        response = self.client.messages.create(
            model=MODEL,
            max_tokens=256,
            system=[
                {
                    "type": "text",
                    "text": ROUTER_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
        try:
            parsed = json.loads(raw)
            agent_key = parsed.get("agent", "marketing")
            reason = parsed.get("reason", "")
        except Exception:
            agent_key = "marketing"
            reason = ""

        if agent_key not in self.agents:
            agent_key = "marketing"

        return agent_key, reason

    def run(self, user_message: str, agent_key: str = None) -> dict:
        """
        에이전트를 실행합니다.
        agent_key가 지정되면 해당 에이전트를, 아니면 자동 라우팅합니다.
        """
        reason = ""
        if not agent_key:
            agent_key, reason = self.route(user_message)

        agent = self.agents[agent_key]
        history = self.conversation_histories[agent_key]

        result = agent.run(user_message, conversation_history=list(history))

        self.conversation_histories[agent_key] = result["conversation_history"]

        result["routed_to"] = agent_key
        result["route_reason"] = reason
        result["agent_description"] = AGENT_DESCRIPTIONS.get(agent_key, "")
        return result

    def reset_conversation(self, agent_key: str = None):
        """대화 이력을 초기화합니다."""
        if agent_key:
            self.conversation_histories[agent_key] = []
        else:
            self.conversation_histories = {k: [] for k in self.agents}
