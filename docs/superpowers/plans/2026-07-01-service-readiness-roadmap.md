# App X-Ray Service Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise App X-Ray from a complete local-first MVP to a service-quality product while preserving the confirmed-data export contract.

**Architecture:** Keep the browser app local-first and deterministic by default. Add production readiness in narrow layers: reliable project lifecycle, source ingestion, BYOK AI adapters, review ergonomics, export quality, offline safety, and release QA. Do not introduce hosted accounts, billing, marketplace flows, or server persistence in this roadmap.

**Tech Stack:** React 19, Vite 8, TypeScript 5.5, Node test runner, jsdom, Playwright, browser `localStorage`, deterministic pure domain/export functions.

---

## Current Baseline

The current repository already has:

- Local project storage and migration in `src/storage/project-repository.ts`.
- Mock AI analysis and provider settings in `src/ai/adapter.ts` and `src/ai/settings.ts`.
- Suggested/accepted/edited/rejected/deferred lifecycle rules in `src/domain/status.ts` and `src/domain/lifecycle.ts`.
- Workspace validation in `src/domain/validation.ts`.
- Markdown, Mermaid, JSON, GitHub issue markdown, build prompt, and bundle exports in `src/export/`.
- Source document import for `.md`, `.markdown`, and `.txt` in `src/domain/source-import.ts`.
- Backup import/export in `src/storage/workspace-backup.ts`.
- 38 domain tests in `test/domain.test.mjs`.

Verification baseline before starting any task:

```bash
npm run typecheck
npm test
npm run build
```

Expected result: all three commands pass.

---

## Service-Level Definition

App X-Ray is service-ready when a non-developer can repeatedly:

1. Create or import a project from real notes.
2. Run AI-assisted extraction using either mock mode or their own API key.
3. Review, edit, merge, reject, and defer suggestions without losing confirmed work.
4. Understand validation blockers and fix them on screen.
5. Export deterministic artifacts that are useful in Codex, Cursor, Lovable, Replit, Bolt, and GitHub issue workflows.
6. Close/reopen the browser and recover the same workspace.
7. Import/export a portable backup safely.
8. Use the app without hidden backend, account, billing, or cloud assumptions.

---

## Implementation Slices

### Task 1: Product Documentation and Release Surface

**Purpose:** Make the shipped product understandable without reading internal rule files.

**Files:**
- Modify: `README.md`
- Create: `docs/product/service-readiness.md`
- Create: `docs/product/local-first-data-contract.md`
- Modify: `app-xray-codex-rules/README_CONCEPT.md`

- [x] Write `README.md` with the product purpose, local-first boundary, supported imports, supported exports, and development commands.
- [x] Write `docs/product/service-readiness.md` with the service-level definition, supported workflows, non-goals, and release checklist.
- [x] Write `docs/product/local-first-data-contract.md` documenting `localStorage` keys, backup format, confirmed-only export rule, and AI key handling.
- [x] Link those docs from `app-xray-codex-rules/README_CONCEPT.md` without changing the product boundary.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Commit with `docs: document App X-Ray service readiness`.

Acceptance criteria:

- A new developer can run the app and understand what is and is not in scope from `README.md`.
- The docs explicitly state that default exports include only `accepted` and `edited` objects.
- The docs explicitly state that API keys stay in browser-local storage and are not included in exports or prompts.

---

### Task 2: Real Project Lifecycle and Empty-State Quality

**Purpose:** Replace demo-first feel with durable project workflows.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/storage/project-repository.ts`
- Modify: `src/domain/routes.ts`
- Test: `test/domain.test.mjs`
- Create: `test/ui-project-lifecycle.test.mjs`

- [x] Add domain tests for creating a project with user-provided name and source text.
- [x] Add repository tests for duplicate project names, empty collection, corrupt collection, and project deletion.
- [x] Add UI tests with jsdom for the empty project list, new project form validation, successful creation, project switching, and deletion confirmation state.
- [x] Refine `src/App.tsx` so `/projects`, `/projects/new`, and `/projects/:projectId/review` each have explicit loading, empty, invalid input, success, and error states.
- [x] Add non-blocking save status copy when local persistence succeeds or fails.
- [x] Ensure deleting a project never deletes another project and always leaves a valid route.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Commit with `feat: harden local project lifecycle`.

Acceptance criteria:

- A user can create, switch, rename, and delete local projects without route drift.
- Empty states explain the next action in Korean without technical metadata.
- Corrupt local data opens a visible recovery state instead of failing silently.

---

### Task 3: Source Ingestion Upgrade

**Purpose:** Support more realistic input while preserving source version history.

**Files:**
- Modify: `src/domain/source-import.ts`
- Modify: `src/domain/source-documents.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `test/domain.test.mjs`
- Create: `test/ui-source-import.test.mjs`

