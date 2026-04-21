import sqlite3
import json
from datetime import datetime
from config import DB_PATH


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS customers (
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
            created_at TEXT,
            updated_at TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS team_members (
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
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS performance_records (
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
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS performance_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            period TEXT NOT NULL,
            target_sales_amount REAL,
            target_deals INTEGER,
            target_calls INTEGER,
            target_meetings INTEGER,
            created_at TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS onboarding_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            plan_name TEXT,
            start_date TEXT,
            target_completion_date TEXT,
            overall_progress INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            notes TEXT,
            created_at TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS onboarding_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            task_name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            due_date TEXT,
            status TEXT DEFAULT 'pending',
            completion_date TEXT,
            notes TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER,
            recipient_id INTEGER,
            message_type TEXT,
            subject TEXT,
            content TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            metadata TEXT,
            created_at TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            organizer_id INTEGER,
            meeting_type TEXT,
            scheduled_at TEXT,
            duration_minutes INTEGER DEFAULT 60,
            agenda TEXT,
            attendees TEXT,
            status TEXT DEFAULT 'scheduled',
            notes TEXT,
            created_at TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS customer_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            member_id INTEGER,
            note_type TEXT,
            content TEXT NOT NULL,
            created_at TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS followups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            assigned_to INTEGER,
            followup_date TEXT NOT NULL,
            followup_type TEXT,
            priority TEXT DEFAULT 'medium',
            notes TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT
        )
    """)

    conn.commit()
    conn.close()
