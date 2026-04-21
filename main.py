"""
영업팀 멀티 에이전트 시스템 - 메인 CLI

사용법:
    python main.py                    # 대화형 모드
    python main.py --demo             # 데모 시나리오 실행
    python main.py --agent marketing  # 특정 에이전트 직접 지정
"""

import argparse
import sys

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich.text import Text
from rich import box

from storage.database import init_db
from orchestrator import Orchestrator, AGENT_DESCRIPTIONS

console = Console()

AGENT_COLORS = {
    "marketing": "cyan",
    "customer_management": "green",
    "performance": "yellow",
    "onboarding": "blue",
    "communication": "magenta",
}

AGENT_ICONS = {
    "marketing": "📊",
    "customer_management": "👥",
    "performance": "📈",
    "onboarding": "🎓",
    "communication": "💬",
}

DEMO_SCENARIOS = [
    ("performance", "팀원을 등록해줘. 이름: 김민수, 역할: sales_rep, 이메일: minsu@sales.com"),
    ("performance", "팀원을 등록해줘. 이름: 이지은, 역할: sales_rep, 이메일: jieun@sales.com"),
    ("performance", "팀원을 등록해줘. 이름: 박준호, 역할: team_lead, 이메일: junho@sales.com"),
    ("marketing", "IT 스타트업 회사의 CTO인 홍길동(gildong@startup.io, 010-1234-5678)을 고객DB에 추가해줘. 예산 5000만원, 핵심 문제는 개발 생산성 저하와 레거시 시스템 문제야. 리드 점수는 85점"),
    ("marketing", "제조업 구매팀장 김철수(cheol@mfg.co.kr)도 추가해줘. 회사 규모는 large, 예산 3000만원, 문제는 재고관리 비효율. 리드 점수 72점"),
    ("marketing", "고객 DB에서 리드 점수 70점 이상 고객을 조회해줘"),
    ("marketing", "팀원들에게 고객 DB를 균등 배포해줘. '이번 주 안에 첫 연락 부탁드립니다'라는 메시지와 함께"),
    ("customer_management", "고객 ID 1번 고객 상세 정보를 보여줘"),
    ("customer_management", "고객 ID 1번 상태를 'contacted'로 변경해줘. 이유는 '첫 전화 통화 완료'"),
    ("customer_management", "고객 ID 1에 노트를 추가해줘. 유형은 call, 내용: '오늘 첫 통화에서 레거시 문제에 큰 관심 보임. 다음 주 데모 미팅 요청'"),
    ("customer_management", "고객 ID 1에 팔로업을 등록해줘. 날짜: 2026-04-28, 유형: meeting, 우선순위: high"),
    ("performance", "팀원 ID 1(김민수)의 2026-04 실적을 입력해줘: 매출 1200만원, 계약 2건, 전화 95회, 미팅 8회, 만족도 4.3"),
    ("performance", "팀원 ID 1(김민수)의 2026-04 목표를 설정해줘: 매출 목표 2000만원, 계약 목표 3건, 전화 목표 100회"),
    ("performance", "팀 전체 실적 대시보드를 보여줘"),
    ("performance", "팀원 ID 1(김민수)에 대한 AI 피드백을 생성해줘"),
    ("onboarding", "팀원 ID 2(이지은)의 온보딩 플랜을 만들어줘. 시작일: 2026-04-21"),
    ("onboarding", "팀원 ID 2(이지은)의 온보딩 현황을 보여줘"),
    ("onboarding", "팀원 ID 2(이지은)의 멘토를 팀원 ID 3(박준호)으로 배정해줘"),
    ("onboarding", "팀원 ID 2(이지은)를 위한 환영 가이드를 생성해줘"),
    ("communication", "팀 전체에 공지해줘: '이번 달 영업 목표 달성을 위해 리드점수 80점 이상 고객을 최우선으로 공략해주세요!' 우선순위는 important"),
    ("communication", "팀원 ID 1(김민수)에게 개인 메시지를 보내줘: '이번 달 실적 잘 하고 있어요! 계속 화이팅!'"),
    ("communication", "팀 미팅 일정을 만들어줘. 제목: 4월 실적 리뷰, 유형: team_meeting, 일시: 2026-04-30 14:00, 참석자: [1, 2, 3]"),
    ("communication", "수신함 공지사항을 확인해줘"),
    ("customer_management", "영업 파이프라인 현황 리포트를 보여줘"),
]


def print_header():
    console.print(
        Panel.fit(
            "[bold white]영업팀 멀티 에이전트 시스템[/bold white]\n"
            "[dim]Marketing · CRM · Performance · Onboarding · Communication[/dim]",
            border_style="bright_blue",
            padding=(1, 4),
        )
    )