- [x] Add tests for `.csv`, `.json`, and pasted text classification.
- [x] Add tests proving identical content does not create duplicate source versions.
- [x] Add tests proving unsupported binary files return a user-facing Korean error.
- [x] Implement `.csv` import as plain structured source text with detected headers.
- [x] Implement `.json` import as pretty-printed source text with malformed JSON errors.
- [x] Add paste/import UI affordances that show source type, version count, last imported time, and unsupported-file errors.
- [x] Keep PDF as explicit unsupported future scope unless a PDF parser dependency is approved in a separate task.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Commit with `feat: expand local source import formats`.

Acceptance criteria:

- Markdown, text, CSV, JSON, and pasted text produce source documents.
- Malformed JSON and unsupported files are distinguishable in the UI.
- Source version history remains append-only except for exact duplicate content.

---

### Task 4: BYOK AI Provider Adapters

**Purpose:** Add real AI analysis behind adapters without making the app dependent on a hosted backend.

**Files:**
- Modify: `src/ai/adapter.ts`
- Modify: `src/ai/settings.ts`
- Create: `src/ai/provider-registry.ts`
- Create: `src/ai/structured-prompt.ts`
- Create: `src/ai/http-provider.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `test/domain.test.mjs`
- Create: `test/ai-provider.test.mjs`

- [ ] Refactor `AiProviderAdapter.analyze` to return `Promise<AiAnalysisResult>`.
- [ ] Add tests proving mock adapter remains deterministic after async conversion.
- [ ] Add `structured-prompt.ts` that builds a provider-neutral extraction prompt from the latest source document and the `AI_ANALYSIS_SCHEMA.md` contract.
- [ ] Add tests proving the prompt includes excluded scopes and asks for structured JSON only.
- [ ] Add `provider-registry.ts` with `mock`, `openai`, `anthropic`, `gemini`, and `openrouter` provider metadata.
- [ ] Add `http-provider.ts` with provider-specific request/response normalization for BYOK browser calls.
- [ ] Add tests with mocked `fetch` for success, invalid JSON, provider error, missing API key, and timeout.
- [ ] Update `App.tsx` so analysis has visible idle, running, success, validation-failed, and provider-error states.
- [ ] Keep API keys in local browser storage only. Never include the raw key in logs, exports, prompts, backups, or public config.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `feat: add BYOK AI provider adapters`.

Acceptance criteria:

- Mock mode still works offline.
- Real providers are optional and selected by the user.
- Provider output must pass `validateAiAnalysisResult` before it can touch workspace state.
- Provider failures do not overwrite confirmed or edited objects.

Risk gate:

- Browser-side BYOK calls can expose API keys to the browser runtime by design. The UI and docs must state this plainly.
- If CORS blocks a provider, the UI must show that local browser calls are blocked and suggest mock mode or a future local desktop bridge.

---

### Task 5: Review Workbench Upgrade

**Purpose:** Make suggestion review efficient enough for real projects.

**Files:**
- Modify: `src/components/ReviewPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/domain/lifecycle.ts`
- Modify: `src/domain/diff.ts`
- Test: `test/domain.test.mjs`
- Create: `test/ui-review-workbench.test.mjs`

- [x] Add domain tests for bulk accept by bucket, bulk reject by bucket, and preserving edited objects during rerun merge.
- [x] Add domain tests for undoing the most recent status decision within the current session.
- [x] Add review UI tests for filter by bucket, filter by status, search by name/description, bulk action, inline edit, and undo.
- [x] Split review rendering into focused subcomponents only if `ReviewPanel.tsx` becomes hard to reason about during implementation.
- [x] Add visible counts for all statuses per bucket.
- [x] Add keyboard-safe controls with labels for accept, edit, reject, defer, and undo.
- [x] Add a merge-impact panel after rerun showing added, refreshed, preserved, and status-changed suggestions.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Commit with `feat: improve suggestion review workbench`.

Acceptance criteria:

- A user can process a large suggestion set without one-item-at-a-time friction.
- Confirmed and edited objects survive AI reruns.
- Rejected and deferred items remain visible for audit but stay out of default exports.

---

### Task 6: Validation Repair Guidance

**Purpose:** Turn validation from a passive export blocker into actionable repair guidance.

**Files:**
- Modify: `src/domain/validation.ts`
- Create: `src/domain/validation-actions.ts`
- Modify: `src/components/ExportPanel.tsx`
- Modify: `src/components/ReviewPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `test/domain.test.mjs`
- Create: `test/ui-validation-actions.test.mjs`

