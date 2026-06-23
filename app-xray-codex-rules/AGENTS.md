# AGENTS.md

## Project Identity

This repository builds **App X-Ray**.

App X-Ray is a local-first, open-source app design tool for non-developer vibe coders.

The product helps users turn rough app ideas, PRDs, notes, and domain-specific descriptions into:

- App Map
- Data Map
- Flow Map
- Missing Parts
- AI build prompts
- Markdown / Mermaid / JSON exports

App X-Ray does **not** replace Cursor, Codex, Lovable, Replit, or Bolt.

It sits before those tools and helps users understand what they are building before they ask AI tools to build it.

## Core Product Statement

> See your app before AI builds it.

## Primary User

The primary user is a non-developer vibe coder.

They usually have strong domain knowledge but weak software architecture knowledge.

Examples:

- field operators
- maintenance workers
- small business operators
- internal tool builders
- solo founders
- PM beginners
- no-code or low-code users moving toward AI coding tools

## Product Principle

AI suggests.
The user confirms.
The system preserves.

Never allow AI output to silently overwrite user-confirmed structure.

## Development Principles

1. Prefer simple, explicit domain models.
2. Treat AI output as draft data, never canonical data.
3. Keep local-first behavior as the default.
4. Avoid SaaS assumptions unless explicitly requested.
5. Keep terminology friendly for non-developers.
6. Developer terms may exist internally, but UI copy should use plain language.
7. All exports must be generated from confirmed structured data, not directly from AI text.
8. Use deterministic logic for validation, rendering, diffing, and export.
9. Use AI only for interpretation, extraction, explanation, and prompt writing.
10. Keep each implementation step small and reviewable.

## Default Technical Direction

Preferred architecture:

- Desktop-first or local web-first
- Tauri-compatible structure if desktop packaging is needed
- React + TypeScript for UI
- SQLite or local file persistence
- Provider-agnostic AI adapter layer
- BYOK AI connection
- OpenRouter OAuth can be added later
- Markdown, Mermaid, and JSON export

Do not introduce a cloud backend, paid SaaS billing, user accounts, or hosted workspace unless a task explicitly requires it.

## Required Source of Truth

The canonical project structure must be stored as typed data:

- Project
- SourceDocument
- Requirement
- Screen
- Feature
- DataObject
- DataField
- DataRelation
- UserRole
- Permission
- Flow
- FlowStep
- Issue
- ExportArtifact
- TemplateManifest

AI text is not the source of truth.

## Suggested Status Model

Every AI-derived object should support a lifecycle status:

- `suggested`
- `accepted`
- `edited`
- `rejected`
- `deferred`

Only `accepted` and `edited` records should be used for canonical exports by default.

## UI Language Rule

Use user-friendly wording in visible UI.

Examples:

| Internal term | UI label |
|---|---|
| Entity | 앱이 저장할 정보 |
| ERD | 정보 구조 |
| Schema | 정보 항목 |
| RBAC | 누가 무엇을 할 수 있는지 |
| CRUD | 추가·조회·수정·삭제 |
| Route | 화면 주소 |
| Acceptance Criteria | 완성 판단 기준 |
| Requirement Gap | 빠진 것 |
| User Flow | 사용 흐름 |

## Do Not Build

Do not build these unless explicitly requested:

- Full SaaS backend
- Subscription billing
- Multi-tenant team workspace
- Real-time collaboration
- Marketplace payments
- AI token resale
- Hosted AI proxy
- Automatic code generation that mutates a target codebase
- GitHub write integration
- Notion/Google Docs sync

## First-Class Features

Prioritize:

1. Idea / PRD input
2. AI analysis result as structured JSON
3. App Map
4. Data Map
5. Missing Parts
6. AI build prompt generation
7. Markdown export
8. Mermaid export
9. Template Manifest support

## Implementation Style

- Use strict TypeScript.
- Prefer pure functions for parsing, mapping, validation, export, and diff.
- Keep AI provider code behind adapters.
- Keep UI components dumb where possible.
- Store complex product state in explicit domain objects.
- Avoid global implicit state.
- Avoid magic strings; define enums or literal unions.
- Write small tests for deterministic logic.

## Definition of Done

A task is done only when:

- It preserves the AI-draft vs confirmed-data boundary.
- It does not break existing exports.
- It has sensible empty states.
- It handles missing or partial AI output.
- It keeps user edits intact.
- It is typed.
- It can be tested or manually verified.
