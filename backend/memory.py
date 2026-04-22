"""
메모리 관리 — SQLite DB 초기화 + 공통 헬퍼
"""
import json
import sqlite3
from datetime import datetime, date, timedelta

from config import DB_PATH


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        phone TEXT,
        email TEXT,
        industry TEXT,
        company_size TEXT,
        budget_range TEXT,
        pain_points TEXT,
        lead_score INTEGER DEFAULT 0,
        status TEXT DEFAULT 'prospect',
        source TEXT,
        assigned_to INTEGER,
        notion_page_id TEXT,
        created_at TEXT,
        updated_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        member_id INTEGER,
        insurance_type TEXT NOT NULL,
        product_name TEXT,
        premium_monthly REAL DEFAULT 0,
        contract_amount REAL DEFAULT 0,
        start_date TEXT,
        end_date TEXT,
        status TEXT DEFAULT 'pending',
        notion_page_id TEXT,
        notes TEXT,
        created_at TEXT,
        updated_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT,
        email TEXT,
        phone TEXT,
        department TEXT,
        hire_date TEXT,
        is_active INTEGER DEFAULT 1,
        mentor_id INTEGER,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS performance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        period TEXT NOT NULL,
        sales_count INTEGER DEFAULT 0,
        sales_amount REAL DEFAULT 0,
        calls_made INTEGER DEFAULT 0,
        meetings_held INTEGER DEFAULT 0,
        deals_closed INTEGER DEFAULT 0,
        customer_satisfaction REAL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS performance_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        period TEXT NOT NULL,
        target_sales_amount REAL DEFAULT 0,
        target_deals INTEGER DEFAULT 0,
        target_calls INTEGER DEFAULT 0,
        target_meetings INTEGER DEFAULT 0,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS sns_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        insurance_type TEXT,
        content_theme TEXT,
        caption TEXT,
        image_url TEXT,
        hashtags TEXT,
        platform_post_id TEXT,
        status TEXT DEFAULT 'draft',
        scheduled_at TEXT,
        posted_at TEXT,
        created_at TEXT NOT NULL
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        status TEXT DEFAULT 'info',
        created_at TEXT NOT NULL
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS scheduled_meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        triggered_by TEXT DEFAULT 'scheduler',
        status TEXT DEFAULT 'waiting_user',
        plan_data TEXT,
        user_answers TEXT,
        result_data TEXT,
        created_at TEXT NOT NULL,
        executed_at TEXT,
        expires_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        recipient_id INTEGER,
        message_type TEXT,
        subject TEXT,
        content TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        assigned_to INTEGER,
        followup_date TEXT NOT NULL,
        followup_type TEXT,
        priority TEXT DEFAULT 'medium',
        notes TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS onboarding_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        plan_name TEXT,
        start_date TEXT,
        target_completion_date TEXT,
        overall_progress INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS customer_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        member_id INTEGER,
        note_type TEXT,
        content TEXT NOT NULL,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        organizer_id INTEGER,
        meeting_type TEXT DEFAULT 'weekly',
        scheduled_at TEXT NOT NULL,
        duration_minutes INTEGER DEFAULT 60,
        agenda TEXT,
        attendees TEXT,
        status TEXT DEFAULT 'scheduled',
        notes TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS onboarding_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        task_name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        due_date TEXT,
        status TEXT DEFAULT 'pending',
        completion_date TEXT,
        notes TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS contract_renewals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER NOT NULL,
        renewal_date TEXT NOT NULL,
        notified INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at TEXT
    )""")

    conn.commit()
    conn.close()


# ── 활동 로그 ──────────────────────────────────────────────────────────────

def log_activity(agent: str, action: str, detail: str = "", status: str = "info"):
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            "INSERT INTO activity_log (agent, action, detail, status, created_at) VALUES (?, ?, ?, ?, ?)",
            (agent, action, detail, status, datetime.now().isoformat()),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def get_recent_activity(limit: int = 50) -> list:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def clear_activity_log():
    conn = get_connection()
    conn.execute("DELETE FROM activity_log")
    conn.commit()
    conn.close()


# ── 자율 회의 ──────────────────────────────────────────────────────────────

def save_scheduled_meeting(plan_data: dict) -> int:
    conn = get_connection()
    c = conn.cursor()
    now = datetime.now()
    expires = (now + timedelta(minutes=10)).isoformat()
    c.execute(
        """INSERT INTO scheduled_meetings (triggered_by, status, plan_data, created_at, expires_at)
           VALUES ('scheduler', 'waiting_user', ?, ?, ?)""",
        (json.dumps(plan_data, ensure_ascii=False), now.isoformat(), expires),
    )
    mid = c.lastrowid
    conn.commit()
    conn.close()
    return mid


def get_active_meeting() -> dict | None:
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        """SELECT * FROM scheduled_meetings
           WHERE status='waiting_user' AND expires_at > ?
           ORDER BY created_at DESC LIMIT 1""",
        (datetime.now().isoformat(),),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    result = dict(row)
    result["plan_data"] = json.loads(result.get("plan_data") or "{}")
    return result


def complete_meeting(meeting_id: int, result_data: dict):
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        """UPDATE scheduled_meetings
           SET status='completed', result_data=?, executed_at=?
           WHERE id=?""",
        (json.dumps(result_data, ensure_ascii=False), datetime.now().isoformat(), meeting_id),
    )
    conn.commit()
    conn.close()


# ── 팔로업 ─────────────────────────────────────────────────────────────────

def get_overdue_followups() -> list:
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        """SELECT f.*, cu.name as customer_name, cu.phone as customer_phone
           FROM followups f
           LEFT JOIN customers cu ON f.customer_id = cu.id
           WHERE f.status='pending' AND f.followup_date <= ?""",
        (date.today().isoformat(),),
    )
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


# ── 팀 현황 (회의 전략용) ──────────────────────────────────────────────────

def gather_team_state() -> dict:
    conn = get_connection()
    c = conn.cursor()
    now = datetime.now()
    period = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")
    state = {}
    try:
        c.execute("SELECT COUNT(*) as cnt FROM team_members WHERE is_active=1")
        state["team_size"] = c.fetchone()["cnt"]

        c.execute("SELECT id, name, role FROM team_members WHERE is_active=1")
        state["team_members"] = [dict(r) for r in c.fetchall()]

        c.execute("SELECT COUNT(*) as cnt FROM customers")
        state["total_customers"] = c.fetchone()["cnt"]

        c.execute("SELECT status, COUNT(*) as cnt FROM customers GROUP BY status")
        state["pipeline"] = {r["status"]: r["cnt"] for r in c.fetchall()}

        c.execute("SELECT COUNT(*) as cnt FROM contracts WHERE status='active'")
        state["active_contracts"] = c.fetchone()["cnt"]

        c.execute("""SELECT tm.name,
                   COALESCE(pr.sales_amount, 0) as sales,
                   COALESCE(pt.target_sales_amount, 0) as target
                   FROM team_members tm
                   LEFT JOIN performance_records pr ON tm.id=pr.member_id AND pr.period=?
                   LEFT JOIN performance_targets pt ON tm.id=pt.member_id AND pt.period=?
                   WHERE tm.is_active=1""", (period, period))
        perf = [dict(r) for r in c.fetchall()]
        total_sales = sum(p["sales"] for p in perf)
        total_target = sum(p["target"] for p in perf)
        state["performance"] = {
            "기간": period,
            "팀 총매출": f"{total_sales:,.0f}만원",
            "팀 목표": f"{total_target:,.0f}만원",
            "달성률": f"{round(total_sales / total_target * 100) if total_target else 0}%",
        }

        c.execute("SELECT COUNT(*) as cnt FROM followups WHERE status='pending' AND followup_date <= ?", (today,))
        state["overdue_followups"] = c.fetchone()["cnt"]

        c.execute("SELECT COUNT(*) as cnt FROM sns_posts WHERE status IN ('posted','simulated')")
        state["sns_posts_total"] = c.fetchone()["cnt"]

    finally:
        conn.close()
    return state
