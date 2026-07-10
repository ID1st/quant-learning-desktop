# Market Data Stability Plan

## Status

Completed on 2026-07-11. This slice stabilizes the provider-neutral chart data path without changing the chart, strategy, or cache contracts.

## Provider Priority

1. `stock-sdk`: primary source for CN/HK/US quotes, historical bars, and intraday bars.
2. `yahoo-finance`: US-only fallback for `1m`, `1d`, and `1w` bars. It does not provide websocket or quote-snapshot capability.
3. `alphafeed-rest`: configured credential-backed REST fallback.
4. `alphafeed-websocket`: configured member streaming fallback for quote snapshots.
5. `longbridge`: configured fallback and broker integration path.

The selected provider is capability-specific. Yahoo is intentionally skipped for quote snapshots because it declares no `realtimeQuote` capability.

## Failure and Cache Rules

- Provider errors are passed through the neutral gateway with the latest sanitized provider-health message.
- Stock SDK network failures are classified as a transient network failure and tell the UI that fallback sources were attempted.
- Yahoo retries one transient network or HTTP 5xx request with bounded linear backoff. Authentication and rate-limit responses are not retried by this provider.
- If an intraday or historical refresh fails, the current local cache remains the displayed data. The chart status explicitly reports the retained cache count.
- Historical realtime bars are merged with newer live points; historical data cannot overwrite newer live points.

## Performance Rules

- The chart renders cached bars first, then refreshes in the background.
- Concurrent identical chart-bar requests share one in-flight request.
- Realtime data keeps full raw bars for cache and strategy execution. Only the chart render input is sampled when it exceeds 1,200 points; first/last points and per-bucket high/low extrema are retained.
- Viewport, price scale, and right-side spacing remain owned by the chart viewport model, so a background refresh does not reset a user's view.

## Capability and External Risk

Yahoo Finance is a best-effort public fallback, not a guaranteed real-time feed. Current implementation only claims US chart bars and declares `delayLevel: unknown`; upstream rate limits, access restrictions, delayed data, or network blocks can make it unavailable. Stock SDK also depends on upstream network sources, so the UI must retain cache and expose fallback diagnostics rather than promise continuous availability.

## Verification

- Provider fallback, provider-health detail, transient retry, and render sampling have desktop regression coverage.
- The chart test suite verifies future-area pan, stable viewport updates, and right-axis price scaling.
- Electron development mode was restarted after the main-process IPC change; the window responded successfully and a local renderer page loaded with a clean console.
