export type SeriesValue = number | null | undefined;

function isValidNumber(value: SeriesValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function nz(value: SeriesValue, replacement = 0): number {
  return isValidNumber(value) ? value : replacement;
}

export function history<T>(series: readonly T[], index: number, offset: number): T | undefined {
  return series[index - offset];
}

export function sma(series: readonly SeriesValue[], length: number): Array<number | null> {
  return series.map((_, index) => {
    const window = series.slice(index - length + 1, index + 1);
    if (window.length < length || !window.every(isValidNumber)) {
      return null;
    }

    return sum(window) / length;
  });
}

export function ema(series: readonly SeriesValue[], length: number): Array<number | null> {
  const alpha = 2 / (length + 1);
  let previous: number | null = null;

  return series.map((value, index) => {
    if (!isValidNumber(value)) {
      return null;
    }

    if (previous === null) {
      const window = series.slice(index - length + 1, index + 1);
      if (window.length < length || !window.every(isValidNumber)) {
        return null;
      }

      previous = sum(window) / length;
      return previous;
    }

    previous = value * alpha + previous * (1 - alpha);
    return previous;
  });
}

export function rma(series: readonly SeriesValue[], length: number): Array<number | null> {
  const safeLength = Math.max(1, Math.floor(length));
  const alpha = 1 / safeLength;
  let previous: number | null = null;

  return series.map((value, index) => {
    if (!isValidNumber(value)) {
      return null;
    }

    if (previous === null) {
      const window = series.slice(index - safeLength + 1, index + 1);
      if (window.length < safeLength || !window.every(isValidNumber)) {
        return null;
      }

      previous = sum(window) / safeLength;
      return previous;
    }

    previous = value * alpha + previous * (1 - alpha);
    return previous;
  });
}

export function wma(series: readonly SeriesValue[], length: number): Array<number | null> {
  const denominator = (length * (length + 1)) / 2;

  return series.map((_, index) => {
    const window = series.slice(index - length + 1, index + 1);
    if (window.length < length || !window.every(isValidNumber)) {
      return null;
    }

    return window.reduce((total, value, windowIndex) => total + value * (windowIndex + 1), 0) / denominator;
  });
}

export function hma(series: readonly SeriesValue[], length: number): Array<number | null> {
  const safeLength = Math.max(1, Math.floor(length));
  const halfLength = Math.max(1, Math.floor(safeLength / 2));
  const rootLength = Math.max(1, Math.round(Math.sqrt(safeLength)));
  const half = wma(series, halfLength);
  const full = wma(series, safeLength);
  const difference = series.map((_, index) =>
    isValidNumber(half[index]) && isValidNumber(full[index])
      ? 2 * half[index]! - full[index]!
      : null,
  );

  return wma(difference, rootLength);
}

export function rollingSum(series: readonly SeriesValue[], length: number): Array<number | null> {
  const safeLength = Math.max(1, Math.floor(length));

  return series.map((_, index) => {
    const window = series.slice(index - safeLength + 1, index + 1);
    return window.length === safeLength && window.every(isValidNumber) ? sum(window) : null;
  });
}

export function highest(series: readonly SeriesValue[], length: number): Array<number | null> {
  return series.map((_, index) => {
    const window = series.slice(index - length + 1, index + 1);
    if (window.length < length || !window.every(isValidNumber)) {
      return null;
    }

    return Math.max(...window);
  });
}

export function lowest(series: readonly SeriesValue[], length: number): Array<number | null> {
  return series.map((_, index) => {
    const window = series.slice(index - length + 1, index + 1);
    if (window.length < length || !window.every(isValidNumber)) {
      return null;
    }

    return Math.min(...window);
  });
}

export interface OhlcBar {
  high: number;
  low: number;
  close: number;
}

export function trueRange(bars: readonly OhlcBar[]): Array<number | null> {
  return bars.map((bar, index) => {
    const previousClose = history(bars, index, 1)?.close;
    if (!isValidNumber(previousClose)) {
      return bar.high - bar.low;
    }

    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
}

export function atr(bars: readonly OhlcBar[], length: number): Array<number | null> {
  return rma(trueRange(bars), length);
}

export function rsi(series: readonly SeriesValue[], length: number): Array<number | null> {
  const changes = series.map((value, index) => {
    const previous = history(series, index, 1);
    return isValidNumber(value) && isValidNumber(previous) ? value - previous : null;
  });
  const gains = changes.map((value) => isValidNumber(value) ? Math.max(value, 0) : null);
  const losses = changes.map((value) => isValidNumber(value) ? Math.max(-value, 0) : null);
  const averageGain = rma(gains, length);
  const averageLoss = rma(losses, length);

  return series.map((_, index) => {
    const gain = averageGain[index];
    const loss = averageLoss[index];
    if (!isValidNumber(gain) || !isValidNumber(loss)) {
      return null;
    }
    if (gain === 0 && loss === 0) {
      return 50;
    }
    if (loss === 0) {
      return 100;
    }
    if (gain === 0) {
      return 0;
    }

    return 100 - 100 / (1 + gain / loss);
  });
}

export interface SupertrendResult {
  line: Array<number | null>;
  direction: Array<1 | -1 | null>;
}

export function supertrend(bars: readonly OhlcBar[], factor: number, length: number): SupertrendResult {
  const atrValues = atr(bars, length);
  const line: Array<number | null> = [];
  const direction: Array<1 | -1 | null> = [];
  const upperBand: Array<number | null> = [];
  const lowerBand: Array<number | null> = [];

  bars.forEach((bar, index) => {
    const volatility = atrValues[index];
    if (!isValidNumber(volatility)) {
      upperBand.push(null);
      lowerBand.push(null);
      line.push(null);
      direction.push(null);
      return;
    }

    const midpoint = (bar.high + bar.low) / 2;
    const basicUpper = midpoint + factor * volatility;
    const basicLower = midpoint - factor * volatility;
    const previousUpper = upperBand[index - 1];
    const previousLower = lowerBand[index - 1];
    const previousClose = bars[index - 1]?.close;
    const finalUpper =
      !isValidNumber(previousUpper) || basicUpper < previousUpper || (isValidNumber(previousClose) && previousClose > previousUpper)
        ? basicUpper
        : previousUpper;
    const finalLower =
      !isValidNumber(previousLower) || basicLower > previousLower || (isValidNumber(previousClose) && previousClose < previousLower)
        ? basicLower
        : previousLower;
    const previousLine = line[index - 1];
    let nextDirection: 1 | -1;

    if (!isValidNumber(previousLine) || !isValidNumber(previousUpper)) {
      nextDirection = 1;
    } else if (previousLine === previousUpper) {
      nextDirection = bar.close > finalUpper ? -1 : 1;
    } else {
      nextDirection = bar.close < finalLower ? 1 : -1;
    }

    upperBand.push(finalUpper);
    lowerBand.push(finalLower);
    direction.push(nextDirection);
    line.push(nextDirection === -1 ? finalLower : finalUpper);
  });

  return { line, direction };
}

export function barssince(condition: readonly boolean[]): Array<number | null> {
  let elapsed: number | null = null;

  return condition.map((value) => {
    if (value) {
      elapsed = 0;
    } else if (elapsed !== null) {
      elapsed += 1;
    }

    return elapsed;
  });
}

export function crossover(left: readonly SeriesValue[], right: readonly SeriesValue[]): boolean[] {
  return left.map((leftValue, index) => {
    const previousLeft = history(left, index, 1);
    const rightValue = right[index];
    const previousRight = history(right, index, 1);

    return (
      isValidNumber(leftValue) &&
      isValidNumber(previousLeft) &&
      isValidNumber(rightValue) &&
      isValidNumber(previousRight) &&
      previousLeft <= previousRight &&
      leftValue > rightValue
    );
  });
}

export function crossunder(left: readonly SeriesValue[], right: readonly SeriesValue[]): boolean[] {
  return left.map((leftValue, index) => {
    const previousLeft = history(left, index, 1);
    const rightValue = right[index];
    const previousRight = history(right, index, 1);

    return (
      isValidNumber(leftValue) &&
      isValidNumber(previousLeft) &&
      isValidNumber(rightValue) &&
      isValidNumber(previousRight) &&
      previousLeft >= previousRight &&
      leftValue < rightValue
    );
  });
}

export function cross(left: readonly SeriesValue[], right: readonly SeriesValue[]): boolean[] {
  const up = crossover(left, right);
  const down = crossunder(left, right);
  return up.map((value, index) => value || down[index]);
}
