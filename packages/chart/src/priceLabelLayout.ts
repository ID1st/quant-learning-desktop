export interface ProjectedPriceLabelLayout {
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const compactCharacterWidth = (character: string) => (/^[\u0000-\u00ff]$/.test(character) ? 5.5 : 9.5);

export function getProjectedPriceLabelLayout(input: {
  readonly label: string;
  readonly lineEndX: number;
  readonly priceY: number;
  readonly plotLeft: number;
  readonly plotRight: number;
  readonly plotTop: number;
  readonly plotBottom: number;
}): ProjectedPriceLabelLayout {
  const estimatedTextWidth = Array.from(input.label).reduce((total, character) => total + compactCharacterWidth(character), 0);
  const width = Math.min(120, Math.max(68, Math.ceil(estimatedTextWidth + 14)));
  const x = Math.max(input.plotLeft + 2, Math.min(input.lineEndX - width + 4, input.plotRight - width - 2));
  const y = Math.max(input.plotTop + 2, Math.min(input.priceY - 13, input.plotBottom - 26));
  return { width, x, y };
}
