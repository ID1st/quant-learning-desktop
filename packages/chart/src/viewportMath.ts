export interface ChartVisibleRange {
  start: number;
  end: number;
}

export function clampChartVisibleRange(
  range: ChartVisibleRange,
  total: number,
  minimumWindow = 12,
  futurePaddingBars = 0,
): ChartVisibleRange {
  const safeTotal = Math.max(0, Math.floor(total));
  if (safeTotal === 0) {
    return { start: 0, end: 0 };
  }

  const safeFuturePadding = Math.max(0, Math.floor(futurePaddingBars));
  const maxEnd = safeTotal + safeFuturePadding;
  const safeMinimumWindow = Math.max(1, Math.min(maxEnd, Math.floor(minimumWindow)));
  const requestedStart = Math.floor(range.start);
  const requestedEnd = Math.ceil(range.end);
  const requestedWindow = Math.max(safeMinimumWindow, requestedEnd - requestedStart);
  const windowSize = Math.min(maxEnd, requestedWindow);
  const start = Math.max(0, Math.min(maxEnd - windowSize, requestedStart));

  return { start, end: start + windowSize };
}

export function getChartFuturePaddingBars(range: ChartVisibleRange) {
  return Math.max(12, Math.round(Math.max(1, range.end - range.start) * 0.5));
}

export function shouldInitializeChartViewAfterSparseLoad(previousTotal: number, nextTotal: number, minimumInteractiveCandles = 12) {
  return previousTotal < minimumInteractiveCandles && nextTotal >= minimumInteractiveCandles;
}

export function zoomChartVisibleRange(
  range: ChartVisibleRange,
  total: number,
  anchorRatio: number,
  zoomFactor: number,
  futurePaddingBars = 0,
): ChartVisibleRange {
  const current = clampChartVisibleRange(range, total, 12, futurePaddingBars);
  const currentWindow = Math.max(1, current.end - current.start);
  const nextWindow = currentWindow * zoomFactor;
  const safeAnchorRatio = Math.max(0, Math.min(1, anchorRatio));
  const anchorIndex = current.start + currentWindow * safeAnchorRatio;
  const nextStart = Math.round(anchorIndex - nextWindow * safeAnchorRatio);

  return clampChartVisibleRange({ start: nextStart, end: nextStart + nextWindow }, total, 12, futurePaddingBars);
}

export function panChartVisibleRange(range: ChartVisibleRange, total: number, deltaBars: number, futurePaddingBars = 0): ChartVisibleRange {
  const current = clampChartVisibleRange(range, total, 12, futurePaddingBars);
  const shift = Math.round(deltaBars);

  return clampChartVisibleRange({ start: current.start + shift, end: current.end + shift }, total, 12, futurePaddingBars);
}

export function syncChartVisibleRangeForDataUpdate(
  range: ChartVisibleRange,
  previousTotal: number,
  nextTotal: number,
  futurePaddingBars = 0,
): ChartVisibleRange {
  const safePreviousTotal = Math.max(0, Math.floor(previousTotal));
  const safeNextTotal = Math.max(0, Math.floor(nextTotal));

  if (safeNextTotal === 0) {
    return { start: 0, end: 0 };
  }

  const windowSize = Math.max(1, range.end - range.start);
  const wasPinnedToLatest = safePreviousTotal === 0 || range.end >= safePreviousTotal;

  if (wasPinnedToLatest) {
    const preservedFuturePadding = Math.max(0, range.end - safePreviousTotal);
    return clampChartVisibleRange(
      { start: safeNextTotal - windowSize + preservedFuturePadding, end: safeNextTotal + preservedFuturePadding },
      safeNextTotal,
      12,
      futurePaddingBars,
    );
  }

  return clampChartVisibleRange(range, safeNextTotal, 12, futurePaddingBars);
}

export function getScaledPriceRange(minPrice: number, maxPrice: number, scaleFactor: number) {
  const safeMin = Math.min(minPrice, maxPrice);
  const safeMax = Math.max(minPrice, maxPrice);
  const center = (safeMin + safeMax) / 2;
  const baseRange = Math.max(1, safeMax - safeMin);
  const safeScaleFactor = Math.max(0.25, Math.min(4, Number.isFinite(scaleFactor) ? scaleFactor : 1));
  const scaledRange = baseRange * safeScaleFactor;

  return {
    min: center - scaledRange / 2,
    max: center + scaledRange / 2,
  };
}

/** Moves the price viewport without changing its vertical density. */
export function panChartPriceRange(minPrice: number, maxPrice: number, deltaPrice: number) {
  const safeMin = Math.min(minPrice, maxPrice);
  const safeMax = Math.max(minPrice, maxPrice);
  const safeDelta = Number.isFinite(deltaPrice) ? deltaPrice : 0;

  return {
    min: safeMin + safeDelta,
    max: safeMax + safeDelta,
  };
}

/** Keeps price-line text inside its SVG label across Chinese and Latin scripts. */
export function getChartPriceLineLabelLayout(label: string, rightX: number, minimumX: number) {
  const safeRightX = Number.isFinite(rightX) ? rightX : 0;
  const safeMinimumX = Math.min(safeRightX, Number.isFinite(minimumX) ? minimumX : 0);
  const horizontalPadding = 12;
  const estimatedTextWidth = Array.from(label).reduce((width, character) => {
    if (/\s/.test(character)) return width + 6;
    return width + (/[^\u0000-\u00ff]/.test(character) ? 12 : 7);
  }, 0);
  const desiredWidth = Math.max(100, Math.ceil(estimatedTextWidth + horizontalPadding * 2));
  const availableWidth = Math.max(1, safeRightX - safeMinimumX);
  const width = Math.min(desiredWidth, availableWidth);
  const x = safeRightX - width;

  return {
    x,
    width,
    textX: x + width - horizontalPadding,
    textLength: Math.max(1, width - horizontalPadding * 2),
  };
}