- [ ] Extend validation issues with `targetBucket`, `targetId`, and `suggestedAction`.
- [ ] Add tests for broken relation, duplicate name, orphan field, empty confirmed object, and non-confirmed export contamination.
- [ ] Implement `validation-actions.ts` with pure helpers that map a validation issue to a review route and repair action label.
- [ ] Add an export-panel validation list where each blocking item can jump to the relevant review object.
- [ ] Add review-side validation badges on affected objects.
- [ ] Add safe repair actions only where deterministic: remove broken relation, mark duplicate as deferred, or exclude issue from prompt.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `feat: add actionable validation repair guidance`.

Acceptance criteria:

- Export blockers explain what is wrong, where it is, and the safest next action.
- Deterministic repair actions never delete confirmed user edits without an explicit click.
- Warnings remain non-blocking.

---

### Task 7: Export Quality and Delivery

**Purpose:** Make exports production-useful, inspectable, and repeatable.

**Files:**
- Modify: `src/export/export-content.ts`
- Modify: `src/export/markdown.ts`
- Modify: `src/export/json.ts`
- Modify: `src/export/mermaid.ts`
- Modify: `src/export/github-issues.ts`
- Create: `src/export/csv.ts`
- Modify: `src/components/ExportPanel.tsx`
- Modify: `src/App.css`
- Test: `test/domain.test.mjs`
- Create: `test/ui-export-panel.test.mjs`

- [ ] Add tests proving each export has stable ordering, stable filenames, Korean text preservation, and empty-state content.
- [ ] Add CSV export for issues and data objects using UTF-8 text and deterministic headers.
- [ ] Add copy-to-clipboard result states for preview content.
- [ ] Add per-format export descriptions that explain what each artifact is for.
- [ ] Add bundle manifest metadata: app version, export mode, generated timestamp, validation summary, file list.
- [ ] Keep canonical export mode as confirmed-only.
- [ ] Keep audit-trail mode explicit and visibly labeled.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `feat: improve deterministic export delivery`.

Acceptance criteria:

- Export previews are understandable before download.
- CSV opens cleanly in common spreadsheet tools with Korean text preserved.
- Same workspace state produces the same deterministic content except explicit generated timestamp metadata in bundle manifest.

---

### Task 8: Backup, Recovery, and Local Data Safety

**Purpose:** Reduce data-loss risk for serious use.

