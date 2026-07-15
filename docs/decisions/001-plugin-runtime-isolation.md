# ADR-001: Isolate third-party plugin execution from the renderer

## Status

Implemented for strategy plugins on 2026-07-15

## Date

2026-07-14

## Context

The trusted-local plugin MVP imported installed JavaScript source directly into the Electron renderer. A narrow registration context does not isolate the module itself: imported code can still access renderer globals and network APIs. The renderer also hosts the chart, strategy UI, and desktop preload bridge, so executing arbitrary plugin source there creates an unacceptable privilege boundary.

## Decision

- Keep plugin installation, manifest validation, listing, enable/disable, failure records, and uninstall available.
- Remove `readEnabledRuntimeModules` from the preload and renderer contracts, so installed source never enters the renderer bundle or renderer memory.
- Start an Electron Utility Process host from the main process. The host receives only enabled module source and returns only validated strategy descriptors and JSON-safe strategy outputs.
- Execute each activation and strategy run in a Node `vm` context with imports disabled, a capability-only `registerStrategy` API, a 750 ms VM timeout, 256 KiB source limit, 5,000-bar input limit, 512 KiB output limit, and a 1,500 ms parent-process watchdog that terminates an unresponsive host.
- Keep indicator, data-source, and export plugin execution disabled until each gets its own asynchronous capability and rendering contract. A strategy plugin cannot obtain credentials, Electron APIs, provider instances, filesystem handles, network clients, or renderer globals.
- Keep `npm run smoke:plugin-runtime` as a production-build verification. It launches Electron, starts the actual Utility Process, activates an isolated fixture, runs it, and detects entry-path regressions caused by bundler code splitting.

Built-in strategies and indicators are not affected because they are compiled application modules rather than installed third-party source.

## Alternatives Considered

### Continue trusted-local renderer imports

Rejected because trust is not an enforceable technical boundary and the imported module can access more than the declared plugin context.

### Block selected global names in plugin source

Rejected because static string checks are bypassable and do not provide runtime isolation.

### Utility Process as a complete hostile-code sandbox

Rejected as an absolute claim. Utility Process gives process and privilege separation, but Electron documents it as a Node-enabled child process rather than a complete security sandbox. The additional VM restrictions and capability protocol reduce exposure; code signing, an audited plugin registry, user permission consent history, and OS-level sandboxing remain future work.

## Consequences

- Installed third-party strategy plugins execute only through the isolated asynchronous host. Their results enter the chart through the existing declaration-based strategy output contract.
- Indicator packages remain visible but degraded rather than executing in the renderer; this is intentional until their dedicated boundary exists.
- Plugin failures are recorded in the existing manager and repeated failure continues to trigger automatic disable behavior.
