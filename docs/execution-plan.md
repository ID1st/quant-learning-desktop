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

## 8.1. Milestone 6.5: Market Data Provider Gateway

Goal:

- Introduce a provider-neutral market-data gateway before replacing the current AlphaFeed/LongBridge flow.

Context:

- `chengzuopeng/stock-sdk` has been evaluated as a candidate primary market data source.
- It can provide useful REST coverage for CN/HK/US quotes, daily bars, and intraday minute data.
- It has no confirmed native WebSocket client in the evaluated source, so it should not replace AlphaFeed WebSocket streaming until a real stream capability exists.

Target provider order:

1. `stock-sdk` primary provider.
2. AlphaFeed REST fallback.
3. AlphaFeed WebSocket member-channel fallback.
4. LongBridge fallback and broker/account integration path.

Deliverables:

- `MarketDataProvider` contract.
- `MarketDataProviderRegistry`.
- `MarketDataGateway`.
- Provider capability model.
- Provider health status model.
- Provider-neutral quote, historical bar, intraday bar, and optional stream interfaces.
- Backward-compatible cache provider ID migration.
- Provider-priority API configuration page design.
- `stock-sdk` adapter plan covering symbol normalization, OHLC validation, and REST polling.

Progress:

- Phase 1 completed: provider-neutral contracts, capability model, health status model, in-memory registry, and gateway fallback shell were added under `apps/desktop/src/features/marketData/`.
- Phase 2 completed: AlphaFeed REST, AlphaFeed WebSocket, and LongBridge compatibility providers were added under `apps/desktop/src/features/marketData/`. They map existing bridge results to gateway quote/bar shapes while preserving current production chart fetching.
- Phase 3 completed: provider IDs were centralized, and sync state, quote snapshots, K-line bars, K-line metadata, and realtime merge rules now accept legacy and gateway provider IDs.
- Phase 4 completed: chart workspace data loading now goes through the chart-facing market data gateway adapter while preserving current LongBridge history, AlphaFeed REST polling, and AlphaFeed WebSocket fallback behavior.
- Phase 5 completed: API configuration now presents `stock-sdk` as the default-expanded primary placeholder and keeps AlphaFeed REST, AlphaFeed WebSocket, and LongBridge as collapsed fallback provider sections with visible priority/status.
- Phase 6 completed: the disabled-by-default `stock-sdk` adapter was added behind the gateway with injectable operations, symbol normalization, quote/bar normalization, deterministic zero-open repair, invalid OHLC rejection, and fallback tests.
- Phase 7 completed: `stock-sdk@2.3.0` controlled real-data probe passed 10/10 checks for CN/HK/US quote snapshots, daily bars, weekly bars, and 1m intraday bars through the gateway adapter. Findings are recorded in `docs/stock-sdk-data-test-report.md`.
- Phase 8 completed: a guarded provider setting can register `stock-sdk` as the primary chart gateway provider while keeping AlphaFeed REST, AlphaFeed WebSocket, and LongBridge fallback providers active. The default remains off.
- Phase 9 completed: provider diagnostics now summarize active source, capability, health state, and fallback source in chart status messages. The API configuration page exposes the guarded Stock SDK primary-source switch and provider priority can show `stock-sdk` as enabled.
- Phase 10 completed: final review, desktop tests, typecheck, production build, controlled `stock-sdk` probe, documentation updates, and a git rollback point close the Market Data Provider Gateway migration objective.

Acceptance:

- Chart, strategy, cache, and UI do not directly depend on concrete provider SDKs after the gateway migration.
- Each quote and bar keeps provider, market, symbol, timeframe, and timestamp metadata.
- Historical refreshes cannot overwrite newer live bars from any live-capable provider.
- Existing AlphaFeed and LongBridge credentials remain usable.
- Existing cached market data remains readable.
- Visible diagnostics explain provider fallback without breaking chart rendering.
- Every implementation slice keeps `npm run typecheck` passing.

Deferred:

- Direct production switch to `stock-sdk`.
- Native WebSocket support for `stock-sdk` unless a real upstream stream API is confirmed.
- Provider-neutral desktop IPC (`window.quantDesktop.marketData.*`) as the next follow-up slice.

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
- Beijing-time x-axis labels, price y-axis labels, and right price-axis drag scaling.
- Chart toolbar, left drawing toolbar, chart settings entry, and right-click menu UI.
- Market-data status display for provider health, latency, latest update time, empty data, paused polling, and degraded API states.
- Production chart empty state when no real cached market data exists; generated/prototype candles must not appear in the desktop workspace.
- Declarative render command model for strategy layers, indicator layers, and drawing layers.
- Strategy layer controls for enable/disable, show/hide, z-index, parameter entry, no-data state, error state, and unsupported-timeframe state.
- Chart settings for moving average, volume, grid, signals, price labels, and layer visibility.
- Interface reservations for multi-chart layout, synchronized crosshair, and synchronized zoom.

Acceptance:

- Chart interactions are usable with cached bars and realtime daily quote polling.
- Realtime chart preserves newer AlphaFeed points when LongBridge intraday history is delayed and reports the gap without generating synthetic intermediate prices.
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
