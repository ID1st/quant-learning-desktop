export interface ProjectedPriceLabelLayout {
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const compactCharacterWidth = (character: string) => (/^[\u0000-\u00ff]$/.test(character) ? 5 : 8.5);

export function getProjectedPriceLabelLayout(input: {
  readonly label: string;
  readonly lineEndX: number;
  readonly priceY: number;
  readonly plotLeft: number;
  readonly plotRight: number;
}): ProjectedPriceLabelLayout {
  const estimatedTextWidth = Array.from(input.label).reduce((total, character) => total + compactCharacterWidth(character), 0);
  const width = Math.min(110, Math.max(60, Math.ceil(estimatedTextWidth + 12)));
  const x = Math.max(input.plotLeft + 2, Math.min(input.lineEndX - width + 4, input.plotRight - width - 2));
  const y = input.priceY - 11;
  return { width, x, y };
}
