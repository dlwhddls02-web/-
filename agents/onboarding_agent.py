import json
from datetime import datetime, timedelta
from agents.base_agent import BaseAgent
from storage.database import get_connection

SYSTEM_PROMPT = """당신은 영업팀의 온보딩 에이전트입니다.

주요 역할:
1. 신입/신규 팀원을 위한 개인화된 온보딩 플랜 설계
2. 단계별 교육 커리큘럼 및 체크리스트 관리
3. 온보딩 진행 상황 추적 및 보고
4. 멘토 배정 및 멘토링 계획 수립
5. 팀 적응을 돕는 가이드 및 자료 제공

온보딩 카테고리:
- product_knowledge: 제품/서비스 지식
- sales_skills: 영업 스킬 및 화법
- system_training: CRM·시스템 사용법
- compliance: 법규·회사 정책
- shadowing: 선배 동행 영업
- team_culture: 팀 문화 적응

기간별 마일스톤:
- 1주차: 회사 이해 및 팀 소개
- 2-3주차: 제품 교육 및 시스템 교육
- 4주차: 동행 영업 및 실습
- 2개월차: 단독 영업 시작
- 3개월차: 독립적인 목표 설정

항상 한국어로 응답하고, 실용적인 액션 플랜을 제시하세요."""

TOOLS = [
    {
        "name": "create_onboarding_plan",
        "description": "신규 팀원을 위한 온보딩 플랜을 생성합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "팀원 ID"},
                "plan_name": {"type": "string", "description": "플랜 이름"},
                "start_date": {"type": "string", "description": "시작일 (YYYY-MM-DD)"},
                "duration_weeks": {"type": "integer", "description": "기간 (주), 기본 12주"},
                "role_specific": {
                    "type": "string",
                    "description": "역할별 특화 내용 (신입영업/경력이직/팀장 등)",
                },
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "add_onboarding_task",
        "description": "온보딩 플랜에 태스크를 추가합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "plan_id": {"type": "integer", "description": "플랜 ID"},
                "task_name": {"type": "string", "description": "태스크 이름"},
                "description": {"type": "string", "description": "상세 설명"},
                "category": {
                    "type": "string",
                    "description": "카테고리 (product_knowledge/sales_skills/system_training/compliance/shadowing/team_culture)",
                },
                "due_date": {"type": "string", "description": "완료 목표일 (YYYY-MM-DD)"},
            },
            "required": ["plan_id", "task_name", "category"],
        },
    },
    {
        "name": "update_task_progress",
        "description": "온보딩 태스크의 진행 상태를 업데이트합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "태스크 ID"},
                "status": {
                    "type": "string",
                    "description": "상태 (pending/in_progress/completed)",
                },
                "notes": {"type": "string", "description": "진행 메모"},
            },
            "required": ["task_id", "status"],
        },
    },
    {
        "name": "assign_mentor",
        "description": "신규 팀원에게 멘토를 배정합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "신규 팀원 ID"},
                "mentor_id": {"type": "integer", "description": "멘토 팀원 ID"},
            },
            "required": ["member_id", "mentor_id"],
        },
    },
    {
        "name": "get_onboarding_status",
        "description": "팀원의 온보딩 진행 현황을 조회합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "팀원 ID"},
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "get_all_onboarding_overview",
        "description": "전체 온보딩 중인 팀원 현황을 조회합니다",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "generate_welcome_guide",
        "description": "신규 팀원을 위한 환영 가이드를 생성합니다",
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "신규 팀원 ID"},
            },
            "required": ["member_id"],
        },
    },
]

