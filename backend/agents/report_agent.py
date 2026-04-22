"""
실적관리 에이전트 — 팀원 등록 / 성과 추적 / AI 피드백 / Notion 보고서
"""
import json
from datetime import datetime
from agents.base_agent import BaseAgent
from backend.memory import get_connection, log_activity
from backend.tools.notion_client import create_report_in_notion
from backend.tools.kakao_client import KakaoClient

_SYSTEM = """당신은 보험 영업팀 실적관리 AI입니다.

업무:
- 팀원 등록 및 관리
- 월별 실적 입력 및 조회
- 목표 설정
- AI 기반 개인별 영업 피드백
- 팀 전체 성과 보고서 생성 (Notion 저장 + 카카오 발송)
- 대시보드 현황

역할 예시: FC(Financial Consultant), SM(Sales Manager), TL(Team Leader), 부지점장, 지점장 등
역할 형식에 제한 없이 입력된 그대로 저장하세요.

피드백 원칙:
- 달성률 80% 미만: 구체적 개선 액션 3가지 제시
- 80~100%: 유지 전략 + 다음 목표 상향 제안
- 100% 초과: 축하 + 베스트 프랙티스 공유 독려

도구를 사용해 실제 작업하세요."""

_TOOLS = [
    {
        "name": "register_member",
        "description": "팀원 등록",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":       {"type": "string"},
                "role":       {"type": "string", "description": "역할 자유 입력 (FC/SM/TL 등)"},
                "phone":      {"type": "string"},
                "email":      {"type": "string"},
                "hire_date":  {"type": "string", "description": "YYYY-MM-DD"},
                "mentor_id":  {"type": "integer"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "get_members",
        "description": "팀원 목록 조회",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "input_performance",
        "description": "팀원 실적 입력",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id":            {"type": "integer"},
                "period":               {"type": "string", "description": "YYYY-MM (기본 이번달)"},
                "sales_amount":         {"type": "number",  "description": "매출액 (만원)"},
                "deals_closed":         {"type": "integer", "description": "계약 건수"},
                "calls_made":           {"type": "integer"},
                "meetings_held":        {"type": "integer"},
                "customer_satisfaction":{"type": "number",  "description": "고객 만족도 1~5"},
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "set_target",
        "description": "팀원 월별 목표 설정",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id":           {"type": "integer"},
                "period":              {"type": "string", "description": "YYYY-MM"},
                "target_sales_amount": {"type": "number"},
                "target_deals":        {"type": "integer"},
                "target_calls":        {"type": "integer"},
                "target_meetings":     {"type": "integer"},
            },
            "required": ["member_id", "target_sales_amount"],
        },
    },
    {
        "name": "get_performance",
        "description": "팀원 실적 조회 (개인 or 팀 전체)",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "생략 시 팀 전체"},
                "period":    {"type": "string",  "description": "YYYY-MM"},
            },
        },
    },
    {
        "name": "generate_ai_feedback",
        "description": "개인별 AI 영업 피드백 생성",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer"},
                "period":    {"type": "string"},
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "generate_team_report",
        "description": "팀 전체 성과 보고서 생성 + Notion 저장 + 카카오 발송",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "description": "YYYY-MM"},
            },
        },
    },
    {
        "name": "get_dashboard",
        "description": "팀 대시보드 — 이번달 핵심 지표 한눈에 보기",
        "input_schema": {"type": "object", "properties": {}},
    },
]


