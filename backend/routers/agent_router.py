"""
에이전트 API 라우터 — /api/chat, /api/meeting/*, /api/reset, /api/scheduler/status
"""
import asyncio
import traceback
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from backend.memory import (
    log_activity, get_active_meeting,
    complete_meeting, gather_team_state,
)

router = APIRouter()


# ── 요청 모델 ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    agent: str | None = None

class ResetRequest(BaseModel):
    agent: str | None = None

class MeetingJoinRequest(BaseModel):
    meeting_id: int
    assignments: list[dict[str, Any]]
    answers: dict[str, dict[str, str]]

class MeetingPlanRequest(BaseModel):
    topic: str | None = None


# ── 헬퍼 ──────────────────────────────────────────────────────────────────

def _get_orch():
    from backend.agents.orchestrator import get_orchestrator
    return get_orchestrator()


# ── 엔드포인트 ─────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(req: ChatRequest):
    try:
        agent_key = req.agent if req.agent and req.agent != "auto" else None
        result = await asyncio.wait_for(
            asyncio.to_thread(_get_orch().run, req.message, agent_key),
            timeout=120,
        )
        return {
            "response":          result["response"],
            "agent":             result["routed_to"],
            "agent_description": result["agent_description"],
            "route_reason":      result.get("route_reason", ""),
        }
    except asyncio.TimeoutError:
        return {"response": "응답 시간이 초과됐습니다. 다시 시도해주세요.", "agent": "auto", "agent_description": "", "route_reason": ""}
    except Exception as e:
        print(f"[CHAT ERROR] {traceback.format_exc()}")
        msg = str(e)
        if "authentication" in msg.lower() or "api_key" in msg.lower():
            msg = "API 키가 유효하지 않습니다. .env 파일을 확인해주세요."
        return {"response": f"오류: {msg}", "agent": "auto", "agent_description": "", "route_reason": ""}


@router.post("/meeting/plan")
async def meeting_plan(req: MeetingPlanRequest):
    """수동 회의 — Phase 1: 전략 수립"""
    try:
        from team_meeting import TeamMeeting
        orch = _get_orch()
        tm = TeamMeeting(orch)
        result = await asyncio.wait_for(
            asyncio.to_thread(tm.plan, req.topic),
            timeout=120,
        )
        return result
    except Exception as e:
        print(f"[PLAN ERROR] {traceback.format_exc()}")
        return {"strategy_overview": f"오류: {e}", "priority_order": [], "assignments": []}


@router.post("/meeting/execute")
async def meeting_execute(req: MeetingJoinRequest):
    """Phase 2: 에이전트 실행 + 회의 결과 저장"""
    try:
        from team_meeting import TeamMeeting
        orch = _get_orch()
        tm = TeamMeeting(orch)
        result = await asyncio.wait_for(
            asyncio.to_thread(tm.execute, req.assignments, req.answers),
            timeout=300,
        )
        if req.meeting_id:
            complete_meeting(req.meeting_id, result)
        log_activity("🏢 회의", f"자율 회의 실행 완료 ({len(result.get('executed', []))}건)", status="success")
        return result
    except Exception as e:
        print(f"[EXECUTE ERROR] {traceback.format_exc()}")
        return {"log": [], "report": f"실행 오류: {e}", "executed": [], "duration": 0}


@router.get("/meeting/active")
async def meeting_active():
    """현재 팀장 참여 가능한 대기 중인 회의 반환"""
    meeting = get_active_meeting()
    return {"meeting": meeting}


@router.post("/reset")
async def reset(req: ResetRequest):
    _get_orch().reset(req.agent)
    return {"status": "ok"}


@router.get("/scheduler/status")
async def scheduler_status():
    """스케줄러 등록 작업 목록"""
    try:
        from backend.main import _scheduler
        jobs = []
        for job in _scheduler.get_jobs():
            next_run = job.next_run_time.isoformat() if job.next_run_time else None
            jobs.append({"id": job.id, "name": job.name or job.id, "next_run": next_run})
        return {"running": _scheduler.running, "jobs": jobs}
    except Exception as e:
        return {"running": False, "jobs": [], "error": str(e)}


@router.get("/dashboard")
async def dashboard():
    """대시보드 핵심 지표"""
    try:
        state = gather_team_state()
        return state
    except Exception as e:
        return {"error": str(e)}
