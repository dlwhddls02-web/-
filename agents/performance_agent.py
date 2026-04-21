import json
from datetime import datetime
from agents.base_agent import BaseAgent
from storage.database import get_connection

SYSTEM_PROMPT = """당신은 영업팀의 실적관리 에이전트입니다.

주요 역할:
1. 팀원별 월간/주간 실적 추적 및 시각화
2. 목표 대비 달성률 분석
3. AI 기반 개인 맞춤 피드백 생성
4. 실적 부진 원인 분석 및 개선안 제시
5. 우수 팀원 사례 공유 및 인센티브 제안
6. 팀 전체 성과 대시보드 제공

평가 지표:
- 매출 달성률: 목표 대비 실제 매출
- 계약 건수: 이번 달 클로징된 계약
- 활동량: 전화/미팅 횟수
- 고객 만족도: 1-5점 평균
- 리드 전환율: 담당 고객 중 계약 성사 비율

피드백은 구체적이고 실행 가능한 개선안을 포함해야 합니다.
항상 한국어로 응답하세요."""

TOOLS = [
    {
        "name": "update_sales_record",
        "description": "팀원의 실적 데이터를 입력/업데이트합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "팀원 ID"},
                "period": {
                    "type": "string",
                    "description": "기간 (YYYY-MM 형식, 예: 2026-04)",
                },
                "sales_count": {"type": "integer", "description": "영업 건수"},
                "sales_amount": {"type": "number", "description": "매출액 (만원)"},
                "calls_made": {"type": "integer", "description": "전화 통화 수"},
                "meetings_held": {"type": "integer", "description": "미팅 횟수"},
                "deals_closed": {"type": "integer", "description": "계약 성사 건수"},
                "customer_satisfaction": {
                    "type": "number",
                    "description": "고객 만족도 (1.0-5.0)",
                },
            },
            "required": ["member_id", "period"],
        },
    },
    {
        "name": "set_performance_target",
        "description": "팀원의 월간 목표를 설정합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "팀원 ID"},
                "period": {"type": "string", "description": "기간 (YYYY-MM)"},
                "target_sales_amount": {"type": "number", "description": "매출 목표 (만원)"},
                "target_deals": {"type": "integer", "description": "계약 건수 목표"},
                "target_calls": {"type": "integer", "description": "전화 목표"},
                "target_meetings": {"type": "integer", "description": "미팅 목표"},
            },
            "required": ["member_id", "period"],
        },
    },
    {
        "name": "get_member_performance",
        "description": "팀원 개인의 실적을 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "팀원 ID"},
                "period": {"type": "string", "description": "기간 (YYYY-MM)"},
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "get_team_performance_dashboard",
        "description": "팀 전체 실적 대시보드를 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "description": "기간 (YYYY-MM, 미입력 시 현재 월)",
                },
            },
        },
    },
    {
        "name": "generate_ai_feedback",
        "description": "AI가 팀원의 실적을 분석하고 맞춤 피드백을 생성합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "팀원 ID"},
                "period": {"type": "string", "description": "분석 기간 (YYYY-MM)"},
            },
            "required": ["member_id"],
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
    {
        "name": "add_team_member",
        "description": "새 팀원을 등록합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "이름"},
                "role": {
                    "type": "string",
                    "description": "역할 (sales_rep/team_lead/manager)",
                },
                "email": {"type": "string", "description": "이메일"},
                "phone": {"type": "string", "description": "전화번호"},
                "department": {"type": "string", "description": "부서"},
                "hire_date": {"type": "string", "description": "입사일 (YYYY-MM-DD)"},
            },
            "required": ["name", "role"],
        },
    },
]