def print_agent_map():
    table = Table(box=box.ROUNDED, border_style="dim", show_header=True)
    table.add_column("에이전트", style="bold")
    table.add_column("역할")
    table.add_column("명령어")

    rows = [
        ("📊 마케팅", "고객 DB 구축·배포·리드 스코어링", "/marketing"),
        ("👥 고객관리", "CRM·팔로업·파이프라인 관리", "/crm"),
        ("📈 실적관리", "실적 추적·목표·AI 피드백", "/performance"),
        ("🎓 온보딩", "신규 팀원 교육·멘토 배정", "/onboarding"),
        ("💬 커뮤니케이션", "공지·메시지·미팅 관리", "/comm"),
    ]
    for name, role, cmd in rows:
        table.add_row(name, role, f"[dim]{cmd}[/dim]")

    console.print(table)
    console.print(
        "[dim]  /demo - 전체 데모 실행  |  /reset - 대화 초기화  |  /quit - 종료[/dim]\n"
    )


def print_response(result: dict):
    agent_key = result.get("routed_to", "")
    color = AGENT_COLORS.get(agent_key, "white")
    icon = AGENT_ICONS.get(agent_key, "🤖")
    desc = result.get("agent_description", result.get("agent", ""))
    reason = result.get("route_reason", "")

    header = f"{icon} {desc}"
    if reason:
        header += f"  [dim]({reason})[/dim]"

    console.print(
        Panel(
            result["response"],
            title=f"[{color}]{header}[/{color}]",
            border_style=color,
            padding=(0, 1),
        )
    )


def run_demo(orchestrator: Orchestrator):
    console.print(
        Panel(
            f"[bold]데모 시나리오 실행[/bold]\n총 {len(DEMO_SCENARIOS)}개 시나리오",
            border_style="bright_yellow",
        )
    )

    for i, (agent_key, message) in enumerate(DEMO_SCENARIOS, 1):
        icon = AGENT_ICONS.get(agent_key, "🤖")
        console.print(f"\n[dim]── 시나리오 {i}/{len(DEMO_SCENARIOS)} ──[/dim]")
        console.print(f"[bold]{icon} 요청:[/bold] {message}")

        result = orchestrator.run(message, agent_key=agent_key)
        print_response(result)

        if i < len(DEMO_SCENARIOS):
            try:
                input("[dim]Enter로 다음 시나리오...[/dim]")
            except (EOFError, KeyboardInterrupt):
                break


def parse_agent_shortcut(text: str) -> tuple[str | None, str]:
    """슬래시 명령어에서 에이전트 키와 메시지를 분리합니다."""
    shortcuts = {
        "/marketing": "marketing",
        "/crm": "customer_management",
        "/performance": "performance",
        "/onboarding": "onboarding",
        "/comm": "communication",
    }
    for cmd, key in shortcuts.items():
        if text.startswith(cmd):
            msg = text[len(cmd):].strip()
            return key, msg
    return None, text


def interactive_mode(orchestrator: Orchestrator, fixed_agent: str = None):
    print_header()
    print_agent_map()

    while True:
        try:
            user_input = Prompt.ask("[bold bright_blue]>[/bold bright_blue]").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]종료합니다.[/dim]")
            break

        if not user_input:
            continue

        if user_input.lower() in ("/quit", "/exit", "quit", "exit"):
            console.print("[dim]종료합니다.[/dim]")
            break

        if user_input.lower() == "/demo":
            run_demo(orchestrator)
            continue

        if user_input.lower() == "/reset":
            orchestrator.reset_conversation()
            console.print("[green]대화 이력이 초기화되었습니다.[/green]")
            continue

        if user_input.lower() == "/help":
            print_agent_map()
            continue

        agent_key = fixed_agent
        message = user_input

        if not agent_key:
            shortcut_key, message = parse_agent_shortcut(user_input)
            agent_key = shortcut_key

        if not message:
            console.print("[yellow]메시지를 입력해주세요.[/yellow]")
            continue

        try:
            result = orchestrator.run(message, agent_key=agent_key)
            print_response(result)
        except Exception as e:
            console.print(f"[red]오류: {e}[/red]")


def main():
    parser = argparse.ArgumentParser(description="영업팀 멀티 에이전트 시스템")
    parser.add_argument("--demo", action="store_true", help="데모 시나리오 실행")
    parser.add_argument(
        "--agent",
        choices=["marketing", "customer_management", "performance", "onboarding", "communication"],
        help="특정 에이전트 직접 지정",
    )
    args = parser.parse_args()

    init_db()
    orchestrator = Orchestrator()

    if args.demo:
        print_header()
        run_demo(orchestrator)
    else:
        interactive_mode(orchestrator, fixed_agent=args.agent)


if __name__ == "__main__":
    main()
