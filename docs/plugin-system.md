# Plugin System Design

## 1. Goals

The plugin system must allow future expansion without changing core modules.

Supported plugin types:

- Strategy plugins.
- Indicator plugins.
- Data source plugins.
- Export plugins.

The plugin system should support:

- Manifest-based installation.
- Version checks.
- Permission declarations.
- Lifecycle hooks.
- Capability registration.
- Disable/uninstall.
- Future hot update support.

## 2. Plugin Package Shape

```text
my-plugin/
  plugin.json
  dist/
    index.js
  README.md
```

## 3. Manifest

Example manifest shape:

```json
{
  "id": "com.example.strategy.orb-extension",
  "name": "ORB Extension Strategy",
  "version": "1.0.0",
  "type": "strategy",
  "main": "dist/index.js",
  "engine": {
    "app": ">=0.1.0",
    "pluginApi": ">=0.1.0"
  },
  "permissions": [
    "market-data:read",
    "strategy:run",
    "file:export"
  ],
  "capabilities": [
    "strategy"
  ]
}
```

## 4. Plugin Types

### Strategy Plugin

Provides:

- Strategy definition.
- Parameter schema.
- Runtime function.
- Optional educational notes.
- Optional default chart overlays.

### Indicator Plugin

Provides:

- Indicator definition.
- Parameter schema.
- Time-series calculation.
- Overlay or separate pane rendering data.

### Data Source Plugin

Provides:

- Symbol search.
- Historical bars.
- Realtime subscriptions.
- Provider health checks.

### Export Plugin

Provides:

- Export format.
- Export command.
- Optional target settings.

Examples:

- CSV exporter.
- JSON exporter.
- Backtest report exporter.

## 5. Lifecycle

```mermaid
flowchart TD
  A[Install Package] --> B[Read Manifest]
  B --> C[Validate Schema]
  C --> D[Check Version Compatibility]
  D --> E[Check Permissions]
  E --> F[Store Install Record]
  F --> G[Load Plugin]
  G --> H[onLoad]
  H --> I[Register Capabilities]
  I --> J[Enabled]
  J --> K[onStart]
  K --> L[Running]
  L --> M[onStop]
  M --> N[Disabled]
  N --> O[onUnload]
```

Lifecycle hooks:

- onLoad
- onStart
- onStop
- onUnload
- onUpdate

## 6. Plugin API

Initial API surface:

```text
PluginContext
  - logger
  - registerStrategy()
  - registerIndicator()
  - registerDataSource()
  - registerExporter()
  - getPluginStorage()
  - getPermissions()
```

The plugin API should expose capabilities, not internal app objects.

## 7. Permissions

Suggested permissions:

- market-data:read
- market-data:subscribe
- strategy:run
- strategy:backtest
- chart:overlay
- file:read
- file:write
- network:request
- settings:read

Permission rules:

- Plugins must declare permissions in manifest.
- Permission changes require user confirmation.
- Unknown permissions block installation.
- Sensitive permissions should be visible in UI.

## 8. Isolation Strategy

First implementation:

- Load trusted local plugins only.
- Run plugins through a restricted host API.
- Do not expose Node globals directly.
- Disable plugin on repeated runtime failures.

Future implementation:

- Worker thread isolation.
- Process isolation for untrusted plugins.
- Signature verification.
- Plugin store or curated registry.

## 9. Versioning

Version fields:

- plugin version
- required app version
- required plugin API version

Compatibility policy:

- Patch upgrades should be compatible.
- Minor upgrades can add optional capabilities.
- Major upgrades can break plugin API.

## 10. Installation

Install flow:

```mermaid
flowchart TD
  A[Select Plugin Package] --> B[Read Manifest]
  B --> C{Manifest Valid?}
  C -- No --> D[Show Error]
  C -- Yes --> E[Show Permissions]
  E --> F{User Confirms?}
  F -- No --> G[Cancel]
  F -- Yes --> H[Copy To Plugin Directory]
  H --> I[Record In SQLite]
  I --> J[Load Plugin]
```

## 11. Hot Update Plan

Initial version:

- No automatic hot update.
- Allow manual install of a newer version.
- Disable old version before loading new version.

Future:

- Plugin registry metadata.
- Update check.
- Download package.
- Verify signature.
- Install side-by-side.
- Switch active version after restart or controlled reload.

## 12. Failure Handling

Plugin failures should not crash the app.

Failure behavior:

- Runtime error: log and mark plugin degraded.
- Repeated error: auto-disable plugin.
- Manifest error: block installation.
- Capability registration error: disable affected capability.

## 13. Built-In Strategies As Internal Plugins

Built-in preset strategies should follow the same capability model as plugins.

Initial built-ins:

- Ultimate Opening Range Breakout.
- Trend Targets.

This keeps future user and plugin strategies consistent with built-in strategies.

## 14. MVP Implementation Status (2026-07-11)

Implemented now:

- Electron main-process installation copies a selected local directory into the managed application plugin directory.
- `plugin.json` schema, package path, JavaScript entry path, supported permissions/capabilities, and app/plugin API versions are checked before install.
- Only trusted, self-contained strategy and indicator modules are executable in the MVP. Data-source and export packages remain declared future capabilities and are rejected by the current runtime.
- The preload bridge exposes only list, install, enable/disable, uninstall, runtime-failure report, and enabled-module read operations.
- Plugins receive only `registerStrategy`, `registerIndicator`, and `log`. They cannot receive provider credentials, Node APIs, file APIs, or desktop IPC handles through the plugin context.
- A broken plugin is isolated. Runtime failures are persisted as degraded state and the plugin is disabled after three failures.
- `examples/plugins/sma-crossover` is an installable sample strategy plugin that produces declarative chart signal overlays.

Deliberate MVP limits:

- This is trusted-local extensibility, not a sandbox for arbitrary third-party code. Full worker/process isolation and signing are required before a marketplace or untrusted packages are supported.
- No automatic hot update, remote download, data-source plugin host, export plugin host, or plugin-specific persistence API is provided yet.
