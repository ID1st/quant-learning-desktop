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
  return ema(trueRange(bars), length);
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
