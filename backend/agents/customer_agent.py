"""
고객관리 에이전트 — 보험 CRM / 리드 스코어링 / Notion 동기화
"""
import json
from datetime import datetime
from agents.base_agent import BaseAgent
from backend.memory import get_connection, log_activity
from backend.tools.notion_client import add_customer_to_notion, update_customer_in_notion

_SYSTEM = """당신은 보험 영업팀 고객관리 AI입니다.

업무:
- 신규 고객 등록 및 리드 스코어링 (0~100점)
- 고객 상태 관리: prospect → contacted → qualified → proposal → closed_won / closed_lost
- 팔로업 일정 등록
- 상담 노트 기록
- 파이프라인 현황 리포트
- 팀원에게 고객 배정

리드 스코어링 기준:
- 직장인·자영업자·기업체 임원: 높은 점수
- 가족 있음·자녀 있음: 가점
- 보험 필요성 언급: 가점
- 예산 규모: 클수록 가점

도구를 순차적으로 사용해 실제로 작업하세요."""

_TOOLS = [
    {
        "name": "add_customer",
        "description": "신규 고객 DB 등록 + Notion 동기화 + 리드 점수 자동 계산",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":         {"type": "string", "description": "고객 이름"},
                "phone":        {"type": "string", "description": "전화번호"},
                "email":        {"type": "string", "description": "이메일"},
                "industry":     {"type": "string", "description": "직업/업종"},
                "company_size": {"type": "string", "description": "회사 규모 또는 가족 구성"},
                "budget_range": {"type": "string", "description": "예산 범위 (월 보험료)"},
                "pain_points":  {"type": "string", "description": "걱정거리/관심 보험종류"},
                "source":       {"type": "string", "description": "유입 경로 (SNS/소개/방문 등)"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "get_customers",
        "description": "고객 목록 조회",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "상태 필터 (prospect/contacted/qualified/proposal/closed_won/closed_lost)"},
                "limit":  {"type": "integer", "description": "조회 수 (기본 20)"},
            },
        },
    },
    {
        "name": "update_customer_status",
        "description": "고객 상태 변경",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "고객 ID"},
                "status":      {"type": "string", "description": "새 상태"},
                "note":        {"type": "string", "description": "변경 사유 메모"},
            },
            "required": ["customer_id", "status"],
        },
    },
    {
        "name": "add_note",
        "description": "상담 노트 기록",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer"},
                "note_type":   {"type": "string", "description": "전화/방문/이메일/카카오"},
                "content":     {"type": "string", "description": "상담 내용"},
            },
            "required": ["customer_id", "content"],
        },
    },
    {
        "name": "schedule_followup",
        "description": "팔로업 일정 등록",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id":   {"type": "integer"},
                "followup_date": {"type": "string", "description": "YYYY-MM-DD"},
                "followup_type": {"type": "string", "description": "전화/방문/이메일"},
                "priority":      {"type": "string", "description": "high/medium/low"},
                "notes":         {"type": "string"},
            },
            "required": ["customer_id", "followup_date"],
        },
    },
    {
        "name": "assign_customer",
        "description": "팀원에게 고객 배정",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer"},
                "member_id":   {"type": "integer", "description": "배정할 팀원 ID"},
            },
            "required": ["customer_id", "member_id"],
        },
    },
    {
        "name": "get_pipeline_report",
        "description": "파이프라인 현황 및 전환율 리포트",
        "input_schema": {"type": "object", "properties": {}},
    },
]


