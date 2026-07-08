# Current Development Plan

## Status

The project is in Phase 4 module development. Market Data Provider Gateway phases 1 through 9 are complete; the next slice is provider-neutral desktop IPC hardening and richer provider diagnostics history.

Completed foundations:

- Electron desktop shell and preload bridge.
- React workstation routes and layout.
- AlphaFeed market data contract and secure credential persistence.
- LongBridge backup data source contract and secure credential persistence.
- Quote snapshot sync for the default watchlist.
- Local document-style market cache for quotes, watchlist, sync state, and bars.
- Chart workspace renders only real cached market bars in the production workspace; when no market data exists, the chart shows an explicit empty state instead of prototype candles.
- Provider verification, quote, and K-line network calls are registered behind main-process IPC handlers.
- Market K-line cache metadata, retention pruning, cache summary, and manual cleanup in Settings.
- Chart workspace exposes `realtime`, `1d`, and `1w`.
- `1d` chart rendering can merge the latest realtime quote snapshot into the current trading-day candle.
- `realtime` intraday chart can backfill LongBridge 1m history, cap LongBridge requests at 1,000 bars, preserve newer live points, and report delayed-history gaps.
- AlphaFeed REST polling batches the full watchlist every 10 seconds by default, reports provider health, latency, latest check time, error class, rate-limit retry hints, and keeps 30/60/120 second fallback controls.
- AlphaFeed WebSocket member-channel configuration is available in the API settings page, with stream credentials stored through the desktop secure credential bridge.
- AlphaFeed WebSocket quote streaming has a desktop IPC session, watchlist/all-symbol subscription payload, reconnect handling, permission/auth fallback states, normalized quote snapshots, and REST batch polling fallback in the chart workspace.
- Super chart first capability batch is in place: zoom, pan, right price-axis drag scaling, Beijing-time x-axis labels, price y-axis labels, real visible-range reset, OHLCV hover legend, explicit crosshair/grid/volume/price-label/current-price-line toggles, current price line and label, chart settings popover, context menu scaffold, and clearer strategy layer states.
- Built-in strategy runtime foundation and strategy render-layer contract.
- Minimal UTORB and Trend Targets strategy implementations.
- `chengzuopeng/stock-sdk` has been evaluated as a candidate primary market data source. Smoke tests confirm useful REST coverage for CN/HK/US quotes, daily bars, and intraday minute data, but also confirm symbol-normalization and data-quality rules are required before integration.
- Market Data Provider Gateway phase 1 is in place: provider IDs, capability declarations, health states, provider registry, and gateway fallback shell.
- Market Data Provider Gateway phase 2 is in place: AlphaFeed REST, AlphaFeed WebSocket, and LongBridge have compatibility providers that map existing bridge results into the provider-neutral gateway shape.
- Market Data Provider Gateway phase 3 is in place: cache and sync provider IDs now support legacy `alphafeed`/`longport` plus gateway IDs `stock-sdk`/`alphafeed-rest`/`alphafeed-websocket`/`longbridge`. Realtime intraday merge rules also preserve newer live bars from gateway live-capable providers.
- Market Data Provider Gateway phase 4 is in place: the chart workspace now reads historical bars, intraday bars, REST quote snapshots, and WebSocket quote snapshots through a chart-facing gateway adapter while preserving the existing visible AlphaFeed/LongBridge behavior.
- Market Data Provider Gateway phase 5 is in place: the API configuration page is provider-priority oriented, with `stock-sdk` shown as the default-expanded primary placeholder and AlphaFeed REST, AlphaFeed WebSocket, and LongBridge shown as collapsed fallback provider sections.
- Market Data Provider Gateway phase 6 is in place: the `stock-sdk` gateway adapter exists behind an injectable operations boundary, defaults to `unconfigured`, is not used by the production chart flow, and has tests for symbol normalization, quote/bar normalization, deterministic `open: 0` repair, invalid OHLC rejection, and fallback behavior.
- Market Data Provider Gateway phase 7 is in place: `npm run probe:stock-sdk` validates real `stock-sdk@2.3.0` quote, daily, weekly, and 1m intraday data for CN/HK/US through the gateway adapter. The latest run passed 10/10 checks and is documented in `docs/stock-sdk-data-test-report.md`.
- Market Data Provider Gateway phase 8 is in place: the chart gateway can register the real `stock-sdk` operations as the primary provider only when `stockSdkPrimaryEnabled` is explicitly enabled in provider settings. The default setting remains off, and AlphaFeed REST, AlphaFeed WebSocket, and LongBridge fallback paths remain active and covered by tests.
- Market Data Provider Gateway phase 9 is in place: the API configuration page exposes the guarded `stockSdkPrimaryEnabled` switch, provider priority status can show `stock-sdk` as enabled, and the chart status badge uses provider diagnostics to show active provider, health state, capability, and fallback source.

