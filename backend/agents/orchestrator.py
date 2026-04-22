"""
멀티 에이전트 오케스트레이터 — 키워드 우선 + LLM 라우팅
"""
import json
import anthropic
from config import ANTHROPIC_API_KEY, MODEL
from backend.memory import log_activity

from backend.agents.customer_agent import CustomerAgent
from backend.agents.contract_agent import ContractAgent
from backend.agents.schedule_agent import ScheduleAgent
from backend.agents.report_agent import ReportAgent
from backend.agents.sns_agent import SnsAgent

_ROUTER_PROMPT = """당신은 보험 영업팀 AI 에이전트 시스템의 라우터입니다.

에이전트 목록:
- customer : 고객 추가/조회/리드스코어링/CRM/파이프라인/팔로업/상담노트
- contract  : 계약 등록/조회/분석/보험종류별 현황
- schedule  : 팀원 일정/온보딩/공지/팀미팅/팔로업 일정
- report    : 실적 조회/목표설정/AI피드백/성과보고/팀원등록/대시보드
- sns       : SNS 게시물 제작/인스타그램 포스팅/페이스북 포스팅/콘텐츠 캘린더

JSON으로만 응답: {"agent": "<키>", "reason": "<이유 한 줄>"}"""

_KEYWORDS: list[tuple[str, list[str]]] = [
    ("report", [
        "팀원 등록", "팀원 추가", "직원 등록", "멤버 추가",
        "실적 입력", "실적 조회", "실적관리", "목표 설정",
        "대시보드", "ai 피드백", "피드백 생성", "성과",
        "이름:", "역할:", "fc", "sm", "팀장",
    ]),
    ("customer", [
        "고객 추가", "고객 등록", "고객 db", "리드", "lead",
        "고객 상태", "팔로업", "상담 노트", "파이프라인",
        "고객 배포", "고객 배정", "스크립트", "고객id",
    ]),
    ("contract", [
        "계약", "보험 계약", "계약 등록", "계약 조회",
        "실손", "생명보험", "종신", "연금보험", "어린이보험",
        "월납", "보험료", "계약금액",
    ]),
    ("schedule", [
        "온보딩", "교육 계획", "멘토 배정", "공지", "공지사항",
        "미팅 일정", "미팅 생성", "팀 일정", "일정 등록",
    ]),
    ("sns", [
        "인스타그램", "페이스북", "sns", "게시물", "포스팅",
        "릴스", "콘텐츠", "해시태그", "캡션", "업로드",
    ]),
]

_AGENT_DESC = {
    "customer": "고객관리 에이전트 — CRM / 리드 스코어링 / 파이프라인",
    "contract": "계약관리 에이전트 — 보험 계약 등록 및 분석",
    "schedule": "일정관리 에이전트 — 온보딩 / 미팅 / 팀 공지",
    "report":   "실적관리 에이전트 — 성과 추적 / AI 피드백",
    "sns":      "SNS 에이전트 — 인스타그램 / 페이스북 자동 포스팅",
}

_instance: "Orchestrator | None" = None


def get_orchestrator() -> "Orchestrator":
    global _instance
    if _instance is None:
        _instance = Orchestrator()
    return _instance


class Orchestrator:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.agents = {
            "customer": CustomerAgent(),
            "contract": ContractAgent(),
            "schedule": ScheduleAgent(),
            "report":   ReportAgent(),
            "sns":      SnsAgent(),
        }
        self.histories: dict[str, list] = {k: [] for k in self.agents}

    def route(self, message: str) -> tuple[str, str]:
        msg = message.lower()
        for key, keywords in _KEYWORDS:
            for kw in keywords:
                if kw in msg:
                    return key, f"키워드 '{kw}' 매칭"

        resp = self.client.messages.create(
            model=MODEL,
            max_tokens=128,
            system=[{"type": "text", "text": _ROUTER_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": message}],
        )
        try:
            parsed = json.loads(resp.content[0].text.strip())
            key = parsed.get("agent", "report")
            reason = parsed.get("reason", "")
        except Exception:
            key, reason = "report", ""

        if key not in self.agents:
            key = "report"
        return key, reason

    def run(self, message: str, agent_key: str = None) -> dict:
        reason = ""
        if not agent_key or agent_key == "auto":
            agent_key, reason = self.route(message)

        log_activity(f"🔀 라우터", f"{_AGENT_DESC.get(agent_key, agent_key)}로 전달", detail=message[:60])

        agent = self.agents[agent_key]
        history = list(self.histories[agent_key])
        result = agent.run(message, conversation_history=history)
        self.histories[agent_key] = result["conversation_history"]

        result["routed_to"] = agent_key
        result["route_reason"] = reason
        result["agent_description"] = _AGENT_DESC.get(agent_key, "")
        return result

    def reset(self, agent_key: str = None):
        if agent_key:
            self.histories[agent_key] = []
        else:
            self.histories = {k: [] for k in self.agents}
