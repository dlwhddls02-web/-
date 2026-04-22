"""
SNS 에이전트 — 보험업 특화 인스타그램 / 페이스북 자동 포스팅
Meta Graph API 연동 (미설정 시 시뮬레이션)
"""
import json
import httpx
from datetime import datetime
from agents.base_agent import BaseAgent
from backend.memory import get_connection, log_activity
from backend.tools.kakao_client import KakaoClient
from config import META_ACCESS_TOKEN, FACEBOOK_PAGE_ID, INSTAGRAM_ACCOUNT_ID, UNSPLASH_ACCESS_KEY

_GRAPH = "https://graph.facebook.com/v19.0"
_TIMEOUT = 30

_SYSTEM = """당신은 보험업 전문 SNS 마케터 AI입니다.

업무 순서:
1. get_image_url로 관련 이미지 확보
2. post_to_instagram 또는 post_to_facebook으로 게시
3. 게시 결과 보고

콘텐츠 원칙:
- 금융소비자보호법 준수 (수익률 보장 등 과장 광고 절대 금지)
- 공감형 스토리텔링: 일상 위험 인식 → 보험 필요성
- 따뜻하고 진정성 있는 어투
- 해시태그 10~15개 (#보험 #실손보험 #가족사랑 등)
- 무료 상담 CTA 포함

보험 종류: 실손의료보험 / 생명보험 / 종신보험 / 연금보험 / 어린이보험 / 자동차보험 / 건강보험

도구를 사용해 실제로 게시하세요. 게시 후 결과를 한국어로 보고하세요."""

_TOOLS = [
    {
        "name": "get_image_url",
        "description": "보험/금융 관련 무료 이미지 URL 가져오기 (Unsplash)",
        "input_schema": {
            "type": "object",
            "properties": {
                "keywords": {"type": "string", "description": "영어 키워드 (예: family health insurance protection)"},
            },
            "required": ["keywords"],
        },
    },
    {
        "name": "post_to_instagram",
        "description": "인스타그램 이미지 포스팅 (Meta Graph API)",
        "input_schema": {
            "type": "object",
            "properties": {
                "caption":        {"type": "string", "description": "캡션 전문 (해시태그 포함)"},
                "image_url":      {"type": "string", "description": "공개 이미지 URL"},
                "insurance_type": {"type": "string", "description": "보험 종류"},
                "content_theme":  {"type": "string", "description": "콘텐츠 테마"},
            },
            "required": ["caption"],
        },
    },
    {
        "name": "post_to_facebook",
        "description": "페이스북 페이지 포스팅 (Meta Graph API)",
        "input_schema": {
            "type": "object",
            "properties": {
                "message":        {"type": "string", "description": "게시글 전문"},
                "image_url":      {"type": "string", "description": "이미지 URL (선택)"},
                "insurance_type": {"type": "string", "description": "보험 종류"},
            },
            "required": ["message"],
        },
    },
    {
        "name": "create_content_calendar",
        "description": "월간 SNS 콘텐츠 캘린더 기획",
        "input_schema": {
            "type": "object",
            "properties": {
                "month":           {"type": "string", "description": "YYYY-MM"},
                "posts_per_week":  {"type": "integer", "description": "주당 포스팅 수 (기본 3)"},
                "focus_products":  {"type": "string", "description": "집중 홍보 상품 (쉼표 구분)"},
            },
            "required": ["month"],
        },
    },
    {
        "name": "generate_reels_script",
        "description": "인스타그램 릴스 스크립트 생성 (15~60초)",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic":            {"type": "string"},
                "duration_seconds": {"type": "integer", "description": "15/30/60"},
            },
            "required": ["topic"],
        },
    },
    {
        "name": "get_sns_history",
        "description": "SNS 게시 이력 조회",
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {"type": "string", "description": "instagram/facebook/all"},
                "limit":    {"type": "integer"},
            },
        },
    },
]

_DEFAULT_IMAGES = {
    "family":     "https://images.unsplash.com/photo-1511895426328-dc8714191011?w=1080",
    "health":     "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1080",
    "retirement": "https://images.unsplash.com/photo-1581579186913-45ac3e6efe93?w=1080",
    "children":   "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1080",
    "car":        "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=1080",
    "money":      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1080",
}


