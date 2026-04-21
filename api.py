import asyncio
import traceback
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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


class MeetingRequest(BaseModel):
    topic: str | None = None


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
        return {
            "response": "응답 시간이 초과되었습니다. 다시 시도해주세요.",
            "agent": "auto",
            "agent_description": "시스템",
            "route_reason": "",
        }
    except Exception as e:
        err = traceback.format_exc()
        print(f"[ERROR] {err}")
        msg = str(e)
        if "authentication" in msg.lower() or "api_key" in msg.lower() or "401" in msg:
            msg = "API 키가 유효하지 않습니다. .env 파일의 ANTHROPIC_API_KEY를 확인해주세요."
        elif "rate" in msg.lower():
            msg = "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."
        else:
            msg = f"오류가 발생했습니다: {msg}"
        return {
            "response": msg,
            "agent": "auto",
            "agent_description": "시스템",
            "route_reason": "",
        }


@app.post("/meeting")
async def meeting(req: MeetingRequest):
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(team_meeting.run, req.topic),
            timeout=300,
        )
        return result
    except asyncio.TimeoutError:
        return {"log": [], "report": "회의 시간이 초과되었습니다.", "executed": [], "duration": 0}
    except Exception as e:
        print(f"[MEETING ERROR] {traceback.format_exc()}")
        return {"log": [], "report": f"회의 중 오류가 발생했습니다: {e}", "executed": [], "duration": 0}


@app.post("/reset")
async def reset(req: ResetRequest):
    orchestrator.reset_conversation(req.agent)
    return {"status": "ok"}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
