export interface ResponsiveSvgViewBoxInput {
  readonly viewBoxWidth: number;
  readonly fallbackHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
}

export function getResponsiveSvgViewBoxHeight({
  viewBoxWidth,
  fallbackHeight,
  cssWidth,
  cssHeight,
}: ResponsiveSvgViewBoxInput): number {
  if (
    !Number.isFinite(viewBoxWidth) ||
    viewBoxWidth <= 0 ||
    !Number.isFinite(cssWidth) ||
    cssWidth <= 0 ||
    !Number.isFinite(cssHeight) ||
    cssHeight <= 0
  ) {
    return fallbackHeight;
  }

  return viewBoxWidth * (cssHeight / cssWidth);
}
