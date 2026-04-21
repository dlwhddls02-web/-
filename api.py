import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from storage.database import init_db
from orchestrator import Orchestrator

app = FastAPI(title="영업팀 에이전트 시스템")
init_db()
orchestrator = Orchestrator()


class ChatRequest(BaseModel):
    message: str
    agent: str | None = None


class ResetRequest(BaseModel):
    agent: str | None = None


@app.post("/chat")
async def chat(req: ChatRequest):
    agent_key = req.agent if req.agent and req.agent != "auto" else None
    result = await asyncio.to_thread(orchestrator.run, req.message, agent_key)
    return {
        "response": result["response"],
        "agent": result["routed_to"],
        "agent_description": result["agent_description"],
        "route_reason": result.get("route_reason", ""),
    }


@app.post("/reset")
async def reset(req: ResetRequest):
    orchestrator.reset_conversation(req.agent)
    return {"status": "ok"}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
