import json
from datetime import datetime
from agents.base_agent import BaseAgent
from storage.database import get_connection

SYSTEM_PROMPT = """당신은 영업팀의 고객관리(CRM) 에이전트입니다.

주요 역할:
1. 마케팅 에이전트로부터 받은 고객 DB를 체계적으로 관리
2. 고객 상태(prospect → contacted → negotiating → closed/lost) 추적
3. 고객별 상담 노트 관리 및 이력 기록
4. 팔로업 일정 관리 및 알림
5. 고객 분석 및 전환율 리포트 생성
6. 고객별 최적 접근 전략 제안

고객 상태 단계:
- prospect: 잠재고객 (마케팅 DB 입수)
- contacted: 첫 접촉 완료
- negotiating: 협상/제안 단계
- closed: 계약 성사
- lost: 고객 이탈

항상 한국어로 응답하고, 구체적인 액션 아이템을 제시하세요."""

TOOLS = [
    {
        "name": "get_customer_details",
        "description": "특정 고객의 상세 정보와 히스토리를 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "고객 ID"},
            },
            "required": ["customer_id"],
        },
    },
    {
        "name": "update_customer_status",
        "description": "고객의 영업 상태를 업데이트합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "고객 ID"},
                "status": {
                    "type": "string",
                    "description": "새 상태 (prospect/contacted/negotiating/closed/lost)",
                },
                "reason": {"type": "string", "description": "상태 변경 이유"},
            },
            "required": ["customer_id", "status"],
        },
    },
    {
        "name": "add_customer_note",
        "description": "고객에 대한 상담 노트를 추가합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "고객 ID"},
                "member_id": {"type": "integer", "description": "담당 팀원 ID"},
                "note_type": {
                    "type": "string",
                    "description": "노트 유형 (call/meeting/email/general)",
                },
                "content": {"type": "string", "description": "노트 내용"},
            },
            "required": ["customer_id", "note_type", "content"],
        },
    },
    {
        "name": "schedule_followup",
        "description": "고객 팔로업 일정을 등록합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "고객 ID"},
                "assigned_to": {"type": "integer", "description": "담당 팀원 ID"},
                "followup_date": {
                    "type": "string",
                    "description": "팔로업 날짜 (YYYY-MM-DD)",
                },
                "followup_type": {
                    "type": "string",
                    "description": "팔로업 방식 (call/email/meeting/demo)",
                },
                "priority": {
                    "type": "string",
                    "description": "우선순위 (low/medium/high/urgent)",
                },
                "notes": {"type": "string", "description": "팔로업 메모"},
            },
            "required": ["customer_id", "followup_date", "followup_type"],
        },
    },
    {
        "name": "get_customers_by_status",
        "description": "상태별 고객 목록을 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "상태 필터"},
                "assigned_to": {"type": "integer", "description": "담당 팀원 ID 필터"},
            },
        },
    },
    {
        "name": "get_pending_followups",
        "description": "처리 대기 중인 팔로업 목록을 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "assigned_to": {"type": "integer", "description": "담당 팀원 ID 필터"},
                "overdue_only": {"type": "boolean", "description": "기한 초과 항목만 조회"},
            },
        },
    },
    {
        "name": "generate_customer_report",
        "description": "고객 현황 분석 리포트를 생성합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "report_type": {
                    "type": "string",
                    "description": "리포트 유형 (pipeline/conversion/assigned)",
                },
                "member_id": {"type": "integer", "description": "특정 팀원만 조회 (선택)"},
            },
            "required": ["report_type"],
        },
    },
]


