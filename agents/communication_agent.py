import json
from datetime import datetime
from agents.base_agent import BaseAgent
from storage.database import get_connection

SYSTEM_PROMPT = """당신은 영업팀의 팀 커뮤니케이션 에이전트입니다.

주요 역할:
1. 팀 전체 공지 및 중요 메시지 발송
2. 개인 메시지 및 피드백 전달
3. 팀 미팅 일정 생성 및 관리
4. 고객 DB 배포 알림 자동화
5. 실적 리포트 자동 발송
6. 팀 소통 현황 및 수신함 관리

메시지 유형:
- announcement: 팀 전체 공지
- personal: 개인 메시지
- customer_db_share: 고객 DB 배포
- performance_report: 실적 리포트
- feedback: 개인 피드백

항상 한국어로 응답하고, 명확하고 친근한 톤을 유지하세요."""

TOOLS = [
    {
        "name": "send_team_announcement",
        "description": "팀 전체에 공지사항을 발송합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {"type": "string", "description": "공지 제목"},
                "content": {"type": "string", "description": "공지 내용"},
                "sender_id": {"type": "integer", "description": "발송자 팀원 ID (없으면 시스템 발송)"},
                "priority": {
                    "type": "string",
                    "description": "우선순위 (normal/important/urgent)",
                },
            },
            "required": ["subject", "content"],
        },
    },
    {
        "name": "send_personal_message",
        "description": "특정 팀원에게 개인 메시지를 발송합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "recipient_id": {"type": "integer", "description": "수신자 팀원 ID"},
                "subject": {"type": "string", "description": "메시지 제목"},
                "content": {"type": "string", "description": "메시지 내용"},
                "sender_id": {"type": "integer", "description": "발송자 팀원 ID"},
                "message_type": {
                    "type": "string",
                    "description": "유형 (personal/feedback/performance_report)",
                },
            },
            "required": ["recipient_id", "subject", "content"],
        },
    },
    {
        "name": "create_meeting",
        "description": "팀 미팅 또는 1:1 미팅 일정을 생성합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "미팅 제목"},
                "organizer_id": {"type": "integer", "description": "주최자 팀원 ID"},
                "meeting_type": {
                    "type": "string",
                    "description": "유형 (team_meeting/one_on_one/training/client_meeting)",
                },
                "scheduled_at": {
                    "type": "string",
                    "description": "일시 (YYYY-MM-DD HH:MM)",
                },
                "duration_minutes": {"type": "integer", "description": "소요 시간 (분)"},
                "agenda": {"type": "string", "description": "안건"},
                "attendee_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "참석자 팀원 ID 목록",
                },
            },
            "required": ["title", "meeting_type", "scheduled_at"],
        },
    },
    {
        "name": "get_inbox",
        "description": "팀원의 수신 메시지함을 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "팀원 ID (없으면 전체 공지 조회)"},
                "unread_only": {"type": "boolean", "description": "읽지 않은 메시지만 조회"},
                "limit": {"type": "integer", "description": "조회 개수"},
            },
        },
    },
    {
        "name": "send_performance_report_to_member",
        "description": "팀원에게 실적 리포트 메시지를 발송합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "수신자 팀원 ID"},
                "period": {"type": "string", "description": "리포트 기간 (YYYY-MM)"},
                "report_content": {"type": "string", "description": "리포트 내용"},
                "include_feedback": {
                    "type": "boolean",
                    "description": "AI 피드백 포함 여부",
                },
            },
            "required": ["member_id", "period", "report_content"],
        },
    },
    {
        "name": "get_upcoming_meetings",
        "description": "예정된 미팅 목록을 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "특정 팀원 ID (없으면 전체)"},
                "days_ahead": {"type": "integer", "description": "몇 일 후까지 조회"},
            },
        },
    },
    {
        "name": "broadcast_customer_db_notification",
        "description": "고객 DB 배포 알림을 팀 전체에 발송합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "total_customers": {"type": "integer", "description": "배포된 총 고객 수"},
                "min_lead_score": {"type": "integer", "description": "최소 리드 점수"},
                "highlights": {
                    "type": "string",
                    "description": "주목할 고객 또는 특이사항",
                },
            },
            "required": ["total_customers"],
        },
    },
]


