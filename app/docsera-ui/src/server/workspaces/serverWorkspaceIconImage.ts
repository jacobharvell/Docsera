export type WorkspaceIconImageFormat = "jpeg" | "png" | "webp";

export type WorkspaceIconImageMetadata = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  format: WorkspaceIconImageFormat;
  height: number;
  width: number;
};

export type WorkspaceIconValidationResult =
  | ({ kind: "succeeded" } & WorkspaceIconImageMetadata)
  | { errorMessage: string; kind: "failed" };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_ICON_BYTES = 1024 * 1024;
const MIN_ICON_DIMENSION = 128;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeContentType(value: unknown): string {
  return cleanText(value).split(";")[0].trim().toLowerCase();
}

function hasBytes(bytes: Uint8Array, offset: number, values: number[]): boolean {
  if (offset < 0 || bytes.length < offset + values.length) {
    return false;
  }
  return values.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || bytes.length < offset + length) {
    return "";
  }
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
}

function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || bytes.length < offset + 2) {
    return null;
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint24LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || bytes.length < offset + 3) {
    return null;
  }
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || bytes.length < offset + 4) {
    return null;
  }
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || bytes.length < offset + 4) {
    return null;
  }
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function parsePng(bytes: Uint8Array): WorkspaceIconImageMetadata | null {
  if (!hasBytes(bytes, 0, PNG_SIGNATURE) || bytes.length < 33 || readUint32BE(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") {
    return null;
  }
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (!width || !height) {
    return null;
  }
  let hasImageData = false;
  let offset = 8;
  while (offset < bytes.length) {
    const chunkLength = readUint32BE(bytes, offset);
    const chunkType = ascii(bytes, offset + 4, 4);
    if (chunkLength === null || !chunkType || offset + 12 + chunkLength > bytes.length) {
      return null;
    }
    if (offset === 8 && chunkType !== "IHDR") {
      return null;
    }
    if (chunkType === "IDAT") {
      hasImageData = true;
    }
    offset += 12 + chunkLength;
    if (chunkType === "IEND") {
      return hasImageData && offset === bytes.length ? { contentType: "image/png", format: "png", width, height } : null;
    }
  }
  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function parseJpeg(bytes: Uint8Array): WorkspaceIconImageMetadata | null {
  if (!hasBytes(bytes, 0, [0xff, 0xd8])) {
    return null;
  }
  let offset = 2;
  let metadata: WorkspaceIconImageMetadata | null = null;
  let sawScan = false;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return null;
    }
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) {
      return metadata && sawScan ? metadata : null;
    }
    if (marker === 0xda) {
      const segmentLength = readUint16BE(bytes, offset);
      if (!segmentLength || segmentLength < 2 || offset + segmentLength >= bytes.length - 2 || !metadata || !hasBytes(bytes, bytes.length - 2, [0xff, 0xd9])) {
        return null;
      }
      sawScan = true;
      return metadata;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }
    const segmentLength = readUint16BE(bytes, offset);
    if (!segmentLength || segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }
    if (isJpegStartOfFrame(marker)) {
      const height = readUint16BE(bytes, offset + 3);
      const width = readUint16BE(bytes, offset + 5);
      if (!width || !height) {
        return null;
      }
      metadata = { contentType: "image/jpeg", format: "jpeg", width, height };
    }
    offset += segmentLength;
  }
  return null;
}