DEFAULT_TASKS = [
    ("1주차: 회사 소개 및 조직도 파악", "HR 오리엔테이션 참석, 조직도 및 주요 연락처 숙지", "team_culture", 7),
    ("1주차: 팀원 소개 및 인사", "모든 팀원과 1:1 인사 미팅 (각 15분)", "team_culture", 7),
    ("1-2주차: 제품/서비스 기초 교육", "주요 제품 라인업 및 핵심 가치 제안 학습", "product_knowledge", 14),
    ("2주차: CRM 시스템 교육", "고객관리 시스템 사용법 숙달 및 실습", "system_training", 14),
    ("2주차: 영업 프로세스 이해", "리드 발굴부터 클로징까지 전체 영업 프로세스 학습", "sales_skills", 14),
    ("3주차: 전화 영업 화법 교육", "오프닝·가치제안·클로징 화법 실습 (롤플레이)", "sales_skills", 21),
    ("3주차: 경쟁사 분석", "주요 경쟁사 제품 및 차별화 포인트 학습", "product_knowledge", 21),
    ("4주차: 선배 동행 영업 #1", "우수 팀원과 실제 고객 미팅 동행 (관찰)", "shadowing", 28),
    ("4주차: 선배 동행 영업 #2", "고객 전화 상담 동행 및 피드백", "shadowing", 28),
    ("4주차: 컴플라이언스 교육", "개인정보보호·계약 관련 법규·회사 정책 교육", "compliance", 28),
    ("5-6주차: 단독 전화 영업 시작", "배정된 고객 리스트로 단독 영업 시작, 주 2회 리뷰", "sales_skills", 42),
    ("7-8주차: 첫 고객 미팅 진행", "단독으로 고객 미팅 진행, 사후 피드백 세션", "sales_skills", 56),
    ("12주차: 3개월 성과 리뷰", "온보딩 마무리 및 독립 목표 설정 미팅", "team_culture", 84),
]