**Files:**
- Modify: `src/storage/workspace-backup.ts`
- Modify: `src/storage/project-repository.ts`
- Create: `src/storage/autosave-snapshots.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `test/domain.test.mjs`
- Create: `test/storage-recovery.test.mjs`

- [ ] Add snapshot tests for creating, listing, restoring, and pruning local autosave snapshots.
- [ ] Add backup tests for schema version mismatch, missing required fields, malformed JSON, and import overwrite confirmation.
- [ ] Implement local autosave snapshots per project with bounded retention.
- [ ] Add restore UI that shows snapshot time, project name, and validation status before applying.
- [ ] Add import UI that distinguishes merge, replace, and cancel.
- [ ] Never overwrite the current workspace from backup without a visible confirmation step.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `feat: add local recovery snapshots`.

Acceptance criteria:

- A bad import cannot silently overwrite current work.
- Users can recover a recent local snapshot after accidental edits.
- Snapshot retention is bounded so localStorage usage does not grow without limit.

---

### Task 9: Browser QA and Regression Harness

**Purpose:** Add realistic end-to-end verification before broader product work.

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `test/e2e/app-xray.spec.ts`
- Create: `test/e2e/fixtures.ts`
- Create: `docs/product/manual-qa-checklist.md`

- [x] Add `test:e2e` script that runs Playwright against the Vite dev server.
- [x] Add an E2E test for create project → import source → run mock analysis → accept/edit/reject → export confirmed-only markdown.
- [x] Add an E2E test for reload persistence and project switching.
- [x] Add an E2E test for validation blocking export download.
- [x] Add an E2E test for backup download and backup import.
- [x] Add `docs/product/manual-qa-checklist.md` with exact browser checks for desktop and mobile widths.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `npm run test:e2e`.
- [x] Commit with `test: add App X-Ray browser regression coverage`.

Acceptance criteria:

- Core user flow is verified in a real browser.
- Reload persistence is covered.
- Export validation blocking behavior is covered.
- Manual QA checklist matches the app's actual routes and controls.

---

### Task 10: Desktop Packaging Feasibility Check

**Purpose:** Decide whether local-first service quality should ship as browser-only or desktop app next.

**Files:**
- Create: `docs/product/desktop-packaging-decision.md`
- Modify: `README.md`
- Optional Create: `scripts/check-release.mjs`

- [ ] Document browser-only release constraints: localStorage capacity, browser BYOK CORS, file access limits, no native encrypted keychain.
- [ ] Document desktop release benefits: native file storage, local encrypted settings, local model bridge option, safer backup location.
- [ ] Compare Electron, Tauri, and browser-only PWA against maintenance cost.
- [ ] If a release script is added, make it run `npm run typecheck`, `npm test`, and `npm run build` in sequence and report failures clearly.
- [ ] Do not add Electron or Tauri in this task.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `docs: evaluate App X-Ray desktop packaging`.

Acceptance criteria:

- The next platform decision is explicit and reviewable.
- No packaging dependency is introduced before the decision is accepted.
- Browser-only service limits are documented honestly.

---

## Recommended Execution Order

1. Task 1: Documentation and release surface.
2. Task 9: Browser QA harness, so later work has regression coverage.
3. Task 2: Project lifecycle hardening.
4. Task 3: Source ingestion upgrade.
5. Task 5: Review workbench upgrade.
6. Task 6: Validation repair guidance.
7. Task 7: Export quality and delivery.
8. Task 8: Backup and recovery.
9. Task 4: BYOK AI provider adapters.
10. Task 10: Desktop packaging decision.

Reasoning:

- Documentation and E2E coverage make the product boundary explicit before behavior grows.
- Project/source/review/validation/export/recovery improve deterministic product quality without external-service risk.
- Real AI adapters come after the local deterministic loop is strong enough to absorb provider failures safely.
- Desktop packaging should be decided after browser limits are visible through actual usage and tests.

---

## Verification Matrix

Every implementation task must run:

```bash
npm run typecheck
npm test
npm run build
```

Tasks with browser-visible behavior must also run:

```bash
npm run test:e2e
```

Manual QA after Task 9 and later UI tasks:

- Desktop viewport: project creation, source import, mock analysis, review, export.
- Mobile-width viewport: navigation, review controls, export preview, validation list.
- Reload persistence: refresh after edits and confirm state survives.
- Empty state: no project and no confirmed objects.
- Error state: malformed import and invalid AI provider result.

---

## Risk Areas

- DB schema changed: No. This roadmap stays browser-local unless a future task explicitly approves native or hosted persistence.
- API contract changed: Yes for Task 4 only, because `AiProviderAdapter.analyze` becomes async and provider HTTP contracts are introduced.
- Auth/permission changed: No. No user accounts or hosted auth are part of this roadmap.
- UI layout changed: Yes for Tasks 2, 3, 5, 6, 7, and 8.
- State management changed: Yes for Tasks 2, 5, and 8.
- Data import/export changed: Yes for Tasks 3, 7, and 8.
- Build/deployment config changed: Yes for Task 9 if Playwright config and scripts are added.
- Test coverage changed: Yes across all implementation tasks.

---

## Explicit Non-Goals

- Hosted SaaS backend.
- Login, organizations, billing, marketplace, template sales, or team collaboration.
- GitHub write integration.
- Notion, Linear, Jira, Supabase, or Figma write/sync integration.
- PDF parsing without a separate dependency and privacy review.
- Replacing deterministic exports with AI-generated export text.

---

## Stop Conditions

Stop and ask for approval before:

- Adding a backend service.
- Adding Electron, Tauri, or any desktop packaging dependency.
- Adding a PDF parsing dependency.
- Persisting API keys anywhere outside browser-local settings.
- Introducing hosted telemetry or analytics.
- Changing the confirmed-only default export rule.

---

## Plan Self-Review

Spec coverage:

- Local-first service readiness is covered by Tasks 1, 2, 8, and 10.
- Real user ingestion is covered by Task 3.
- BYOK AI provider support is covered by Task 4.
- Review and confirmed-data integrity are covered by Task 5.
- Validation and export quality are covered by Tasks 6 and 7.
- Verification depth is covered by Task 9.

Placeholder scan:

- No implementation step depends on an unspecified future module except where the task creates that module first.
- PDF support is explicitly excluded from this roadmap until a separate dependency review is approved.

Type consistency:

- Existing names are preserved: `ProjectWorkspace`, `AiAnalysisResult`, `AiProviderConfig`, `ExportType`, `ExportMode`, `validateWorkspace`, and `validateAiAnalysisResult`.
- New proposed modules have single responsibilities and do not replace existing deterministic domain/export modules.
