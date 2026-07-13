import type { BacktestResult } from "@quant/strategy-engine";
import type { Market, Timeframe } from "@quant/shared";
import { appLocalDatabase, type LocalDatabase } from "../persistence/localDatabase.ts";

const COLLECTION_KEY = "strategy-backtest-runs";
const STORAGE_VERSION = 1;
const MAX_SAVED_RUNS = 20;

export interface StrategyBacktestRun {
  id: string;
  createdAt: string;
  strategyKey: string;
  strategyName: string;
  strategyVersion: string;
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  parameters: Record<string, unknown>;
  result: BacktestResult;
}

function isMarket(value: unknown): value is Market {
  return value === "US" || value === "HK" || value === "CN";
}

function isTimeframe(value: unknown): value is Timeframe {
  return value === "realtime" || value === "1m" || value === "5m" || value === "15m" || value === "30m" || value === "1h" || value === "1d" || value === "1w";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeResult(value: unknown): BacktestResult | null {
  if (!isRecord(value) || !isRecord(value.settings) || !isRecord(value.summary) || !Array.isArray(value.trades) || !Array.isArray(value.equityCurve) || !Array.isArray(value.warnings)) {
    return null;
  }

  const { settings, summary } = value;
  if (
    !isFiniteNumber(settings.initialCapital) ||
    !isFiniteNumber(settings.feeRate) ||
    !isFiniteNumber(settings.slippageRate) ||
    typeof settings.allowShort !== "boolean" ||
    !isFiniteNumber(summary.initialCapital) ||
    !isFiniteNumber(summary.finalCapital) ||
    !isFiniteNumber(summary.totalReturnPct) ||
    !isFiniteNumber(summary.maxDrawdownPct) ||
    !isFiniteNumber(summary.tradeCount) ||
    !isFiniteNumber(summary.winningTradeCount) ||
    !isFiniteNumber(summary.winRate) ||
    !(summary.profitFactor === null || isFiniteNumber(summary.profitFactor))
  ) {
    return null;
  }

  const trades = value.trades.filter((trade) => {
    if (!isRecord(trade)) return false;
    return (
      (trade.direction === "long" || trade.direction === "short") &&
      [trade.entryTimestamp, trade.entryPrice, trade.exitTimestamp, trade.exitPrice, trade.quantity, trade.grossPnl, trade.fees, trade.netPnl, trade.returnPct, trade.entrySignalTimestamp].every((item) => isFiniteNumber(item))
    );
  });
  const equityCurve = value.equityCurve.filter((point) => isRecord(point) && isFiniteNumber(point.timestamp) && isFiniteNumber(point.equity));

  if (trades.length !== value.trades.length || equityCurve.length !== value.equityCurve.length || !value.warnings.every((warning) => typeof warning === "string")) {
    return null;
  }

  return value as unknown as BacktestResult;
}

function sanitizeRun(value: unknown): StrategyBacktestRun | null {
  if (!isRecord(value) || !isMarket(value.market) || !isTimeframe(value.timeframe) || !isRecord(value.parameters)) {
    return null;
  }

  const result = sanitizeResult(value.result);
  if (
    !result ||
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.strategyKey !== "string" ||
    typeof value.strategyName !== "string" ||
    typeof value.strategyVersion !== "string" ||
    typeof value.symbol !== "string"
  ) {
    return null;
  }

  return { ...value, result } as StrategyBacktestRun;
}

function sanitizeRuns(value: unknown): StrategyBacktestRun[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const runs = value.map(sanitizeRun).filter((run): run is StrategyBacktestRun => run !== null);
  return runs.length === value.length ? runs : null;
}

export function readStrategyBacktestRuns(database: LocalDatabase = appLocalDatabase) {
  return database.readDocument(COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: [],
    sanitize: sanitizeRuns,
  });
}

export function saveStrategyBacktestRun(run: StrategyBacktestRun, database: LocalDatabase = appLocalDatabase) {
  if (!sanitizeRun(run)) {
    throw new Error("回测结果包含无效数值，未保存。");
  }

  const nextRuns = [run, ...readStrategyBacktestRuns(database).filter((item) => item.id !== run.id)].slice(0, MAX_SAVED_RUNS);
  database.writeDocument(COLLECTION_KEY, STORAGE_VERSION, nextRuns);
  return nextRuns;
}

export function deleteStrategyBacktestRun(id: string, database: LocalDatabase = appLocalDatabase) {
  const nextRuns = readStrategyBacktestRuns(database).filter((item) => item.id !== id);
  database.writeDocument(COLLECTION_KEY, STORAGE_VERSION, nextRuns);
  return nextRuns;
}
