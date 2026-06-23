# Codex Workflow

## Purpose

This document defines how Codex should be used to develop App X-Ray.

## Working Style

Codex should work in small, reviewable steps.

Avoid large rewrites unless explicitly requested.

Prefer this loop:

```text
Read rules
→ inspect existing files
→ propose focused change
→ implement
→ run typecheck/tests if available
→ summarize changes
```

## Required Reading Order

Before implementing product logic, Codex should read:

1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `AI_BOUNDARY.md`
4. `DOMAIN_MODEL.md`
5. `AI_ANALYSIS_SCHEMA.md`
6. `UI_UX_RULES.md`
7. `EXPORT_RULES.md`
8. `TEMPLATE_MANIFEST.md`

## Implementation Priority

Initial implementation should follow this order:

1. Project shell
2. Domain types
3. Local project store
4. Source document input
5. Mock AI analysis result
6. Suggested/accepted/rejected lifecycle
7. App Map view
8. Data Map view
9. Missing Parts view
10. Prompt generation view
11. Markdown export
12. Mermaid export
13. BYOK settings
14. Real AI adapter

## Do Not Start With

Do not start with:

- marketplace
- payments
- team accounts
- cloud sync
- GitHub OAuth
- Notion integration
- real-time collaboration
- automatic code generation
- complicated graph editor

## Suggested Branch Naming

Use clear branches:

```text
feat/domain-model
feat/local-store
feat/app-map
feat/data-map
feat/missing-parts
feat/prompt-export
feat/ai-adapter
fix/export-validation
refactor/project-state
```

## Commit Style

Use Conventional Commits.

Examples:

```text
feat: add project domain types
feat: add local source document store
feat: render app map from confirmed screens
fix: preserve edited screen names after analysis rerun
refactor: isolate ai provider adapters
docs: add template manifest schema
test: add export validation tests
```

Avoid vague messages:

```text
update
fix2
changes
wip
misc
```

## Task Prompt Template for Codex

Use this format when assigning work:

```markdown
## Goal

[Specific goal]

## Context

Read:
- AGENTS.md
- PROJECT_RULES.md
- AI_BOUNDARY.md
- DOMAIN_MODEL.md

## Requirements

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Constraints

- Do not introduce SaaS backend.
- Do not let AI output overwrite accepted user data.
- Use strict TypeScript.
- Keep exports deterministic.

## Acceptance Criteria

- [ ] Criteria 1
- [ ] Criteria 2
- [ ] Typecheck passes
- [ ] Existing behavior is not broken
```

## Example Codex Task 1

```markdown
## Goal

Create the initial TypeScript domain model for App X-Ray.

## Context

Use DOMAIN_MODEL.md and AI_ANALYSIS_SCHEMA.md as the source of truth.

## Requirements

- Define Project, SourceDocument, Screen, DataObject, Flow, Issue, and related types.
- Define SuggestionStatus and ConfidenceBand.
- Define helper predicates for confirmed records.
- Add sample fixture data for a field asset management app.

## Constraints

- Do not add database code yet.
- Do not add AI provider code.
- Do not add SaaS/backend assumptions.

## Acceptance Criteria

- Types compile.
- Fixture data satisfies the types.
- Helper function `isConfirmedXrayObject` returns true for accepted/edited only.
```

## Example Codex Task 2

```markdown
## Goal

Implement deterministic Markdown export.

## Context

Read EXPORT_RULES.md.

## Requirements

- Export project summary.
- Export accepted/edited screens.
- Export accepted/edited data objects.
- Export accepted/edited flows.
- Export accepted/edited issues.
- Exclude rejected records by default.
- Add an option to include suggested records.

## Constraints

- Do not call AI for this export.
- Output must be deterministic.

## Acceptance Criteria

- Same input produces same Markdown.
- Rejected objects are excluded by default.
- Unit tests cover confirmed-only export.
```

## Example Codex Task 3

```markdown
## Goal

Build App Map view from structured screen data.

## Context

Read UI_UX_RULES.md and DOMAIN_MODEL.md.

## Requirements

- Show screen hierarchy.
- Show selected screen detail panel.
- Show status labels.
- Let user accept, edit, reject, or defer suggested screens.
- Preserve edited names.

## Constraints

- Do not implement full graph editor yet.
- Do not call AI from the view.
- Use existing project state.

## Acceptance Criteria

- Suggested screens are visually distinct.
- Accepted and edited screens are treated as confirmed.
- Rejected screens are hidden by default but can be shown with a filter.
```

## Review Checklist

Before finishing any Codex task:

- Did it respect local-first assumptions?
- Did it keep AI suggestions separate from confirmed data?
- Did it avoid unrequested SaaS features?
- Did it use user-friendly UI copy?
- Did it preserve deterministic exports?
- Did it avoid broad rewrites?
- Did it include a clear summary?
