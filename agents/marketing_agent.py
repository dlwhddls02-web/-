import json
from datetime import datetime
from agents.base_agent import BaseAgent
from storage.database import get_connection

SYSTEM_PROMPT = """당신은 영업팀의 마케팅 에이전트입니다.

주요 역할:
1. 계약 성사율이 높은 잠재 고객 발굴 및 DB 구축
2. 리드 스코어링(0-100점)으로 우선순위 고객 선정
3. 고객 DB를 팀원들에게 공평하게 배포
4. 각 고객 맞춤형 영업 스크립트 생성
5. 업종·규모·예산 기반 고객 세분화

리드 스코어링 기준 (각 25점):
- 예산 적합성: 예산이 명확하고 충분할수록 높음
- 의사결정권: 의사결정자와 직접 접촉 가능할수록 높음
- 니즈 부합성: 우리 제품/서비스와 니즈가 맞을수록 높음
- 타이밍: 즉시 구매 의향이 있을수록 높음

항상 한국어로 응답하고, 구체적이고 실용적인 정보를 제공하세요."""

TOOLS = [
    {
        "name": "add_customer_to_db",
        "description": "새로운 잠재 고객을 데이터베이스에 추가합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "고객 이름"},
                "company": {"type": "string", "description": "회사명"},
                "phone": {"type": "string", "description": "전화번호"},
                "email": {"type": "string", "description": "이메일"},
                "industry": {"type": "string", "description": "업종"},
                "company_size": {
                    "type": "string",
                    "description": "회사 규모 (small/medium/large/enterprise)",
                },
                "budget_range": {"type": "string", "description": "예산 범위"},
                "pain_points": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "고객의 핵심 문제점 목록",
                },
                "lead_score": {"type": "integer", "description": "리드 점수 (0-100)"},
                "source": {"type": "string", "description": "고객 발굴 경로"},
            },
            "required": ["name", "company", "industry", "lead_score"],
        },
    },
    {
        "name": "get_customer_db",
        "description": "고객 데이터베이스를 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_lead_score": {"type": "integer", "description": "최소 리드 점수 필터"},
                "industry": {"type": "string", "description": "업종 필터"},
                "status": {"type": "string", "description": "상태 필터"},
                "limit": {"type": "integer", "description": "조회 개수 제한"},
            },
        },
    },
    {
        "name": "score_customer_lead",
        "description": "고객 리드 점수를 세부 항목별로 계산하고 업데이트합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "고객 ID"},
                "budget_score": {"type": "integer", "description": "예산 적합성 점수 (0-25)"},
                "decision_score": {"type": "integer", "description": "의사결정권 점수 (0-25)"},
                "needs_score": {"type": "integer", "description": "니즈 부합성 점수 (0-25)"},
                "timing_score": {"type": "integer", "description": "타이밍 점수 (0-25)"},
                "reasoning": {"type": "string", "description": "점수 산정 근거"},
            },
            "required": [
                "customer_id",
                "budget_score",
                "decision_score",
                "needs_score",
                "timing_score",
            ],
        },
    },
    {
        "name": "distribute_customers_to_team",
        "description": "고객 DB를 팀원들에게 배포하고 알림을 발송합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "distribution_type": {
                    "type": "string",
                    "description": "배포 방식 (equal/by_score)",
                },
                "min_lead_score": {"type": "integer", "description": "배포할 최소 리드 점수"},
                "message": {"type": "string", "description": "배포와 함께 보낼 메시지"},
            },
            "required": ["distribution_type"],
        },
    },
    {
        "name": "generate_contact_script",
        "description": "특정 고객을 위한 맞춤형 영업 스크립트를 생성합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "고객 ID"},
                "contact_type": {
                    "type": "string",
                    "description": "접촉 방식 (phone_call/email/meeting)",
                },
            },
            "required": ["customer_id", "contact_type"],
        },
    },
    {
        "name": "get_team_members",
        "description": "팀원 목록을 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "active_only": {"type": "boolean", "description": "활성 팀원만 조회"}
            },
        },
    },
]


