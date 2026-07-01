# Market Data Provider Plan

## Current Decision

The system now treats AlphaFeed as the primary market data provider and LongBridge as the backup provider.

- Primary provider: AlphaFeed
- Backup provider: LongBridge OpenAPI
- Current implemented path: REST quote snapshot, historical K-line, intraday K-line, initial default-watchlist K-line sync, chart workspace cached-bar rendering, secure credential persistence, provider network calls behind main-process IPC, cache governance
- Next path: AlphaFeed realtime stream and provider health

## Official Source Notes

AlphaFeed documentation:

- REST base URL: `https://api.alphafeed.org`
- Real-time quote endpoint: `GET /v1/quotes`
- Authentication: `X-API-Key` header or `api_key` query parameter
- Supported quote query modes: comma-separated `symbols` or `universes`
- Quote markets: `CN`, `US`, `HK`
- Quote fields used by the app: `symbol`, `region`, `last_price`, `prev_close`, `volume`, `amount`, `timestamp`, `ext`
- Historical K-line endpoint: `GET /v1/klines`
- Intraday K-line endpoint: `GET /v1/klines/intraday`
- K-line response format: columnar OHLCV arrays with matching indexes
- WebSocket stream: `wss://api.tickflow.org/v1/ws/stream`
- WebSocket subscription channels: `quotes`, `depth`

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
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
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

1. Add AlphaFeed WebSocket quote stream with reconnect and backoff.
2. Add provider health status and latency display.
3. Add market permission detection and user-facing no-permission states.
4. Keep LongBridge as explicit backup and future trading/account channel.