class PerformanceAgent(BaseAgent):
    def __init__(self):
        super().__init__("실적관리 에이전트", SYSTEM_PROMPT, TOOLS)

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        now = datetime.now().isoformat()
        current_period = datetime.now().strftime("%Y-%m")

        try:
            if tool_name == "add_team_member":
                c.execute(
                    "INSERT INTO team_members (name, role, email, phone, department, "
                    "hire_date, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
                    (
                        tool_input["name"],
                        tool_input["role"],
                        tool_input.get("email"),
                        tool_input.get("phone"),
                        tool_input.get("department"),
                        tool_input.get("hire_date", datetime.now().strftime("%Y-%m-%d")),
                        now,
                    ),
                )
                conn.commit()
                mid = c.lastrowid
                return f"팀원 '{tool_input['name']}' (ID: {mid}) 등록 완료"

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
                    lines.append(
                        f"  [ID:{m['id']}] {m['name']} | {m.get('role','N/A')} "
                        f"| {m.get('email','N/A')} | 입사:{m.get('hire_date','N/A')}"
                    )
                return "\n".join(lines)

            elif tool_name == "update_sales_record":
                period = tool_input["period"]
                mid = tool_input["member_id"]
                c.execute(
                    "SELECT id FROM performance_records WHERE member_id = ? AND period = ?",
                    (mid, period),
                )
                existing = c.fetchone()
                if existing:
                    updates = []
                    params = []
                    for field in [
                        "sales_count",
                        "sales_amount",
                        "calls_made",
                        "meetings_held",
                        "deals_closed",
                        "customer_satisfaction",
                    ]:
                        if field in tool_input:
                            updates.append(f"{field} = ?")
                            params.append(tool_input[field])
                    if updates:
                        params.extend([now, mid, period])
                        c.execute(
                            f"UPDATE performance_records SET {', '.join(updates)}, updated_at = ? "
                            f"WHERE member_id = ? AND period = ?",
                            params,
                        )
                else:
                    c.execute(
                        "INSERT INTO performance_records (member_id, period, sales_count, "
                        "sales_amount, calls_made, meetings_held, deals_closed, "
                        "customer_satisfaction, created_at, updated_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            mid,
                            period,
                            tool_input.get("sales_count", 0),
                            tool_input.get("sales_amount", 0),
                            tool_input.get("calls_made", 0),
                            tool_input.get("meetings_held", 0),
                            tool_input.get("deals_closed", 0),
                            tool_input.get("customer_satisfaction", 0),
                            now,
                            now,
                        ),
                    )
                conn.commit()
                return f"팀원 ID {mid} {period} 실적 업데이트 완료"

            elif tool_name == "set_performance_target":
                mid = tool_input["member_id"]
                period = tool_input["period"]
                c.execute(
                    "SELECT id FROM performance_targets WHERE member_id = ? AND period = ?",
                    (mid, period),
                )
                existing = c.fetchone()
                if existing:
                    c.execute(
                        "UPDATE performance_targets SET target_sales_amount=?, target_deals=?, "
                        "target_calls=?, target_meetings=? WHERE member_id=? AND period=?",
                        (
                            tool_input.get("target_sales_amount"),
                            tool_input.get("target_deals"),
                            tool_input.get("target_calls"),
                            tool_input.get("target_meetings"),
                            mid,
                            period,
                        ),
                    )
                else:
                    c.execute(
                        "INSERT INTO performance_targets (member_id, period, target_sales_amount, "
                        "target_deals, target_calls, target_meetings, created_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            mid,
                            period,
                            tool_input.get("target_sales_amount"),
                            tool_input.get("target_deals"),
                            tool_input.get("target_calls"),
                            tool_input.get("target_meetings"),
                            now,
                        ),
                    )
                conn.commit()
                return f"팀원 ID {mid} {period} 목표 설정 완료"

            elif tool_name == "get_member_performance":
                mid = tool_input["member_id"]
                period = tool_input.get("period", current_period)
                c.execute("SELECT name, role FROM team_members WHERE id = ?", (mid,))
                member = c.fetchone()
                if not member:
                    return "팀원을 찾을 수 없습니다."

                c.execute(
                    "SELECT * FROM performance_records WHERE member_id = ? AND period = ?",
                    (mid, period),
                )
                rec = c.fetchone()
                c.execute(
                    "SELECT * FROM performance_targets WHERE member_id = ? AND period = ?",
                    (mid, period),
                )
                tgt = c.fetchone()

                lines = [
                    f"=== {member['name']} ({member['role']}) {period} 실적 ===",
                ]
                if not rec:
                    lines.append("실적 데이터 없음")
                else:
                    r = dict(rec)
                    t = dict(tgt) if tgt else {}
                    lines.append(f"매출액: {r['sales_amount']:,.0f}만원" +
                                 (f" / 목표 {t['target_sales_amount']:,.0f}만원 "
                                  f"({round(r['sales_amount']/t['target_sales_amount']*100)}%)"
                                  if t.get("target_sales_amount") else ""))
                    lines.append(f"계약 건수: {r['deals_closed']}건" +
                                 (f" / 목표 {t['target_deals']}건 "
                                  f"({round(r['deals_closed']/t['target_deals']*100)}%)"
                                  if t.get("target_deals") else ""))
                    lines.append(f"전화: {r['calls_made']}회" +
                                 (f" / 목표 {t['target_calls']}회" if t.get("target_calls") else ""))
                    lines.append(f"미팅: {r['meetings_held']}회" +
                                 (f" / 목표 {t['target_meetings']}회" if t.get("target_meetings") else ""))
                    lines.append(f"고객 만족도: {r['customer_satisfaction']:.1f}/5.0")

                return "\n".join(lines)

            elif tool_name == "get_team_performance_dashboard":
                period = tool_input.get("period", current_period)
                c.execute(
                    "SELECT tm.id, tm.name, tm.role, "
                    "pr.sales_amount, pr.deals_closed, pr.calls_made, "
                    "pr.meetings_held, pr.customer_satisfaction, "
                    "pt.target_sales_amount, pt.target_deals "
                    "FROM team_members tm "
                    "LEFT JOIN performance_records pr ON tm.id=pr.member_id AND pr.period=? "
                    "LEFT JOIN performance_targets pt ON tm.id=pt.member_id AND pt.period=? "
                    "WHERE tm.is_active=1 ORDER BY COALESCE(pr.sales_amount,0) DESC",
                    (period, period),
                )
                rows = [dict(r) for r in c.fetchall()]
                if not rows:
                    return "팀원 데이터가 없습니다."

                lines = [f"=== 팀 실적 대시보드 [{period}] ===\n"]
                rank = 1
                for r in rows:
                    amt = r["sales_amount"] or 0
                    tgt = r["target_sales_amount"]
                    rate = round(amt / tgt * 100) if tgt else None
                    rate_str = f" ({rate}% 달성)" if rate is not None else ""
                    lines.append(
                        f"#{rank} {r['name']} [{r['role']}]\n"
                        f"    매출: {amt:,.0f}만원{rate_str} | "
                        f"계약: {r['deals_closed'] or 0}건 | "
                        f"전화: {r['calls_made'] or 0}회 | "
                        f"미팅: {r['meetings_held'] or 0}회 | "
                        f"만족도: {r['customer_satisfaction'] or 0:.1f}/5.0"
                    )
                    rank += 1

                total_sales = sum(r["sales_amount"] or 0 for r in rows)
                total_deals = sum(r["deals_closed"] or 0 for r in rows)
                lines.append(f"\n[팀 합계] 매출: {total_sales:,.0f}만원 | 계약: {total_deals}건")
                return "\n".join(lines)

            elif tool_name == "generate_ai_feedback":
                mid = tool_input["member_id"]
                period = tool_input.get("period", current_period)
                c.execute("SELECT name, role, hire_date FROM team_members WHERE id = ?", (mid,))
                member = c.fetchone()
                if not member:
                    return "팀원을 찾을 수 없습니다."

                c.execute(
                    "SELECT * FROM performance_records WHERE member_id = ? AND period = ?",
                    (mid, period),
                )
                rec = c.fetchone()
                c.execute(
                    "SELECT * FROM performance_targets WHERE member_id = ? AND period = ?",
                    (mid, period),
                )
                tgt = c.fetchone()

                if not rec:
                    return f"{member['name']}의 {period} 실적 데이터가 없어 피드백을 생성할 수 없습니다."

                r = dict(rec)
                t = dict(tgt) if tgt else {}

                sales_rate = round(r["sales_amount"] / t["target_sales_amount"] * 100) if t.get("target_sales_amount") else None
                deals_rate = round(r["deals_closed"] / t["target_deals"] * 100) if t.get("target_deals") else None

                strengths = []
                improvements = []

                if sales_rate and sales_rate >= 100:
                    strengths.append(f"매출 목표 {sales_rate}% 달성 (우수)")
                elif sales_rate and sales_rate < 70:
                    improvements.append(f"매출 목표 {sales_rate}% 달성 — 고객 발굴 및 클로징 전략 재점검 필요")

                if r["calls_made"] >= 80:
                    strengths.append(f"높은 활동량 (전화 {r['calls_made']}회)")
                elif r["calls_made"] < 40:
                    improvements.append(f"전화 활동량 부족 ({r['calls_made']}회) — 일일 콜 목표 설정 권장")

                if r["customer_satisfaction"] >= 4.5:
                    strengths.append(f"뛰어난 고객 만족도 ({r['customer_satisfaction']:.1f}점)")
                elif r["customer_satisfaction"] > 0 and r["customer_satisfaction"] < 3.5:
                    improvements.append(f"고객 만족도 개선 필요 ({r['customer_satisfaction']:.1f}점) — 고객 니즈 파악 교육 권장")

                feedback = f"=== {member['name']} {period} AI 피드백 ===\n\n"

                if strengths:
                    feedback += "✅ 강점:\n"
                    for s in strengths:
                        feedback += f"  • {s}\n"

                if improvements:
                    feedback += "\n⚠️ 개선 필요 영역:\n"
                    for imp in improvements:
                        feedback += f"  • {imp}\n"

                feedback += "\n📋 액션 아이템:\n"
                if sales_rate and sales_rate < 100:
                    gap = (t.get("target_sales_amount", 0) - r["sales_amount"])
                    feedback += f"  1. 잔여 목표 {gap:,.0f}만원 달성을 위해 리드점수 70점 이상 고객 집중 공략\n"
                feedback += f"  2. 주 1회 팀장과 파이프라인 리뷰 미팅 진행\n"
                feedback += f"  3. 계약 성사 고객 성공 사례 1건 팀 공유\n"

                return feedback

        except Exception as e:
            return f"오류: {e}"
        finally:
            conn.close()
