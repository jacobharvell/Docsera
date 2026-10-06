export const DOCSERA_PALETTE_KEYS = ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;

export type DocseraPaletteKey = (typeof DOCSERA_PALETTE_KEYS)[number];

const DOCSERA_PALETTE_KEY_SET = new Set<string>(DOCSERA_PALETTE_KEYS);

export function isDocseraPaletteKey(value: unknown): value is DocseraPaletteKey {
  return typeof value === "string" && DOCSERA_PALETTE_KEY_SET.has(value);
}

export const DOCSERA_TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
export const DOCSERA_NON_DEFAULT_TEXT_ALIGNMENTS = ["center", "right"] as const;

export type DocseraTextAlignment = (typeof DOCSERA_TEXT_ALIGNMENTS)[number];
export type DocseraNonDefaultTextAlignment = (typeof DOCSERA_NON_DEFAULT_TEXT_ALIGNMENTS)[number];

export function isDocseraTextAlignment(value: unknown): value is DocseraTextAlignment {
  return typeof value === "string" && DOCSERA_TEXT_ALIGNMENTS.includes(value as DocseraTextAlignment);
}

export function isDocseraNonDefaultTextAlignment(value: unknown): value is DocseraNonDefaultTextAlignment {
  return typeof value === "string" && DOCSERA_NON_DEFAULT_TEXT_ALIGNMENTS.includes(value as DocseraNonDefaultTextAlignment);
}
