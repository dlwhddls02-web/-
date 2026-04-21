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

- performance: 팀원 등록/추가, 팀원 목록, 실적 입력/조회, 목표 설정, AI 피드백, 대시보드
- marketing: 고객 DB 구축, 리드 스코어링, 고객 발굴, 영업 스크립트 생성, 고객 배포
- customer_management: 고객 상태 관리, 팔로업, 상담 노트, 파이프라인 리포트
- onboarding: 온보딩 플랜 생성, 교육 계획, 멘토 배정, 온보딩 진행 현황
- communication: 팀 공지, 개인 메시지, 미팅 생성, 실적 리포트 발송

라우팅 규칙 (최우선):
- "팀원 등록", "팀원 추가", "직원 등록", "이름+역할/직급" → 반드시 performance
- "고객 추가", "고객 등록", "리드" → marketing
- "고객 상태", "팔로업", "노트" → customer_management
- "온보딩", "교육", "멘토" → onboarding
- "공지", "메시지", "미팅 일정" → communication

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
        """키워드 우선 매칭 → LLM 라우팅 순서로 에이전트를 결정합니다."""
        import json

        msg = user_message.lower()

        # 키워드 우선 매칭 (LLM보다 빠르고 정확)
        KEYWORD_RULES = [
            ("performance", [
                "팀원 등록", "팀원 추가", "직원 등록", "직원 추가",
                "팀원등록", "팀원추가", "멤버 등록", "멤버 추가",
                "실적 입력", "실적 조회", "실적관리", "실적 관리",
                "대시보드", "목표 설정", "ai 피드백", "피드백 생성",
                "이름:", "역할:", "직급:", "sales_rep", "team_lead", "manager",
            ]),
            ("onboarding", [
                "온보딩", "온보 딩", "교육 계획", "교육계획",
                "멘토 배정", "멘토배정", "환영 가이드", "온보딩 플랜",
            ]),
            ("communication", [
                "공지", "공지사항", "팀 공지", "메시지 보내", "미팅 일정",
                "미팅 생성", "미팅 만들", "수신함", "알림 보내",
            ]),
            ("customer_management", [
                "고객 상태", "팔로업", "상담 노트", "파이프라인",
                "고객 노트", "전환율", "followup", "고객 id",
            ]),
            ("marketing", [
                "고객 추가", "고객 등록", "고객 db", "리드", "lead",
                "영업 스크립트", "스크립트 생성", "고객 배포", "리드 점수",
            ]),
        ]

        for agent_key, keywords in KEYWORD_RULES:
            for kw in keywords:
                if kw in msg:
                    return agent_key, f"키워드 '{kw}' 매칭"

        # 키워드 매칭 실패 시 LLM 라우팅
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
            agent_key = parsed.get("agent", "performance")
            reason = parsed.get("reason", "")
        except Exception:
            agent_key = "performance"
            reason = ""

        if agent_key not in self.agents:
            agent_key = "performance"

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
