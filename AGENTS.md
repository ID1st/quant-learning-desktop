# AGENTS.md

## Project Context

This workspace is for the Quant Learning Desktop System, a desktop learning system for quantitative trading and analysis.

Current state: the project directory does not yet contain application source code, package manifests, tests, or build scripts. Treat this repository as an early-stage project scaffold until those files are added.

## Installed Skills

- `karpathy-guidelines` has been installed into the local Codex skills directory.
- Restart Codex after installation so future sessions can discover and use the skill automatically.
- Use the skill when writing, reviewing, or refactoring code. Its main bias is: think first, keep changes simple, make surgical edits, and verify success with concrete checks.

## Development Principles

- Prefer the smallest implementation that solves the requested problem.
- Do not add speculative frameworks, services, abstractions, or configuration before the project needs them.
- State assumptions before implementing when requirements are ambiguous.
- Keep changes local to the requested feature or fix.
- Match the style and architecture already present once the codebase exists.
- Remove only unused code created by the current change. Do not clean unrelated code unless explicitly asked.
- Define verifiable success criteria for non-trivial work before editing.

## Expected Project Shape

When the application is created, keep the structure easy to inspect:

- `src/` for application source code.
- `tests/` for automated tests.
- `docs/` for architecture notes, user flows, and learning content plans.
- `data/` for small sample datasets only. Large market data should stay outside Git or be fetched by scripts.
- `scripts/` for repeatable local setup, data import, and maintenance tasks.

If the desktop app stack is not chosen yet, decide deliberately and document the choice before scaffolding. Reasonable future options include Electron, Tauri, Python desktop tooling, or a web frontend packaged for desktop.

## Quant Learning System Guidance

The application should separate these concerns as it grows:

- Learning content: lessons, examples, quizzes, notebooks, or strategy walkthroughs.
- Market data: ingestion, normalization, caching, and sample fixtures.
- Strategy logic: indicators, signals, backtests, risk controls, and portfolio simulation.
- User interface: navigation, charts, study progress, parameter controls, and result comparison.
- Persistence: local settings, learning progress, cached datasets, and user-created strategies.

Avoid mixing UI code directly with trading logic. Strategy and backtest behavior should be testable without launching the desktop shell.

## Verification Expectations

For every code change, run the most relevant available checks:

- Unit tests for strategy math, data transforms, and backtest behavior.
- Type checks or lint checks when the chosen stack supports them.
- UI smoke tests for navigation, charts, and desktop packaging flows.
- Manual verification notes when automated tests do not yet exist.

If no test framework exists yet, add only the minimal test setup needed for the first meaningful behavior.

## Agent Workflow

Before implementation:

1. Inspect the existing files.
2. Identify the current stack and conventions.
3. State assumptions when the request has multiple plausible meanings.
4. Plan only as much as needed for the task size.

During implementation:

1. Make focused edits.
2. Prefer existing helpers and patterns.
3. Keep generated files, caches, and large datasets out of source control unless intentionally required.

Before finishing:

1. Run relevant checks.
2. Summarize changed files and behavior.
3. Mention any checks that could not be run.
4. Call out follow-up decisions when the project is still missing core structure.