## Current Data Flow

1. User binds AlphaFeed in the desktop app.
2. Optional LongBridge credentials can be entered as a backup source.
3. Initial sync creates the default watchlist.
4. Initial sync fetches quote snapshots.
5. Initial sync can warm cached bars, while the chart workspace can load active-symbol historical bars on demand.
6. Quote snapshots and K-line bars are written to local cache.
7. Chart workspace reads cached K-line bars by symbol, market, and timeframe.
8. The chart workspace creates provider-neutral gateway adapters from the saved desktop credentials and calls the gateway for historical bars, intraday bars, quote polling, and stream snapshots. `stock-sdk` is registered as primary only when the guarded provider setting is enabled; otherwise the existing AlphaFeed/LongBridge priorities are preserved.
9. If AlphaFeed WebSocket member credentials exist, the desktop main process opens the stream session first and normalizes incoming quotes into the same snapshot cache through the gateway adapter.
10. If WebSocket is still connecting, disconnected, unauthorized, permission-denied, or has no first snapshot, the chart workspace keeps using AlphaFeed REST batch polling as fallback through the gateway adapter.
11. AlphaFeed REST polling fetches the deduplicated watchlist in batches and keeps the latest quote snapshot per symbol.
12. On the `1d` chart, the active symbol quote is read from the snapshot cache and merged into the current trading-day candle.
13. On the `realtime` chart, the active symbol can load LongBridge 1m candlesticks into the `realtime` cache, capped at 1,000 bars per request. During market hours, live quote snapshots can append new points; after close, polling stops and only historical intraday data remains.
14. If LongBridge realtime-page history is delayed, the cache merge keeps newer live bars and the chart status explains whether the gap has been bridged.
15. Provider health is surfaced in the chart top bar with active provider, capability, fallback source, latency, latest check time, and degraded states.
16. Settings exposes cache size, indexed entries, retention cleanup, and full cache clearing.
17. Dashboard shows provider state, quote count, and K-line count.

## Planned Market Data Direction

The next market-data architecture change is a provider-gateway migration, not a direct provider swap.

Target priority:

1. `stock-sdk` candidate primary source.
2. AlphaFeed REST fallback.
3. AlphaFeed WebSocket member-channel fallback for streaming quotes when available.
4. LongBridge fallback and broker/account integration path.

Important constraints:

- The current chart must keep rendering through the existing cache while the gateway is introduced.
- Strategies must continue to depend only on normalized bars, not on provider SDKs.
- Existing AlphaFeed and LongBridge credentials and cache entries must remain readable.
- `stock-sdk` should not be marked as native WebSocket-capable until a real stream implementation exists. It should be modeled as REST plus optional polling-driven streaming.
- Provider-specific quirks must stay behind the desktop bridge and provider adapters.

## Next Tasks

### 1. Market Data Provider Gateway Planning

Status: completed.

Goal: introduce a provider-neutral market-data architecture before replacing the active provider flow.

Acceptance:

