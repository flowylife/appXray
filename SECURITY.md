# Security Policy

## Supported Versions

App X-Ray is pre-1.0 software. Security fixes are applied to the default branch until versioned releases are introduced.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Report security issues through GitHub private vulnerability reporting if it is enabled for this repository. If private reporting is not available, contact the maintainers through the repository owner profile and include only the minimum details needed to coordinate a secure report.

## Security Boundaries

App X-Ray is designed as a local-first browser application.

- Project data is stored in browser `localStorage` and user-downloaded workspace backups.
- There is no hidden hosted workspace, login system, billing system, or server-side project store.
- BYOK AI provider keys are browser-local settings.
- API keys must not be included in exports, prompts, logs, workspace backups, fixtures, or test output.
- Default exports include only confirmed `accepted` and `edited` data.

## In Scope

- API key leakage through UI, logs, prompts, backups, exports, tests, or error messages
- workspace backup import issues that could corrupt or silently replace confirmed data
- export behavior that includes rejected, deferred, or unconfirmed data without explicit audit mode
- dependency or build configuration issues that affect local users
- browser-side injection issues caused by imported source documents or provider responses

## Out of Scope

- attacks requiring direct access to a user's unlocked browser profile or local machine
- provider-side incidents in OpenAI, Anthropic, Google Gemini, OpenRouter, or other third-party APIs
- issues in unsupported forks or modified deployments
- social engineering against maintainers or users

## Maintainer Response

Maintainers should acknowledge valid reports, avoid public disclosure until a fix is available, and document the fix in the release or pull request notes.
