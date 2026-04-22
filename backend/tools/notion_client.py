"""
Notion API 클라이언트 — 고객 DB / 계약 / 보고서 연동
API 키 미설정 시 시뮬레이션 모드로 동작
"""
import json
import httpx
from datetime import datetime
from config import NOTION_API_KEY, NOTION_CUSTOMERS_DB_ID, NOTION_CONTRACTS_DB_ID, NOTION_REPORTS_DB_ID

_BASE = "https://api.notion.com/v1"
_HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}
_TIMEOUT = 15


def _enabled() -> bool:
    return bool(NOTION_API_KEY)


def _post(path: str, body: dict) -> dict:
    r = httpx.post(f"{_BASE}{path}", headers=_HEADERS, json=body, timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


def _patch(path: str, body: dict) -> dict:
    r = httpx.patch(f"{_BASE}{path}", headers=_HEADERS, json=body, timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


# ── 고객 ───────────────────────────────────────────────────────────────────

def add_customer_to_notion(customer: dict) -> dict:
    """고객을 Notion 고객 DB에 추가. 반환: {"page_id": ..., "url": ...}"""
    if not _enabled():
        return {"page_id": None, "url": None, "simulated": True}

    props = {
        "이름": {"title": [{"text": {"content": customer.get("name", "")}}]},
        "전화번호": {"phone_number": customer.get("phone", "")},
        "이메일": {"email": customer.get("email", "")},
        "업종": {"rich_text": [{"text": {"content": customer.get("industry", "")}}]},
        "상태": {"select": {"name": customer.get("status", "prospect")}},
        "리드점수": {"number": customer.get("lead_score", 0)},
        "담당자": {"rich_text": [{"text": {"content": str(customer.get("assigned_to", ""))}}]},
    }
    body = {
        "parent": {"database_id": NOTION_CUSTOMERS_DB_ID},
        "properties": props,
    }
    try:
        res = _post("/pages", body)
        return {"page_id": res["id"], "url": res.get("url", ""), "simulated": False}
    except Exception as e:
        return {"page_id": None, "url": None, "error": str(e), "simulated": True}


def update_customer_in_notion(page_id: str, updates: dict) -> bool:
    """Notion 고객 페이지 업데이트"""
    if not _enabled() or not page_id:
        return False
    props = {}
    if "status" in updates:
        props["상태"] = {"select": {"name": updates["status"]}}
    if "lead_score" in updates:
        props["리드점수"] = {"number": updates["lead_score"]}
    if not props:
        return True
    try:
        _patch(f"/pages/{page_id}", {"properties": props})
        return True
    except Exception:
        return False


def get_customers_from_notion(status: str = None) -> list:
    """Notion 고객 DB 조회"""
    if not _enabled():
        return []
    body: dict = {}
    if status:
        body["filter"] = {"property": "상태", "select": {"equals": status}}
    try:
        res = _post(f"/databases/{NOTION_CUSTOMERS_DB_ID}/query", body)
        return res.get("results", [])
    except Exception:
        return []


# ── 계약 ───────────────────────────────────────────────────────────────────

def add_contract_to_notion(contract: dict) -> dict:
    """계약을 Notion 계약 DB에 추가"""
    if not _enabled():
        return {"page_id": None, "simulated": True}

    props = {
        "계약명": {"title": [{"text": {"content": contract.get("product_name", "신규계약")}}]},
        "보험종류": {"select": {"name": contract.get("insurance_type", "기타")}},
        "월납보험료": {"number": contract.get("premium_monthly", 0)},
        "계약금액": {"number": contract.get("contract_amount", 0)},
        "상태": {"select": {"name": contract.get("status", "pending")}},
        "시작일": {"date": {"start": contract.get("start_date", datetime.now().strftime("%Y-%m-%d"))}},
    }
    body = {
        "parent": {"database_id": NOTION_CONTRACTS_DB_ID},
        "properties": props,
    }
    try:
        res = _post("/pages", body)
        return {"page_id": res["id"], "url": res.get("url", ""), "simulated": False}
    except Exception as e:
        return {"page_id": None, "error": str(e), "simulated": True}


# ── 보고서 ─────────────────────────────────────────────────────────────────

def create_report_in_notion(title: str, content: str, period: str = None) -> dict:
    """보고서를 Notion 보고서 DB에 저장"""
    if not _enabled():
        return {"page_id": None, "simulated": True}

    period = period or datetime.now().strftime("%Y-%m")
    props = {
        "제목": {"title": [{"text": {"content": title}}]},
        "기간": {"rich_text": [{"text": {"content": period}}]},
        "생성일": {"date": {"start": datetime.now().strftime("%Y-%m-%d")}},
    }
    children = [
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": content[:2000]}}]
            },
        }
    ]
    body = {
        "parent": {"database_id": NOTION_REPORTS_DB_ID},
        "properties": props,
        "children": children,
    }
    try:
        res = _post("/pages", body)
        return {"page_id": res["id"], "url": res.get("url", ""), "simulated": False}
    except Exception as e:
        return {"page_id": None, "error": str(e), "simulated": True}
