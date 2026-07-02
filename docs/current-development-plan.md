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
- Chart workspace reads cached market bars before falling back to prototype candles.
- Secure credential persistence for AlphaFeed and LongBridge through main-process IPC and OS-backed encryption.
- Provider verification, quote, and K-line network calls are registered behind main-process IPC handlers.
- Market K-line cache metadata, retention pruning, cache summary, and manual cleanup in Settings.
- Chart workspace exposes `realtime`, `1d`, and `1w`; history loading now prefers LongBridge candlesticks, while AlphaFeed handles realtime quote updates.
- `1d` chart rendering can merge the latest AlphaFeed quote snapshot into the current trading-day candle through WebSocket streaming when available or REST polling fallback.
- `realtime` 分时图会先回填 1m 历史数据，覆盖至少前一开盘日至当前可用时刻；收盘后仅显示历史分时，不继续追加实时快照点。
- AlphaFeed REST polling now batches the full watchlist every 10 seconds by default, reports provider health, latency, latest check time, error class, rate-limit retry hints, and keeps 30/60/120 second fallback polling controls.
- AlphaFeed WebSocket member-channel configuration is available in the API settings page, with stream credentials stored through the desktop secure credential bridge.
- AlphaFeed WebSocket quote streaming has a desktop IPC session, watchlist/all-symbol subscription payload, reconnect handling, permission/auth fallback states, normalized quote snapshots, and REST batch polling fallback in the chart workspace.
- Super chart first capability batch is in place: zoom, pan, real visible-range reset, OHLCV hover legend, explicit crosshair/grid/volume/price-label/current-price-line toggles, current price line and label, chart settings popover, context menu scaffold, and clearer strategy layer states.
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
12. On the `realtime` chart, the active symbol first loads LongBridge 1m candlesticks into the `realtime` cache. During market hours, AlphaFeed quote snapshots can append new points; after close, polling stops and only the historical intraday line remains.
13. AlphaFeed stream/REST health is surfaced in the chart top bar with latency, latest check time, and degraded states.
14. Settings exposes cache size, indexed entries, retention cleanup, and full cache clearing.
15. Dashboard shows provider state, quote count, and K-line count.

## Next Tasks

### 1. Super Chart Capability Completion

Goal: complete the TradingView-like super chart as the unified surface for market data, indicators, strategy overlays, drawing tools, and future plugin layers.

Acceptance:

- Extend the chart toolbar, left drawing toolbar, chart settings entry, and right-click menu beyond the current safe scaffold.
- Surface market-data status, provider health, latency, latest update time, empty data, paused polling, and degraded API states.
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