class OnboardingAgent(BaseAgent):
    def __init__(self):
        super().__init__("온보딩 에이전트", SYSTEM_PROMPT, TOOLS)

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        conn = get_connection()
        c = conn.cursor()
        now = datetime.now().isoformat()

        try:
            if tool_name == "create_onboarding_plan":
                mid = tool_input["member_id"]
                c.execute("SELECT name, role FROM team_members WHERE id = ?", (mid,))
                member = c.fetchone()
                if not member:
                    return "팀원을 찾을 수 없습니다."

                start = tool_input.get("start_date", datetime.now().strftime("%Y-%m-%d"))
                weeks = tool_input.get("duration_weeks", 12)
                start_dt = datetime.strptime(start, "%Y-%m-%d")
                end_dt = start_dt + timedelta(weeks=weeks)
                plan_name = tool_input.get("plan_name", f"{member['name']} 온보딩 플랜")

                c.execute(
                    "INSERT INTO onboarding_plans (member_id, plan_name, start_date, "
                    "target_completion_date, overall_progress, status, created_at) "
                    "VALUES (?, ?, ?, ?, 0, 'active', ?)",
                    (mid, plan_name, start, end_dt.strftime("%Y-%m-%d"), now),
                )
                conn.commit()
                plan_id = c.lastrowid

                for task_name, desc, category, offset_days in DEFAULT_TASKS:
                    due = (start_dt + timedelta(days=offset_days)).strftime("%Y-%m-%d")
                    c.execute(
                        "INSERT INTO onboarding_tasks (plan_id, task_name, description, "
                        "category, due_date, status) VALUES (?, ?, ?, ?, ?, 'pending')",
                        (plan_id, task_name, desc, category, due),
                    )
                conn.commit()

                return (
                    f"온보딩 플랜 생성 완료!\n"
                    f"  플랜 ID: {plan_id}\n"
                    f"  대상: {member['name']} ({member['role']})\n"
                    f"  기간: {start} ~ {end_dt.strftime('%Y-%m-%d')} ({weeks}주)\n"
                    f"  총 태스크: {len(DEFAULT_TASKS)}개 자동 생성됨"
                )

            elif tool_name == "add_onboarding_task":
                c.execute(
                    "INSERT INTO onboarding_tasks (plan_id, task_name, description, "
                    "category, due_date, status) VALUES (?, ?, ?, ?, ?, 'pending')",
                    (
                        tool_input["plan_id"],
                        tool_input["task_name"],
                        tool_input.get("description", ""),
                        tool_input["category"],
                        tool_input.get("due_date"),
                    ),
                )
                conn.commit()
                tid = c.lastrowid
                return f"태스크 추가 완료 (ID: {tid}): {tool_input['task_name']}"

            elif tool_name == "update_task_progress":
                status = tool_input["status"]
                completion = now[:10] if status == "completed" else None
                c.execute(
                    "UPDATE onboarding_tasks SET status = ?, completion_date = ?, notes = ? WHERE id = ?",
                    (status, completion, tool_input.get("notes"), tool_input["task_id"]),
                )
                conn.commit()

                c.execute(
                    "SELECT plan_id FROM onboarding_tasks WHERE id = ?",
                    (tool_input["task_id"],),
                )
                row = c.fetchone()
                if row:
                    plan_id = row["plan_id"]
                    c.execute(
                        "SELECT COUNT(*) as total, "
                        "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done "
                        "FROM onboarding_tasks WHERE plan_id = ?",
                        (plan_id,),
                    )
                    counts = c.fetchone()
                    progress = round(counts["done"] / counts["total"] * 100) if counts["total"] else 0
                    c.execute(
                        "UPDATE onboarding_plans SET overall_progress = ? WHERE id = ?",
                        (progress, plan_id),
                    )
                    conn.commit()

                return f"태스크 ID {tool_input['task_id']} 상태 → {status}"

            elif tool_name == "assign_mentor":
                c.execute(
                    "UPDATE team_members SET mentor_id = ? WHERE id = ?",
                    (tool_input["mentor_id"], tool_input["member_id"]),
                )
                conn.commit()
                c.execute("SELECT name FROM team_members WHERE id = ?", (tool_input["member_id"],))
                mentee = c.fetchone()
                c.execute("SELECT name FROM team_members WHERE id = ?", (tool_input["mentor_id"],))
                mentor = c.fetchone()
                return (
                    f"멘토 배정 완료: {mentee['name'] if mentee else '?'} "
                    f"← 멘토: {mentor['name'] if mentor else '?'}"
                )

            elif tool_name == "get_onboarding_status":
                mid = tool_input["member_id"]
                c.execute(
                    "SELECT tm.name, tm.role, tm.hire_date, tm2.name as mentor_name, "
                    "op.id as plan_id, op.plan_name, op.start_date, op.target_completion_date, "
                    "op.overall_progress, op.status as plan_status "
                    "FROM team_members tm "
                    "LEFT JOIN team_members tm2 ON tm.mentor_id = tm2.id "
                    "LEFT JOIN onboarding_plans op ON tm.id = op.member_id "
                    "WHERE tm.id = ?",
                    (mid,),
                )
                row = c.fetchone()
                if not row:
                    return "팀원을 찾을 수 없습니다."
                r = dict(row)

                lines = [
                    f"=== {r['name']} 온보딩 현황 ===",
                    f"역할: {r['role']} | 입사일: {r.get('hire_date','N/A')}",
                    f"멘토: {r.get('mentor_name','미배정')}",
                ]

                if r.get("plan_id"):
                    lines.append(
                        f"\n[플랜: {r['plan_name']}]"
                        f"\n  기간: {r['start_date']} ~ {r['target_completion_date']}"
                        f"\n  진행률: {r['overall_progress']}%"
                    )
                    c.execute(
                        "SELECT category, status, COUNT(*) as cnt FROM onboarding_tasks "
                        "WHERE plan_id = ? GROUP BY category, status",
                        (r["plan_id"],),
                    )
                    task_rows = [dict(t) for t in c.fetchall()]

                    cat_labels = {
                        "product_knowledge": "제품지식",
                        "sales_skills": "영업스킬",
                        "system_training": "시스템교육",
                        "compliance": "컴플라이언스",
                        "shadowing": "동행영업",
                        "team_culture": "팀문화",
                    }
                    cat_summary: dict = {}
                    for t in task_rows:
                        cat = cat_labels.get(t["category"], t["category"])
                        cat_summary.setdefault(cat, {"completed": 0, "total": 0})
                        cat_summary[cat]["total"] += t["cnt"]
                        if t["status"] == "completed":
                            cat_summary[cat]["completed"] += t["cnt"]

                    lines.append("\n[카테고리별 진행]")
                    for cat, counts in cat_summary.items():
                        lines.append(
                            f"  {cat}: {counts['completed']}/{counts['total']} 완료"
                        )
                else:
                    lines.append("\n온보딩 플랜이 없습니다. 플랜 생성이 필요합니다.")

                return "\n".join(lines)

            elif tool_name == "get_all_onboarding_overview":
                c.execute(
                    "SELECT tm.name, tm.role, op.plan_name, op.overall_progress, "
                    "op.start_date, op.target_completion_date, op.status "
                    "FROM onboarding_plans op "
                    "JOIN team_members tm ON op.member_id = tm.id "
                    "WHERE op.status = 'active' ORDER BY op.overall_progress"
                )
                rows = [dict(r) for r in c.fetchall()]
                if not rows:
                    return "진행 중인 온보딩이 없습니다."
                lines = [f"=== 온보딩 전체 현황 ({len(rows)}명) ==="]
                for r in rows:
                    bar = "█" * (r["overall_progress"] // 10) + "░" * (10 - r["overall_progress"] // 10)
                    lines.append(
                        f"\n{r['name']} ({r['role']})"
                        f"\n  [{bar}] {r['overall_progress']}%"
                        f"\n  기간: {r['start_date']} ~ {r['target_completion_date']}"
                    )
                return "\n".join(lines)

            elif tool_name == "generate_welcome_guide":
                mid = tool_input["member_id"]
                c.execute(
                    "SELECT tm.name, tm.role, tm.hire_date, tm2.name as mentor_name "
                    "FROM team_members tm LEFT JOIN team_members tm2 ON tm.mentor_id=tm2.id "
                    "WHERE tm.id = ?",
                    (mid,),
                )
                row = c.fetchone()
                if not row:
                    return "팀원을 찾을 수 없습니다."
                r = dict(row)
                guide = f"""
=== {r['name']}님 환영합니다! ===

안녕하세요, {r['name']}님!
저희 팀에 합류하신 것을 진심으로 환영합니다.

[첫 주 필수 사항]
1. 전체 팀원 인사 (담당: 온보딩 에이전트가 일정 조율)
2. 멘토 {r.get('mentor_name', 'TBD')}님과 첫 미팅 (1시간)
3. 팀 슬랙/커뮤니케이션 도구 설정
4. CRM 시스템 계정 생성 및 초기 설정

[빠른 시작 가이드]
- 우리 팀의 핵심 제품 3가지 먼저 학습하세요
- 리드 스코어링 기준을 숙지하세요 (70점 이상이 핵심 타겟)
- 팀 공유 드라이브에서 영업 스크립트 샘플을 확인하세요

[유용한 연락처]
- 멘토: {r.get('mentor_name', '곧 배정 예정')}
- 온보딩 문의: 온보딩 에이전트 (챗봇)
- 시스템 오류: IT 지원팀

[첫 달 목표]
- 제품 지식 테스트 통과
- 동행 영업 5회 이상 참여
- 단독 전화 영업 20건 이상

화이팅입니다! 궁금한 사항은 언제든지 멘토나 팀장님께 문의하세요.
"""
                return guide.strip()

        except Exception as e:
            return f"오류: {e}"
        finally:
            conn.close()
