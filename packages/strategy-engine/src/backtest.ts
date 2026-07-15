import type { Bar, StrategySignal } from "./index.ts";

export type BacktestPositionDirection = "long" | "short";

export interface BacktestSettings {
  initialCapital?: number;
  feeRate?: number;
  slippageRate?: number;
  allowShort?: boolean;
}

export interface ResolvedBacktestSettings {
  initialCapital: number;
  feeRate: number;
  slippageRate: number;
  allowShort: boolean;
}

export interface BacktestTrade {
  direction: BacktestPositionDirection;
  entryTimestamp: number;
  entryPrice: number;
  exitTimestamp: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  returnPct: number;
  entrySignalTimestamp: number;
  exitSignalTimestamp?: number;
}

export interface BacktestEquityPoint {
  timestamp: number;
  equity: number;
}

export interface BacktestSummary {
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  tradeCount: number;
  winningTradeCount: number;
  winRate: number;
  profitFactor: number | null;
}

export interface BacktestResult {
  settings: ResolvedBacktestSettings;
  summary: BacktestSummary;
  trades: BacktestTrade[];
  equityCurve: BacktestEquityPoint[];
  warnings: string[];
}

export interface StrategyBacktestRequest {
  bars: readonly Bar[];
  signals: readonly StrategySignal[];
  settings?: BacktestSettings;
}

interface OpenPosition {
  direction: BacktestPositionDirection;
  entryTimestamp: number;
  entryPrice: number;
  quantity: number;
  entryFee: number;
  entrySignalTimestamp: number;
}

const defaultSettings: ResolvedBacktestSettings = {
  initialCapital: 100_000,
  feeRate: 0.0005,
  slippageRate: 0.0005,
  allowShort: false,
};

