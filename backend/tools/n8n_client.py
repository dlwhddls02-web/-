"""
n8n 클라이언트 — 워크플로우 자동화 트리거
API 미설정 시 로그로 대체
"""
import httpx
from config import N8N_BASE_URL, N8N_API_KEY
from backend.memory import log_activity

_TIMEOUT = 15
_HEADERS = {"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"}


def _enabled() -> bool:
    return bool(N8N_API_KEY and N8N_BASE_URL)


def trigger_workflow(workflow_id: str, data: dict = None) -> dict:
    """n8n 워크플로우 실행 트리거 (ID 방식)"""
    if not _enabled():
        log_activity("⚙️ n8n", f"[시뮬레이션] 워크플로우 {workflow_id} 트리거", status="warning")
        return {"simulated": True, "workflow_id": workflow_id}
    try:
        r = httpx.post(
            f"{N8N_BASE_URL}/api/v1/workflows/{workflow_id}/execute",
            headers=_HEADERS,
            json={"data": data or {}},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        result = r.json()
        log_activity("⚙️ n8n", f"워크플로우 {workflow_id} 실행 완료", status="success")
        return {"simulated": False, "execution_id": result.get("id"), "status": "triggered"}
    except Exception as e:
        log_activity("⚙️ n8n", f"워크플로우 실행 오류: {e}", status="error")
        return {"simulated": True, "error": str(e)}


def trigger_webhook(webhook_path: str, data: dict = None) -> dict:
    """n8n Webhook 트리거 (Webhook URL 방식)"""
    if not _enabled():
        log_activity("⚙️ n8n", f"[시뮬레이션] Webhook {webhook_path} 트리거", status="warning")
        return {"simulated": True}
    try:
        url = f"{N8N_BASE_URL}/webhook/{webhook_path.lstrip('/')}"
        r = httpx.post(url, json=data or {}, timeout=_TIMEOUT)
        r.raise_for_status()
        log_activity("⚙️ n8n", f"Webhook {webhook_path} 트리거 완료", status="success")
        return {"simulated": False, "status": r.status_code, "response": r.text[:200]}
    except Exception as e:
        log_activity("⚙️ n8n", f"Webhook 오류: {e}", status="error")
        return {"simulated": True, "error": str(e)}


def get_executions(workflow_id: str = None, limit: int = 10) -> list:
    """최근 실행 이력 조회"""
    if not _enabled():
        return []
    try:
        params = {"limit": limit}
        if workflow_id:
            params["workflowId"] = workflow_id
        r = httpx.get(
            f"{N8N_BASE_URL}/api/v1/executions",
            headers=_HEADERS,
            params=params,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        return r.json().get("data", [])
    except Exception:
        return []


def get_workflows() -> list:
    """등록된 워크플로우 목록"""
    if not _enabled():
        return []
    try:
        r = httpx.get(f"{N8N_BASE_URL}/api/v1/workflows", headers=_HEADERS, timeout=_TIMEOUT)
        r.raise_for_status()
        return r.json().get("data", [])
    except Exception:
        return []


# ── 자주 쓰는 워크플로우 단축 함수 ────────────────────────────────────────

def trigger_sns_workflow(platform: str, caption: str, image_url: str = "") -> dict:
    """SNS 게시 워크플로우 트리거"""
    return trigger_webhook("sns-post", {
        "platform": platform,
        "caption": caption,
        "image_url": image_url,
    })


def trigger_followup_workflow(customer_name: str, phone: str, followup_type: str) -> dict:
    """팔로업 알림 워크플로우 트리거"""
    return trigger_webhook("followup-reminder", {
        "customer_name": customer_name,
        "phone": phone,
        "followup_type": followup_type,
    })


def trigger_contract_workflow(customer_name: str, insurance_type: str, amount: float) -> dict:
    """계약 체결 후처리 워크플로우 트리거"""
    return trigger_webhook("contract-signed", {
        "customer_name": customer_name,
        "insurance_type": insurance_type,
        "amount": amount,
    })
