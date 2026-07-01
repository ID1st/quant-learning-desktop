# Current Development Plan

## Status

The project is in Phase 4 module development.

Completed foundations:

- Electron desktop shell and preload bridge.
- React workstation routes and layout.
- AlphaFeed primary data source contract.
- LongBridge backup data source contract.
- Quote snapshot sync for the default watchlist.
- Initial AlphaFeed daily K-line sync for the default watchlist.
- Local document-style market cache for quotes, watchlist, sync state, and bars.
- Chart workspace reads cached market bars before falling back to prototype candles.
- Secure credential persistence for AlphaFeed and LongBridge through main-process IPC and OS-backed encryption.
- Provider verification, quote, and K-line network calls are registered behind main-process IPC handlers.
- Market K-line cache metadata, retention pruning, cache summary, and manual cleanup in Settings.
- Built-in strategy runtime foundation and strategy render-layer contract.
- Minimal UTORB and Trend Targets strategy implementations.

## Current Data Flow

1. User binds AlphaFeed in the desktop app.
2. Optional LongBridge credentials can be entered as a backup source.
3. Initial sync creates the default watchlist.
4. Initial sync fetches quote snapshots.
5. Initial sync fetches AlphaFeed daily K-line bars with `count=240` and `adjust=forward`.
6. Quote snapshots and K-line bars are written to local cache.
7. Chart workspace reads cached K-line bars by symbol, market, and timeframe.
8. Settings exposes cache size, indexed entries, retention cleanup, and full cache clearing.
9. Dashboard shows provider state, quote count, and K-line count.

## Next Tasks

### 1. Realtime Stream

Goal: add AlphaFeed WebSocket quote stream.

Acceptance:

- Subscribe to watchlist quotes.
- Handle reconnect/backoff.
- Surface provider health and latency.
- Keep LongBridge quote snapshot as fallback.

### 2. Strategy Uses Real Bars

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
