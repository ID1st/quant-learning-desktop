# Market Data Provider Plan

## Current Decision

The system now treats AlphaFeed as the primary market data provider and LongBridge as the backup provider.

- Primary provider: AlphaFeed
- Backup provider: LongBridge OpenAPI
- Current implemented path: REST quote snapshot, historical K-line, initial default-watchlist K-line sync, chart workspace cached-bar rendering, 1d quote-driven candle refresh, realtime intraday history backfill from 1m bars, provider health telemetry, rate-limit backoff hints, secure credential persistence, AlphaFeed WebSocket member-channel configuration, AlphaFeed WebSocket desktop IPC session with REST fallback, provider network calls behind main-process IPC, cache governance
- Next path: LongBridge fallback expansion and strategy execution on real cached bars

## Official Source Notes

AlphaFeed documentation:

- REST base URL: `https://api.alphafeed.org`
- Real-time quote endpoint: `GET /v1/quotes`
- Authentication: `X-API-Key` header or `api_key` query parameter
- Supported quote query modes: comma-separated `symbols` or `universes`
- Quote markets: `CN`, `US`, `HK`
- Quote fields used by the app: `symbol`, `region`, `last_price`, `prev_close`, `volume`, `amount`, `timestamp`, `ext`
- Historical K-line endpoint: `GET /v1/klines`
- Recent intraday K-line sync also uses `GET /v1/klines` with periods such as `1m`, `5m`, `15m`, and `60m`
- The realtime chart uses AlphaFeed `1m` bars to backfill an intraday line from at least the previous market open to the latest available market time. If the market is closed, the chart stops appending quote-derived points and keeps the historical intraday line static.
- The `GET /v1/klines/intraday` endpoint is reserved for same-day minute-line use cases and is not used for default cache warm-up
- K-line response format: columnar OHLCV arrays with matching indexes
- HK symbols must use five-digit exchange codes for provider requests, for example `09988.HK` for Alibaba HK
- AlphaFeed quote refresh currently tries the optional member WebSocket stream first when stream credentials exist. If the stream is unavailable, still connecting, unauthorized, permission-denied, or has no snapshots yet, the chart workspace falls back to REST polling.
- AlphaFeed REST fallback uses a default 10-second chart interval, fetching the deduplicated watchlist in quote batches instead of requesting one symbol at a time. Polling pauses while the page is hidden and uses a 120-second backoff when the API reports rate limiting.
- AlphaFeed desktop bridge responses include provider health metadata: status, message, latency, checked time, and optional retry time.
- The chart workspace exposes polling interval choices of 10, 30, 60, and 120 seconds. A single request batch is capped at 30 symbols before additional batches are created.
- WebSocket stream noted by public docs: `wss://api.tickflow.org/v1/ws/stream`
- WebSocket subscription channels noted by public docs: `quotes`, `depth`
- The app now provides an AlphaFeed WebSocket member-channel configuration area. It stores the stream URL and API key through the desktop secure credential bridge, while local app state stores only a redacted summary.
- The initial WebSocket runtime stays behind desktop IPC. It sends a `quotes` subscription payload for either the watchlist symbols or member all-symbol universes, normalizes quote messages into `MarketQuoteSnapshot`, handles auth/permission errors as fallback states, and reconnects after transient network closes. The exact provider payload may need adjustment after the user's member plan confirms the final AlphaFeed protocol.

LongBridge remains useful for:

- Backup quote snapshots
- Broker/account-related integration
- Future order, position, and trading workflows

## Provider Boundary

Provider-specific code must stay behind typed boundaries.

Renderer pages must not call external APIs directly. They can only call the desktop bridge:

- `window.quantDesktop.alphaFeed.verifyCredentials`
- `window.quantDesktop.alphaFeed.fetchQuoteSnapshot`
- `window.quantDesktop.alphaFeed.fetchHistoricalBars`
- `window.quantDesktop.alphaFeed.fetchIntradayBars`
- `window.quantDesktop.alphaFeed.connectStream`
- `window.quantDesktop.alphaFeed.readStreamSnapshot`
- `window.quantDesktop.alphaFeed.disconnectStream`
- `window.quantDesktop.longPort.verifyCredentials`
- `window.quantDesktop.longPort.fetchQuoteSnapshot`

Shared normalized quote snapshot:

```ts
interface MarketQuoteSnapshot {
  symbol: string;
  market: "CN" | "US" | "HK";
  lastPrice: number;
  previousClose: number;
  changePercent: number;
  volume: number;
  quoteTime: string;
  receivedAt: string;
  provider: "alphafeed" | "longport";
}
```

Shared normalized market bar:

```ts
interface MarketDataBar {
  symbol: string;
  market: "CN" | "US" | "HK";
  timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  provider: "alphafeed" | "longport";
}
```

## Failover Policy

1. Verify AlphaFeed first.
2. If LongBridge credentials are complete, verify LongBridge as backup.
3. During initial market sync:
   - Fetch quote snapshots from AlphaFeed.
   - Fetch default multi-timeframe K-line bars from AlphaFeed for every preset watchlist symbol.
   - Store K-line bars by `market + symbol + timeframe`.
   - If AlphaFeed fails and LongBridge backup credentials were entered in this session, fetch from LongBridge.
   - Store the provider used in the local market data sync state.

## Security Policy

- Do not commit API keys.
- Do not store full API keys in renderer-local storage.
- Store only redacted summaries in local app state.
- Store full AlphaFeed and LongBridge credentials only through the desktop secure credential bridge.
- Encrypt stored credentials with Electron `safeStorage` before writing to the user data directory.
- Keep broker SDK calls and external network requests behind the desktop bridge.
- Treat all third-party API responses as untrusted and validate shape before use.

## Remaining Work

1. Confirm AlphaFeed WebSocket member protocol details against the selected plan and adjust the subscription payload if needed.
2. Expand LongBridge as explicit backup and future trading/account channel.
