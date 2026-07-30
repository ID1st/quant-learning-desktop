export type LegacyMarketDataProviderId = "alphafeed" | "longport";
export type GatewayMarketDataProviderId =
  "stock-sdk" | "alphafeed-rest" | "alphafeed-websocket" | "longbridge" | "yahoo-finance";
export type MarketDataProviderId = LegacyMarketDataProviderId | GatewayMarketDataProviderId;

export const marketDataProviderIds = [
  "alphafeed",
  "longport",
  "stock-sdk",
  "alphafeed-rest",
  "alphafeed-websocket",
  "longbridge",
  "yahoo-finance",
] as const satisfies readonly MarketDataProviderId[];

export const liveMarketDataProviderIds: readonly MarketDataProviderId[] = [
  "alphafeed",
  "stock-sdk",
  "alphafeed-rest",
  "alphafeed-websocket",
  "yahoo-finance",
] as const;

export const historicalMarketDataProviderIds: readonly MarketDataProviderId[] = [
  "longport",
  "longbridge",
] as const;

export function sanitizeMarketDataProviderId(value: unknown): MarketDataProviderId | null {
  return typeof value === "string" && marketDataProviderIds.includes(value as MarketDataProviderId)
    ? (value as MarketDataProviderId)
    : null;
}

export function isLiveMarketDataProviderId(provider: MarketDataProviderId) {
  return liveMarketDataProviderIds.includes(provider);
}

export function isHistoricalMarketDataProviderId(provider: MarketDataProviderId) {
  return historicalMarketDataProviderIds.includes(provider);
}
