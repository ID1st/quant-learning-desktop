export interface ChartVisibleRange {
  start: number;
  end: number;
}

export function clampChartVisibleRange(range: ChartVisibleRange, total: number, minimumWindow = 12): ChartVisibleRange {
  const safeTotal = Math.max(0, Math.floor(total));
  if (safeTotal === 0) {
    return { start: 0, end: 0 };
  }

  const safeMinimumWindow = Math.max(1, Math.min(safeTotal, Math.floor(minimumWindow)));
  const requestedStart = Math.floor(range.start);
  const requestedEnd = Math.ceil(range.end);
  const requestedWindow = Math.max(safeMinimumWindow, requestedEnd - requestedStart);
  const windowSize = Math.min(safeTotal, requestedWindow);
  const start = Math.max(0, Math.min(safeTotal - windowSize, requestedStart));

  return { start, end: start + windowSize };
}

export function zoomChartVisibleRange(range: ChartVisibleRange, total: number, anchorRatio: number, zoomFactor: number): ChartVisibleRange {
  const current = clampChartVisibleRange(range, total);
  const currentWindow = Math.max(1, current.end - current.start);
  const nextWindow = currentWindow * zoomFactor;
  const safeAnchorRatio = Math.max(0, Math.min(1, anchorRatio));
  const anchorIndex = current.start + currentWindow * safeAnchorRatio;
  const nextStart = Math.round(anchorIndex - nextWindow * safeAnchorRatio);

  return clampChartVisibleRange({ start: nextStart, end: nextStart + nextWindow }, total);
}

export function panChartVisibleRange(range: ChartVisibleRange, total: number, deltaBars: number): ChartVisibleRange {
  const current = clampChartVisibleRange(range, total);
  const shift = Math.round(deltaBars);

  return clampChartVisibleRange({ start: current.start + shift, end: current.end + shift }, total);
}

export function syncChartVisibleRangeForDataUpdate(range: ChartVisibleRange, previousTotal: number, nextTotal: number): ChartVisibleRange {
  const safePreviousTotal = Math.max(0, Math.floor(previousTotal));
  const safeNextTotal = Math.max(0, Math.floor(nextTotal));

  if (safeNextTotal === 0) {
    return { start: 0, end: 0 };
  }

  const windowSize = Math.max(1, range.end - range.start);
  const wasPinnedToLatest = safePreviousTotal === 0 || range.end >= safePreviousTotal;

  if (wasPinnedToLatest) {
    return clampChartVisibleRange({ start: safeNextTotal - windowSize, end: safeNextTotal }, safeNextTotal);
  }

  return clampChartVisibleRange(range, safeNextTotal);
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