class MarketingAgent(BaseAgent):
    def __init__(self):
        super().__init__("마케팅 에이전트", SYSTEM_PROMPT, TOOLS)

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        now = datetime.now().isoformat()

        try:
            if tool_name == "add_customer_to_db":
                pain_points_json = json.dumps(
                    tool_input.get("pain_points", []), ensure_ascii=False
                )
                c.execute(
                    """
                    INSERT INTO customers
                        (name, company, phone, email, industry, company_size,
                         budget_range, pain_points, lead_score, source, status,
                         created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prospect', ?, ?)
                """,
                    (
                        tool_input["name"],
                        tool_input.get("company"),
                        tool_input.get("phone"),
                        tool_input.get("email"),
                        tool_input["industry"],
                        tool_input.get("company_size"),
                        tool_input.get("budget_range"),
                        pain_points_json,
                        tool_input["lead_score"],
                        tool_input.get("source"),
                        now,
                        now,
                    ),
                )
                conn.commit()
                cid = c.lastrowid
                return (
                    f"고객 '{tool_input['name']}' (ID: {cid}) 추가 완료. "
                    f"리드 점수: {tool_input['lead_score']}점"
                )

            elif tool_name == "get_customer_db":
                query = "SELECT * FROM customers WHERE 1=1"
                params = []
                if tool_input.get("min_lead_score") is not None:
                    query += " AND lead_score >= ?"
                    params.append(tool_input["min_lead_score"])
                if tool_input.get("industry"):
                    query += " AND industry = ?"
                    params.append(tool_input["industry"])
                if tool_input.get("status"):
                    query += " AND status = ?"
                    params.append(tool_input["status"])
                query += " ORDER BY lead_score DESC"
                if tool_input.get("limit"):
                    query += f" LIMIT {int(tool_input['limit'])}"

                c.execute(query, params)
                rows = [dict(r) for r in c.fetchall()]

                if not rows:
                    return "조건에 맞는 고객이 없습니다."

                lines = [f"총 {len(rows)}명 조회 결과:"]
                for r in rows:
                    pp = json.loads(r.get("pain_points") or "[]")
                    lines.append(
                        f"\n[ID:{r['id']}] {r['name']} / {r['company']}"
                        f"\n  업종: {r['industry']} | 규모: {r.get('company_size','N/A')}"
                        f"\n  리드점수: {r['lead_score']}점 | 상태: {r['status']}"
                        f"\n  연락처: {r.get('phone','N/A')} | {r.get('email','N/A')}"
                        + (f"\n  핵심문제: {', '.join(pp)}" if pp else "")
                    )
                return "\n".join(lines)

            elif tool_name == "score_customer_lead":
                total = (
                    tool_input["budget_score"]
                    + tool_input["decision_score"]
                    + tool_input["needs_score"]
                    + tool_input["timing_score"]
                )
                c.execute(
                    "UPDATE customers SET lead_score = ?, updated_at = ? WHERE id = ?",
                    (total, now, tool_input["customer_id"]),
                )
                conn.commit()
                return (
                    f"고객 ID {tool_input['customer_id']} 리드 점수 → {total}점\n"
                    f"  예산: {tool_input['budget_score']}/25  "
                    f"의사결정: {tool_input['decision_score']}/25  "
                    f"니즈: {tool_input['needs_score']}/25  "
                    f"타이밍: {tool_input['timing_score']}/25\n"
                    f"  근거: {tool_input.get('reasoning', 'N/A')}"
                )

            elif tool_name == "distribute_customers_to_team":
                c.execute("SELECT * FROM team_members WHERE is_active = 1")
                members = [dict(r) for r in c.fetchall()]
                if not members:
                    return "활성 팀원이 없습니다."

                min_score = tool_input.get("min_lead_score", 60)
                c.execute(
                    "SELECT * FROM customers WHERE lead_score >= ? AND assigned_to IS NULL "
                    "ORDER BY lead_score DESC",
                    (min_score,),
                )
                unassigned = [dict(r) for r in c.fetchall()]
                if not unassigned:
                    return f"배포할 고객 없음 (리드점수 {min_score}점 이상, 미배정)"

                assignments: dict[str, list] = {}
                for i, customer in enumerate(unassigned):
                    member = members[i % len(members)]
                    c.execute(
                        "UPDATE customers SET assigned_to = ?, updated_at = ? WHERE id = ?",
                        (member["id"], now, customer["id"]),
                    )
                    assignments.setdefault(member["name"], []).append(customer["name"])

                conn.commit()

                body = f"[고객 DB 배포] 총 {len(unassigned)}명 배포"
                if tool_input.get("message"):
                    body += f"\n\n{tool_input['message']}"
                body += "\n\n배포 현황:"
                for mname, clist in assignments.items():
                    body += f"\n  {mname}: {len(clist)}명 ({', '.join(clist)})"

                c.execute(
                    "INSERT INTO messages (sender_id, recipient_id, message_type, "
                    "subject, content, created_at) VALUES (NULL, NULL, 'customer_db_share', "
                    "'신규 고객 DB 배포', ?, ?)",
                    (body, now),
                )
                conn.commit()
                return f"배포 완료: {len(unassigned)}명 → {len(members)}명 팀원"

            elif tool_name == "generate_contact_script":
                c.execute("SELECT * FROM customers WHERE id = ?", (tool_input["customer_id"],))
                row = c.fetchone()
                if not row:
                    return "고객을 찾을 수 없습니다."
                cust = dict(row)
                pp = json.loads(cust.get("pain_points") or "[]")
                ctype = tool_input["contact_type"]
                needs_str = ", ".join(pp[:2]) if pp else "업무 효율화"

                if ctype == "phone_call":
                    script = f"""[전화 스크립트 - {cust['name']} / {cust['company']}]

오프닝:
"안녕하세요, {cust['name']}님! 저는 [회사명]의 [담당자]입니다.
{cust.get('industry','')} 분야 솔루션 관련해서 잠깐 말씀드릴 수 있을까요?"

핵심 가치 제안:
"저희는 {needs_str} 문제를 해결하는 솔루션을 제공하고 있습니다.
{cust['company']}와 유사한 {cust.get('industry','')} 기업들이 큰 효과를 보셨습니다."

클로징:
"이번 주나 다음 주 중으로 30분 미팅이 가능하신가요?
구체적인 사례와 귀사 맞춤 제안을 드릴 수 있습니다."
"""
                elif ctype == "email":
                    script = f"""[이메일 스크립트 - {cust['name']} / {cust['company']}]

제목: {cust['company']} {cust.get('industry','')} 업무 혁신 제안

안녕하세요, {cust['name']}님.

저는 [회사명]의 [담당자]입니다.
{cust['company']}에서 {needs_str} 관련 어려움을 해결할 수 있는 방안을 제안드리고자 연락드립니다.

저희는 {cust.get('industry','')} 분야 기업들의 동일한 문제를 성공적으로 해결해 왔습니다.

15분 화상 미팅을 통해 구체적인 사례를 공유드릴 수 있을까요?

감사합니다.
[담당자] 드림
"""
                else:
                    script = f"""[미팅 제안 - {cust['name']} / {cust['company']}]

미팅 목적: {needs_str} 해결 방안 논의
제안 아젠다:
  1. 현황 파악 (10분)
  2. 솔루션 소개 및 사례 공유 (15분)
  3. 귀사 맞춤 제안 (15분)
  4. Q&A (10분)
"""
                return script

            elif tool_name == "get_team_members":
                query = "SELECT * FROM team_members"
                if tool_input.get("active_only", True):
                    query += " WHERE is_active = 1"
                c.execute(query)
                members = [dict(r) for r in c.fetchall()]
                if not members:
                    return "팀원이 없습니다."
                lines = [f"팀원 목록 ({len(members)}명):"]
                for m in members:
                    lines.append(f"  [ID:{m['id']}] {m['name']} - {m.get('role','N/A')} ({m.get('email','N/A')})")
                return "\n".join(lines)

        except Exception as e:
            return f"오류: {e}"
        finally:
            conn.close()
