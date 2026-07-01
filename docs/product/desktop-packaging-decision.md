# App X-Ray Desktop Packaging Decision

## Decision

App X-Ray should ship the current service-readiness release as a browser-only local-first app. Do not add Electron or Tauri yet.

Revisit desktop packaging after the browser release has enough real BYOK usage to show whether CORS, file storage, and key handling are blocking normal users.

## Browser-Only Constraints

- Workspace data is stored in browser `localStorage`, so capacity and durability depend on the browser profile.
- Browser BYOK calls can be blocked by provider CORS policy, network policy, or extension settings.
- API keys are visible to the browser runtime by design. App X-Ray must not send them to a hidden backend, include them in exports, or include them in backups.
- File access is user-mediated through upload/download controls. The app cannot manage a native project folder directly.
- There is no native encrypted keychain. API key storage is browser-local storage, not OS credential storage.
- Recovery depends on local snapshots, browser persistence, and user-downloaded workspace backups.

## Desktop Benefits

- Native file storage can make workspace backups more durable and easier to locate.
- OS keychain integration can store provider keys more safely than browser `localStorage`.
- A local desktop bridge can avoid browser CORS failures while preserving the no-hosted-backend boundary.
- Native file dialogs can support safer import/export paths and larger source files.
- Desktop packaging can eventually support local model adapters without changing the core domain model.

## Options Compared

| Option | Benefits | Costs | Decision |
|---|---|---|---|
| Browser-only | Lowest maintenance, no native dependency, easiest OSS review, works with current tests | localStorage limits, browser CORS risk, no keychain | Ship now |
| Electron | Mature desktop APIs, Node bridge, keychain/file integrations available | larger bundle, native security surface, updater/signing burden | Defer |
| Tauri | Smaller desktop shell, Rust-native system integration, good security model | adds Rust toolchain, plugin choices, signing/updater work | Defer |
| PWA | Installable browser experience without native shell | still has browser storage/CORS/key limitations | Possible later, not required now |

## Release Gate

The browser-only release remains acceptable if these checks pass:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Manual QA should cover project create, source import, mock analysis, BYOK error handling, review, export, backup import, autosave restore, and reload persistence.

## Next Review Trigger

Re-open desktop packaging if at least one of these becomes a repeated user blocker:

- Provider CORS prevents common BYOK usage.
- Users need OS keychain storage before entering real API keys.
- Source files or workspaces exceed reliable browser storage limits.
- Users need native project-folder workflows instead of manual backup downloads.
- A local model bridge becomes a core product requirement.
