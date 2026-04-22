"""
보험영업팀 AI 에이전트 — FastAPI 메인
24시간 자율 운영 + 팀장 참여형 회의
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.memory import (
    init_db, log_activity,
    save_scheduled_meeting, get_overdue_followups,
)

_scheduler = BackgroundScheduler(timezone="Asia/Seoul")


# ── 스케줄 작업 ────────────────────────────────────────────────────────────

def _job_sns_post(insurance_type: str, theme: str, platform: str):
    try:
        from backend.agents.orchestrator import Orchestrator
        orch = Orchestrator()
        orch.run(
            f"[자동 스케줄] {platform}에 {insurance_type} '{theme}' 테마 보험 게시물을 제작하고 업로드해주세요.",
            agent_key="sns",
        )
    except Exception as e:
        log_activity("⏰ 스케줄러", f"SNS 자동 게시 실패: {e}", status="error")


def _job_weekly_meeting():
    try:
        log_activity("⏰ 스케줄러", "주간 자율 회의 시작 — 팀장 참여 대기 중 (10분)", status="info")
        from backend.agents.schedule_agent import prepare_weekly_meeting
        prepare_weekly_meeting()
    except Exception as e:
        log_activity("⏰ 스케줄러", f"자율 회의 준비 오류: {e}", status="error")


def _job_followup_check():
    try:
        rows = get_overdue_followups()
        if rows:
            log_activity("⏰ 스케줄러", f"기한 초과 팔로업 {len(rows)}건 발견", status="warning")
            try:
                from backend.tools.kakao_client import KakaoClient
                KakaoClient().send_followup_alert(rows)
            except Exception:
                pass
        else:
            log_activity("⏰ 스케줄러", "팔로업 점검 완료 — 기한 초과 없음", status="info")
    except Exception as e:
        log_activity("⏰ 스케줄러", f"팔로업 체크 오류: {e}", status="error")


def _job_contract_renewal_check():
    """만기 30일 이내 계약 알림"""
    try:
        from backend.memory import get_connection
        from backend.tools.kakao_client import KakaoClient
        conn = get_connection()
        c = conn.cursor()
        c.execute("""
            SELECT ct.id, ct.insurance_type, ct.end_date, cu.name as customer_name
            FROM contracts ct
            LEFT JOIN customers cu ON ct.customer_id = cu.id
            WHERE ct.status = 'active'
              AND ct.end_date IS NOT NULL
              AND julianday(ct.end_date) - julianday('now') BETWEEN 0 AND 30
        """)
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        if rows:
            text = f"⚠️ [계약 만기 임박 {len(rows)}건]\n"
            for r in rows[:5]:
                text += f"• {r['customer_name']} ({r['insurance_type']}) — {r['end_date']}\n"
            KakaoClient().send_me(text)
            log_activity("⏰ 스케줄러", f"계약 만기 임박 {len(rows)}건 알림", status="warning")
        else:
            log_activity("⏰ 스케줄러", "계약 만기 점검 완료 — 해당 없음", status="info")
    except Exception as e:
        log_activity("⏰ 스케줄러", f"계약 만기 체크 오류: {e}", status="error")


def _job_monthly_report():
    try:
        from backend.agents.orchestrator import Orchestrator
        orch = Orchestrator()
        orch.run(
            "[자동 스케줄] 이번 달 팀 전체 실적 보고서를 작성하고 Notion에 저장해주세요.",
            agent_key="report",
        )
        log_activity("⏰ 스케줄러", "월간 성과 보고서 생성 완료", status="success")
    except Exception as e:
        log_activity("⏰ 스케줄러", f"월간 보고서 오류: {e}", status="error")


def _start_scheduler():
    # 월·수·금 오전 9시 — 인스타그램 자동 포스팅
    _scheduler.add_job(
        _job_sns_post,
        CronTrigger(day_of_week="mon,wed,fri", hour=9, minute=0),
        args=["실손보험", "건강걱정", "instagram"],
        id="sns_am", replace_existing=True, misfire_grace_time=3600,
    )
    # 화·목 오후 7시 — 페이스북 자동 포스팅
    _scheduler.add_job(
        _job_sns_post,
        CronTrigger(day_of_week="tue,thu", hour=19, minute=0),
        args=["생명보험", "가족사랑", "facebook"],
        id="sns_pm", replace_existing=True, misfire_grace_time=3600,
    )
    # 매주 월요일 오전 8:30 — 자율 팀 회의 준비
    _scheduler.add_job(
        _job_weekly_meeting,
        CronTrigger(day_of_week="mon", hour=8, minute=30),
        id="weekly_meeting", replace_existing=True,
    )
    # 매일 오전 8시 — 팔로업 기한 초과 점검
    _scheduler.add_job(
        _job_followup_check,
        CronTrigger(hour=8, minute=0),
        id="followup_check", replace_existing=True,
    )
    # 매월 1일 오전 9시 — 월간 성과 보고서
    _scheduler.add_job(
        _job_monthly_report,
        CronTrigger(day=1, hour=9, minute=0),
        id="monthly_report", replace_existing=True,
    )
    # 매일 오전 9시 — 계약 만기 30일 이내 알림
    _scheduler.add_job(
        _job_contract_renewal_check,
        CronTrigger(hour=9, minute=30),
        id="contract_renewal", replace_existing=True,
    )
    _scheduler.start()
    log_activity("⚙️ 시스템", "24시간 자동 운영 스케줄러 시작 (SNS 2종·주간회의·팔로업·월간보고)", status="success")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _start_scheduler()
    yield
    if _scheduler.running:
        _scheduler.shutdown(wait=False)


app = FastAPI(title="보험영업팀 AI 에이전트", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.routers.agent_router import router as _agent_router
from backend.routers.log_router import router as _log_router

app.include_router(_agent_router, prefix="/api")
app.include_router(_log_router, prefix="/api")

app.mount("/", StaticFiles(directory="static", html=True), name="static")
