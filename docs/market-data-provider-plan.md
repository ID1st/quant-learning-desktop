# Market Data Provider Plan

## Current Decision

The system now uses a split provider model: LongBridge is responsible for historical K-line and intraday-history backfill, while AlphaFeed is responsible for same-day realtime quote updates.

- Realtime provider: AlphaFeed REST polling or AlphaFeed WebSocket member channel
- Historical provider: LongBridge OpenAPI candlesticks
- Backup quote provider: LongBridge OpenAPI
- Explicitly not in current scope: Eastmoney intraday backfill
- Current implemented path: AlphaFeed REST quote snapshot, AlphaFeed WebSocket member-channel quote streaming, LongBridge historical K-line bridge, chart workspace cached-bar rendering, LongBridge realtime-page historical 1m backfill, LongBridge-delay gap diagnostics, 1d quote-driven candle refresh, provider health telemetry, rate-limit backoff hints, secure credential persistence, provider network calls behind main-process IPC, cache governance
- Next path: strategy execution on real cached bars and richer mixed-source diagnostics

## Official Source Notes

AlphaFeed documentation:

- REST base URL: `https://api.alphafeed.org`
- Real-time quote endpoint: `GET /v1/quotes`
- Authentication: `X-API-Key` header or `api_key` query parameter
- Supported quote query modes: comma-separated `symbols` or `universes`
- Quote markets: `CN`, `US`, `HK`
- Quote fields used by the app: `symbol`, `region`, `last_price`, `prev_close`, `volume`, `amount`, `timestamp`, `ext`
- Historical K-line endpoint: `GET /v1/klines`
- AlphaFeed historical bars are retained as a disabled fallback path only; the current chart history path prefers LongBridge.
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

- Historical K-line and intraday-history backfill
- Backup quote snapshots
- Broker/account-related integration
- Future order, position, and trading workflows

LongBridge intraday constraints:

- Single candlestick requests are capped at 1,000 bars to avoid provider error `301607 request too many klines`.
- A-share and Hong Kong realtime quotes from LongBridge may be delayed by roughly 15 minutes depending on permissions.
- The chart therefore treats LongBridge as historical backfill only. AlphaFeed realtime points newer than the latest LongBridge bar are retained when historical bars refresh, preventing delayed LongBridge history from overwriting the latest AlphaFeed-driven segment.

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
- `window.quantDesktop.longPort.fetchHistoricalBars`

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
3. During chart history loading:
   - Fetch `realtime` page history from LongBridge `1m` candlesticks, capped at 1,000 bars, then store it as the normalized `realtime` cache.
   - Fetch `1d` and `1w` history from LongBridge candlesticks.
   - During market hours, append AlphaFeed quote snapshots to the active realtime or daily bar.
   - If LongBridge history is delayed, preserve newer AlphaFeed bars during every history refresh, report the detected gap, and avoid fabricating intermediate prices.
   - After market close, stop AlphaFeed realtime appends and keep the LongBridge historical line static.
   - Store the provider used in each bar through the normalized `provider` field.

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
2. Add richer visible mixed-source diagnostics, for example per-segment provider coloring or a provider timeline.
