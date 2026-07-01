# App X-Ray

> AI가 만들기 전에 앱을 먼저 보세요.

[English](README.md)

App X-Ray는 앱 아이디어, PRD, 업무 메모를 AI 코딩 도구에 넘기기 전에 화면, 데이터, 권한, 사용 흐름, 빠진 결정을 구조화해서 검토할 수 있게 해주는 local-first 오픈소스 도구입니다.

App X-Ray는 코드를 직접 생성하거나 대상 저장소를 수정하지 않습니다. 대신 사용자가 만들려는 앱의 구조를 먼저 확인하고, 확정된 내용만 Codex, Cursor, Lovable, Replit, Bolt 같은 도구에 전달할 수 있게 정리합니다.

## 왜 필요한가

AI 코딩은 앱 구조가 명확할수록 잘 작동합니다. 도메인 지식이 충분해도 화면, 데이터 모델, 권한, 워크플로를 구현 가능한 구조로 바꾸는 일은 어렵습니다.

App X-Ray는 구현 전에 앱의 지도를 먼저 보여줘서, 모호한 프롬프트가 모호한 앱으로 이어지는 문제를 줄입니다.

## 스크린샷

### 검토 워크벤치

![App X-Ray 검토 워크벤치](docs/assets/screenshots/app-xray-review-desktop.png)

### 앱 지도

![App X-Ray 앱 지도](docs/assets/screenshots/app-xray-maps-desktop.png)

### 내보내기 점검

![App X-Ray 내보내기 화면](docs/assets/screenshots/app-xray-export-desktop.png)

### 모바일 검토 화면

![App X-Ray 모바일 검토](docs/assets/screenshots/app-xray-review-mobile.png)

## 핵심 원칙

```text
AI suggests.
The user confirms.
The system preserves.
```

AI 결과는 초안입니다. 기본 export에는 사용자가 `accepted` 또는 `edited`로 확정한 구조만 포함됩니다.

## 주요 기능

- 아이디어, PRD, 메모, Markdown, TXT, CSV, JSON을 구조화된 앱 지도로 변환합니다.
- 화면, 기능, 데이터 객체, 필드, 관계, 역할, 권한, 흐름, 빠진 결정을 검토 가능한 AI 제안으로 보여줍니다.
- 제안을 확정, 수정 확정, 제외, 나중에 결정, 일괄 검토, 되돌리기 할 수 있습니다.
- AI 재분석과 복구 흐름에서도 사용자가 확정한 결정을 보존합니다.
- export 전 검증 결과를 보여주고 영향을 받는 검토 항목으로 이동할 수 있습니다.
- Markdown, Mermaid, JSON, CSV, Codex/Cursor 프롬프트, GitHub issue 초안, bundle JSON을 내보냅니다.
- 프로젝트를 브라우저 로컬에 저장하고 workspace backup/restore를 지원합니다.
- 앱 안의 언어 선택 기능으로 한국어 또는 영어 UI를 사용할 수 있습니다.
- 일상적으로 더 쉽게 쓰기 위해 local Electron 데스크톱 앱으로 패키징할 수 있습니다.
- 오프라인 deterministic mock 분석과 OpenAI, Anthropic, Google Gemini, OpenRouter BYOK 설정을 지원합니다.

## 제품 경계

App X-Ray는 의도적으로 local-first입니다.

- 프로젝트 데이터는 브라우저 `localStorage`와 사용자가 내려받는 workspace backup에 저장됩니다.
- 숨겨진 SaaS backend, hosted workspace, login, billing, marketplace, token resale은 없습니다.
- AI API key는 브라우저 로컬 설정에만 저장됩니다.
- API key는 export, prompt, backup, fixture, log, test output에 포함되면 안 됩니다.
- 브라우저 BYOK 호출은 provider CORS 정책에 막힐 수 있습니다. Mock mode는 안전한 오프라인 fallback입니다.
- App X-Ray는 AI 코딩 도구를 대체하지 않습니다. 더 좋은 입력을 준비하는 계획/검토 도구입니다.

관련 문서:

- [서비스 준비 기준](docs/product/service-readiness.md)
- [Local-first 데이터 계약](docs/product/local-first-data-contract.md)
- [Desktop packaging 판단](docs/product/desktop-packaging-decision.md)
- [수동 QA 체크리스트](docs/product/manual-qa-checklist.md)

## 지원 import

| 입력 | 상태 | 설명 |
|---|---:|---|
| 붙여넣은 텍스트 | 지원 | PRD, 앱 아이디어, 업무 메모를 source text로 저장합니다. |
| `.md` | 지원 | Markdown source text로 가져옵니다. |
| `.markdown` | 지원 | Markdown source text로 가져옵니다. |
| `.txt` | 지원 | 일반 텍스트로 가져옵니다. |
| `.csv` | 지원 | Header를 감지해 구조화된 source text로 변환합니다. |
| `.json` | 지원 | 유효한 JSON을 pretty-print된 source text로 변환합니다. |
| `.pdf` | 미지원 | PDF parsing은 parser dependency 승인 후 별도 범위에서 다룹니다. |

