# UI / UX Rules

## Primary UX Goal

Help non-developer vibe coders understand their app before AI builds it.

The user should feel:

> "내가 만들려는 앱 구조가 처음으로 보인다."

## Tone

Use calm, direct, plain language.

Avoid making users feel their idea is wrong.

Prefer:

- "결정 필요"
- "확인 필요"
- "빠진 부분"
- "추천 구조"
- "앱이 저장할 정보"

Avoid:

- "오류"
- "잘못됨"
- "invalid schema"
- "RBAC incomplete"
- "ERD mismatch"

## Core Layout Pattern

Recommended layout:

```text
Left Sidebar       Main Canvas / Result Area       Right Detail Panel
────────────       ───────────────────────       ─────────────────
Projects           App Map / Data Map             Selected node
Source docs        Flow Map / Issue list          Explanation
Views              Prompt preview                 Actions
```

## Main Navigation

Recommended primary sections:

1. Source
2. App Map
3. Data Map
4. Flow Map
5. Missing Parts
6. Build Prompts
7. Export
8. Settings

## Empty States

Every major section needs an empty state.

Examples:

### App Map Empty

```text
아직 앱 지도가 없습니다.
아이디어나 PRD를 입력하면 필요한 화면 구조를 자동으로 정리합니다.
```

### Data Map Empty

```text
아직 저장 정보가 없습니다.
분석을 실행하면 앱이 기억해야 할 정보 묶음을 찾아드립니다.
```

### Missing Parts Empty

```text
아직 확인된 빠진 부분이 없습니다.
분석을 실행하면 결정이 필요한 항목을 찾아드립니다.
```

## Visible Status Labels

| Internal status | Korean UI label |
|---|---|
| suggested | 제안됨 |
| accepted | 반영됨 |
| edited | 수정됨 |
| rejected | 제외됨 |
| deferred | 나중에 결정 |

## Confidence Labels

| Confidence band | Korean UI label |
|---|---|
| likely | 추천 |
| review | 확인 필요 |
| weak | 약한 추정 |

## Issue Severity Labels

| Severity | Korean UI label |
|---|---|
| high | 중요 |
| medium | 보통 |
| low | 낮음 |

## Node Types

App Map node types:

- App Area
- Screen
- Feature
- Issue

Data Map node types:

- Data Object
- Data Field
- Relation
- Issue

Flow Map node types:

- Start
- Screen Step
- Action
- Decision
- End
- Issue

## Node Detail Panel

When a node is selected, show:

- name
- plain-language description
- status
- source quote if available
- related screens/features/data
- issues
- actions

Actions:

- accept
- edit
- reject
- defer
- copy
- include in prompt

## Missing Parts UX

Each issue card should show:

- issue title
- plain-language explanation
- why it matters
- suggested options
- related object
- severity
- action buttons

Issue action buttons:

- 해결됨
- 나중에 결정
- 제외
- 내 답변 입력

## Prompt UX

Prompt generation should be step-based.

The user should choose:

- target tool: Codex, Cursor, Lovable, Replit, Bolt
- build step
- included screens
- included data objects
- excluded scope

Always include:

- goal
- app type
- screens
- data
- constraints
- excluded scope
- completion criteria

## Copywriting Examples

### Landing

```text
AI가 만들기 전에, 내 앱의 구조를 먼저 보세요.

아이디어, PRD, 메모를 넣으면
화면, 데이터, 사용 흐름, 빠진 부분을 앱 지도로 바꿔드립니다.
```

### Analysis Summary

```text
이 앱은 내부 업무툴과 자산관리 앱에 가깝습니다.

발견된 구조:
- 주요 화면 8개
- 저장 정보 6개
- 사용 흐름 4개
- 결정이 필요한 부분 9개
```

### Missing Permission

```text
누가 이 정보를 수정할 수 있는지 아직 정해지지 않았습니다.
관리자만 수정할지, 담당자도 수정할지 결정이 필요합니다.
```

### Missing State

```text
상태값이 아직 정해지지 않았습니다.
예: 정상, 주의, 경고, 고장, 정지
```

## Developer Terms Rule

Developer terms can appear only in advanced panels.

Examples:

Basic label:
> 앱이 저장할 정보

Advanced label:
> Data Object / Entity

Basic label:
> 누가 무엇을 할 수 있는지

Advanced label:
> Permission / RBAC

## Accessibility

- Keyboard navigation should be possible for main actions.
- Do not rely only on color for status.
- Use readable text size.
- Ensure graph nodes have text alternatives or detail panels.

## Visual Style

Recommended feel:

- clean
- structured
- calm
- dashboard-like
- map-oriented
- not playful
- not overly technical

Avoid cluttered node graphs.
Prefer progressive disclosure.
