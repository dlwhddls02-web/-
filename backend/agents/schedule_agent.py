"""
일정관리 에이전트 — 온보딩 / 팀 미팅 / 공지 / 자율 회의 준비
"""
import json
from datetime import datetime, date, timedelta
from agents.base_agent import BaseAgent
from backend.memory import (
    get_connection, log_activity,
    save_scheduled_meeting, gather_team_state,
)
from backend.tools.kakao_client import KakaoClient

_SYSTEM = """당신은 보험 영업팀 일정관리 AI입니다.

업무:
- 팀 미팅 및 일정 등록
- 신규 팀원 온보딩 플랜 생성
- 팀 공지 및 메시지 발송
- 팔로업 일정 관리
- 매주 월요일 자율 회의 준비 (에이전트들의 주간 전략 수립)

온보딩 플랜 기본 구성 (4주):
1주: 회사·상품 이해, 시스템 교육
2주: 보험 기초, 화법 교육, 선배 동행
3주: 자체 영업 시작, 롤플레이
4주: 독립 영업, 멘토 주 1회 피드백

도구를 사용해 실제로 일정을 등록하세요."""

_TOOLS = [
    {
        "name": "create_meeting",
        "description": "팀 미팅 일정 생성",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":            {"type": "string"},
                "scheduled_at":     {"type": "string", "description": "YYYY-MM-DD HH:MM"},
                "duration_minutes": {"type": "integer", "description": "기본 60"},
                "meeting_type":     {"type": "string", "description": "weekly/training/1on1/strategy"},
                "agenda":           {"type": "string"},
                "attendees":        {"type": "string", "description": "참석자 (쉼표 구분)"},
            },
            "required": ["title", "scheduled_at"],
        },
    },
    {
        "name": "send_announcement",
        "description": "팀 공지 등록 + 카카오 알림 발송",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {"type": "string"},
                "content": {"type": "string"},
                "urgent":  {"type": "boolean", "description": "긴급 여부"},
            },
            "required": ["subject", "content"],
        },
    },
    {
        "name": "create_onboarding_plan",
        "description": "신규 팀원 4주 온보딩 플랜 자동 생성",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id":  {"type": "integer"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "mentor_id":  {"type": "integer", "description": "멘토 팀원 ID"},
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "get_schedule",
        "description": "이번 주 / 이번 달 일정 조회",
        "input_schema": {
            "type": "object",
            "properties": {
                "range": {"type": "string", "description": "week / month"},
            },
        },
    },
    {
        "name": "get_onboarding_status",
        "description": "온보딩 진행 현황 조회",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "prepare_weekly_meeting",
        "description": "주간 자율 회의 준비 — 팀 현황 분석 후 회의 계획 DB 저장",
        "input_schema": {"type": "object", "properties": {}},
    },
]

_DEFAULT_TASKS = [
    ("회사 소개 및 비전 교육",    "company",  0),
    ("보험 상품 라인업 학습",      "product",  1),
    ("CRM 시스템 사용법 교육",     "system",   2),
    ("보험 기초 이론 교육",        "training", 7),
    ("영업 화법 교육 (롤플레이)",  "training", 8),
    ("선배 영업 동행 (3회)",       "field",    10),
    ("첫 고객 발굴 미션",          "field",    14),
    ("멘토 1:1 피드백",            "mentor",   16),
    ("자체 영업 시작",             "field",    21),
    ("중간 점검 미팅",             "review",   21),
    ("독립 영업 도전",             "field",    25),
    ("최종 평가 및 피드백",        "review",   28),
]


