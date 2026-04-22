"""
계약관리 에이전트 — 보험 계약 등록 / 분석 / Notion 저장
"""
import json
from datetime import datetime
from agents.base_agent import BaseAgent
from backend.memory import get_connection, log_activity
from backend.tools.notion_client import add_contract_to_notion
from backend.tools.kakao_client import KakaoClient
from backend.tools.n8n_client import trigger_contract_workflow

_SYSTEM = """당신은 보험 계약 전문 AI입니다.

업무:
- 신규 보험 계약 등록 (실손/생명/종신/연금/어린이/자동차/건강)
- 계약 현황 및 유지율 분석
- 보험종류별 수익 리포트
- 계약 체결 시 카카오 알림 + n8n 후처리 자동 실행

계약 상태: pending(심사중) → active(유효) → lapsed(실효) → cancelled(해지)

도구를 사용해 실제로 계약을 등록하고 분석하세요."""

_TOOLS = [
    {
        "name": "create_contract",
        "description": "신규 보험 계약 등록 + Notion 저장 + 카카오 알림",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id":     {"type": "integer", "description": "고객 ID"},
                "member_id":       {"type": "integer", "description": "담당 팀원 ID"},
                "insurance_type":  {"type": "string",  "description": "보험종류 (실손/생명/종신/연금/어린이/자동차/건강)"},
                "product_name":    {"type": "string",  "description": "상품명"},
                "premium_monthly": {"type": "number",  "description": "월납 보험료 (원)"},
                "contract_amount": {"type": "number",  "description": "보험 가입금액 (원)"},
                "start_date":      {"type": "string",  "description": "계약 시작일 YYYY-MM-DD"},
                "end_date":        {"type": "string",  "description": "만기일 YYYY-MM-DD"},
                "notes":           {"type": "string",  "description": "특이사항"},
            },
            "required": ["customer_id", "insurance_type"],
        },
    },
    {
        "name": "get_contracts",
        "description": "계약 목록 조회",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id":    {"type": "integer", "description": "고객별 조회"},
                "member_id":      {"type": "integer", "description": "담당자별 조회"},
                "insurance_type": {"type": "string",  "description": "보험종류 필터"},
                "status":         {"type": "string",  "description": "상태 필터"},
                "limit":          {"type": "integer"},
            },
        },
    },
    {
        "name": "update_contract_status",
        "description": "계약 상태 변경 (active/lapsed/cancelled)",
        "input_schema": {
            "type": "object",
            "properties": {
                "contract_id": {"type": "integer"},
                "status":      {"type": "string"},
                "notes":       {"type": "string"},
            },
            "required": ["contract_id", "status"],
        },
    },
    {
        "name": "get_contract_stats",
        "description": "보험종류별 계약 현황 및 수익 분석",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "description": "조회 기간 YYYY-MM (기본 이번달)"},
            },
        },
    },
    {
        "name": "get_member_contracts",
        "description": "팀원별 계약 실적 요약",
        "input_schema": {"type": "object", "properties": {}},
    },
]


