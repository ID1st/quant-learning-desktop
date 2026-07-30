# Execution Plan

## 1. Current Status

The repository is now in Phase 4 module development.

Completed major foundations:

- Monorepo scaffold with Electron-facing desktop app, React/Vite UI, shared packages, chart package, strategy engine, plugin-loader boundary, and desktop tests.
- TradingView-like workstation UI with chart workspace, watchlist, API configuration, strategy management, settings, and diagnostics surfaces.
- Provider-neutral Market Data Gateway with `stock-sdk` as guarded/default primary source and AlphaFeed REST, AlphaFeed WebSocket, and LongBridge as fallback providers.
- Provider-neutral desktop IPC through `window.quantDesktop.marketData.*` for provider status, quote snapshots, historical bars, intraday bars, and quote stream control.
- Local market cache for quotes, bars, provider metadata, and cache cleanup.
- Built-in UTORB and Trend Targets strategies translated into TypeScript runtime implementations.
- Strategy chart runtime now consumes normalized cached market bars and emits signals, logs, metrics, alerts, and declarative render elements.
- A read-only Strategy Learning page explains the currently supported strategies and indicators without cross-page learning flows.
- Installed plugins can be managed, but all third-party plugin execution is disabled by ADR-002 after the former Utility Process/Node `vm` boundary failed adversarial escape review; renderer code still receives no plugin source.
- Live provider probes, controlled fallback/cache-retention drills, and an Electron plugin-runtime fail-closed smoke test are available as repeatable verification commands.

Current recommended next milestone:

- Confirm and harden the real AlphaFeed WebSocket member protocol: authentication, subscription payloads, heartbeat, reconnect limits, and source diagnostics.
- Then design a genuinely no-Node strategy/indicator sandbox. Strategy, indicator, data-source, and export plugin execution remain intentionally disabled until their dedicated boundaries pass adversarial isolation tests.
- Keep Stock SDK/Tencent as the primary production route for supported quote/history data. AlphaFeed REST, AlphaFeed WebSocket, LongBridge, and US-only Yahoo Finance remain capability-specific fallbacks; no provider should be described as universally available.

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
- Phase 8 completed: a guarded provider setting can register `stock-sdk` as the primary chart gateway provider while keeping AlphaFeed REST, AlphaFeed WebSocket, and LongBridge fallback providers active. The default is now on for new or malformed settings, with explicit user opt-out preserved.
- Phase 9 completed: provider diagnostics now summarize active source, capability, health state, and fallback source in chart status messages. The API configuration page exposes the guarded Stock SDK primary-source switch and provider priority can show `stock-sdk` as enabled.
- Phase 10 completed: final review, desktop tests, typecheck, production build, controlled `stock-sdk` probe, documentation updates, and a git rollback point close the Market Data Provider Gateway migration objective.
- Post-gateway hotfix completed: `stock-sdk` primary is default-on for new or malformed provider settings, and super-chart `realtime` history now uses the intraday gateway path with returned `1m` bars normalized into the `realtime` cache.

Acceptance:

- Chart, strategy, cache, and UI do not directly depend on concrete provider SDKs after the gateway migration.
- Each quote and bar keeps provider, market, symbol, timeframe, and timestamp metadata.
- Historical refreshes cannot overwrite newer live bars from any live-capable provider.
- Existing AlphaFeed and LongBridge credentials remain usable.
- Existing cached market data remains readable.
- Visible diagnostics explain provider fallback without breaking chart rendering.
- Super-chart `realtime` history uses `intradayBars` rather than forcing minute data through the historical K-line gateway.
- Every implementation slice keeps `npm run typecheck` passing.

Deferred:

- Native WebSocket support for `stock-sdk` unless a real upstream stream API is confirmed.

## 8.5. Milestone 6.5: Provider-Neutral Desktop IPC

Status:

- Completed.

Goal:

