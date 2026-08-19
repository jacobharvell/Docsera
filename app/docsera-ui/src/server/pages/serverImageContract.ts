export const DOCSERA_IMAGE_ALIGNMENTS = ["left", "center", "right"] as const;

export type DocseraImageAlignment = (typeof DOCSERA_IMAGE_ALIGNMENTS)[number];

export type DocseraImageAttrs = {
  mediaId: string;
  darkMediaId: string | null;
  alt: string;
  caption: string;
  frame: boolean;
  align: DocseraImageAlignment;
  widthPct: number;
};

const DOCSERA_IMAGE_ALLOWED_ATTR_KEYS = [
  "mediaId",
  "darkMediaId",
  "alt",
  "caption",
  "frame",
  "align",
  "widthPct"
] as const;

export const DOCSERA_IMAGE_DEFAULTS = {
  darkMediaId: null,
  alt: "",
  caption: "",
  frame: true,
  align: "left",
  widthPct: 100
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isDocseraImageAlignment(value: unknown): value is DocseraImageAlignment {
  return typeof value === "string" && DOCSERA_IMAGE_ALIGNMENTS.includes(value as DocseraImageAlignment);
}

function normalizeMediaId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeWidthPct(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(20, value));
}

function createImageValidationFailure(): false {
  return false;
}

export function validateDocseraImageAttrs(attrs: unknown): boolean {
  if (!isRecord(attrs) || !hasOnlyAllowedKeys(attrs, DOCSERA_IMAGE_ALLOWED_ATTR_KEYS)) {
    return createImageValidationFailure();
  }

  if (normalizeMediaId(attrs.mediaId) === null) {
    return createImageValidationFailure();
  }

  if (attrs.darkMediaId !== undefined && attrs.darkMediaId !== null && normalizeMediaId(attrs.darkMediaId) === null) {
    return createImageValidationFailure();
  }

  if (attrs.alt !== undefined && typeof attrs.alt !== "string") {
    return createImageValidationFailure();
  }

  if (attrs.caption !== undefined && typeof attrs.caption !== "string") {
    return createImageValidationFailure();
  }

  if (attrs.frame !== undefined && typeof attrs.frame !== "boolean") {
    return createImageValidationFailure();
  }

  if (attrs.align !== undefined && !isDocseraImageAlignment(attrs.align)) {
    return createImageValidationFailure();
  }

  if (attrs.widthPct !== undefined && normalizeWidthPct(attrs.widthPct) === null) {
    return createImageValidationFailure();
  }

  return true;
}

export function canonicalizeDocseraImageAttrs(attrs: unknown): DocseraImageAttrs {
  if (!validateDocseraImageAttrs(attrs)) {
    throw new TypeError("The published page content contains an invalid image.");
  }

  const imageAttrs = isRecord(attrs) ? attrs : {};
  const mediaId = normalizeMediaId(imageAttrs.mediaId);
  const darkMediaId = imageAttrs.darkMediaId === undefined || imageAttrs.darkMediaId === null ? null : normalizeMediaId(imageAttrs.darkMediaId);
  const widthPct = imageAttrs.widthPct === undefined ? DOCSERA_IMAGE_DEFAULTS.widthPct : normalizeWidthPct(imageAttrs.widthPct);

  if (mediaId === null || widthPct === null) {
    throw new TypeError("The published page content contains an invalid image.");
  }

  return {
    mediaId,
    darkMediaId,
    alt: typeof imageAttrs.alt === "string" ? imageAttrs.alt : DOCSERA_IMAGE_DEFAULTS.alt,
    caption: typeof imageAttrs.caption === "string" ? imageAttrs.caption : DOCSERA_IMAGE_DEFAULTS.caption,
    frame: typeof imageAttrs.frame === "boolean" ? imageAttrs.frame : DOCSERA_IMAGE_DEFAULTS.frame,
    align: isDocseraImageAlignment(imageAttrs.align) ? imageAttrs.align : DOCSERA_IMAGE_DEFAULTS.align,
    widthPct
  };
}
