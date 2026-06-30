# App X-Ray Service Readiness

이 문서는 App X-Ray가 “서비스 수준으로 사용할 수 있다”고 판단하는 기준을 정의합니다. 목표는 local-first, open-source 제품 경계를 유지하면서 비개발자 사용자가 반복적으로 안전하게 프로젝트를 분석, 검토, export할 수 있게 만드는 것입니다.

## Service-Level Definition

App X-Ray는 사용자가 다음 작업을 반복할 수 있을 때 service-ready로 봅니다.

1. 실제 앱 아이디어, PRD, 업무 메모로 로컬 프로젝트를 만들거나 불러옵니다.
2. Mock 분석 또는 사용자가 직접 연결한 BYOK AI 설정으로 구조 초안을 생성합니다.
3. AI가 만든 `suggested` 구조를 검토하고 `accepted`, `edited`, `rejected`, `deferred` 상태로 결정합니다.
4. 사용자가 확정한 구조가 AI 재분석, backup import, template 적용 과정에서 조용히 덮어써지지 않습니다.
5. validation error와 warning을 화면에서 이해하고 export 전에 수정할 수 있습니다.
6. Codex, Cursor, Lovable, Replit, Bolt, GitHub issue workflow에 유용한 deterministic export를 생성합니다.
7. 브라우저를 닫았다 열어도 같은 workspace를 복구합니다.
8. workspace backup을 내려받고 다시 가져올 수 있습니다.
9. 숨겨진 backend, account, billing, cloud workspace, token resale 없이 사용할 수 있습니다.

## Supported Workflows

### Local Project Workflow

- 새 프로젝트를 만들고 source text를 저장합니다.
- 여러 프로젝트를 `localStorage` collection으로 보관합니다.
- active project를 전환합니다.
- workspace backup JSON을 내려받고 다시 가져옵니다.

### Source Input Workflow

- 사용자가 PRD, 아이디어, 업무 메모를 직접 붙여넣습니다.
- `.md`, `.markdown`, `.txt` 파일을 source document로 가져옵니다.
- source document는 versioned local workspace data로 남습니다.
- PDF, CSV, JSON import는 현재 release surface가 아니라 이후 source ingestion task 범위입니다.

### Review Workflow

- AI 또는 template이 만든 구조는 기본적으로 `suggested`입니다.
- 사용자는 제안을 `accepted`, `edited`, `rejected`, `deferred`로 결정합니다.
- `accepted`와 `edited`만 기본 export에 포함됩니다.
- `rejected`와 `deferred`는 기본 export에서 제외되며 audit trail 용도로만 다룹니다.

### Export Workflow

- Markdown, App Map Mermaid, Data Map Mermaid, JSON, Codex Prompt, Cursor Prompt, GitHub Issues Markdown, Bundle JSON을 생성합니다.
- 기본 export mode는 `confirmedOnly`입니다.
- audit trail mode는 검토 이력을 확인하기 위한 선택 모드이며 기본 동작이 아닙니다.
- 같은 workspace 상태는 같은 export content를 만들어야 합니다.

### AI Settings Workflow

- 현재 mock adapter는 deterministic 분석에 사용됩니다.
- provider 설정과 API key 입력은 browser-local settings에 저장됩니다.
- API key 원문은 public config, export, prompt, workspace backup에 포함하지 않습니다.
- 실제 provider adapter는 local-first BYOK 경계를 유지하는 별도 task에서 확장합니다.

## Non-Goals

다음은 service-readiness의 기본 범위가 아닙니다.

- hosted SaaS backend
- login, billing, subscription
- multi-tenant team workspace
- real-time collaboration
- marketplace payment, seller dashboard, ranking, review
- AI token resale 또는 hosted AI proxy
- GitHub write integration
- Notion, Google Docs, Linear, Jira sync
- 대상 codebase를 자동으로 수정하는 code generation
- PDF parsing dependency 추가
- 서버에 workspace 또는 API key 저장

## Release Checklist

출시 전에는 아래 항목을 확인합니다.

- [ ] README에서 제품 목적, local-first 경계, 지원 import/export, 개발 명령을 확인할 수 있습니다.
- [ ] 기본 export가 `accepted`와 `edited`만 포함한다는 점이 문서와 UI에 드러납니다.
- [ ] API key가 browser-local 설정에만 저장되고 export, prompt, backup에 포함되지 않습니다.
- [ ] workspace backup import가 malformed JSON과 최소 backup identity 오류를 구분해 실패합니다.
- [ ] 기존 confirmed/edited 구조가 AI rerun, backup import, template 적용으로 덮어써지지 않습니다.
- [ ] empty, loading, error, success 상태가 주요 workflow에 존재합니다.
- [ ] `npm run typecheck`가 통과합니다.
- [ ] `npm test`가 통과합니다.
- [ ] `npm run build`가 통과합니다.
- [ ] browser manual QA에서 create/import/review/export/backup/reload workflow를 확인합니다.

## Current Readiness Notes

이 문서는 service-ready 목표와 현재 release surface를 함께 설명합니다. 현재 구현의 기본 분석 경로는 mock adapter이며, 실제 BYOK provider 호출은 roadmap의 별도 task에서 adapter 뒤에 추가해야 합니다. 이 확장은 browser-local API key 원칙과 no hidden backend 원칙을 유지해야 합니다.
