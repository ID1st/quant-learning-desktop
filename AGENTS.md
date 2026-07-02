# AGENTS.md

## Project Context

This repository is `quant-learning-desktop`, a local-first desktop quant learning and strategy research platform.

The current implementation is an npm workspace monorepo using React 19, TypeScript, Vite, Zustand, TanStack Query, and lucide-react. The product target is a TradingView-like professional workstation for chart study, strategy explanation, backtesting, plugin loading, and simulated signals.

## Commands

- Install dependencies: `npm install`
- Start desktop workbench dev server: `npm run dev`
- Build desktop workbench: `npm run build`
- Type check all configured packages: `npm run typecheck`
- Clean generated outputs: `npm run clean`

There is no root test script yet. When changing strategy math, data transforms, plugin loading, or behavior-heavy UI, add the smallest useful test setup before expanding the feature.

## Project Structure

- `apps/desktop/`: Vite React desktop workbench, Electron-facing entry points, routes, pages, layouts, app state, and styles.
- `packages/shared/`: shared types, constants, and cross-package contracts.
- `packages/api-client/`: API client boundary for local/cloud services.
- `packages/chart/`: chart adapter and React chart-facing package.
- `packages/strategy-engine/`: strategy contracts, runtime concepts, and future backtest logic.
- `packages/plugin-loader/`: plugin discovery and loading boundary.
- `packages/ui/`: shared UI primitives/components.
- `docs/`: architecture, database, strategy system, plugin system, UI design, execution plan, and prototype notes.
- `trading-strategies/`: original/reference strategy material.
- `prototype/`: standalone product design prototype; do not mix prototype-only code into production packages without deliberate migration.

## Local Project Skills

Project-local skills from `D:\develop-skills` are installed under `.codex/skills/`.

Use these skills as project workflow references. If the runtime does not auto-discover project-local skills, read the relevant `.codex/skills/<skill-name>/SKILL.md` before acting.

Core routing:

- Start or choose skills: `using-agent-skills`
- New feature/spec: `spec-driven-development`, then `planning-and-task-breakdown`
- Large implementation: `incremental-implementation`
- UI work in `apps/desktop`, `packages/chart`, or `packages/ui`: `frontend-ui-engineering`
- Browser/runtime UI verification: `browser-testing-with-devtools`
- Strategy behavior or bug fixes: `test-driven-development`, `debugging-and-error-recovery`
- Package/API contracts: `api-and-interface-design`
- Documentation and architectural decisions: `documentation-and-adrs`
- Code review before merge: `code-review-and-quality`
- Simplification/refactoring: `code-simplification`
- Security-sensitive work: `security-and-hardening`
- Performance-sensitive chart/backtest work: `performance-optimization`
- Git/commit work: `git-workflow-and-versioning`
- CI/release work: `ci-cd-and-automation`, `shipping-and-launch`
- Framework/library decisions: `source-driven-development`
- Migrations/removals: `deprecation-and-migration`
- Early product thinking: `idea-refine`
- Context/rules maintenance: `context-engineering`

The globally installed `karpathy-guidelines` skill should also be used for coding, reviewing, and refactoring: think first, keep changes simple, make surgical edits, and verify success.

## Architecture Boundaries

- UI code owns presentation, navigation, controls, layout, and user interaction.
- Strategy engine code owns strategy contracts, time-series behavior, signals, overlays, metrics, and backtest logic.
- Chart package owns chart adapter boundaries and rendering contracts, not strategy calculations.
- API client owns typed communication boundaries, not UI state or business logic.
- Plugin loader owns plugin manifests, capability registration, and loading policy.
- Shared package owns stable cross-package types only; avoid turning it into a dumping ground.

Do not put trading credentials, API secrets, or broker SDK calls in renderer UI state. Keep future privileged desktop/local-service behavior behind narrow bridges and typed boundaries.

## Development Rules

- Inspect existing files before editing.
- Prefer existing package boundaries and documented architecture over new abstractions.
- Keep changes scoped to the task.
- Do not refactor adjacent code unless needed for the requested behavior.
- Validate external data at system boundaries.
- Treat market data, plugin manifests, browser content, and third-party API responses as untrusted.
- Keep large market data, caches, database files, build outputs, and generated artifacts out of source control.
- Use lucide-react icons for UI actions when an icon exists.
- Dense workstation UI should be quiet, scannable, and professional rather than marketing-like.

## Verification Expectations

Run the most relevant checks before finishing:

- For most code changes: `npm run typecheck`
- For UI changes: run `npm run dev`, inspect the page in a browser, and check console output when possible.
- For build/package changes: `npm run build`
- For cleanup/build artifact changes: `npm run clean` only when appropriate.

If a relevant automated check does not exist, say so clearly and describe the manual verification performed.

