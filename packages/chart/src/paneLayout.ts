export function clampSecondaryPaneRatio(ratio: number): number {
  return Math.min(0.45, Math.max(0.18, Number.isFinite(ratio) ? ratio : 0.26));
}

export function getChartPaneGridTemplate(secondaryPaneRatio?: number): string {
  if (secondaryPaneRatio === undefined) return "minmax(0, 1fr)";
  const percent = Math.round(clampSecondaryPaneRatio(secondaryPaneRatio) * 100);
  return `minmax(0, ${100 - percent}fr) 7px minmax(0, ${percent}fr)`;
}