- Add or update documentation for `MarketDataProvider`, `MarketDataProviderRegistry`, `MarketDataGateway`, provider capabilities, health states, and failover order.
- Record `stock-sdk` smoke-test findings: CN/HK/US quote coverage, daily/intraday coverage, symbol conversion requirements, data-quality risks, and no confirmed native WebSocket support.
- Define cache-merge rules so older historical bars cannot overwrite newer live bars from any live-capable provider.
- Define an API configuration layout where `stock-sdk` is the primary source and AlphaFeed REST, AlphaFeed WebSocket, and LongBridge are fallback sections.
- Do not change production data fetching until the user confirms the gateway implementation step.

### 2. Market Data Provider Gateway Foundation

Status: completed. Phase 1 added the provider-neutral contracts and gateway/registry shell. Phase 2 wrapped existing AlphaFeed REST, AlphaFeed WebSocket, and LongBridge flows without changing chart behavior.

Goal: add the gateway and registry as a compatibility layer around the existing AlphaFeed and LongBridge flows.

Acceptance:

- Existing chart behavior stays unchanged.
- Existing cache stays readable.
- Typecheck passes after each slice.
- Renderer pages start moving toward provider-neutral gateway calls instead of direct provider-specific calls.

### 2.5. Market Data Provider Cache Compatibility

Status: completed.

Goal: extend cache and sync provider IDs so both legacy `alphafeed`/`longport` and gateway IDs `stock-sdk`/`alphafeed-rest`/`alphafeed-websocket`/`longbridge` can coexist safely.

Acceptance:

- Existing cache entries remain readable.
- New provider IDs can be sanitized, written, indexed, and reported.
- Historical refreshes still cannot overwrite newer live bars.
- Typecheck and desktop cache tests pass.

### 2.6. Chart Uses Market Data Gateway

Status: completed.

Goal: move chart data loading from direct AlphaFeed/LongBridge calls to the provider-neutral gateway while preserving the current visible chart behavior.

Acceptance:

- `realtime`, `1d`, and `1w` chart behavior remains unchanged.
- Existing cached data stays readable.
- Provider fallback order is visible in code and testable.
- Typecheck and desktop tests pass.
- Chart page no longer performs direct AlphaFeed/LongBridge network calls; provider-specific bridge calls are isolated behind `chartMarketDataGateway`.

### 2.7. API Configuration Uses Provider Priority

Status: completed.

Goal: redesign the API configuration page around the future provider priority model.

Acceptance:

- `stock-sdk` primary source is visible as the first, default-expanded placeholder and does not collect credentials yet.
- AlphaFeed REST, AlphaFeed WebSocket member channel, and LongBridge are visible as fallback provider sections and default collapsed.
- Provider priority is shown as `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, LongBridge.
- Existing AlphaFeed REST, AlphaFeed WebSocket, and LongBridge credential flows remain usable.
- Typecheck, desktop tests, and browser UI smoke verification pass.

### 2.8. stock-sdk Adapter Behind Gateway

Status: completed.

Goal: implement a provider-neutral `stock-sdk` adapter without switching production market-data traffic.

Acceptance:

- `stock-sdk` remains disabled by default and reports `unconfigured`, so the gateway can fall back to AlphaFeed/LongBridge without calling it.
- Adapter tests cover CN/HK/US symbol normalization for quotes and bars.
- Adapter tests cover quote snapshots, daily/weekly bars, intraday bars, deterministic zero-open repair, and invalid OHLC rejection.
- The app-facing symbol, market, provider, timeframe, and timestamp metadata are preserved on normalized records.
- Typecheck and desktop tests pass.

### 2.9. Controlled stock-sdk Data Test

Status: completed.

Goal: test the real `stock-sdk` package through the disabled gateway adapter before any production source switch.

Acceptance:

- `stock-sdk@2.3.0` is pinned as a development-only dependency for controlled probing.
- `npm run probe:stock-sdk` checks CN/HK/US quote snapshots, daily bars, weekly bars, and 1m intraday bars.
- Probe output is written to `docs/generated/stock-sdk-provider-probe-latest.json`.
- Human-readable findings are recorded in `docs/stock-sdk-data-test-report.md`.
- The production chart path remains unchanged and does not register `stock-sdk`.

### 2.10. Guarded stock-sdk Primary Switch

Status: completed.

Goal: allow a controlled gray switch to try `stock-sdk` as the first provider while preserving existing fallback providers.

Acceptance:

- Provider settings default `stockSdkPrimaryEnabled` to `false`.
- The chart gateway registers `stock-sdk` only when the guarded setting is true or test config explicitly enables it.
- With the switch enabled, quote, historical, and intraday gateways try `stock-sdk` first.
- If `stock-sdk` is unavailable, quote fallback uses AlphaFeed REST, historical fallback uses LongBridge, and intraday fallback uses AlphaFeed REST then LongBridge.
- Tests prove both default old priority and enabled fallback behavior.

### 2.11. Provider Diagnostics And Status Hardening

Status: completed.

Goal: make the multi-provider model visible to users and safer to operate during the guarded `stock-sdk` rollout.

Acceptance:

- The API configuration page exposes a UI-safe toggle for `stockSdkPrimaryEnabled`.
- Provider priority status can distinguish `stock-sdk` as `待接入` or `已启用`.
- The chart status badge can show whether realtime quotes, historical bars, or intraday bars were served by `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, or LongBridge.
- Fallback from a higher-priority provider is visible in the diagnostic message.
- Diagnostics remain in the app market-data feature layer; chart rendering and strategy packages still do not depend on provider SDKs.