class CustomerManagementAgent(BaseAgent):
    def __init__(self):
        super().__init__("고객관리 에이전트", SYSTEM_PROMPT, TOOLS)

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        now = datetime.now().isoformat()
        today = datetime.now().strftime("%Y-%m-%d")

        try:
            if tool_name == "get_customer_details":
                cid = tool_input["customer_id"]
                c.execute("SELECT * FROM customers WHERE id = ?", (cid,))
                row = c.fetchone()
                if not row:
                    return "고객을 찾을 수 없습니다."
                cust = dict(row)
                pp = json.loads(cust.get("pain_points") or "[]")

                c.execute(
                    "SELECT cn.*, tm.name as member_name FROM customer_notes cn "
                    "LEFT JOIN team_members tm ON cn.member_id = tm.id "
                    "WHERE cn.customer_id = ? ORDER BY cn.created_at DESC LIMIT 10",
                    (cid,),
                )
                notes = [dict(r) for r in c.fetchall()]

                c.execute(
                    "SELECT f.*, tm.name as member_name FROM followups f "
                    "LEFT JOIN team_members tm ON f.assigned_to = tm.id "
                    "WHERE f.customer_id = ? ORDER BY f.followup_date",
                    (cid,),
                )
                followups = [dict(r) for r in c.fetchall()]

                lines = [
                    f"=== 고객 상세 정보 ===",
                    f"이름: {cust['name']} | 회사: {cust['company']}",
                    f"업종: {cust['industry']} | 규모: {cust.get('company_size','N/A')}",
                    f"연락처: {cust.get('phone','N/A')} | {cust.get('email','N/A')}",
                    f"리드점수: {cust['lead_score']}점 | 상태: {cust['status']}",
                    f"예산: {cust.get('budget_range','N/A')}",
                ]
                if pp:
                    lines.append(f"핵심문제: {', '.join(pp)}")
                if notes:
                    lines.append("\n[최근 상담 이력]")
                    for n in notes[:5]:
                        lines.append(
                            f"  {n['created_at'][:10]} [{n['note_type']}] "
                            f"{n.get('member_name','시스템')}: {n['content'][:80]}"
                        )
                if followups:
                    lines.append("\n[팔로업 일정]")
                    for f in followups:
                        lines.append(
                            f"  {f['followup_date']} [{f['followup_type']}] "
                            f"우선순위:{f['priority']} 상태:{f['status']}"
                        )
                return "\n".join(lines)

            elif tool_name == "update_customer_status":
                c.execute(
                    "UPDATE customers SET status = ?, updated_at = ? WHERE id = ?",
                    (tool_input["status"], now, tool_input["customer_id"]),
                )
                conn.commit()
                reason = tool_input.get("reason", "")
                if reason:
                    c.execute(
                        "INSERT INTO customer_notes (customer_id, note_type, content, created_at) "
                        "VALUES (?, 'general', ?, ?)",
                        (tool_input["customer_id"], f"상태 변경 → {tool_input['status']}: {reason}", now),
                    )
                    conn.commit()
                return (
                    f"고객 ID {tool_input['customer_id']} 상태 → {tool_input['status']}"
                    + (f" ({reason})" if reason else "")
                )

            elif tool_name == "add_customer_note":
                c.execute(
                    "INSERT INTO customer_notes (customer_id, member_id, note_type, content, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        tool_input["customer_id"],
                        tool_input.get("member_id"),
                        tool_input["note_type"],
                        tool_input["content"],
                        now,
                    ),
                )
                conn.commit()
                return f"고객 ID {tool_input['customer_id']} 노트 추가 완료 [{tool_input['note_type']}]"

            elif tool_name == "schedule_followup":
                c.execute(
                    "INSERT INTO followups (customer_id, assigned_to, followup_date, "
                    "followup_type, priority, notes, status, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
                    (
                        tool_input["customer_id"],
                        tool_input.get("assigned_to"),
                        tool_input["followup_date"],
                        tool_input["followup_type"],
                        tool_input.get("priority", "medium"),
                        tool_input.get("notes", ""),
                        now,
                    ),
                )
                conn.commit()
                return (
                    f"팔로업 등록: 고객 ID {tool_input['customer_id']} | "
                    f"{tool_input['followup_date']} [{tool_input['followup_type']}] "
                    f"우선순위:{tool_input.get('priority','medium')}"
                )

            elif tool_name == "get_customers_by_status":
                query = "SELECT c.*, tm.name as assigned_name FROM customers c " \
                        "LEFT JOIN team_members tm ON c.assigned_to = tm.id WHERE 1=1"
                params = []
                if tool_input.get("status"):
                    query += " AND c.status = ?"
                    params.append(tool_input["status"])
                if tool_input.get("assigned_to"):
                    query += " AND c.assigned_to = ?"
                    params.append(tool_input["assigned_to"])
                query += " ORDER BY c.lead_score DESC"
                c.execute(query, params)
                rows = [dict(r) for r in c.fetchall()]
                if not rows:
                    return "조건에 맞는 고객이 없습니다."
                lines = [f"고객 목록 ({len(rows)}명):"]
                for r in rows:
                    lines.append(
                        f"  [ID:{r['id']}] {r['name']} / {r['company']} "
                        f"| {r['status']} | 리드:{r['lead_score']}점 "
                        f"| 담당:{r.get('assigned_name','미배정')}"
                    )
                return "\n".join(lines)

            elif tool_name == "get_pending_followups":
                query = (
                    "SELECT f.*, c.name as customer_name, c.company, "
                    "tm.name as member_name FROM followups f "
                    "JOIN customers c ON f.customer_id = c.id "
                    "LEFT JOIN team_members tm ON f.assigned_to = tm.id "
                    "WHERE f.status = 'pending'"
                )
                params = []
                if tool_input.get("assigned_to"):
                    query += " AND f.assigned_to = ?"
                    params.append(tool_input["assigned_to"])
                if tool_input.get("overdue_only"):
                    query += " AND f.followup_date < ?"
                    params.append(today)
                query += " ORDER BY f.followup_date"
                c.execute(query, params)
                rows = [dict(r) for r in c.fetchall()]
                if not rows:
                    return "대기 중인 팔로업이 없습니다."
                lines = [f"팔로업 대기 목록 ({len(rows)}건):"]
                for r in rows:
                    overdue = " ⚠️ 기한초과" if r["followup_date"] < today else ""
                    lines.append(
                        f"  {r['followup_date']}{overdue} [{r['followup_type']}] "
                        f"{r['customer_name']}({r['company']}) "
                        f"| 담당:{r.get('member_name','미배정')} | 우선:{r['priority']}"
                    )
                return "\n".join(lines)

            elif tool_name == "generate_customer_report":
                rtype = tool_input["report_type"]

                if rtype == "pipeline":
                    c.execute(
                        "SELECT status, COUNT(*) as cnt, AVG(lead_score) as avg_score "
                        "FROM customers GROUP BY status ORDER BY cnt DESC"
                    )
                    rows = [dict(r) for r in c.fetchall()]
                    total = sum(r["cnt"] for r in rows)
                    lines = [f"=== 영업 파이프라인 현황 (총 {total}명) ==="]
                    status_labels = {
                        "prospect": "잠재고객",
                        "contacted": "접촉완료",
                        "negotiating": "협상중",
                        "closed": "계약성사",
                        "lost": "이탈",
                    }
                    for r in rows:
                        pct = round(r["cnt"] / total * 100) if total else 0
                        label = status_labels.get(r["status"], r["status"])
                        lines.append(
                            f"  {label}: {r['cnt']}명 ({pct}%) | 평균 리드점수: {round(r['avg_score'] or 0)}점"
                        )
                    return "\n".join(lines)

                elif rtype == "conversion":
                    c.execute("SELECT COUNT(*) as total FROM customers")
                    total = c.fetchone()["total"]
                    c.execute("SELECT COUNT(*) as cnt FROM customers WHERE status = 'closed'")
                    closed = c.fetchone()["cnt"]
                    c.execute("SELECT COUNT(*) as cnt FROM customers WHERE status = 'lost'")
                    lost = c.fetchone()["cnt"]
                    conv_rate = round(closed / total * 100, 1) if total else 0
                    lines = [
                        "=== 전환율 분석 ===",
                        f"전체 고객: {total}명",
                        f"계약 성사: {closed}명 (전환율 {conv_rate}%)",
                        f"고객 이탈: {lost}명 (이탈율 {round(lost/total*100,1) if total else 0}%)",
                        f"진행 중: {total - closed - lost}명",
                    ]
                    return "\n".join(lines)

                else:  # assigned
                    c.execute(
                        "SELECT tm.name, tm.id, COUNT(c.id) as cnt, "
                        "SUM(CASE WHEN c.status='closed' THEN 1 ELSE 0 END) as closed_cnt "
                        "FROM team_members tm "
                        "LEFT JOIN customers c ON c.assigned_to = tm.id "
                        "WHERE tm.is_active = 1 GROUP BY tm.id ORDER BY closed_cnt DESC"
                    )
                    rows = [dict(r) for r in c.fetchall()]
                    lines = ["=== 팀원별 고객 배정 현황 ==="]
                    for r in rows:
                        rate = round(r["closed_cnt"] / r["cnt"] * 100, 1) if r["cnt"] else 0
                        lines.append(
                            f"  {r['name']}: 총 {r['cnt']}명 | 계약 {r['closed_cnt']}명 (전환율 {rate}%)"
                        )
                    return "\n".join(lines)

        except Exception as e:
            return f"오류: {e}"
        finally:
            conn.close()
