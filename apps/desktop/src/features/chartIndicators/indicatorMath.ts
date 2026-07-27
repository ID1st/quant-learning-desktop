import type { CandlePoint } from "@quant/chart";

export type IndicatorConvention = "a-share" | "cross-market";

export interface IndicatorValuePoint {
  readonly timestamp: number;
  readonly value: number;
}

export interface IndicatorBandPoint {
  readonly timestamp: number;
  readonly mid: number;
  readonly upper: number;
  readonly lower: number;
}

export interface MacdPoint {
  readonly timestamp: number;
  readonly dif: number;
  readonly dea: number;
  readonly histogram: number;
}

export interface KdjPoint {
  readonly timestamp: number;
  readonly k: number;
  readonly d: number;
  readonly j: number;
}

interface SafeCandle {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const roundPeriod = (period: number, minimum = 1) => Math.max(minimum, Math.round(finite(period, minimum)));

function normalizeCandles(candles: readonly CandlePoint[]): SafeCandle[] {
  let previousClose = 0;
  return candles.map((candle, index) => {
    const close = finite(candle.close, previousClose);
    const open = finite(candle.open, close);
    const high = Math.max(open, close, finite(candle.high, close));
    const low = Math.min(open, close, finite(candle.low, close));
    previousClose = close;
    return {
      timestamp: finite(candle.timestamp ?? index, index),
      open,
      high,
      low,
      close,
      volume: Math.max(0, finite(candle.volume)),
    };
  });
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function calculateValueMa(
  values: readonly { readonly timestamp: number; readonly value: number }[],
  period: number,
): IndicatorValuePoint[] {
  const size = roundPeriod(period);
  if (values.length < size) return [];
  let sum = 0;
  const result: IndicatorValuePoint[] = [];
  values.forEach((point, index) => {
    sum += finite(point.value);
    if (index >= size) sum -= finite(values[index - size]?.value ?? 0);
    if (index >= size - 1) result.push({ timestamp: point.timestamp, value: finite(sum / size) });
  });
  return result;
}

function calculateValueEma(
  values: readonly { readonly timestamp: number; readonly value: number }[],
  period: number,
): IndicatorValuePoint[] {
  const size = roundPeriod(period);
  if (values.length < size) return [];
  const alpha = 2 / (size + 1);
  let current = average(values.slice(0, size).map((point) => finite(point.value)));
  const result: IndicatorValuePoint[] = [{ timestamp: values[size - 1]!.timestamp, value: finite(current) }];
  for (let index = size; index < values.length; index += 1) {
    current = finite(values[index]!.value) * alpha + current * (1 - alpha);
    result.push({ timestamp: values[index]!.timestamp, value: finite(current) });
  }
  return result;
}

export function calculateMa(candles: readonly CandlePoint[], period: number): IndicatorValuePoint[] {
  return calculateValueMa(
    normalizeCandles(candles).map((candle) => ({ timestamp: candle.timestamp, value: candle.close })),
    period,
  );
}

export function calculateEma(candles: readonly CandlePoint[], period: number): IndicatorValuePoint[] {
  return calculateValueEma(
    normalizeCandles(candles).map((candle) => ({ timestamp: candle.timestamp, value: candle.close })),
    period,
  );
}

export function calculateBoll(candles: readonly CandlePoint[], period: number, multiplier: number): IndicatorBandPoint[] {
  const normalized = normalizeCandles(candles);
  const size = roundPeriod(period, 2);
  const factor = Math.max(0, finite(multiplier, 2));
  if (normalized.length < size) return [];
  return normalized.slice(size - 1).map((candle, offset) => {
    const index = offset + size - 1;
    const values = normalized.slice(index - size + 1, index + 1).map((item) => item.close);
    const mid = average(values);
    const deviation = Math.sqrt(average(values.map((value) => (value - mid) ** 2)));
    return {
      timestamp: candle.timestamp,
      mid: finite(mid),
      upper: finite(mid + deviation * factor, mid),
      lower: finite(mid - deviation * factor, mid),
    };
  });
}

export function calculateBbi(
  candles: readonly CandlePoint[],
  periods: readonly number[] = [3, 6, 12, 24],
): IndicatorValuePoint[] {
  const normalizedPeriods = periods.map((period) => roundPeriod(period));
  const longest = Math.max(...normalizedPeriods);
  if (candles.length < longest) return [];
  const byTimestamp = normalizedPeriods.map((period) =>
    new Map(calculateMa(candles, period).map((point) => [point.timestamp, point.value])),
  );
  return normalizeCandles(candles).slice(longest - 1).flatMap((candle) => {
    const values = byTimestamp.map((series) => series.get(candle.timestamp));
    if (values.some((value) => value === undefined)) return [];
    return [{ timestamp: candle.timestamp, value: finite(average(values as number[])) }];
  });
}

export function calculateEne(
  candles: readonly CandlePoint[],
  period: number,
  upperPercent: number,
  lowerPercent: number,
): IndicatorBandPoint[] {
  const upperRatio = Math.max(0, finite(upperPercent, 11)) / 100;
  const lowerRatio = Math.max(0, finite(lowerPercent, 9)) / 100;
  return calculateMa(candles, period).map((point) => ({
    timestamp: point.timestamp,
    mid: point.value,
    upper: finite(point.value * (1 + upperRatio), point.value),
    lower: finite(point.value * (1 - lowerRatio), point.value),
  }));
}

export function calculateSar(
  candles: readonly CandlePoint[],
  start: number,
  step: number,
  maximum: number,
): IndicatorValuePoint[] {
  const values = normalizeCandles(candles);
  if (values.length < 2) return [];
  const accelerationStart = Math.max(0.001, finite(start, 0.02));
  const accelerationStep = Math.max(0.001, finite(step, 0.02));
  const accelerationMaximum = Math.max(accelerationStart, finite(maximum, 0.2));
  let rising = values[1]!.close >= values[0]!.close;
  let sar = rising ? values[0]!.low : values[0]!.high;
  let extreme = rising ? Math.max(values[0]!.high, values[1]!.high) : Math.min(values[0]!.low, values[1]!.low);
  let acceleration = accelerationStart;
  const result: IndicatorValuePoint[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const candle = values[index]!;
    sar += acceleration * (extreme - sar);
    if (rising) {
      sar = Math.min(sar, values[index - 1]!.low, index > 1 ? values[index - 2]!.low : values[index - 1]!.low);
      if (candle.low < sar) {
        rising = false;
        sar = extreme;
        extreme = candle.low;
        acceleration = accelerationStart;
      } else if (candle.high > extreme) {
        extreme = candle.high;
        acceleration = Math.min(accelerationMaximum, acceleration + accelerationStep);
      }
    } else {
      sar = Math.max(sar, values[index - 1]!.high, index > 1 ? values[index - 2]!.high : values[index - 1]!.high);
      if (candle.high > sar) {
        rising = true;
        sar = extreme;
        extreme = candle.high;
        acceleration = accelerationStart;
      } else if (candle.low < extreme) {
        extreme = candle.low;
        acceleration = Math.min(accelerationMaximum, acceleration + accelerationStep);
      }
    }
    result.push({ timestamp: candle.timestamp, value: finite(sar, candle.close) });
  }
  return result;
}

export function calculateVolumeMa(candles: readonly CandlePoint[], period: number): IndicatorValuePoint[] {
  return calculateValueMa(
    normalizeCandles(candles).map((candle) => ({ timestamp: candle.timestamp, value: candle.volume })),
    period,
  );
}

export function calculateMacd(
  candles: readonly CandlePoint[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
  convention: IndicatorConvention,
): MacdPoint[] {
  const fast = new Map(calculateEma(candles, fastPeriod).map((point) => [point.timestamp, point.value]));
  const slow = calculateEma(candles, slowPeriod);
  const dif = slow.flatMap((point) => {
    const fastValue = fast.get(point.timestamp);
    return fastValue === undefined ? [] : [{ timestamp: point.timestamp, value: finite(fastValue - point.value) }];
  });
  const dea = calculateValueEma(dif, signalPeriod);
  const difByTimestamp = new Map(dif.map((point) => [point.timestamp, point.value]));
  const histogramFactor = convention === "a-share" ? 2 : 1;
  return dea.map((point) => {
    const difValue = difByTimestamp.get(point.timestamp) ?? point.value;
    return {
      timestamp: point.timestamp,
      dif: finite(difValue),
      dea: finite(point.value),
      histogram: finite((difValue - point.value) * histogramFactor),
    };
  });
}

export function calculateKdj(
  candles: readonly CandlePoint[],
  period: number,
  kSmoothing: number,
  dSmoothing: number,
): KdjPoint[] {
  const values = normalizeCandles(candles);
  const size = roundPeriod(period);
  const kFactor = roundPeriod(kSmoothing);
  const dFactor = roundPeriod(dSmoothing);
  if (values.length < size) return [];
  let k = 50;
  let d = 50;
  const result: KdjPoint[] = [];
  for (let index = size - 1; index < values.length; index += 1) {
    const window = values.slice(index - size + 1, index + 1);
    const highest = Math.max(...window.map((candle) => candle.high));
    const lowest = Math.min(...window.map((candle) => candle.low));
    const amplitude = highest - lowest;
    const rsv = amplitude === 0 ? 50 : ((values[index]!.close - lowest) / amplitude) * 100;
    k = ((kFactor - 1) * k + rsv) / kFactor;
    d = ((dFactor - 1) * d + k) / dFactor;
    result.push({ timestamp: values[index]!.timestamp, k: finite(k, 50), d: finite(d, 50), j: finite(3 * k - 2 * d, 50) });
  }
  return result;
}

export function calculateRsi(candles: readonly CandlePoint[], period: number): IndicatorValuePoint[] {
  const values = normalizeCandles(candles);
  const size = roundPeriod(period);
  if (values.length <= size) return [];
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= size; index += 1) {
    const change = values[index]!.close - values[index - 1]!.close;
    averageGain += Math.max(0, change);
    averageLoss += Math.max(0, -change);
  }
  averageGain /= size;
  averageLoss /= size;
  const result: IndicatorValuePoint[] = [];
  for (let index = size; index < values.length; index += 1) {
    if (index > size) {
      const change = values[index]!.close - values[index - 1]!.close;
      averageGain = ((size - 1) * averageGain + Math.max(0, change)) / size;
      averageLoss = ((size - 1) * averageLoss + Math.max(0, -change)) / size;
    }
    const value = averageGain === 0 && averageLoss === 0
      ? 50
      : averageLoss === 0
        ? 100
        : 100 - 100 / (1 + averageGain / averageLoss);
    result.push({ timestamp: values[index]!.timestamp, value: finite(value, 50) });
  }
  return result;
}

export function calculateWr(candles: readonly CandlePoint[], period: number): IndicatorValuePoint[] {
  const values = normalizeCandles(candles);
  const size = roundPeriod(period);
  if (values.length < size) return [];
  return values.slice(size - 1).map((candle, offset) => {
    const index = offset + size - 1;
    const window = values.slice(index - size + 1, index + 1);
    const highest = Math.max(...window.map((item) => item.high));
    const lowest = Math.min(...window.map((item) => item.low));
    const amplitude = highest - lowest;
    return {
      timestamp: candle.timestamp,
      value: amplitude === 0 ? -50 : finite(-100 * (highest - candle.close) / amplitude, -50),
    };
  });
}

export function calculateCci(
  candles: readonly CandlePoint[],
  period: number,
  constant: number,
): IndicatorValuePoint[] {
  const values = normalizeCandles(candles);
  const size = roundPeriod(period);
  const scale = Math.max(0.000001, finite(constant, 0.015));
  if (values.length < size) return [];
  const typicalPrices = values.map((candle) => (candle.high + candle.low + candle.close) / 3);
  return values.slice(size - 1).map((candle, offset) => {
    const index = offset + size - 1;
    const window = typicalPrices.slice(index - size + 1, index + 1);
    const mean = average(window);
    const meanDeviation = average(window.map((value) => Math.abs(value - mean)));
    return {
      timestamp: candle.timestamp,
      value: meanDeviation === 0 ? 0 : finite((typicalPrices[index]! - mean) / (scale * meanDeviation)),
    };
  });
}
