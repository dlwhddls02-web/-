import asyncio
import traceback
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Any

from storage.database import init_db
from orchestrator import Orchestrator
from team_meeting import TeamMeeting

app = FastAPI(title="영업팀 에이전트 시스템")
init_db()
orchestrator = Orchestrator()
team_meeting = TeamMeeting(orchestrator)


class ChatRequest(BaseModel):
    message: str
    agent: str | None = None

class ResetRequest(BaseModel):
    agent: str | None = None

class MeetingPlanRequest(BaseModel):
    topic: str | None = None

class MeetingExecuteRequest(BaseModel):
    assignments: list[dict[str, Any]]
    answers: dict[str, dict[str, str]]


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        agent_key = req.agent if req.agent and req.agent != "auto" else None
        result = await asyncio.wait_for(
            asyncio.to_thread(orchestrator.run, req.message, agent_key),
            timeout=120,
        )
        return {
            "response": result["response"],
            "agent": result["routed_to"],
            "agent_description": result["agent_description"],
            "route_reason": result.get("route_reason", ""),
        }
    except asyncio.TimeoutError:
        return {"response": "응답 시간이 초과되었습니다.", "agent": "auto", "agent_description": "시스템", "route_reason": ""}
    except Exception as e:
        print(f"[ERROR] {traceback.format_exc()}")
        msg = str(e)
        if "authentication" in msg.lower() or "api_key" in msg.lower():
            msg = "API 키가 유효하지 않습니다. .env 파일을 확인해주세요."
        return {"response": f"오류: {msg}", "agent": "auto", "agent_description": "시스템", "route_reason": ""}


@app.post("/meeting/plan")
async def meeting_plan(req: MeetingPlanRequest):
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(team_meeting.plan, req.topic),
            timeout=120,
        )
        return result
    except Exception as e:
        print(f"[PLAN ERROR] {traceback.format_exc()}")
        return {"strategy_overview": f"오류: {e}", "priority_order": [], "assignments": []}


@app.post("/meeting/execute")
async def meeting_execute(req: MeetingExecuteRequest):
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(team_meeting.execute, req.assignments, req.answers),
            timeout=300,
        )
        return result
    except Exception as e:
        print(f"[EXECUTE ERROR] {traceback.format_exc()}")
        return {"log": [], "report": f"실행 오류: {e}", "executed": [], "duration": 0}


@app.post("/reset")
async def reset(req: ResetRequest):
    orchestrator.reset_conversation(req.agent)
    return {"status": "ok"}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
