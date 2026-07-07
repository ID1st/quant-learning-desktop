# Current Development Plan

## Status

The project is in Phase 4 module development.

Completed foundations:

- Electron desktop shell and preload bridge.
- React workstation routes and layout.
- AlphaFeed primary data source contract.
- LongBridge backup data source contract.
- Quote snapshot sync for the default watchlist.
- Initial AlphaFeed multi-timeframe K-line sync for the default watchlist.
- Local document-style market cache for quotes, watchlist, sync state, and bars.
- Chart workspace renders only real cached market bars in the production workspace; when no market data exists, the chart shows an explicit empty state instead of prototype candles.
- Secure credential persistence for AlphaFeed and LongBridge through main-process IPC and OS-backed encryption.
- Provider verification, quote, and K-line network calls are registered behind main-process IPC handlers.
- Market K-line cache metadata, retention pruning, cache summary, and manual cleanup in Settings.
- Chart workspace exposes `realtime`, `1d`, and `1w`; history loading now prefers LongBridge candlesticks, while AlphaFeed handles realtime quote updates.
- `1d` chart rendering can merge the latest AlphaFeed quote snapshot into the current trading-day candle through WebSocket streaming when available or REST polling fallback.
- `realtime` intraday chart first backfills LongBridge 1m history, covering at least the previous trading session through the latest available historical point; after close, it displays historical intraday data only and stops appending realtime quote points.
- LongBridge 1m history requests are capped at 1,000 bars to avoid provider error `301607 request too many klines`.
- If LongBridge intraday history is delayed, newer AlphaFeed realtime points are preserved during history refreshes and the chart status reports the detected gap without fabricating intermediate prices.
- AlphaFeed REST polling now batches the full watchlist every 10 seconds by default, reports provider health, latency, latest check time, error class, rate-limit retry hints, and keeps 30/60/120 second fallback polling controls.
- AlphaFeed WebSocket member-channel configuration is available in the API settings page, with stream credentials stored through the desktop secure credential bridge.
- AlphaFeed WebSocket quote streaming has a desktop IPC session, watchlist/all-symbol subscription payload, reconnect handling, permission/auth fallback states, normalized quote snapshots, and REST batch polling fallback in the chart workspace.
- Super chart first capability batch is in place: zoom, pan, right price-axis drag scaling, Beijing-time x-axis labels, price y-axis labels, real visible-range reset, OHLCV hover legend, explicit crosshair/grid/volume/price-label/current-price-line toggles, current price line and label, chart settings popover, context menu scaffold, and clearer strategy layer states.
- Built-in strategy runtime foundation and strategy render-layer contract.
- Minimal UTORB and Trend Targets strategy implementations.

## Current Data Flow

1. User binds AlphaFeed in the desktop app.
2. Optional LongBridge credentials can be entered as a backup source.
3. Initial sync creates the default watchlist.
4. Initial sync fetches quote snapshots.
5. Initial sync can still warm available cached bars, but the chart workspace now loads active-symbol historical bars from LongBridge on demand.
6. Quote snapshots and K-line bars are written to local cache.
7. Chart workspace reads cached K-line bars by symbol, market, and timeframe.
8. If AlphaFeed WebSocket member credentials exist, the desktop main process opens the stream session first and normalizes incoming quotes into the same snapshot cache.
9. If WebSocket is still connecting, disconnected, unauthorized, permission-denied, or has no first snapshot, the chart workspace keeps using AlphaFeed REST batch polling as fallback.
10. AlphaFeed REST polling fetches the deduplicated watchlist in batches and keeps the latest quote snapshot per symbol.
11. On the `1d` chart, the active symbol quote is read from the snapshot cache and merged into the current trading-day candle.
12. On the `realtime` chart, the active symbol first loads LongBridge 1m candlesticks into the `realtime` cache, capped at 1,000 bars per request. During market hours, AlphaFeed quote snapshots can append new points; after close, polling stops and only the historical intraday line remains.
13. If LongBridge realtime-page history is delayed, the cache merge keeps newer AlphaFeed bars and the chart status explains whether the gap has been bridged.
14. AlphaFeed stream/REST health is surfaced in the chart top bar with latency, latest check time, and degraded states.
15. Settings exposes cache size, indexed entries, retention cleanup, and full cache clearing.
16. Dashboard shows provider state, quote count, and K-line count.

## Next Tasks

### 1. Super Chart Capability Completion

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

### 2. Mixed Provider Diagnostics

Goal: make the split provider model visible and easier to debug.

Acceptance:

- Surface whether the current chart is using `LongBridge 历史`, `AlphaFeed REST 实时`, or `AlphaFeed WebSocket 实时`.
- Surface which provider served the current quote snapshot and each active bar batch.
- Keep broker/account integration behind desktop IPC.

### 3. AlphaFeed WebSocket Runtime Hardening

Goal: harden the initial AlphaFeed member-channel runtime after the user's real member plan and protocol details are confirmed.

Acceptance:

- Confirm the exact provider subscription payload and auth format against the user's plan.
- Add provider-specific heartbeat/ping handling if required.
- Add visible stream source diagnostics in the chart status surface.
- Add optional reconnect/backoff tuning if AlphaFeed publishes connection limits.

### 4. Strategy Uses Real Bars

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
