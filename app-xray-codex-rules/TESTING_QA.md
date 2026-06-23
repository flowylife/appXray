# Testing and QA Rules

## Testing Philosophy

App X-Ray depends on a clear boundary between AI suggestions and deterministic logic.

Tests should focus heavily on deterministic parts:

- lifecycle status
- validation
- export
- graph conversion
- template application
- prompt context assembly
- version diff

AI output itself can be mocked.

## High-Priority Test Areas

### 1. Confirmation Lifecycle

Test that:

- suggested objects are not canonical by default
- accepted objects are canonical
- edited objects are canonical
- rejected objects are excluded from canonical exports
- deferred objects are excluded unless explicitly included

### 2. User Edit Preservation

Test that:

- user-edited names are not overwritten by later AI suggestions
- user-rejected objects do not reappear as accepted
- accepted object IDs remain stable

### 3. Export Determinism

Test that:

- same input produces same Markdown
- same input produces same Mermaid
- rejected objects are excluded
- broken references are warned or omitted safely
- high-severity open issues trigger warnings

### 4. Template Application

Test that:

- template references are valid
- template application detects name collisions
- template objects are imported as suggested by default
- applying a template does not overwrite existing confirmed objects silently

### 5. AI Output Validation

Test that:

- invalid enum values are handled
- missing arrays are treated as empty arrays
- malformed relations do not crash
- duplicate temp IDs are handled
- confidence outside 0-1 is clamped or rejected

### 6. Prompt Context Assembly

Test that:

- prompt context uses confirmed data
- rejected data is excluded
- selected scope is respected
- excluded scope appears in the prompt context
- target tool is reflected in output

## Manual QA Checklist

Before shipping a feature, manually verify:

- Empty state exists.
- Loading state exists.
- Error state exists.
- Korean UI copy is understandable to non-developers.
- Suggested/accepted/edited/rejected status is visible.
- User can undo or change decisions where appropriate.
- Export output can be copied.
- No hidden SaaS or backend assumption was introduced.

## Sample Test Fixture

Use a field asset management app as the primary fixture.

```text
현장 전력설비를 관리하는 앱입니다.
담당구역, 공장, 변전실, 부하를 관리해야 합니다.
부하별 점검 이력과 알람을 볼 수 있어야 합니다.
대시보드에서는 단선도와 주요 알람, 일정이 보여야 합니다.
관리자는 설비 정보를 수정할 수 있고 일반 사용자는 조회만 가능해야 합니다.
```

Expected extracted structure:

- App type: internal tool, asset management, dashboard
- Screens:
  - Dashboard
  - Load List
  - Load Detail
  - Inspection History
  - Alarm Center
  - Scheduler
  - Admin Settings
- Data objects:
  - User
  - Role
  - Area
  - Plant
  - Substation
  - Load
  - InspectionRecord
  - Alarm
  - ScheduleEvent
- Issues:
  - alarm trigger condition missing
  - load status values missing
  - inspection deletion policy missing
  - role boundary unclear

## Suggested Commands

Use project-specific commands if available.

Common examples:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

If commands are unavailable, Codex should inspect `package.json` and use the correct scripts.

## QA Rule for Graph Views

Graph views should be tested with:

- no nodes
- one node
- parent-child hierarchy
- broken relation
- many nodes
- rejected nodes hidden
- suggested nodes visible
- selected node detail panel

## QA Rule for Exports

Every export should be tested with:

- confirmed-only mode
- include-suggested mode
- project with open high-severity issues
- project with no screens
- project with no data objects
- project with broken references

## Regression Risk

Highest-risk regressions:

1. AI suggestions overwrite user edits.
2. Exports include rejected objects.
3. Prompt generator invents out-of-scope features.
4. Template application overwrites existing project structure.
5. UI exposes too much developer jargon.
6. SaaS assumptions sneak into local-first code.