## 지원 export

기본 export는 `accepted`와 `edited` 상태의 confirmed data만 사용합니다. `suggested`, `rejected`, `deferred`는 명시적인 audit trail mode에서만 포함됩니다.

| Export | 예시 파일 | 용도 |
|---|---|---|
| Markdown | `app-xray-project.md` | 사람이 읽는 앱 구조 문서 |
| App Map Mermaid | `app-xray-project-app-map.mmd` | 화면 관계 다이어그램 |
| Data Map Mermaid | `app-xray-project-data-map.mmd` | 데이터 관계 다이어그램 |
| JSON | `app-xray-project.json` | 확정된 구조화 데이터 |
| Data Objects CSV | `app-xray-project-data-objects.csv` | 스프레드시트용 확정 데이터 객체 |
| Issues CSV | `app-xray-project-issues.csv` | 스프레드시트용 확정된 빠진 결정 |
| Codex Prompt | `app-xray-project-codex.md` | Codex용 빌드 프롬프트 |
| Cursor Prompt | `app-xray-project-cursor.md` | Cursor용 빌드 프롬프트 |
| GitHub Issues Markdown | `app-xray-project-github-issues.md` | 구현 issue 초안 |
| Bundle JSON | `app-xray-project-bundle.json` | export 산출물을 묶은 bundle |
| Workspace Backup | `app-xray-workspace-project.json` | 로컬 workspace 이동/복구 |

## 기본 흐름

```text
Idea / PRD / notes
-> App X-Ray analysis
-> suggested 구조 검토
-> accept / edit / reject / defer
-> App Map, Data Map, Missing Parts 확인
-> confirmed 구조와 build prompt export
-> Codex, Cursor, Lovable, Replit, Bolt로 전달
```

## 개발

### 요구사항

- Node.js 20+
- npm

### 웹 앱 설치와 실행

```bash
npm install
npm run dev
```

Vite dev server는 기본적으로 `127.0.0.1`에 바인딩됩니다.

### 데스크톱 앱

App X-Ray는 local Electron 데스크톱 앱으로도 실행할 수 있습니다. 데스크톱 셸은 같은 local-first React 앱을 로드하며, Electron renderer는 `contextIsolation`, 비활성화된 Node integration, 최소 preload bridge로 격리됩니다.

```bash
npm run electron:dev
```

패키지된 macOS 데스크톱 빌드를 만들려면 다음 명령을 사용합니다.

```bash
npm run package:dir
npm run package:mac
```

생성된 데스크톱 패키지는 `release/`에 저장됩니다.

- `release/mac-arm64/App X-Ray.app`: 로컬 테스트용 unpacked app
- `release/App X-Ray-0.0.0-arm64.dmg`: macOS 설치 이미지
- `release/App X-Ray-0.0.0-arm64-mac.zip`: 압축된 macOS 앱

macOS 빌드는 현재 기본적으로 서명되지 않으므로, 처음 실행할 때 로컬 Gatekeeper 정책에 따라 Finder에서 수동으로 열어야 할 수 있습니다.

### 품질 확인

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

생성 산출물:

- `dist/`: TypeScript compile output
- `app-dist/`: Vite production build output
- `release/`: Electron desktop package output
- `test-results/`: Playwright test output
- `playwright-report/`: Playwright HTML report

## 저장소 구조

```text
src/
  ai/            AI adapter, BYOK provider, structured prompt logic
  app/           React shell에서 분리한 앱 레벨 workflow
  components/    Review, map, export UI
  domain/        App X-Ray data model, lifecycle, validation, routing
  export/        Markdown, Mermaid, JSON, CSV, prompt, bundle export
  i18n.ts        한국어/영어 UI label
  storage/       Local project repository, backup, autosave snapshot
electron/
  main.cjs       보안 설정이 적용된 Electron main process
  preload.cjs    최소 isolated preload bridge
test/
  e2e/           Playwright browser flows
  *.test.mjs     Domain, UI, storage, AI, export test
docs/product/    Product boundary, service readiness, QA, packaging docs
app-xray-codex-rules/
  App X-Ray 개발에 사용하는 제품/엔지니어링 규칙
```

## 기여

PR을 열기 전에 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어주세요.

요약:

- local-first 경계를 유지합니다.
- 사용자가 확정한 결정을 보존합니다.
- API key를 export, prompt, backup, fixture, log, test output에 넣지 않습니다.
- 기본 export는 confirmed-only를 유지합니다.
- 관련 검증을 실행하고, 실행하지 못한 항목은 명확히 적습니다.

## 보안

의심되는 취약점은 공개 issue로 올리지 마세요. [SECURITY.md](SECURITY.md)를 확인하세요.

## 라이선스

MIT. [LICENSE](LICENSE)를 확인하세요.
