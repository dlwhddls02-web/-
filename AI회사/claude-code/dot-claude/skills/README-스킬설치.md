# 클로드코드 스킬 설치 안내

## 무엇이 들어 있나

`AI회사/claude-code/dot-claude/skills/` 아래 4개 스킬. 전부 2026-08-25 실사용자 9명 검증에서
얻은 규칙을 담고 있고, **관련 작업을 시작하면 클로드코드가 알아서 불러온다**(description 기반 자동 매칭).

| 스킬 | 언제 걸리나 |
|---|---|
| `saju-reading` | 리딩 프롬프트·규칙 상수·만세력 렌더러를 만질 때 |
| `saju-engine` | 만세력 계산 로직을 만지거나 명식이 이상하다는 제보를 받을 때 |
| `saju-qa` | 리포트를 뽑은 직후 / 고객에게 보내기 전 |
| `saju-cost` | LLM 호출 코드 작성, 원가·마진·가격 논의 |

## 설치

프로젝트 루트에서:

```
<프로젝트>/.claude/skills/saju-reading/SKILL.md
<프로젝트>/.claude/skills/saju-engine/SKILL.md
<프로젝트>/.claude/skills/saju-qa/SKILL.md
<프로젝트>/.claude/skills/saju-cost/SKILL.md
```

`claude-code/dot-claude/` 를 프로젝트의 `.claude/` 로 통째로 복사하면 agents·commands·skills가
한 번에 들어간다.

## 확인

클로드코드에서:

```
/skills
```

4개가 목록에 보이면 된다. 안 보이면 `claude --debug` 로 YAML 파싱 오류를 확인한다.
`/context` 로 로드된 스킬과 토큰 비용도 볼 수 있다.

## 스킬 vs 에이전트 vs 커맨드 — 왜 이렇게 나눴나

- **스킬** (`.claude/skills/`) — 참조 규칙 + 작업 지시. 현재 세션에 로드되고 **자동 호출**된다.
  오늘 만든 규칙들은 "작업 중에 자동으로 걸려야" 의미가 있어서 스킬로 만들었다.
- **에이전트** (`.claude/agents/`) — 7개 부서(ceo·marketing·sales·support·finance·build·ops).
  격리된 독립 실행이 맞는 형태라 그대로 둔다.
- **커맨드** (`.claude/commands/`) — `/handoff`, `/plan-month`, `/standup`.
  공식적으로는 스킬로 통합됐지만 기존 파일은 계속 동작한다. 급하지 않아 그대로 뒀다.

## 주의

이 스킬들은 **되돌리고 싶어지는 규칙**을 담고 있다. "더 구체적으로 단언하면 소름이 나지 않을까",
"전문 용어를 써야 전문가처럼 보이지 않을까" 하는 판단이 들면, 그게 정확히 사고가 났던 지점이다.
각 스킬의 사고 기록을 먼저 읽자.