class CommunicationAgent(BaseAgent):
    def __init__(self):
        super().__init__("팀 커뮤니케이션 에이전트", SYSTEM_PROMPT, TOOLS)

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        now = datetime.now().isoformat()

        try:
            if tool_name == "send_team_announcement":
                priority = tool_input.get("priority", "normal")
                prefix = {"urgent": "[긴급] ", "important": "[중요] ", "normal": ""}.get(priority, "")
                subject = prefix + tool_input["subject"]

                c.execute(
                    "INSERT INTO messages (sender_id, recipient_id, message_type, "
                    "subject, content, is_read, created_at) VALUES (?, NULL, 'announcement', ?, ?, 0, ?)",
                    (tool_input.get("sender_id"), subject, tool_input["content"], now),
                )
                conn.commit()
                mid = c.lastrowid
                c.execute("SELECT COUNT(*) as cnt FROM team_members WHERE is_active = 1")
                team_size = c.fetchone()["cnt"]
                return f"팀 공지 발송 완료 (메시지 ID: {mid}) → {team_size}명 수신 | 제목: {subject}"

            elif tool_name == "send_personal_message":
                c.execute("SELECT name FROM team_members WHERE id = ?", (tool_input["recipient_id"],))
                recipient = c.fetchone()
                if not recipient:
                    return "수신자를 찾을 수 없습니다."

                c.execute(
                    "INSERT INTO messages (sender_id, recipient_id, message_type, "
                    "subject, content, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
                    (
                        tool_input.get("sender_id"),
                        tool_input["recipient_id"],
                        tool_input.get("message_type", "personal"),
                        tool_input["subject"],
                        tool_input["content"],
                        now,
                    ),
                )
                conn.commit()
                return f"{recipient['name']}님에게 메시지 발송 완료 | 제목: {tool_input['subject']}"

            elif tool_name == "create_meeting":
                attendees_json = json.dumps(tool_input.get("attendee_ids", []))
                c.execute(
                    "INSERT INTO meetings (title, organizer_id, meeting_type, scheduled_at, "
                    "duration_minutes, agenda, attendees, status, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)",
                    (
                        tool_input["title"],
                        tool_input.get("organizer_id"),
                        tool_input["meeting_type"],
                        tool_input["scheduled_at"],
                        tool_input.get("duration_minutes", 60),
                        tool_input.get("agenda", ""),
                        attendees_json,
                        now,
                    ),
                )
                conn.commit()
                meeting_id = c.lastrowid

                attendee_ids = tool_input.get("attendee_ids", [])
                notify_content = (
                    f"미팅 일정 안내\n\n"
                    f"제목: {tool_input['title']}\n"
                    f"일시: {tool_input['scheduled_at']}\n"
                    f"소요시간: {tool_input.get('duration_minutes', 60)}분\n"
                    f"안건: {tool_input.get('agenda', 'N/A')}"
                )
                for aid in attendee_ids:
                    c.execute(
                        "INSERT INTO messages (sender_id, recipient_id, message_type, "
                        "subject, content, created_at) VALUES (?, ?, 'announcement', ?, ?, ?)",
                        (
                            tool_input.get("organizer_id"),
                            aid,
                            f"[미팅 초대] {tool_input['title']}",
                            notify_content,
                            now,
                        ),
                    )
                conn.commit()
                return (
                    f"미팅 생성 완료 (ID: {meeting_id})\n"
                    f"  제목: {tool_input['title']}\n"
                    f"  일시: {tool_input['scheduled_at']}\n"
                    f"  참석자: {len(attendee_ids)}명 초대 알림 발송"
                )

            elif tool_name == "get_inbox":
                mid = tool_input.get("member_id")
                limit = tool_input.get("limit", 20)

                if mid:
                    query = (
                        "SELECT m.*, tm.name as sender_name FROM messages m "
                        "LEFT JOIN team_members tm ON m.sender_id = tm.id "
                        "WHERE (m.recipient_id = ? OR m.recipient_id IS NULL) "
                        "AND m.message_type != 'customer_db_share'"
                    )
                    params = [mid]
                else:
                    query = (
                        "SELECT m.*, tm.name as sender_name FROM messages m "
                        "LEFT JOIN team_members tm ON m.sender_id = tm.id "
                        "WHERE m.recipient_id IS NULL"
                    )
                    params = []

                if tool_input.get("unread_only"):
                    query += " AND m.is_read = 0"
                query += f" ORDER BY m.created_at DESC LIMIT {int(limit)}"

                c.execute(query, params)
                msgs = [dict(r) for r in c.fetchall()]
                if not msgs:
                    return "메시지가 없습니다."

                lines = [f"수신함 ({len(msgs)}건):"]
                for msg in msgs:
                    read_mark = "" if msg["is_read"] else "[NEW] "
                    sender = msg.get("sender_name") or "시스템"
                    lines.append(
                        f"  {read_mark}[{msg['created_at'][:10]}] {msg['subject']}"
                        f"\n    발신: {sender} | 유형: {msg['message_type']}"
                        f"\n    {msg['content'][:100]}..."
                    )
                return "\n".join(lines)

            elif tool_name == "send_performance_report_to_member":
                c.execute("SELECT name FROM team_members WHERE id = ?", (tool_input["member_id"],))
                recipient = c.fetchone()
                if not recipient:
                    return "팀원을 찾을 수 없습니다."

                subject = f"{tool_input['period']} 실적 리포트 - {recipient['name']}님"
                content = tool_input["report_content"]
                if tool_input.get("include_feedback"):
                    content += "\n\n[AI 피드백이 포함되어 있습니다. 실적관리 에이전트에서 상세 피드백을 확인하세요.]"

                c.execute(
                    "INSERT INTO messages (sender_id, recipient_id, message_type, "
                    "subject, content, is_read, created_at) VALUES (NULL, ?, 'performance_report', ?, ?, 0, ?)",
                    (tool_input["member_id"], subject, content, now),
                )
                conn.commit()
                return f"{recipient['name']}님에게 {tool_input['period']} 실적 리포트 발송 완료"

            elif tool_name == "get_upcoming_meetings":
                from datetime import timedelta
                days = tool_input.get("days_ahead", 7)
                cutoff = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")
                today = datetime.now().strftime("%Y-%m-%d")

                query = (
                    "SELECT m.*, tm.name as organizer_name FROM meetings m "
                    "LEFT JOIN team_members tm ON m.organizer_id = tm.id "
                    "WHERE m.scheduled_at >= ? AND m.scheduled_at <= ? AND m.status = 'scheduled'"
                )
                params = [today, cutoff]
                mid = tool_input.get("member_id")
                if mid:
                    query += " AND (m.organizer_id = ? OR m.attendees LIKE ?)"
                    params.extend([mid, f"%{mid}%"])
                query += " ORDER BY m.scheduled_at"

                c.execute(query, params)
                rows = [dict(r) for r in c.fetchall()]
                if not rows:
                    return f"향후 {days}일 내 예정된 미팅이 없습니다."

                lines = [f"예정 미팅 ({len(rows)}건):"]
                for r in rows:
                    lines.append(
                        f"\n  [{r['meeting_type']}] {r['title']}"
                        f"\n    일시: {r['scheduled_at']} ({r['duration_minutes']}분)"
                        f"\n    주최: {r.get('organizer_name','N/A')}"
                        + (f"\n    안건: {r['agenda'][:80]}" if r.get("agenda") else "")
                    )
                return "\n".join(lines)

            elif tool_name == "broadcast_customer_db_notification":
                content = (
                    f"[신규 고객 DB 배포 알림]\n\n"
                    f"총 {tool_input['total_customers']}명의 신규 고객 DB가 팀원들에게 배포되었습니다.\n"
                )
                if tool_input.get("min_lead_score"):
                    content += f"리드 점수 기준: {tool_input['min_lead_score']}점 이상\n"
                if tool_input.get("highlights"):
                    content += f"\n[주목 고객]\n{tool_input['highlights']}\n"
                content += "\n각자 배정된 고객을 확인하고 24시간 이내 첫 연락을 진행해 주세요."

                c.execute(
                    "INSERT INTO messages (sender_id, recipient_id, message_type, "
                    "subject, content, is_read, created_at) "
                    "VALUES (NULL, NULL, 'customer_db_share', '[고객DB 배포] 신규 고객 배정 완료', ?, 0, ?)",
                    (content, now),
                )
                conn.commit()
                c.execute("SELECT COUNT(*) as cnt FROM team_members WHERE is_active = 1")
                team_size = c.fetchone()["cnt"]
                return f"고객 DB 배포 알림 발송 완료 → {team_size}명 수신"

        except Exception as e:
            return f"오류: {e}"
        finally:
            conn.close()
