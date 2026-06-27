# Phase 3 Base Scaffold

## Scope

Phase 3 creates the formal application scaffold only. It does not implement authentication, registration, invite-code validation, LongPort binding, market-data sync, chart rendering, Pine conversion, strategy execution, database persistence, or plugin installation.

## Package Manager

`pnpm` is not installed on this machine, so the scaffold uses npm workspaces for the first runnable baseline.

The structure remains compatible with a future pnpm migration because workspace packages are already isolated under `apps/*` and `packages/*`.

## Added Structure

```text
apps/
  desktop/
    src/
      app/
      electron/
      layouts/
      pages/
      routes/
      state/
      theme/
      ui/
packages/
  api-client/
  chart/
  plugin-loader/
  shared/
  strategy-engine/
  ui/
scripts/
  clean.mjs
```

## Implemented Skeletons

- Monorepo workspace.
- React desktop renderer.
- Vite build pipeline.
- App shell layout.
- In-app route switcher.
- Zustand state store skeleton.
- TanStack Query provider.
- API client transport abstraction.
- Chart viewport wrapper placeholder.
- Plugin manifest and loader skeleton.
- Strategy interface, signal model, and registry skeleton.
- Theme token contract.
- Electron main/preload configuration placeholders.

## Business Logic Boundary

The following are intentionally not implemented:

- Real login or registration.
- Real API requests.
- LongPort SDK access.
- Local database access.
- Historical market data cache.
- TradingView/Lightweight Charts integration.
- Backtest engine.
- Pine Script parser/compiler.
- Preset strategy conversion.
- Plugin hot-loading.

## Verification

Run from the repository root:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

Default dev URL:

```text
http://127.0.0.1:5174
```

## Next Phase Gate

Phase 4 should start module-by-module, with confirmation after each module.

Recommended first module:

1. Authentication shell and local session state.
2. Registration and invite-code validation API contract.
3. Email verification contract.
4. LongPort API binding module.
