# ADR-001: Pause renderer plugin execution until an isolated host exists

## Status

Accepted

## Date

2026-07-14

## Context

The trusted-local plugin MVP imported installed JavaScript source directly into the Electron renderer. A narrow registration context does not isolate the module itself: imported code can still access renderer globals and network APIs. The renderer also hosts the chart, strategy UI, and desktop preload bridge, so executing arbitrary plugin source there creates an unacceptable privilege boundary.

## Decision

- Keep plugin installation, manifest validation, listing, enable/disable, failure records, and uninstall available.
- Block `readEnabledRuntimeModules` at the main-process IPC boundary, so plugin source is never returned to the renderer.
- Report the runtime as temporarily unavailable with a Chinese user-facing explanation.
- Re-enable third-party execution only after strategy and indicator plugins run in an isolated Worker or Electron utility process with explicit capability messaging, resource limits, and termination controls.

Built-in strategies and indicators are not affected because they are compiled application modules rather than installed third-party source.

## Alternatives Considered

### Continue trusted-local renderer imports

Rejected because trust is not an enforceable technical boundary and the imported module can access more than the declared plugin context.

### Block selected global names in plugin source

Rejected because static string checks are bypassable and do not provide runtime isolation.

### Implement the full isolated host in this hardening slice

Deferred because the current strategy contract is synchronous and a correct process boundary requires an asynchronous message contract, lifecycle limits, and migration testing.

## Consequences

- Installed third-party plugin strategies and indicators do not execute temporarily.
- Plugin management remains usable and installed packages are preserved.
- A future isolated host can replace the blocked IPC operation without changing chart, strategy, cache, or provider contracts.
