"""
카카오 클라이언트 — KakaoTalk 팀 알림 / 카카오 채널 메시지
API 키 미설정 시 로그로 대체
"""
import httpx
from datetime import datetime
from config import KAKAO_ACCESS_TOKEN, KAKAO_REST_API_KEY, KAKAO_CHANNEL_PUBLIC_ID
from backend.memory import log_activity

_TIMEOUT = 10


class KakaoClient:
    def _enabled(self) -> bool:
        return bool(KAKAO_ACCESS_TOKEN)

    # ── 나에게 메시지 (카카오 나에게 보내기 API) ───────────────────────────
    def send_me(self, text: str) -> bool:
        """카카오 '나에게 보내기' — 팀장 알림용"""
        if not self._enabled():
            log_activity("💬 카카오", f"[시뮬레이션] {text[:60]}", status="warning")
            return False
        try:
            r = httpx.post(
                "https://kapi.kakao.com/v2/api/talk/memo/default/send",
                headers={"Authorization": f"Bearer {KAKAO_ACCESS_TOKEN}"},
                data={
                    "template_object": '{"object_type":"text","text":"'
                    + text.replace('"', "'")
                    + '","link":{"web_url":"","mobile_web_url":""}}'
                },
                timeout=_TIMEOUT,
            )
            ok = r.status_code == 200
            if ok:
                log_activity("💬 카카오", "팀장에게 알림 전송 완료", status="success")
            else:
                log_activity("💬 카카오", f"알림 전송 실패: {r.text[:80]}", status="error")
            return ok
        except Exception as e:
            log_activity("💬 카카오", f"알림 오류: {e}", status="error")
            return False

    # ── 팔로업 기한 초과 알림 ─────────────────────────────────────────────
    def send_followup_alert(self, overdue: list) -> bool:
        lines = ["🔔 [팔로업 기한 초과 알림]", f"총 {len(overdue)}건", ""]
        for f in overdue[:5]:
            lines.append(
                f"• {f.get('customer_name','?')} ({f.get('customer_phone','')}) "
                f"— {f.get('followup_date','')} {f.get('followup_type','')}"
            )
        if len(overdue) > 5:
            lines.append(f"...외 {len(overdue)-5}건")
        return self.send_me("\n".join(lines))

    # ── 실적 보고 알림 ────────────────────────────────────────────────────
    def send_performance_report(self, report_summary: str) -> bool:
        text = f"📊 [실적 보고]\n{datetime.now().strftime('%Y-%m-%d')}\n\n{report_summary[:300]}"
        return self.send_me(text)

    # ── 회의 준비 알림 ────────────────────────────────────────────────────
    def send_meeting_ready(self, expires_minutes: int = 10) -> bool:
        text = (
            "🏢 [자율 회의 준비 완료]\n"
            f"에이전트들이 주간 전략을 수립했습니다.\n"
            f"앱에 접속해 {expires_minutes}분 내로 참여하시면\n"
            "팀장님의 의견을 반영해 실행합니다."
        )
        return self.send_me(text)

    # ── 계약 체결 축하 ────────────────────────────────────────────────────
    def send_contract_alert(self, customer_name: str, insurance_type: str, amount: float) -> bool:
        text = (
            f"🎉 [계약 체결]\n"
            f"고객: {customer_name}\n"
            f"상품: {insurance_type}\n"
            f"월납: {amount:,.0f}원"
        )
        return self.send_me(text)

    # ── SNS 게시 완료 알림 ────────────────────────────────────────────────
    def send_sns_posted(self, platform: str, insurance_type: str) -> bool:
        text = (
            f"📱 [SNS 자동 게시 완료]\n"
            f"플랫폼: {platform}\n"
            f"상품: {insurance_type}\n"
            f"시각: {datetime.now().strftime('%H:%M')}"
        )
        return self.send_me(text)
