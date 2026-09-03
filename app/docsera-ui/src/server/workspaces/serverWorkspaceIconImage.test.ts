import { describe, expect, it } from "vitest";
import { parseWorkspaceIconImage, validateWorkspaceIconImage } from "./serverWorkspaceIconImage.ts";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(58);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0, 0, 0, 0], 29);
  bytes.set([0, 0, 0, 1], 33);
  bytes.set([0x49, 0x44, 0x41, 0x54, 0], 37);
  bytes.set([0, 0, 0, 0], 42);
  bytes.set([0, 0, 0, 0], 46);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 50);
  bytes.set([0, 0, 0, 0], 54);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03, 0x01, 0x11,
    0xff, 0xda, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00,
    0x00,
    0xff, 0xd9
  ]);
}

function webpVp8(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x52, 0x49, 0x46, 0x46, 24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20], 0);
  bytes.set([11, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a], 16);
  bytes[26] = width & 0xff;
  bytes[27] = (width >> 8) & 0xff;
  bytes[28] = height & 0xff;
  bytes[29] = (height >> 8) & 0xff;
  bytes[30] = 0;
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(44);
  bytes.set([0x52, 0x49, 0x46, 0x46, 36, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0], 0);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  bytes.set([0x56, 0x50, 0x38, 0x4c, 6, 0, 0, 0, 0x2f], 30);
  bytes[39] = w & 0xff;
  bytes[40] = ((w >> 8) & 0x3f) | ((h & 0x3) << 6);
  bytes[41] = (h >> 2) & 0xff;
  bytes[42] = (h >> 10) & 0xff;
  bytes[43] = 0;
  bytes[44] = 0;
  return bytes;
}

function webpVp8l(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const bytes = new Uint8Array(26);
  bytes.set([0x52, 0x49, 0x46, 0x46, 18, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 6, 0, 0, 0, 0x2f], 0);
  bytes[21] = w & 0xff;
  bytes[22] = ((w >> 8) & 0x3f) | ((h & 0x3) << 6);
  bytes[23] = (h >> 2) & 0xff;
  bytes[24] = (h >> 10) & 0xff;
  bytes[25] = 0;
  return bytes;
}

describe("workspace icon image validation", () => {
  it("parses PNG, JPEG, and WebP dimensions from signatures", () => {
    expect(parseWorkspaceIconImage(png(128, 128))).toMatchObject({ contentType: "image/png", width: 128, height: 128 });
    expect(parseWorkspaceIconImage(jpeg(256, 256))).toMatchObject({ contentType: "image/jpeg", width: 256, height: 256 });
    expect(parseWorkspaceIconImage(webpVp8(128, 128))).toMatchObject({ contentType: "image/webp", width: 128, height: 128 });
    expect(parseWorkspaceIconImage(webpVp8l(129, 129))).toMatchObject({ contentType: "image/webp", width: 129, height: 129 });
    expect(parseWorkspaceIconImage(webpVp8x(130, 130))).toMatchObject({ contentType: "image/webp", width: 130, height: 130 });
  });

  it("fails closed for malformed data, mismatches, size, and dimension policy", () => {
    expect(parseWorkspaceIconImage(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
    expect(validateWorkspaceIconImage({ bytes: png(128, 128), contentType: "image/jpeg", fileName: "icon.jpg", sizeBytes: 33 }).kind).toBe("failed");
    expect(validateWorkspaceIconImage({ bytes: png(128, 128), contentType: "image/png", fileName: "icon.svg", sizeBytes: 33 }).kind).toBe("failed");
    expect(validateWorkspaceIconImage({ bytes: new Uint8Array(1024 * 1024 + 1), contentType: "image/png", fileName: "icon.png", sizeBytes: 1024 * 1024 + 1 }).kind).toBe("failed");
    expect(validateWorkspaceIconImage({ bytes: png(128, 129), contentType: "image/png", fileName: "icon.png", sizeBytes: 33 }).kind).toBe("failed");
    expect(validateWorkspaceIconImage({ bytes: png(127, 127), contentType: "image/png", fileName: "icon.png", sizeBytes: 33 }).kind).toBe("failed");
  });

  it("rejects structurally truncated or internally inconsistent image containers", () => {
    expect(parseWorkspaceIconImage(png(128, 128).slice(0, 24))).toBeNull();
    expect(parseWorkspaceIconImage(png(128, 128).slice(0, 45))).toBeNull();

    const malformedPng = png(128, 128);
    malformedPng[11] = 12;
    expect(parseWorkspaceIconImage(malformedPng)).toBeNull();
    const pngWithoutIdat = png(128, 128);
    pngWithoutIdat.set([0x49, 0x45, 0x4e, 0x44], 37);
    expect(parseWorkspaceIconImage(pngWithoutIdat)).toBeNull();

    expect(parseWorkspaceIconImage(jpeg(128, 128).slice(0, 15))).toBeNull();
    expect(parseWorkspaceIconImage(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 128, 0, 128, 0x03, 0x01, 0x11, 0xff, 0xd9]))).toBeNull();

    const malformedVp8 = webpVp8(128, 128);
    malformedVp8[16] = 25;
    expect(parseWorkspaceIconImage(malformedVp8)).toBeNull();
    expect(parseWorkspaceIconImage(webpVp8(128, 128).slice(0, 30))).toBeNull();

    const malformedVp8l = webpVp8l(128, 128);
    malformedVp8l[16] = 5;
    expect(parseWorkspaceIconImage(malformedVp8l)).toBeNull();
    expect(parseWorkspaceIconImage(webpVp8l(128, 128).slice(0, 25))).toBeNull();

    const malformedVp8x = webpVp8x(128, 128);
    malformedVp8x[16] = 9;
    expect(parseWorkspaceIconImage(malformedVp8x)).toBeNull();
    expect(parseWorkspaceIconImage(webpVp8x(128, 128).slice(0, 30))).toBeNull();
    const vp8xWithoutPayload = webpVp8x(128, 128).slice(0, 30);
    vp8xWithoutPayload[4] = 22;
    expect(parseWorkspaceIconImage(vp8xWithoutPayload)).toBeNull();
    const vp8xMismatchedPayload = webpVp8x(128, 128);
    vp8xMismatchedPayload[39] = 126;
    expect(parseWorkspaceIconImage(vp8xMismatchedPayload)).toBeNull();
  });
});