### 3. Super Chart Capability Completion

Goal: complete the TradingView-like super chart as the unified surface for market data, indicators, strategy overlays, drawing tools, and future plugin layers.

Acceptance:

- Extend the chart toolbar, left drawing toolbar, chart settings entry, and right-click menu beyond the current safe scaffold.
- Surface market-data status, provider health, latency, latest update time, empty data, paused polling, and degraded API states.
- Keep the production chart empty when no real cached data exists; prototype/demo candles stay inside chart package fallback only.
- Use declarative render commands for strategy layers, indicator layers, and drawing layers instead of direct strategy-to-chart calls.
- Add z-index ordering and richer error detail for strategy layers.
- Add indicator-layer controls beyond the built-in moving average.
- Reserve interfaces for future multi-chart layout, synchronized crosshair, and synchronized zoom.

Deferred:

- Full TradingView Charting Library migration.
- Full multi-window synchronization.
- Drawing object persistence.
- Real order entry from chart context menu.

### 4. Mixed Provider Diagnostics

Status: first pass completed in phase 2.11; richer history/timeline remains.

Goal: make the multi-provider model visible and easier to debug.

Acceptance:

- Surface whether the current chart is using `stock-sdk REST`, `AlphaFeed REST`, `AlphaFeed WebSocket`, or `LongBridge`.
- Surface which provider served the current quote snapshot and each active bar batch.
- Add a compact provider-event timeline for repeated fallback, rate-limit, and delayed-history events.
- Keep broker/account integration behind desktop IPC.

### 5. AlphaFeed WebSocket Runtime Hardening

Goal: harden the initial AlphaFeed member-channel runtime after the user's real member plan and protocol details are confirmed.

Acceptance:

- Confirm the exact provider subscription payload and auth format against the user's plan.
- Add provider-specific heartbeat/ping handling if required.
- Add visible stream source diagnostics in the chart status surface.
- Add optional reconnect/backoff tuning if AlphaFeed publishes connection limits.

### 6. Strategy Uses Real Bars

Goal: run built-in strategies on cached bars instead of generated chart data.

Acceptance:

- UTORB and Trend Targets run on cached bars.
- Parameter changes recompute layers.
- Strategy logs and signals update from real bar input.

## Deferred

- Real trading/order submission.
- Full Pine Script compiler.
- Full plugin sandbox and install UI.
- DuckDB migration for large-scale OHLCV storage.