class SnsAgent(BaseAgent):
    def __init__(self):
        super().__init__("sns", _SYSTEM, _TOOLS)

    def execute_tool(self, name: str, inp: dict) -> str:
        try:
            if name == "get_image_url":           return self._get_image(inp)
            if name == "post_to_instagram":       return self._post_ig(inp)
            if name == "post_to_facebook":        return self._post_fb(inp)
            if name == "create_content_calendar": return self._calendar(inp)
            if name == "generate_reels_script":   return self._reels(inp)
            if name == "get_sns_history":         return self._history(inp)
        except Exception as e:
            return f"오류: {e}"
        return "알 수 없는 도구"

    def _get_image(self, inp: dict) -> str:
        kw = inp.get("keywords", "insurance family")
        if UNSPLASH_ACCESS_KEY:
            try:
                r = httpx.get(
                    "https://api.unsplash.com/photos/random",
                    params={"query": kw, "client_id": UNSPLASH_ACCESS_KEY, "orientation": "squarish"},
                    timeout=10,
                )
                if r.status_code == 200:
                    url = r.json()["urls"]["regular"]
                    return json.dumps({"image_url": url, "source": "unsplash"}, ensure_ascii=False)
            except Exception:
                pass
        for k, url in _DEFAULT_IMAGES.items():
            if k in kw.lower():
                return json.dumps({"image_url": url, "source": "default"}, ensure_ascii=False)
        return json.dumps({"image_url": _DEFAULT_IMAGES["health"], "source": "default"}, ensure_ascii=False)

    def _save_post(self, platform: str, caption: str, image_url: str, insurance_type: str,
                   theme: str, post_id: str, status: str) -> int:
        now = datetime.now().isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            """INSERT INTO sns_posts (platform,insurance_type,content_theme,caption,image_url,
               platform_post_id,status,posted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)""",
            (platform, insurance_type, theme, caption, image_url, post_id, status, now, now),
        )
        rid = c.lastrowid
        conn.commit()
        conn.close()
        return rid

    def _post_ig(self, inp: dict) -> str:
        caption = inp.get("caption", "")
        image_url = inp.get("image_url", _DEFAULT_IMAGES["health"])
        ins_type = inp.get("insurance_type", "")
        theme = inp.get("content_theme", "")

        if not META_ACCESS_TOKEN or not INSTAGRAM_ACCOUNT_ID:
            rid = self._save_post("instagram", caption, image_url, ins_type, theme, "", "simulated")
            KakaoClient().send_sns_posted("인스타그램(시뮬레이션)", ins_type)
            log_activity("📱 SNS", f"인스타그램 시뮬레이션 게시 (API 키 미설정)", status="warning")
            return json.dumps({"status": "simulated", "post_id": rid,
                               "note": "Meta API 키 설정 후 실제 게시됩니다."}, ensure_ascii=False)
        try:
            # 1) 미디어 컨테이너 생성
            r1 = httpx.post(f"{_GRAPH}/{INSTAGRAM_ACCOUNT_ID}/media",
                            params={"image_url": image_url, "caption": caption,
                                    "access_token": META_ACCESS_TOKEN}, timeout=_TIMEOUT)
            r1.raise_for_status()
            creation_id = r1.json()["id"]
            # 2) 게시
            r2 = httpx.post(f"{_GRAPH}/{INSTAGRAM_ACCOUNT_ID}/media_publish",
                            params={"creation_id": creation_id,
                                    "access_token": META_ACCESS_TOKEN}, timeout=_TIMEOUT)
            r2.raise_for_status()
            platform_id = r2.json().get("id", "")
            rid = self._save_post("instagram", caption, image_url, ins_type, theme, platform_id, "posted")
            KakaoClient().send_sns_posted("인스타그램", ins_type)
            log_activity("📱 SNS", f"✅ 인스타그램 게시 완료 ID={platform_id}", status="success")
            return json.dumps({"status": "posted", "platform_post_id": platform_id, "db_id": rid}, ensure_ascii=False)
        except Exception as e:
            log_activity("📱 SNS", f"인스타그램 게시 실패: {e}", status="error")
            return json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)

    def _post_fb(self, inp: dict) -> str:
        message = inp.get("message", "")
        image_url = inp.get("image_url", "")
        ins_type = inp.get("insurance_type", "")

        if not META_ACCESS_TOKEN or not FACEBOOK_PAGE_ID:
            rid = self._save_post("facebook", message, image_url, ins_type, "", "", "simulated")
            KakaoClient().send_sns_posted("페이스북(시뮬레이션)", ins_type)
            log_activity("📘 SNS", "페이스북 시뮬레이션 게시 (API 키 미설정)", status="warning")
            return json.dumps({"status": "simulated", "db_id": rid}, ensure_ascii=False)
        try:
            if image_url:
                r = httpx.post(f"{_GRAPH}/{FACEBOOK_PAGE_ID}/photos",
                               params={"url": image_url, "caption": message,
                                       "access_token": META_ACCESS_TOKEN}, timeout=_TIMEOUT)
            else:
                r = httpx.post(f"{_GRAPH}/{FACEBOOK_PAGE_ID}/feed",
                               params={"message": message,
                                       "access_token": META_ACCESS_TOKEN}, timeout=_TIMEOUT)
            r.raise_for_status()
            platform_id = r.json().get("post_id") or r.json().get("id", "")
            rid = self._save_post("facebook", message, image_url, ins_type, "", platform_id, "posted")
            KakaoClient().send_sns_posted("페이스북", ins_type)
            log_activity("📘 SNS", f"✅ 페이스북 게시 완료 ID={platform_id}", status="success")
            return json.dumps({"status": "posted", "platform_post_id": platform_id, "db_id": rid}, ensure_ascii=False)
        except Exception as e:
            log_activity("📘 SNS", f"페이스북 게시 실패: {e}", status="error")
            return json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)

    def _calendar(self, inp: dict) -> str:
        month = inp.get("month", datetime.now().strftime("%Y-%m"))
        ppw = inp.get("posts_per_week", 3)
        schedule = [
            {"day": "월", "platform": "instagram", "type": "실손보험", "theme": "건강걱정"},
            {"day": "수", "platform": "facebook",  "type": "생명보험", "theme": "가족사랑"},
            {"day": "금", "platform": "instagram", "type": "연금보험", "theme": "노후준비"},
            {"day": "화", "platform": "instagram", "type": "어린이보험", "theme": "자녀보호"},
            {"day": "목", "platform": "facebook",  "type": "자동차보험", "theme": "사고위험"},
        ]
        log_activity("📱 SNS", f"{month} 콘텐츠 캘린더 생성", status="success")
        return json.dumps({
            "month": month, "posts_per_week": ppw,
            "schedule": schedule[:ppw],
            "optimal_times": ["오전 9시", "오후 7시"],
            "hashtag_pool": ["#보험", "#실손보험", "#생명보험", "#연금보험", "#보험상담", "#무료상담"],
        }, ensure_ascii=False, indent=2)

    def _reels(self, inp: dict) -> str:
        topic = inp.get("topic", "실손보험")
        dur = inp.get("duration_seconds", 30)
        script = {
            "topic": topic, "duration": f"{dur}초",
            "scenes": [
                {"time": "0-5초",  "action": "후킹 자막", "content": f"'{topic}' 이거 알고 계셨나요?"},
                {"time": "5-15초", "action": "공감 상황",  "content": "갑작스런 입원, 수술비 걱정되시죠?"},
                {"time": "15-25초","action": "해결책 제시", "content": f"{topic}으로 이렇게 해결됩니다"},
                {"time": "25-30초","action": "CTA",         "content": "지금 무료 상담 받아보세요 👇"},
            ],
            "bgm": "잔잔한 피아노",
            "caption": f"#{topic.replace(' ','')} #보험상담 #무료상담 #보험추천",
        }
        log_activity("📱 SNS", f"릴스 스크립트 생성: {topic}", status="success")
        return json.dumps(script, ensure_ascii=False, indent=2)

    def _history(self, inp: dict) -> str:
        platform = inp.get("platform", "all")
        limit = inp.get("limit", 10)
        conn = get_connection()
        c = conn.cursor()
        if platform != "all":
            c.execute("SELECT * FROM sns_posts WHERE platform=? ORDER BY created_at DESC LIMIT ?", (platform, limit))
        else:
            c.execute("SELECT * FROM sns_posts ORDER BY created_at DESC LIMIT ?", (limit,))
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"total": len(rows), "posts": rows}, ensure_ascii=False, indent=2)
