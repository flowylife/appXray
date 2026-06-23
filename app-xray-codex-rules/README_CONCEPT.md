# App X-Ray

> See your app before AI builds it.

App X-Ray helps non-developer vibe coders turn messy app ideas, PRDs, notes, and domain descriptions into structured product maps.

It helps users see:

- what screens their app needs
- what information the app must store
- how users move through the app
- what requirements are missing
- what to ask AI coding tools to build

## Why App X-Ray Exists

Vibe coding is fast.

But messy prompts create messy apps.

Many non-developers can describe their domain well, but struggle to translate that knowledge into software structure.

App X-Ray helps them create a map before code.

## What App X-Ray Is

App X-Ray is:

- a local-first app design tool
- a PRD and idea visualizer
- a product map generator
- a missing-requirements detector
- a build prompt generator
- an open-source template format

## What App X-Ray Is Not

App X-Ray is not:

- an AI app builder
- a no-code builder
- a SaaS that resells AI credits
- a replacement for Codex, Cursor, Lovable, Replit, or Bolt
- a code generator that mutates your repository

## Core Workflow

```text
Idea / PRD / Notes
→ App X-Ray analysis
→ App Map
→ Data Map
→ Flow Map
→ Missing Parts
→ AI Build Prompt
→ Codex / Cursor / Lovable / Replit / Bolt
```

## Local-First Direction

App X-Ray is designed to be local-first.

Preferred model:

- user data stays local
- user connects their own AI key
- no AI token resale
- export to Markdown, Mermaid, JSON, and build prompts

## Template Marketplace Direction

The future App X-Ray ecosystem may include a template marketplace.

Templates are app design packages, not just documents.

A template may include:

- screens
- data objects
- flows
- roles
- permissions
- missing-parts checklist
- AI tool prompts
- sample data

## Example Input

```text
현장 전력설비를 관리하는 앱을 만들고 싶습니다.
담당구역, 공장, 변전실, 부하를 관리해야 합니다.
부하별 점검 이력과 알람을 볼 수 있어야 하고,
대시보드에서는 단선도와 주요 알람, 일정이 보여야 합니다.
관리자는 설비 정보를 수정할 수 있고 일반 사용자는 조회만 가능해야 합니다.
```

## Example Output

```text
App type:
- Internal tool
- Asset management
- Dashboard

Screens:
- Dashboard
- Load List
- Load Detail
- Inspection History
- Alarm Center
- Scheduler
- Admin Settings

Data:
- User
- Role
- Area
- Plant
- Substation
- Load
- InspectionRecord
- Alarm
- ScheduleEvent

Missing parts:
- Alarm trigger condition is not defined.
- Load status values are not defined.
- Inspection deletion policy is missing.
- User role boundary is unclear.
```

## Core Principle

AI suggests.
The user confirms.
The system preserves.