class ScheduleAgent(BaseAgent):
    def __init__(self):
        super().__init__("schedule", _SYSTEM, _TOOLS)

    def execute_tool(self, name: str, inp: dict) -> str:
        try:
            if name == "create_meeting":         return self._create_meeting(inp)
            if name == "send_announcement":      return self._send_announcement(inp)
            if name == "create_onboarding_plan": return self._create_onboarding(inp)
            if name == "get_schedule":           return self._get_schedule(inp)
            if name == "get_onboarding_status":  return self._onboarding_status()
            if name == "prepare_weekly_meeting":  return self._prepare_meeting()
        except Exception as e:
            return f"오류: {e}"
        return "알 수 없는 도구"

    def _create_meeting(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            """INSERT INTO meetings (title,meeting_type,scheduled_at,duration_minutes,agenda,attendees,status,created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (inp["title"], inp.get("meeting_type","weekly"),
             inp["scheduled_at"], inp.get("duration_minutes",60),
             inp.get("agenda",""), inp.get("attendees",""), "scheduled", now),
        )
        mid = c.lastrowid
        conn.commit()
        conn.close()
        KakaoClient().send_me(f"📅 [미팅 등록]\n{inp['title']}\n일시: {inp['scheduled_at']}")
        log_activity("📅 일정관리", f"미팅 등록: {inp['title']} ({inp['scheduled_at']})", status="success")
        return json.dumps({"meeting_id": mid, "ok": True}, ensure_ascii=False)

    def _send_announcement(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            "INSERT INTO messages (message_type,subject,content,created_at) VALUES (?,?,?,?)",
            ("announcement", inp["subject"], inp["content"], now),
        )
        conn.commit()
        conn.close()
        prefix = "🚨 [긴급공지]" if inp.get("urgent") else "📢 [팀 공지]"
        KakaoClient().send_me(f"{prefix}\n{inp['subject']}\n\n{inp['content'][:200]}")
        log_activity("📢 일정관리", f"공지 발송: {inp['subject']}", status="success")
        return json.dumps({"ok": True}, ensure_ascii=False)

    def _create_onboarding(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        start = date.fromisoformat(inp.get("start_date", date.today().isoformat()))
        target = (start + timedelta(days=28)).isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            """INSERT INTO onboarding_plans (member_id,plan_name,start_date,target_completion_date,status,created_at)
               VALUES (?,?,?,?,?,?)""",
            (inp["member_id"], "4주 온보딩 플랜", start.isoformat(), target, "active", now),
        )
        plan_id = c.lastrowid
        for task_name, category, offset_days in _DEFAULT_TASKS:
            due = (start + timedelta(days=offset_days)).isoformat()
            c.execute(
                "INSERT INTO onboarding_tasks (plan_id,task_name,category,due_date,status) VALUES (?,?,?,?,?)",
                (plan_id, task_name, category, due, "pending"),
            )
        if inp.get("mentor_id"):
            conn.execute("UPDATE team_members SET mentor_id=? WHERE id=?", (inp["mentor_id"], inp["member_id"]))
        conn.commit()
        conn.close()
        log_activity("🎓 일정관리", f"온보딩 플랜 생성: 팀원#{inp['member_id']} (4주 {len(_DEFAULT_TASKS)}개 과제)", status="success")
        return json.dumps({"plan_id": plan_id, "tasks": len(_DEFAULT_TASKS), "end_date": target}, ensure_ascii=False)

    def _get_schedule(self, inp: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        today = date.today()
        if inp.get("range") == "month":
            start = today.replace(day=1).isoformat()
            end = (today.replace(day=28) + timedelta(days=4)).replace(day=1).isoformat()
        else:
            start = today.isoformat()
            end = (today + timedelta(days=7)).isoformat()
        c.execute(
            "SELECT * FROM meetings WHERE scheduled_at BETWEEN ? AND ? ORDER BY scheduled_at",
            (start, end),
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"range": inp.get("range","week"), "meetings": rows}, ensure_ascii=False, indent=2)

    def _onboarding_status(self) -> str:
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            """SELECT op.*, tm.name as member_name,
                      (SELECT COUNT(*) FROM onboarding_tasks ot WHERE ot.plan_id=op.id AND ot.status='completed') as done,
                      (SELECT COUNT(*) FROM onboarding_tasks ot WHERE ot.plan_id=op.id) as total
               FROM onboarding_plans op
               LEFT JOIN team_members tm ON op.member_id=tm.id
               WHERE op.status='active'"""
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"active_plans": rows}, ensure_ascii=False, indent=2)

    def _prepare_meeting(self) -> str:
        state = gather_team_state()
        mid = save_scheduled_meeting({"team_state": state, "topic": "주간 영업 전략 회의"})
        KakaoClient().send_meeting_ready(10)
        log_activity("🏢 일정관리", "주간 자율 회의 준비 완료 — 팀장 참여 대기", status="success")
        return json.dumps({"meeting_id": mid, "expires_minutes": 10, "state_summary": state}, ensure_ascii=False)


# ── 스케줄러에서 직접 호출 ──────────────────────────────────────────────────

def prepare_weekly_meeting():
    agent = ScheduleAgent()
    agent.run("주간 자율 회의를 준비해주세요.")
