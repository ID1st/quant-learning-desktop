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