function finitePositive(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteSlippageRate(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1 ? value : fallback;
}

function hasFiniteBarFields(bar: Bar) {
  return [bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite);
}

function isTradableBar(bar: Bar) {
  return (
    hasFiniteBarFields(bar) &&
    bar.open > 0 &&
    bar.high > 0 &&
    bar.low > 0 &&
    bar.close > 0 &&
    bar.volume >= 0
  );
}

export function resolveBacktestSettings(settings: BacktestSettings = {}): ResolvedBacktestSettings {
  return {
    initialCapital: finitePositive(settings.initialCapital, defaultSettings.initialCapital),
    feeRate: finiteSlippageRate(settings.feeRate, defaultSettings.feeRate),
    slippageRate: finiteSlippageRate(settings.slippageRate, defaultSettings.slippageRate),
    allowShort: settings.allowShort ?? defaultSettings.allowShort,
  };
}

function getSignalDirection(signal: StrategySignal, allowShort: boolean): BacktestPositionDirection | null {
  if (signal.type === "buy") {
    return "long";
  }

  return signal.type === "sell" && allowShort ? "short" : null;
}

function getEntryPrice(price: number, direction: BacktestPositionDirection, slippageRate: number) {
  return direction === "long" ? price * (1 + slippageRate) : price * (1 - slippageRate);
}

function getExitPrice(price: number, direction: BacktestPositionDirection, slippageRate: number) {
  return direction === "long" ? price * (1 - slippageRate) : price * (1 + slippageRate);
}

function getUnrealizedNetPnl(position: OpenPosition, markPrice: number, feeRate: number, slippageRate: number) {
  const exitPrice = getExitPrice(markPrice, position.direction, slippageRate);
  const grossPnl = position.direction === "long" ? (exitPrice - position.entryPrice) * position.quantity : (position.entryPrice - exitPrice) * position.quantity;
  return grossPnl - position.entryFee - exitPrice * position.quantity * feeRate;
}

export function runStrategyBacktest(request: StrategyBacktestRequest): BacktestResult {
  const settings = resolveBacktestSettings(request.settings);
  const bars = [...request.bars]
    .filter(hasFiniteBarFields)
    .sort((left, right) => left.timestamp - right.timestamp);
  const warnings: string[] = [];

  if (bars.filter(isTradableBar).length < 2) {
    return createEmptyResult(settings, warnings.concat("至少需要两根有效 K 线，才能按下一根 K 线开盘价成交。"));
  }

  const signalsByTimestamp = new Map<number, StrategySignal[]>();
  request.signals
    .filter((signal) => Number.isFinite(signal.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((signal) => {
      const signals = signalsByTimestamp.get(signal.timestamp) ?? [];
      signals.push(signal);
      signalsByTimestamp.set(signal.timestamp, signals);
    });

  let capital = settings.initialCapital;
  const state: { position: OpenPosition | null } = { position: null };
  let pendingSignal: StrategySignal | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestEquityPoint[] = [];
  let latestMarkPrice: number | null = null;
  let capitalExhaustionWarned = false;

  const warnCapitalExhausted = () => {
    if (!capitalExhaustionWarned) {
      warnings.push("capital is exhausted; no new position was opened.");
      capitalExhaustionWarned = true;
    }
  };

  const closePosition = (bar: Bar, exitSignalTimestamp?: number) => {
    if (!state.position) {
      return;
    }

    const exitPrice = getExitPrice(bar.open, state.position.direction, settings.slippageRate);
    const grossPnl =
      state.position.direction === "long"
        ? (exitPrice - state.position.entryPrice) * state.position.quantity
        : (state.position.entryPrice - exitPrice) * state.position.quantity;
    const exitFee = exitPrice * state.position.quantity * settings.feeRate;
    const netPnl = grossPnl - state.position.entryFee - exitFee;
    const startingCapital = capital;
    capital += netPnl;
    trades.push({
      direction: state.position.direction,
      entryTimestamp: state.position.entryTimestamp,
      entryPrice: state.position.entryPrice,
      exitTimestamp: bar.timestamp,
      exitPrice,
      quantity: state.position.quantity,
      grossPnl,
      fees: state.position.entryFee + exitFee,
      netPnl,
      returnPct: startingCapital > 0 ? (netPnl / startingCapital) * 100 : 0,
      entrySignalTimestamp: state.position.entrySignalTimestamp,
      ...(exitSignalTimestamp === undefined ? {} : { exitSignalTimestamp }),
    });
    state.position = null;
  };

  const openPosition = (bar: Bar, direction: BacktestPositionDirection, signal: StrategySignal) => {
    const entryPrice = getEntryPrice(bar.open, direction, settings.slippageRate);
    if (capital <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
      warnCapitalExhausted();
      return;
    }
    const quantity = capital / (entryPrice * (1 + settings.feeRate));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      warnCapitalExhausted();
      return;
    }
    const entryFee = entryPrice * quantity * settings.feeRate;
    state.position = {
      direction,
      entryTimestamp: bar.timestamp,
      entryPrice,
      quantity,
      entryFee,
      entrySignalTimestamp: signal.timestamp,
    };
  };

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];

    if (pendingSignal) {
      if (!isTradableBar(bar)) {
        warnings.push("待成交信号对应的下一根 K 线价格无效，已忽略该次成交。");
      } else {
        const direction = getSignalDirection(pendingSignal, settings.allowShort);
        if (pendingSignal.type === "exit" || (pendingSignal.type === "sell" && !settings.allowShort)) {
          closePosition(bar, pendingSignal.timestamp);
        } else if (direction && state.position?.direction !== direction) {
          closePosition(bar, pendingSignal.timestamp);
          openPosition(bar, direction, pendingSignal);
        } else if (direction && !state.position) {
          openPosition(bar, direction, pendingSignal);
        }
      }

      pendingSignal = null;
    }

    const directionalSignal = (signalsByTimestamp.get(bar.timestamp) ?? []).find((signal) => signal.type === "buy" || signal.type === "sell" || signal.type === "exit");
    if (directionalSignal) {
      if (index === bars.length - 1) {
        warnings.push("最后一根 K 线产生的信号没有下一根开盘价，已忽略。" );
      } else {
        pendingSignal = directionalSignal;
      }
    }

    if (isTradableBar(bar)) {
      latestMarkPrice = bar.close;
    }

    equityCurve.push({
      timestamp: bar.timestamp,
      equity: capital + (state.position && latestMarkPrice !== null ? getUnrealizedNetPnl(state.position, latestMarkPrice, settings.feeRate, settings.slippageRate) : 0),
    });
  }

  if (state.position) {
    const lastBar = [...bars].reverse().find(isTradableBar);
    if (!lastBar) {
      return createEmptyResult(settings, warnings);
    }
    warnings.push("回测结束时仍有持仓，已按最后一根 K 线收盘价强制平仓。" );
    const closingBar = { ...lastBar, open: lastBar.close };
    closePosition(closingBar);
    const finalEquityIndex = equityCurve.length - 1;
    equityCurve[finalEquityIndex] = { timestamp: bars[finalEquityIndex]?.timestamp ?? lastBar.timestamp, equity: capital };
  }

  const winningTradeCount = trades.filter((trade) => trade.netPnl > 0).length;
  const grossProfit = trades.filter((trade) => trade.netPnl > 0).reduce((total, trade) => total + trade.netPnl, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.netPnl < 0).reduce((total, trade) => total + trade.netPnl, 0));
  let peakEquity = settings.initialCapital;
  let maxDrawdownPct = 0;
  equityCurve.forEach((point) => {
    peakEquity = Math.max(peakEquity, point.equity);
    if (peakEquity > 0) {
      maxDrawdownPct = Math.max(maxDrawdownPct, ((peakEquity - point.equity) / peakEquity) * 100);
    }
  });

  return {
    settings,
    summary: {
      initialCapital: settings.initialCapital,
      finalCapital: capital,
      totalReturnPct: ((capital - settings.initialCapital) / settings.initialCapital) * 100,
      maxDrawdownPct,
      tradeCount: trades.length,
      winningTradeCount,
      winRate: trades.length > 0 ? (winningTradeCount / trades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    },
    trades,
    equityCurve,
    warnings,
  };
}

function createEmptyResult(settings: ResolvedBacktestSettings, warnings: string[]): BacktestResult {
  return {
    settings,
    summary: {
      initialCapital: settings.initialCapital,
      finalCapital: settings.initialCapital,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      tradeCount: 0,
      winningTradeCount: 0,
      winRate: 0,
      profitFactor: 0,
    },
    trades: [],
    equityCurve: [],
    warnings,
  };
}