class ContractAgent(BaseAgent):
    def __init__(self):
        super().__init__("contract", _SYSTEM, _TOOLS)

    def execute_tool(self, name: str, inp: dict) -> str:
        try:
            if name == "create_contract":       return self._create(inp)
            if name == "get_contracts":         return self._get(inp)
            if name == "update_contract_status":return self._update_status(inp)
            if name == "get_contract_stats":    return self._stats(inp)
            if name == "get_member_contracts":  return self._member_stats()
        except Exception as e:
            return f"오류: {e}"
        return "알 수 없는 도구"

    def _create(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        start = inp.get("start_date", datetime.now().strftime("%Y-%m-%d"))
        conn = get_connection()
        c = conn.cursor()
        # 고객 이름 조회
        c.execute("SELECT name FROM customers WHERE id=?", (inp["customer_id"],))
        cust = c.fetchone()
        cust_name = cust["name"] if cust else f"고객#{inp['customer_id']}"
        c.execute(
            """INSERT INTO contracts
               (customer_id,member_id,insurance_type,product_name,premium_monthly,
                contract_amount,start_date,end_date,status,notes,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (inp["customer_id"], inp.get("member_id"), inp["insurance_type"],
             inp.get("product_name", inp["insurance_type"]),
             inp.get("premium_monthly", 0), inp.get("contract_amount", 0),
             start, inp.get("end_date"), "active", inp.get("notes",""), now, now),
        )
        cid = c.lastrowid
        conn.commit()
        # 실적 기록에 반영
        period = datetime.now().strftime("%Y-%m")
        mid = inp.get("member_id")
        if mid:
            c.execute(
                """INSERT INTO performance_records (member_id,period,deals_closed,sales_amount,created_at,updated_at)
                   VALUES (?,?,1,?,?,?)
                   ON CONFLICT DO NOTHING""",
                (mid, period, inp.get("premium_monthly", 0) * 12, now, now),
            )
            c.execute(
                """UPDATE performance_records
                   SET deals_closed=deals_closed+1,
                       sales_amount=sales_amount+?,
                       updated_at=?
                   WHERE member_id=? AND period=?""",
                (inp.get("premium_monthly", 0) * 12, now, mid, period),
            )
            conn.commit()
        conn.close()

        notion = add_contract_to_notion({**inp, "start_date": start})
        KakaoClient().send_contract_alert(cust_name, inp["insurance_type"], inp.get("premium_monthly", 0))
        trigger_contract_workflow(cust_name, inp["insurance_type"], inp.get("premium_monthly", 0))
        log_activity("📋 계약관리", f"계약 등록: {cust_name} / {inp['insurance_type']} 월{inp.get('premium_monthly',0):,.0f}원", status="success")
        return json.dumps({
            "contract_id": cid,
            "customer_name": cust_name,
            "notion_synced": not notion.get("simulated", True),
        }, ensure_ascii=False)

    def _get(self, inp: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        query = """SELECT ct.*, cu.name as customer_name, tm.name as member_name
                   FROM contracts ct
                   LEFT JOIN customers cu ON ct.customer_id=cu.id
                   LEFT JOIN team_members tm ON ct.member_id=tm.id
                   WHERE 1=1"""
        params = []
        if inp.get("customer_id"):
            query += " AND ct.customer_id=?"; params.append(inp["customer_id"])
        if inp.get("member_id"):
            query += " AND ct.member_id=?"; params.append(inp["member_id"])
        if inp.get("insurance_type"):
            query += " AND ct.insurance_type=?"; params.append(inp["insurance_type"])
        if inp.get("status"):
            query += " AND ct.status=?"; params.append(inp["status"])
        query += f" ORDER BY ct.created_at DESC LIMIT {inp.get('limit', 20)}"
        c.execute(query, params)
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"total": len(rows), "contracts": rows}, ensure_ascii=False, indent=2)

    def _update_status(self, inp: dict) -> str:
        conn = get_connection()
        conn.execute(
            "UPDATE contracts SET status=?,notes=?,updated_at=? WHERE id=?",
            (inp["status"], inp.get("notes",""), datetime.now().isoformat(), inp["contract_id"]),
        )
        conn.commit()
        conn.close()
        log_activity("📋 계약관리", f"계약#{inp['contract_id']} 상태 → {inp['status']}", status="info")
        return json.dumps({"ok": True}, ensure_ascii=False)

    def _stats(self, inp: dict) -> str:
        period = inp.get("period", datetime.now().strftime("%Y-%m"))
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            """SELECT insurance_type,
                      COUNT(*) as count,
                      SUM(premium_monthly) as total_premium,
                      SUM(contract_amount) as total_amount
               FROM contracts
               WHERE status='active' AND strftime('%Y-%m', created_at)=?
               GROUP BY insurance_type ORDER BY total_premium DESC""",
            (period,),
        )
        rows = [dict(r) for r in c.fetchall()]
        c.execute("SELECT COUNT(*) as cnt, SUM(premium_monthly) as total FROM contracts WHERE status='active'")
        summary = dict(c.fetchone())
        conn.close()
        return json.dumps({"period": period, "by_type": rows, "all_active": summary}, ensure_ascii=False, indent=2)

    def _member_stats(self) -> str:
        period = datetime.now().strftime("%Y-%m")
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            """SELECT tm.name, COUNT(ct.id) as contracts, SUM(ct.premium_monthly) as monthly_premium
               FROM team_members tm
               LEFT JOIN contracts ct ON tm.id=ct.member_id
                   AND ct.status='active'
                   AND strftime('%Y-%m', ct.created_at)=?
               WHERE tm.is_active=1
               GROUP BY tm.id ORDER BY monthly_premium DESC""",
            (period,),
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"period": period, "members": rows}, ensure_ascii=False, indent=2)
