"""
활동 로그 / SNS 이력 API 라우터
"""
from fastapi import APIRouter
from backend.memory import get_recent_activity, clear_activity_log, get_connection

router = APIRouter()


@router.get("/activity/recent")
async def activity_recent(limit: int = 50):
    """최근 에이전트 활동 로그 반환 (UI 폴링용)"""
    logs = get_recent_activity(limit)
    return {"logs": logs, "total": len(logs)}


@router.delete("/activity/clear")
async def activity_clear():
    """활동 로그 초기화"""
    clear_activity_log()
    return {"status": "cleared"}


@router.get("/sns/history")
async def sns_history(platform: str = "all", limit: int = 20):
    """SNS 게시 이력"""
    conn = get_connection()
    c = conn.cursor()
    if platform != "all":
        c.execute(
            "SELECT * FROM sns_posts WHERE platform=? ORDER BY created_at DESC LIMIT ?",
            (platform, limit),
        )
    else:
        c.execute("SELECT * FROM sns_posts ORDER BY created_at DESC LIMIT ?", (limit,))
    posts = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"platform": platform, "total": len(posts), "posts": posts}


@router.get("/sns/stats")
async def sns_stats():
    """SNS 통계 — 플랫폼별 게시 현황"""
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        "SELECT platform, status, COUNT(*) as cnt FROM sns_posts GROUP BY platform, status"
    )
    rows = [dict(r) for r in c.fetchall()]
    c.execute("SELECT COUNT(*) as total FROM sns_posts")
    total = c.fetchone()["total"]
    conn.close()
    return {"total": total, "by_platform_status": rows}


@router.get("/customers/recent")
async def customers_recent(limit: int = 10):
    """최근 등록 고객"""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM customers ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"customers": rows}


@router.get("/contracts/recent")
async def contracts_recent(limit: int = 10):
    """최근 계약"""
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        """SELECT ct.*, cu.name as customer_name
           FROM contracts ct LEFT JOIN customers cu ON ct.customer_id=cu.id
           ORDER BY ct.created_at DESC LIMIT ?""",
        (limit,),
    )
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"contracts": rows}