class ReportAgent(BaseAgent):
    def __init__(self):
        super().__init__("report", _SYSTEM, _TOOLS)

    def execute_tool(self, name: str, inp: dict) -> str:
        try:
            if name == "register_member":     return self._register(inp)
            if name == "get_members":         return self._get_members()
            if name == "input_performance":   return self._input_perf(inp)
            if name == "set_target":          return self._set_target(inp)
            if name == "get_performance":     return self._get_perf(inp)
            if name == "generate_ai_feedback":return self._ai_feedback(inp)
            if name == "generate_team_report":return self._team_report(inp)
            if name == "get_dashboard":       return self._dashboard()
        except Exception as e:
            return f"오류: {e}"
        return "알 수 없는 도구"

    def _register(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute(
            "INSERT INTO team_members (name,role,phone,email,hire_date,mentor_id,created_at) VALUES (?,?,?,?,?,?,?)",
            (inp["name"], inp.get("role","FC"), inp.get("phone",""), inp.get("email",""),
             inp.get("hire_date", datetime.now().strftime("%Y-%m-%d")), inp.get("mentor_id"), now),
        )
        mid = c.lastrowid
        conn.commit()
        conn.close()
        log_activity("📈 실적관리", f"팀원 등록: {inp['name']} ({inp.get('role','FC')})", status="success")
        return json.dumps({"member_id": mid, "name": inp["name"], "role": inp.get("role","FC")}, ensure_ascii=False)

    def _get_members(self) -> str:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM team_members WHERE is_active=1 ORDER BY created_at")
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"total": len(rows), "members": rows}, ensure_ascii=False, indent=2)

    def _input_perf(self, inp: dict) -> str:
        now = datetime.now().isoformat()
        period = inp.get("period", datetime.now().strftime("%Y-%m"))
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT id FROM performance_records WHERE member_id=? AND period=?", (inp["member_id"], period))
        existing = c.fetchone()
        if existing:
            sets, vals = [], []
            for col in ["sales_amount","deals_closed","calls_made","meetings_held","customer_satisfaction"]:
                if col in inp:
                    sets.append(f"{col}=?")
                    vals.append(inp[col])
            if sets:
                vals += [now, inp["member_id"], period]
                conn.execute(f"UPDATE performance_records SET {','.join(sets)},updated_at=? WHERE member_id=? AND period=?", vals)
        else:
            c.execute(
                """INSERT INTO performance_records
                   (member_id,period,sales_amount,deals_closed,calls_made,meetings_held,customer_satisfaction,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (inp["member_id"], period, inp.get("sales_amount",0), inp.get("deals_closed",0),
                 inp.get("calls_made",0), inp.get("meetings_held",0), inp.get("customer_satisfaction",0), now, now),
            )
        conn.commit()
        conn.close()
        log_activity("📈 실적관리", f"실적 입력: 팀원#{inp['member_id']} {period}", status="success")
        return json.dumps({"ok": True, "period": period}, ensure_ascii=False)

    def _set_target(self, inp: dict) -> str:
        period = inp.get("period", datetime.now().strftime("%Y-%m"))
        now = datetime.now().isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT id FROM performance_targets WHERE member_id=? AND period=?", (inp["member_id"], period))
        if c.fetchone():
            conn.execute(
                "UPDATE performance_targets SET target_sales_amount=?,target_deals=?,target_calls=?,target_meetings=? WHERE member_id=? AND period=?",
                (inp.get("target_sales_amount",0), inp.get("target_deals",0),
                 inp.get("target_calls",0), inp.get("target_meetings",0), inp["member_id"], period),
            )
        else:
            conn.execute(
                "INSERT INTO performance_targets (member_id,period,target_sales_amount,target_deals,target_calls,target_meetings,created_at) VALUES (?,?,?,?,?,?,?)",
                (inp["member_id"], period, inp.get("target_sales_amount",0),
                 inp.get("target_deals",0), inp.get("target_calls",0), inp.get("target_meetings",0), now),
            )
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "period": period}, ensure_ascii=False)

    def _get_perf(self, inp: dict) -> str:
        period = inp.get("period", datetime.now().strftime("%Y-%m"))
        conn = get_connection()
        c = conn.cursor()
        if inp.get("member_id"):
            c.execute(
                """SELECT tm.name, pr.*, pt.target_sales_amount, pt.target_deals
                   FROM team_members tm
                   LEFT JOIN performance_records pr ON tm.id=pr.member_id AND pr.period=?
                   LEFT JOIN performance_targets pt ON tm.id=pt.member_id AND pt.period=?
                   WHERE tm.id=?""",
                (period, period, inp["member_id"]),
            )
            rows = [dict(r) for r in c.fetchall()]
        else:
            c.execute(
                """SELECT tm.name, tm.role,
                   COALESCE(pr.sales_amount,0) as sales,
                   COALESCE(pr.deals_closed,0) as deals,
                   COALESCE(pt.target_sales_amount,0) as target
                   FROM team_members tm
                   LEFT JOIN performance_records pr ON tm.id=pr.member_id AND pr.period=?
                   LEFT JOIN performance_targets pt ON tm.id=pt.member_id AND pt.period=?
                   WHERE tm.is_active=1""",
                (period, period),
            )
            rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return json.dumps({"period": period, "data": rows}, ensure_ascii=False, indent=2)

    def _ai_feedback(self, inp: dict) -> str:
        period = inp.get("period", datetime.now().strftime("%Y-%m"))
        perf_json = self._get_perf({"member_id": inp["member_id"], "period": period})
        perf = json.loads(perf_json)
        data = perf["data"][0] if perf["data"] else {}
        sales = data.get("sales", 0) or data.get("sales_amount", 0)
        target = data.get("target", 0) or data.get("target_sales_amount", 0)
        rate = round(sales / target * 100) if target else 0
        return json.dumps({
            "member_id": inp["member_id"],
            "period": period,
            "achievement_rate": f"{rate}%",
            "performance": data,
            "feedback_ready": True,
            "note": "AI가 위 데이터를 기반으로 개인 피드백을 작성합니다."
        }, ensure_ascii=False, indent=2)

    def _team_report(self, inp: dict) -> str:
        period = inp.get("period", datetime.now().strftime("%Y-%m"))
        perf_json = self._get_perf({"period": period})
        perf = json.loads(perf_json)
        total_sales = sum(r.get("sales", 0) for r in perf["data"])
        total_deals = sum(r.get("deals", 0) for r in perf["data"])
        summary = (
            f"[{period} 팀 실적]\n"
            f"총 매출: {total_sales:,.0f}만원\n"
            f"총 계약: {total_deals}건\n"
            f"팀원 수: {len(perf['data'])}명"
        )
        notion = create_report_in_notion(f"{period} 월간 팀 성과 보고서", summary, period)
        KakaoClient().send_performance_report(summary)
        log_activity("📈 실적관리", f"{period} 팀 보고서 생성 완료", status="success")
        return json.dumps({
            "period": period,
            "summary": summary,
            "notion_synced": not notion.get("simulated", True),
            "kakao_sent": True,
        }, ensure_ascii=False)

    def _dashboard(self) -> str:
        period = datetime.now().strftime("%Y-%m")
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT COUNT(*) as cnt FROM team_members WHERE is_active=1")
        team_size = c.fetchone()["cnt"]
        c.execute("SELECT COUNT(*) as cnt, SUM(premium_monthly) as total FROM contracts WHERE status='active'")
        contracts = dict(c.fetchone())
        c.execute("SELECT COUNT(*) as cnt FROM customers")
        total_cust = c.fetchone()["cnt"]
        c.execute("SELECT COUNT(*) as cnt FROM sns_posts WHERE status IN ('posted','simulated')")
        sns_cnt = c.fetchone()["cnt"]
        c.execute(
            "SELECT SUM(sales_amount) as total FROM performance_records WHERE period=?", (period,)
        )
        monthly_sales = c.fetchone()["total"] or 0
        conn.close()
        return json.dumps({
            "period": period,
            "team_size": team_size,
            "total_customers": total_cust,
            "active_contracts": contracts.get("cnt", 0),
            "monthly_premium": contracts.get("total", 0),
            "monthly_sales": monthly_sales,
            "sns_posts": sns_cnt,
        }, ensure_ascii=False, indent=2)
