# Execution Plan

## 1. Current Status

The repository is an early-stage project scaffold.

Current files:

- `AGENTS.md`
- `trading-strategies/utorb.md`
- `trading-strategies/trend-targets.md`
- Additional strategy notes under `trading-strategies/`

There is no application source code, package manifest, test framework, or build script yet.

## 2. Execution Rule

The project follows:

**Design first, then prototype, then framework, then module-by-module development.**

No business code should be written before the corresponding stage is confirmed.

## 3. Milestone 1: Design Documentation

Goal:

- Produce complete architecture and planning documents.

Allowed:

- Create and edit files under `docs/`.

Not allowed:

- Initialize application framework.
- Create business source code.
- Convert Pine Script into TypeScript.
- Add package manifests.
- Install dependencies.

Deliverables:

- `docs/architecture.md`
- `docs/database.md`
- `docs/ui-design.md`
- `docs/plugin-system.md`
- `docs/strategy-system.md`
- `docs/execution-plan.md`

Acceptance:

- Documents describe architecture, stack, modules, data flow, UI layout, plugin system, strategy system, and roadmap.
- User confirms before Milestone 2.

## 4. Milestone 2: UI Prototype

Goal:

- Build static UI prototype based on **TradingView Pro Workbench** visual direction.

Allowed:

- UI prototype files.
- Static mock data.
- Visual layout and interactions needed for demonstration.

Not allowed:

- Real authentication.
- Real LongPort API calls.
- Real strategy execution.
- Real database persistence.

Target pages:

- Login.
- Register.
- Invite/email verification.
- API binding.
- Dashboard.
- Super chart workspace.
- Strategy management.
- Strategy parameter panel.
- Backtest result.
- Plugin management.
- Settings.
- Logs.

Acceptance:

- User can inspect and choose the visual and interaction direction.
- Prototype resembles the selected TradingView-like design.
- No business logic is implemented.

## 5. Milestone 3: Base Framework

Goal:

- Create the application skeleton without business implementation.

Deliverables:

- Monorepo setup.
- Electron shell.
- React app.
- Router.
- Layout.
- Theme.
- State store skeleton.
- API client skeleton.
- Chart wrapper skeleton.
- Plugin loader skeleton.
- Strategy interface skeleton.
- Preset strategy registry skeleton.

Acceptance:

- App starts locally.
- Routes render placeholder pages.
- No real business workflows are implemented.

## 6. Milestone 4: Authentication Module

Goal:

- Implement login, registration, invite code validation, email verification, and local session flow.

Acceptance:

- User can register and log in through defined flows.
- Failed states are handled.
- Logs redact sensitive values.
- Module is confirmed before API binding starts.

## 7. Milestone 5: API Binding Module

Goal:

- Bind LongPort API configuration.

Deliverables:

- API URL input.
- API Key input.
- API Secret input.
- Verification flow.
- Encrypted local storage.
- Connection status.

Acceptance:

- Invalid credentials show clear errors.
- Valid credentials are stored securely.
- Frontend never keeps API Secret in global state.

## 8. Milestone 6: Market Data And Cache

Goal:

- Sync market metadata, watchlists, and historical K-lines.

Deliverables:

- LongPort adapter.
- Symbol normalization.
- Watchlist sync.
- SQLite metadata.
- DuckDB OHLCV cache.
- Sync task logs.

Acceptance:

- Historical bars can be queried by symbol/timeframe.
- Sync failures are recoverable.
- No large data is committed to Git.

## 9. Milestone 7: Chart Module

Goal:

- Implement the TradingView-like chart workspace.

Deliverables:

- Candlestick chart.
- Volume pane.
- Timeframe switching.
- Crosshair.
- Zoom and pan.
- Right watchlist panel.
- Bottom dock.
- Initial overlay rendering.

Acceptance:

- Chart can render cached bars.
- UI layout matches the selected visual direction.
- Chart package remains isolated from strategy internals.

## 10. Milestone 7.5: Super Chart Capability Completion

Goal:

- Complete the super chart as the unified TradingView-like surface for market data, indicators, strategy overlays, drawing tools, and future plugin layers.

Deliverables:

- Zoom, pan, crosshair, OHLCV hover, current price line, latest price label, and view reset.
- Chart toolbar, left drawing toolbar, chart settings entry, and right-click menu UI.
- Market-data status display for provider health, latency, latest update time, empty data, paused polling, and degraded API states.
- Declarative render command model for strategy layers, indicator layers, and drawing layers.
- Strategy layer controls for enable/disable, show/hide, z-index, parameter entry, no-data state, error state, and unsupported-timeframe state.
- Chart settings for moving average, volume, grid, signals, price labels, and layer visibility.
- Interface reservations for multi-chart layout, synchronized crosshair, and synchronized zoom.

Acceptance:

- Chart interactions are usable with cached bars and realtime daily quote polling.
- Strategy, indicator, and drawing overlays do not call chart internals directly.
- The chart remains ready for future plugin-provided indicators and strategy layers.

Deferred:

- Full TradingView Charting Library migration.
- Full multi-window synchronization.
- Drawing object persistence.
- Real order entry from chart context menu.

## 11. Milestone 8: Strategy Engine

Goal:

- Implement the independent strategy runtime.

Deliverables:

- Strategy interface.
- Parameter schema.
- Pine helper runtime.
- Backtest loop.
- Realtime update loop.
- Signal, overlay, metric, and log output.

Acceptance:

- Strategies can run without Electron or React.
- Unit tests cover core time-series helpers.
- Strategy output is deterministic.

## 12. Milestone 9: Preset Strategies

Goal:

- Convert the first two Pine Script strategies into built-in TypeScript strategies.

Strategies:

- Ultimate Opening Range Breakout.
- Trend Targets.

Acceptance:

- Both strategies run through the shared strategy engine.
- Outputs include signals, overlays, metrics, and logs.
- Original Pine files remain preserved.
- Behavior differences from Pine are documented.

## 13. Milestone 10: Plugin System

Goal:

- Enable strategy, indicator, data source, and export plugins.

Deliverables:

- Plugin manifest.
- Plugin API.
- Installation flow.
- Version checks.
- Permission declarations.
- Lifecycle hooks.
- Disable/uninstall.

Acceptance:

- A sample plugin can register a capability.
- Plugin failure does not crash the app.
- Permissions are visible to the user.

## 14. Milestone 11: Learning System

Goal:

- Add learning workflows around strategy research.

Deliverables:

- Learning content model.
- Strategy explanation pages.
- Progress tracking.
- Practice and review notes.
- Links from strategies to lessons.

Acceptance:

- Users can study a strategy, run it, and review results in one flow.

## 15. Milestone 12: Hardening

Goal:

- Prepare the project for broader usage.

Focus areas:

- Security review.
- Performance review.
- Packaging.
- Error reporting.
- Data migration.
- UI polish.
- Documentation.

## 16. Risk Controls

- Chart licensing: start with Lightweight Charts and keep adapter boundary.
- Pine compatibility: start with manual translation and helper runtime.
- API security: encrypt secrets and redact logs.
- Plugin risk: restrict plugin API and permissions.
- Market complexity: normalize sessions, timezone, price tick, adjustment mode.
- Scope creep: require confirmation after every milestone.