function parseWebp(bytes: Uint8Array): WorkspaceIconImageMetadata | null {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }
  const riffPayloadLength = readUint32LE(bytes, 4);
  if (riffPayloadLength === null || riffPayloadLength + 8 !== bytes.length || bytes.length < 20) {
    return null;
  }
  let offset = 12;
  let metadata: WorkspaceIconImageMetadata | null = null;
  let requiresImagePayload = false;
  let hasImagePayload = false;
  function acceptImagePayload(payloadMetadata: WorkspaceIconImageMetadata): boolean {
    if (metadata && (metadata.width !== payloadMetadata.width || metadata.height !== payloadMetadata.height)) {
      return false;
    }
    hasImagePayload = true;
    metadata = metadata ?? payloadMetadata;
    return true;
  }
  while (offset < bytes.length) {
    const chunkType = ascii(bytes, offset, 4);
    const chunkLength = readUint32LE(bytes, offset + 4);
    if (!chunkType || chunkLength === null || offset + 8 + chunkLength > bytes.length) {
      return null;
    }
    const payloadOffset = offset + 8;
    if (chunkType === "VP8X") {
      if (chunkLength !== 10) {
        return null;
      }
      const widthMinusOne = readUint24LE(bytes, payloadOffset + 4);
      const heightMinusOne = readUint24LE(bytes, payloadOffset + 7);
      if (widthMinusOne === null || heightMinusOne === null) {
        return null;
      }
      metadata = { contentType: "image/webp", format: "webp", width: widthMinusOne + 1, height: heightMinusOne + 1 };
      requiresImagePayload = true;
    } else if (chunkType === "VP8L") {
      if (chunkLength <= 5 || !hasBytes(bytes, payloadOffset, [0x2f])) {
        return null;
      }
      const b0 = bytes[payloadOffset + 1];
      const b1 = bytes[payloadOffset + 2];
      const b2 = bytes[payloadOffset + 3];
      const b3 = bytes[payloadOffset + 4];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
      if (!acceptImagePayload({ contentType: "image/webp", format: "webp", width, height })) {
        return null;
      }
    } else if (chunkType === "VP8 ") {
      if (chunkLength <= 10 || !hasBytes(bytes, payloadOffset + 3, [0x9d, 0x01, 0x2a])) {
        return null;
      }
      const rawWidth = bytes[payloadOffset + 6] | (bytes[payloadOffset + 7] << 8);
      const rawHeight = bytes[payloadOffset + 8] | (bytes[payloadOffset + 9] << 8);
      if (!rawWidth || !rawHeight) {
        return null;
      }
      if (!acceptImagePayload({ contentType: "image/webp", format: "webp", width: rawWidth & 0x3fff, height: rawHeight & 0x3fff })) {
        return null;
      }
    }
    offset += 8 + chunkLength + (chunkLength % 2);
  }
  return offset === bytes.length && metadata && hasImagePayload && (!requiresImagePayload || hasImagePayload) ? metadata : null;
}

export function normalizeWorkspaceIconDeclaredContentType(value: unknown): WorkspaceIconImageMetadata["contentType"] | null {
  const contentType = normalizeContentType(value);
  return contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp" ? contentType : null;
}

export function contentTypeForWorkspaceIconExtension(fileName: unknown): WorkspaceIconImageMetadata["contentType"] | null {
  const candidate = cleanText(fileName);
  if (!candidate || candidate.includes("/") || candidate.includes("\\") || candidate.includes("..")) {
    return null;
  }
  const extension = candidate.slice(candidate.lastIndexOf(".") + 1).toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

export function parseWorkspaceIconImage(bytes: Uint8Array): WorkspaceIconImageMetadata | null {
  return parsePng(bytes) ?? parseJpeg(bytes) ?? parseWebp(bytes);
}

export function validateWorkspaceIconImage(input: {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  sizeBytes: number;
}): WorkspaceIconValidationResult {
  const extensionContentType = contentTypeForWorkspaceIconExtension(input.fileName);
  if (!extensionContentType) {
    return { kind: "failed", errorMessage: "The icon file name must use PNG, JPG, JPEG, or WebP." };
  }
  const declaredContentType = normalizeWorkspaceIconDeclaredContentType(input.contentType);
  if (!declaredContentType) {
    return { kind: "failed", errorMessage: "The icon content type must be PNG, JPG, JPEG, or WebP." };
  }
  if (declaredContentType !== extensionContentType) {
    return { kind: "failed", errorMessage: "The icon file extension and content type do not match." };
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    return { kind: "failed", errorMessage: "The icon upload body cannot be empty." };
  }
  if (input.sizeBytes > MAX_ICON_BYTES || input.bytes.length > MAX_ICON_BYTES) {
    return { kind: "failed", errorMessage: "The icon upload exceeds the 1 MB limit." };
  }
  const metadata = parseWorkspaceIconImage(input.bytes);
  if (!metadata || metadata.contentType !== declaredContentType) {
    return { kind: "failed", errorMessage: "The icon file content does not match a supported image format." };
  }
  if (metadata.width !== metadata.height || metadata.width < MIN_ICON_DIMENSION) {
    return { kind: "failed", errorMessage: "The icon image must be square and at least 128 by 128 pixels." };
  }
  return { kind: "succeeded", ...metadata };
}
