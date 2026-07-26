import type {
  GatewayMarketDataBar,
  GatewayMarketDataProviderId,
  MarketDataBarRequest,
  MarketDataProviderHealthView,
} from "./marketDataProviderGateway.ts";
import { isMarketDataBarQualityValid } from "./marketDataQuality.ts";

export const mlptMinimumHistoryBars = 1_000;
export const mlptPreferredHistoryBars = 5_000;

export interface HistoricalCoverageRequirement {
  readonly minimumBars: number;
  readonly preferredBars: number;
  readonly confirmedThroughTimestamp: number;
}

export interface MlptHistoricalBackfillSource {
  readonly provider: Extract<GatewayMarketDataProviderId, "stock-sdk" | "longbridge" | "alphafeed-rest">;
  fetchBars(request: MarketDataBarRequest): Promise<readonly GatewayMarketDataBar[]>;
  getHealth?(): Promise<MarketDataProviderHealthView>;
}

export interface HistoricalBackfillResult {
  readonly bars: readonly GatewayMarketDataBar[];
  readonly coverage: {
    readonly confirmedBars: number;
    readonly targetBars: number;
    readonly targetSatisfied: boolean;
    readonly firstTimestamp?: number;
    readonly lastTimestamp?: number;
  };
  readonly contributions: readonly {
    readonly provider: MlptHistoricalBackfillSource["provider"];
    readonly bars: number;
  }[];
  readonly triedProviders: readonly MlptHistoricalBackfillSource["provider"][];
  readonly failures: readonly {
    readonly provider: MlptHistoricalBackfillSource["provider"];
    readonly reason: "request_failed";
  }[];
  readonly stopReason: "target_reached" | "sources_exhausted";
}

const mlptProviderPriority = new Map<string, number>([
  ["stock-sdk", 0],
  ["longbridge", 1],
  ["longport", 1],
  ["alphafeed-rest", 2],
  ["alphafeed", 2],
]);

export function mergeMlptBarsByProviderPriority<
  Bar extends { readonly timestamp: number; readonly provider: string },
>(bars: readonly Bar[]): Bar[] {
  const selected = new Map<number, Bar>();
  for (const bar of bars) {
    const current = selected.get(bar.timestamp);
    if (
      !current ||
      (mlptProviderPriority.get(bar.provider) ?? Number.MAX_SAFE_INTEGER) <
        (mlptProviderPriority.get(current.provider) ?? Number.MAX_SAFE_INTEGER)
    ) {
      selected.set(bar.timestamp, bar);
    }
  }
  return Array.from(selected.values()).sort((left, right) => left.timestamp - right.timestamp);
}

interface FetchMlptHistoricalBackfillOptions {
  readonly request: MarketDataBarRequest;
  readonly targetBars: number;
  readonly confirmedThroughTimestamp: number;
  readonly knownTimestamps?: readonly number[];
  readonly sources: readonly MlptHistoricalBackfillSource[];
}

function isMatchingConfirmedBar(
  bar: GatewayMarketDataBar,
  request: MarketDataBarRequest,
  confirmedThroughTimestamp: number,
) {
  return (
    bar.symbol === request.symbol &&
    bar.market === request.market &&
    (bar.timeframe === "1m" || bar.timeframe === "realtime") &&
    bar.timestamp <= confirmedThroughTimestamp &&
    (request.startTime === undefined || bar.timestamp >= request.startTime) &&
    isMarketDataBarQualityValid(bar)
  );
}

export async function fetchMlptHistoricalBackfill(
  options: FetchMlptHistoricalBackfillOptions,
): Promise<HistoricalBackfillResult> {
  const targetBars = Math.max(
    1,
    Math.min(mlptPreferredHistoryBars, Math.round(options.targetBars)),
  );
  const knownTimestamps = new Set(
    (options.knownTimestamps ?? []).filter(
      (timestamp) =>
        Number.isFinite(timestamp) &&
        timestamp <= options.confirmedThroughTimestamp &&
        (options.request.startTime === undefined || timestamp >= options.request.startTime),
    ),
  );
  const selectedBars = new Map<number, GatewayMarketDataBar>();
  const triedProviders: MlptHistoricalBackfillSource["provider"][] = [];
  const failures: HistoricalBackfillResult["failures"][number][] = [];

  for (const source of options.sources) {
    if (new Set([...knownTimestamps, ...selectedBars.keys()]).size >= targetBars) break;
    triedProviders.push(source.provider);

    try {
      const bars = await source.fetchBars({ ...options.request, count: targetBars });
      for (const bar of bars) {
        if (
          !selectedBars.has(bar.timestamp) &&
          isMatchingConfirmedBar(bar, options.request, options.confirmedThroughTimestamp)
        ) {
          selectedBars.set(bar.timestamp, bar);
        }
      }
    } catch {
      failures.push({ provider: source.provider, reason: "request_failed" });
    }
  }

  const bars = Array.from(selectedBars.values()).sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  const contributions = options.sources.flatMap((source) => {
    const count = bars.filter((bar) => bar.provider === source.provider).length;
    return count > 0 ? [{ provider: source.provider, bars: count }] : [];
  });
  const confirmedBars = new Set([...knownTimestamps, ...bars.map((bar) => bar.timestamp)]).size;
  const targetSatisfied = confirmedBars >= targetBars;

  return {
    bars,
    coverage: {
      confirmedBars,
      targetBars,
      targetSatisfied,
      firstTimestamp: bars[0]?.timestamp,
      lastTimestamp: bars.at(-1)?.timestamp,
    },
    contributions,
    triedProviders,
    failures,
    stopReason: targetSatisfied ? "target_reached" : "sources_exhausted",
  };
}
