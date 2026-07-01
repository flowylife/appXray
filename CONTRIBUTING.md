# Contributing to App X-Ray

Thanks for helping improve App X-Ray.

App X-Ray is a local-first tool for turning app ideas, PRDs, and work notes into reviewable app structure before AI coding begins. Contributions should preserve that boundary.

## Product Principles

- Keep App X-Ray local-first.
- Do not add hidden hosted backends, accounts, billing, cloud workspaces, marketplace payment, or AI token resale.
- Treat AI output as suggested structure until the user confirms it.
- Preserve user-confirmed `accepted` and `edited` structure across re-analysis, backup import, and template flows.
- Keep API keys browser-local and out of exports, prompts, logs, backups, fixtures, and tests.
- Default exports must include confirmed data only unless the user explicitly chooses an audit trail mode.

## Development Setup

```bash
npm install
npm run dev
```

The Vite dev server binds to `127.0.0.1` by default.

## Quality Checks

Run the relevant checks before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

If a check is not relevant or cannot be run, say that clearly in the pull request.

## Pull Request Scope

Keep pull requests focused and reviewable.

Good scopes:

- one user workflow
- one validation rule
- one export format improvement
- one storage or backup behavior
- one UI usability fix
- one documentation update

Avoid mixing unrelated UI, storage, AI provider, export, and tooling changes in one pull request.

## UI Contributions

For UI changes, include the expected states where applicable:

- loading
- empty
- error
- success
- invalid input
- partial failure

Check that the layout remains usable on desktop and narrow mobile viewports.

## AI Provider Contributions

Provider changes must:

- validate returned JSON against the App X-Ray analysis contract
- sanitize provider errors so API keys are not shown
- avoid writing keys to workspace backups or exports
- keep mock mode deterministic for offline testing

## Documentation

Update documentation when behavior, product boundaries, import/export support, or development commands change.

Useful references:

- `README.md`
- `docs/product/service-readiness.md`
- `docs/product/local-first-data-contract.md`
- `app-xray-codex-rules/`
