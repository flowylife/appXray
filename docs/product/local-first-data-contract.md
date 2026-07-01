# Local-First Data Contract

이 문서는 App X-Ray의 browser-local 저장소, backup JSON, export 상태 규칙, AI key 처리 계약을 정의합니다. 이 계약은 제품 경계를 보호하기 위한 문서이며, 숨겨진 SaaS/backend 저장소를 전제로 하지 않습니다.

## Storage Scope

App X-Ray는 현재 브라우저 `localStorage`를 사용합니다. 데이터는 같은 browser profile과 origin 안에 남으며, 사용자가 브라우저 데이터를 지우면 삭제될 수 있습니다.

서버 저장, 계정 동기화, 팀 workspace, billing, token resale은 기본 제품 범위가 아닙니다.

## localStorage Keys

| Key | Status | Stored value | Notes |
|---|---|---|---|
| `app-xray.projects.v1` | current | `ProjectCollection` JSON | 여러 workspace와 active project id를 저장합니다. |
| `app-xray.workspace.v1` | legacy | 단일 `ProjectWorkspace` JSON | 이전 단일 workspace 저장소입니다. current collection이 없을 때 migration source로 읽습니다. |
| `app-xray.ai-settings.v1` | current | `AiProviderConfig` JSON | provider, modelName, `apiKey`, `apiKeyPresent`, lastValidatedAt을 browser-local로 저장합니다. |

`app-xray.projects.v1`의 개념적 구조:

```json
{
  "activeProjectId": "project_123",
  "workspaces": [],
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

각 `workspaces[]` 항목은 `ProjectWorkspace`입니다.

## ProjectWorkspace Shape

Workspace는 다음 최상위 필드를 갖습니다.

| Field | Description |
|---|---|
| `project` | 프로젝트 이름, 설명, app type, 생성/수정 시간 |
| `sourceDocuments` | 붙여넣기 또는 파일 import로 생성된 versioned source documents |
| `objects` | requirements, screens, features, data objects, fields, relations, roles, permissions, flows, flow steps, issues |
| `buildPlanSuggestions` | AI가 제안한 build step 목록 |
| `lastAnalysis` | 마지막 분석 요약 |
| `analysisHistory` | 최근 분석 기록 |
| `lastStructureDiff` | 분석 rerun에서 생긴 구조 변경 요약 |
| `appliedTemplates` | 적용된 template metadata |
| `updatedAt` | workspace 수정 시간 |

## Backup Format

Workspace backup은 사용자가 내려받는 JSON 파일입니다. 파일명은 일반적으로 `app-xray-workspace-[project].json` 형태입니다.

Backup schema:

```json
{
  "schemaVersion": "1.0.0",
  "exportedAt": "2026-07-01T00:00:00.000Z",
  "workspace": {}
}
```

Current import rules:

- JSON parse에 실패하면 import를 거부합니다.
- `schemaVersion`이 `1.0.0`이 아니거나 `workspace.project`, `workspace.objects`가 없으면 App X-Ray backup으로 보지 않습니다.
- 현재 workspace가 있을 때 backup을 import하면 source document는 id 기준으로 추가하고, confirmed data는 보존하면서 suggestion set을 merge합니다.
- backup은 AI settings를 포함하지 않습니다.
- backup은 API key 원문을 포함하지 않습니다.

현재 import identity check는 최소 필드 중심입니다. 더 엄격한 `ProjectWorkspace` 전체 shape 검증과 복구 UI는 service-readiness roadmap의 backup/recovery task에서 강화합니다.

## Confirmed-Only Export Rule

모든 기본 export는 confirmed structured data에서 생성됩니다.

기본 포함 상태:

- `accepted`
- `edited`

기본 제외 상태:

- `suggested`
- `rejected`
- `deferred`

이 규칙은 Markdown, Mermaid, JSON, Codex Prompt, Cursor Prompt, GitHub Issues Markdown, Bundle JSON에 적용됩니다. audit trail mode는 검토 이력을 확인하기 위한 선택 모드이며, 기본 export 경로가 아닙니다.

AI output 원문이나 자유 형식 응답은 export의 최종 source of truth가 아닙니다. export는 typed workspace objects와 deterministic export 함수에서 생성되어야 합니다.

## Supported Export Payloads

| Export | Default data source |
|---|---|
| Markdown | confirmed workspace objects |
| App Map Mermaid | confirmed screens/features |
| Data Map Mermaid | confirmed data objects/relations |
| JSON | confirmed workspace objects plus project/source documents |
| Codex Prompt | confirmed screens/data/flows/issues and validation warnings |
| Cursor Prompt | confirmed screens/data/flows/issues and validation warnings |
| GitHub Issues Markdown | confirmed issues |
| Bundle JSON | generated export files |
| Workspace Backup | full local workspace, excluding AI settings |

## AI Key Handling

AI key handling is browser-local by design.

- API key 원문은 `app-xray.ai-settings.v1`에만 저장됩니다.
- UI는 key가 browser-local임을 알려야 합니다.
- `toPublicAiProviderConfig` 같은 public config 변환은 `apiKey` 원문을 제거해야 합니다.
- export, build prompt, workspace backup, validation report, public config에는 API key 원문을 넣지 않습니다.
- AI key를 logs, generated prompt, support artifact, sample fixture에 복사하지 않습니다.
- 실제 provider adapter를 추가할 때도 hidden backend/proxy를 전제로 하지 않습니다.

Browser-side BYOK 호출은 사용자의 브라우저 런타임에 key가 존재한다는 뜻입니다. 이 위험은 UI와 문서에서 명확히 설명하고, key를 원격 서비스나 export artifact에 몰래 복제하지 않는 것으로 통제합니다.

## Compatibility Rules

- 새 storage key를 추가할 때는 이 문서를 업데이트합니다.
- backup schema version을 바꾸면 migration 또는 compatibility note를 추가합니다.
- confirmed-only export 규칙을 바꾸는 변경은 breaking change로 취급합니다.
- AI settings와 workspace backup을 합치지 않습니다.
- login이나 server persistence를 추가하는 proposal은 local-first product boundary 변경으로 별도 검토해야 합니다.
