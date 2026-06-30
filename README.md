# App X-Ray

> See your app before AI builds it.

App X-Ray는 비개발자 vibe coder가 앱 아이디어, PRD, 업무 메모를 AI 코딩 도구에 넘기기 전에 구조화된 앱 지도로 정리하도록 돕는 local-first 오픈소스 도구입니다.

App X-Ray는 코드를 직접 생성하거나 대상 저장소를 수정하지 않습니다. 사용자가 확인한 구조를 바탕으로 App Map, Data Map, 빠진 것, flow 기반 빌드 프롬프트, Markdown/Mermaid/JSON export를 만듭니다.

## Why This Exists

도메인 지식이 충분해도 화면, 데이터, 권한, 사용 흐름을 소프트웨어 구조로 바꾸는 일은 어렵습니다. App X-Ray는 AI가 만들기 전에 사용자가 무엇을 만들려는지 먼저 볼 수 있게 해, 불명확한 프롬프트가 불명확한 앱으로 이어지는 문제를 줄입니다.

## Product Boundary

App X-Ray는 local-first 제품입니다.

- 프로젝트 데이터는 브라우저 `localStorage`와 사용자가 내려받는 workspace backup에 저장됩니다.
- 숨겨진 SaaS backend, hosted workspace, login, billing, marketplace, token resale은 없습니다.
- AI output은 초안입니다. 사용자가 `accepted` 또는 `edited`로 확인한 구조만 기본 export에 포함됩니다.
- AI API key는 브라우저 로컬 설정에만 저장되며 export, prompt, workspace backup에 포함되면 안 됩니다.
- Codex, Cursor, Lovable, Replit, Bolt를 대체하지 않고 그 전에 구조를 정리합니다.

자세한 서비스 기준은 [docs/product/service-readiness.md](docs/product/service-readiness.md)를 보세요. 저장소와 export 계약은 [docs/product/local-first-data-contract.md](docs/product/local-first-data-contract.md)를 보세요. 브라우저-only와 desktop packaging 판단은 [docs/product/desktop-packaging-decision.md](docs/product/desktop-packaging-decision.md)에 기록되어 있습니다.

## Supported Imports

현재 지원하는 입력은 다음과 같습니다.

| 입력 | 지원 상태 | 설명 |
|---|---:|---|
| 직접 붙여넣은 텍스트 | 지원 | PRD, 아이디어, 업무 메모를 source text로 저장합니다. |
| `.md` | 지원 | Markdown 원문으로 가져옵니다. |
| `.markdown` | 지원 | Markdown 원문으로 가져옵니다. |
| `.txt` | 지원 | 일반 텍스트 원문으로 가져옵니다. |
| `.csv` | 지원 | header를 감지해 구조화된 source text로 가져옵니다. |
| `.json` | 지원 | 유효한 JSON을 pretty-printed source text로 가져옵니다. |
| `.pdf` | 미지원 | PDF parsing은 별도 task에서 dependency 승인 후 다룹니다. |

## AI Providers

Mock 분석은 offline deterministic fixture로 동작합니다. BYOK 설정에서는 OpenAI, Anthropic, Google Gemini, OpenRouter를 선택할 수 있습니다.

- API key는 브라우저 로컬 설정에만 저장됩니다.
- provider를 바꾸면 이전 provider의 key는 재사용하지 않도록 비웁니다.
- provider 응답은 App X-Ray 분석 계약 검증을 통과해야 workspace에 반영됩니다.
- 브라우저 BYOK 호출은 provider CORS 정책에 막힐 수 있습니다. 이 경우 mock mode나 future desktop bridge가 안전한 fallback입니다.

## Supported Exports

기본 export는 `accepted`와 `edited` 상태의 confirmed data만 사용합니다. `suggested`, `rejected`, `deferred`는 audit trail 모드에서만 포함할 수 있습니다.

| Export | 파일 예시 | 용도 |
|---|---|---|
| Markdown | `app-xray-project.md` | 사람이 읽는 앱 구조 문서 |
| App Map Mermaid | `app-xray-project-app-map.mmd` | 화면 관계 다이어그램 |
| Data Map Mermaid | `app-xray-project-data-map.mmd` | 데이터 관계 다이어그램 |
| JSON | `app-xray-project.json` | confirmed structured data |
| Codex Prompt | `app-xray-project-codex.md` | Codex에 전달할 빌드 프롬프트 |
| Cursor Prompt | `app-xray-project-cursor.md` | Cursor에 전달할 빌드 프롬프트 |
| GitHub Issues Markdown | `app-xray-project-github-issues.md` | 구현 issue 초안 |
| Bundle JSON | `app-xray-project-bundle.json` | 위 export들을 하나로 묶은 bundle |
| Workspace Backup | `app-xray-workspace-project.json` | local workspace 이동/복구용 backup |

## Development

**Prerequisites**: Node.js 20+ 권장, npm

```bash
npm install
npm run dev
```

기본 dev server는 `127.0.0.1`에서 실행됩니다.

품질 확인:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

개발 중 생성되는 주요 출력:

- `dist/`: TypeScript compile output
- `app-dist/`: Vite production build output

## Core Workflow

```text
Idea / PRD / Notes
→ App X-Ray analysis
→ 사용자가 suggested 구조를 검토
→ accepted / edited 구조 확정
→ App Map / Data Map / Missing Parts 확인
→ Markdown / Mermaid / JSON / Prompt export
→ Codex / Cursor / Lovable / Replit / Bolt
```

## Product Rules

App X-Ray의 핵심 원칙은 다음과 같습니다.

```text
AI suggests.
The user confirms.
The system preserves.
```

제품 규칙과 Codex 작업 지침은 [app-xray-codex-rules](app-xray-codex-rules/)에 있습니다.