- Move market-data provider selection, credential reads, fallback, errors, health, and concrete provider operations behind a provider-neutral desktop IPC surface.

Deliverables:

- `window.quantDesktop.marketData.getProviderStatus`.
- `window.quantDesktop.marketData.fetchQuoteSnapshot`.
- `window.quantDesktop.marketData.fetchHistoricalBars`.
- `window.quantDesktop.marketData.fetchIntradayBars`.
- `window.quantDesktop.marketData.connectQuoteStream`.
- `window.quantDesktop.marketData.readQuoteStreamSnapshot`.
- `window.quantDesktop.marketData.disconnectQuoteStream`.
- Main-process provider gateway factory that registers `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, and LongBridge using secure credential reads.
- Compatibility preservation for existing AlphaFeed and LongBridge bridge methods.

Implementation order:

1. Completed: define provider-neutral IPC contract types, channel names, and error/health payloads in `apps/desktop/src/electron/marketDataIpcContract.ts`.
2. Completed: add typed preload/main shell without switching the chart.
3. Completed: migrate quote snapshot requests.
4. Completed: migrate historical and intraday bar requests, preserving the `realtime` uses-intraday rule.
5. Completed: migrate stream connect/read/disconnect.
6. Completed: remove renderer-side provider gateway construction from the chart page.
7. Completed: add fallback, provider-health, error-classification, and bridge-shape tests.
8. Completed: run `npm run test:desktop`, `npm run typecheck`, `npm run build`, and `npm run probe:stock-sdk`.
9. Completed: final review and rollback commit.

Acceptance:

- Chart `realtime`, `1d`, and `1w` behavior does not regress.
- Stock SDK remains default primary.
- AlphaFeed REST, AlphaFeed WebSocket, and LongBridge remain fallback providers.
- Renderer chart code no longer directly reads provider credentials or constructs concrete provider gateways.
- Each quote and bar response carries provider, market, symbol, timeframe, and timestamp metadata.
- Existing cache and strategy modules keep using normalized data and do not depend on concrete provider SDKs.

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

Status:

- Complete for the agreed second-round scope. Provider diagnostics, SMA/EMA/BOLL indicator registration, persistent trend/horizontal/text drawings, drawing commands, strategy signal inspection, layer controls, viewport actions, and browser verification are in place.
- Later chart work is limited to deferred advanced TradingView parity rather than unfinished MVP behavior.

Goal:

- Complete the super chart as the unified TradingView-like surface for market data, indicators, strategy overlays, drawing tools, and future plugin layers.

Deliverables:

- UI/display optimization pass: chart-first viewport, compact top/side/bottom panels, reduced font density, strategy settings moved behind on-demand dialogs/drawers, and no unnecessary scrolling in the primary workstation.
- Chart rendering polish: clearer realtime line/K-line modes, readable Beijing-time x-axis labels, stable price y-axis labels, current-price label treatment, crosshair feedback, volume density, and explicit loading/empty/degraded states.
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
- The chart workspace fits normal desktop viewports without burying the main chart below large configuration panels.
- Strategy and indicator details are available on demand without crowding the default chart surface.
- Browser verification passed for 1366x768, 1440x900, and 1920x1080 with no page-level vertical scroll, no button overflow, and no blank chart state.
- Realtime chart preserves newer AlphaFeed points when LongBridge intraday history is delayed and reports the gap without generating synthetic intermediate prices.
- Strategy, indicator, and drawing overlays do not call chart internals directly.
- The chart remains ready for future plugin-provided indicators and strategy layers.

Deferred:

- Full TradingView Charting Library migration.
- Full multi-window synchronization.
- Advanced drawing tools such as Fibonacci, rectangles, and measurement overlays.
- Real order entry from chart context menu.

## 11. Milestone 8: Strategy Engine

Status:

- Runtime foundation completed for the current built-in strategy scope.
- Chart-facing runtime boundary added in `apps/desktop/src/features/strategies/chartStrategyRuntime.ts`.
- Super chart and strategy management now feed strategies from normalized cached market bars rather than generated/sample bars.
- Parameter changes recompute strategy output, and chart-facing logs/signals/render elements are generated from real cached bar input.

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

Status:

- UTORB and Trend Targets are available as built-in TypeScript strategies.
- Both strategies run through the shared strategy engine and can consume cached realtime bars from the market-data cache.
- Strategy outputs include signals, render elements, metrics, logs, and alerts for the chart-facing layer.
- Full Pine Script compiler support remains deferred. The original Pine files remain preserved as reference material.

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

Status:

- Plugin package-management MVP complete: trusted local strategy/indicator packages can be installed, validated, enabled, disabled, and uninstalled through Electron IPC.
- Third-party strategy, indicator, data-source, and export activation/execution is disabled under ADR-002. The main host and utility entry fail closed without reading source after the previous Node `vm` boundary failed adversarial escape review.
- Runtime failure recording and automatic disable behavior remain available. Re-enabling requires every ADR-002 condition, an independent security review, and a new ADR; a no-Node capability sandbox alone is not sufficient.
- Indicator execution, data-source/export hosts, signatures, permission-consent history, and hot update remain follow-up work.

Goal:

- Enable the first trusted-local strategy and indicator plugins without coupling chart or strategy code to a specific plugin package.

Deliverables:

- Plugin manifest.
- Plugin API.
- Installation flow.
- Version checks.
- Permission declarations.
- Runtime failure isolation and automatic disable after three failures.
- Disable/uninstall.

Acceptance:

- Fail-closed strategy execution is covered by unit tests and an Electron production-build smoke test that must reject the request without reading source or starting a plugin process.
- Plugin source is never returned to the renderer.
- Permissions, enable state, error state, and uninstall controls are visible to the user.

## 14. Milestone 11: Learning System

Status:

- Simplified MVP complete: a read-only Strategy Learning page explains UTORB, Trend Targets, SMA, EMA, and BOLL.
- The agreed scope deliberately does not add cross-page navigation, progress tracking, practice exercises, or notes.

Goal:

- Add learning workflows around strategy research.

Completed deliverables:

- Structured built-in educational content.
- Strategy and indicator explanation page.
- Regression test coverage for supported learning content.

Acceptance:

- Users can read the supported strategy/indicator explanations in the desktop application.

Deferred:

- Progress tracking, practice and review notes, and strategy-to-lesson deep links.

## 15. Milestone 12: Hardening

Status:

- Partially complete: credential boundary hardening, renderer sandbox/CSP, fail-closed third-party plugin execution, runtime error redaction, cache write throttling, provider probes, fallback/cache-retention drill, and Electron plugin-runtime smoke test are complete. A no-Node plugin sandbox remains pending.
- Broad release readiness remains pending; installer signing and release automation should follow final functional scope confirmation.

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

## 17. Stock SDK Historical Data Stabilization

Status: completed.

Deliverables:

- Electron-main Tencent Finance bar adapter for CN/HK/US history and intraday data.
- Provider-neutral Stock SDK operation injection; chart, cache, and strategy layers remain vendor-independent.
- US exchange suffix fallback, public-upstream request governance, and closed-session protection.
- Adjustment-aware historical cache migration and optional upstream provenance metadata.
- Fallback order alignment: Stock SDK, AlphaFeed REST, LongBridge, Yahoo Finance for US emergency coverage.

Acceptance:

- AAPL, 00700.HK, and 600519.SH can load Tencent-backed `1d` and `1w` data without an AlphaFeed or LongBridge credential.
- HK/CN minute history and CN 5-minute K lines are normalized before reaching chart or strategy code.
- A closed-market US one-point result never replaces a valid cached intraday series.
- Existing historical cache data cannot mix unadjusted and adjusted price bases.
- Desktop tests, typecheck, and production build pass before the rollback commit.