class CustomerAgent(BaseAgent):
    def __init__(self):
        super().__init__("customer", _SYSTEM, _TOOLS)

    def execute_tool(self, name: str, inp: dict) -> str:
        try:
            if name == "add_customer":          return self._add_customer(inp)
            if name == "get_customers":         return self._get_customers(inp)
            if name == "update_customer_status":return self._update_status(inp)
            if name == "add_note":              return self._add_note(inp)
            if name == "schedule_followup":     return self._schedule_followup(inp)
            if name == "assign_customer":       return self._assign(inp)
            if name == "get_pipeline_report":   return self._pipeline_report()
        except Exception as e:
            return f"오류: {e}"
        return "알 수 없는 도구"

    def _score(self, inp: dict) -> int:
        score = 50
        industry = (inp.get("industry") or "").lower()
        budget = (inp.get("budget_range") or "").lower()
        pain = (inp.get("pain_points") or "").lower()
        size = (inp.get("company_size") or "").lower()
        if any(k in industry for k in ["임원", "대표", "ceo", "자영업"]):  score += 20
        if any(k in industry for k in ["직장인", "공무원", "교사"]):       score += 10
        if any(k in size for k in ["가족", "자녀", "아이"]):               score += 10
        if any(k in pain for k in ["실손", "생명", "암보험", "연금"]):     score += 10
        if any(k in budget for k in ["10만", "20만", "30만"]):             score += 5
        return min(score, 100)

    def _add_customer(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        score = self._score(inp)
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            """INSERT INTO customers
               (name,phone,email,industry,company_size,budget_range,pain_points,source,lead_score,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (inp.get("name"), inp.get("phone",""), inp.get("email",""),
             inp.get("industry",""), inp.get("company_size",""),
             inp.get("budget_range",""), inp.get("pain_points",""),
             inp.get("source",""), score, now, now),
        )
        cid = c.lastrowid
        conn.commit()
        conn.close()
        notion = add_customer_to_notion({**inp, "lead_score": score})
        if notion.get("page_id"):
            conn2 = get_connection()
            conn2.execute("UPDATE customers SET notion_page_id=? WHERE id=?", (notion["page_id"], cid))
            conn2.commit()
            conn2.close()
        log_activity("👥 고객관리", f"신규 고객 등록: {inp.get('name')} (점수 {score}점)", status="success")
        return json.dumps({"customer_id": cid, "lead_score": score, "notion_synced": not notion.get("simulated", True)}, ensure_ascii=False)

    def _get_customers(self, inp: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        status = inp.get("status")
        limit = inp.get("limit", 20)
        if status:
            c.execute("SELECT * FROM customers WHERE status=? ORDER BY lead_score DESC LIMIT ?", (status, limit))
        else:
            c.execute("SELECT * FROM customers ORDER BY lead_score DESC LIMIT ?", (limit,))
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"total": len(rows), "customers": rows}, ensure_ascii=False, indent=2)

    def _update_status(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT notion_page_id, name FROM customers WHERE id=?", (inp["customer_id"],))
        row = c.fetchone()
        c.execute("UPDATE customers SET status=?,updated_at=? WHERE id=?", (inp["status"], now, inp["customer_id"]))
        conn.commit()
        conn.close()
        if row and row["notion_page_id"]:
            update_customer_in_notion(row["notion_page_id"], {"status": inp["status"]})
        if inp.get("note"):
            self._add_note({"customer_id": inp["customer_id"], "note_type": "상태변경", "content": inp["note"]})
        log_activity("👥 고객관리", f"고객 상태 변경: {row['name'] if row else inp['customer_id']} → {inp['status']}", status="info")
        return json.dumps({"ok": True, "status": inp["status"]}, ensure_ascii=False)

    def _add_note(self, inp: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            "INSERT INTO customer_notes (customer_id,note_type,content,created_at) VALUES (?,?,?,?)",
            (inp["customer_id"], inp.get("note_type","일반"), inp["content"], datetime.now().isoformat()),
        )
        conn.commit()
        conn.close()
        return json.dumps({"ok": True}, ensure_ascii=False)

    def _schedule_followup(self, inp: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            "INSERT INTO followups (customer_id,followup_date,followup_type,priority,notes,created_at) VALUES (?,?,?,?,?,?)",
            (inp["customer_id"], inp["followup_date"], inp.get("followup_type","전화"),
             inp.get("priority","medium"), inp.get("notes",""), datetime.now().isoformat()),
        )
        conn.commit()
        conn.close()
        log_activity("👥 고객관리", f"팔로업 등록: {inp['followup_date']}", status="success")
        return json.dumps({"ok": True, "followup_date": inp["followup_date"]}, ensure_ascii=False)

    def _assign(self, inp: dict) -> str:
        conn = get_connection()
        conn.execute("UPDATE customers SET assigned_to=? WHERE id=?", (inp["member_id"], inp["customer_id"]))
        conn.commit()
        conn.close()
        return json.dumps({"ok": True}, ensure_ascii=False)

    def _pipeline_report(self) -> str:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT status, COUNT(*) as cnt, AVG(lead_score) as avg_score FROM customers GROUP BY status")
        rows = [dict(r) for r in c.fetchall()]
        c.execute("SELECT COUNT(*) as cnt FROM customers")
        total = c.fetchone()["cnt"]
        conn.close()
        return json.dumps({"total": total, "by_status": rows}, ensure_ascii=False, indent=2)
