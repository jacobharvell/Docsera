/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { sanitizeDocseraPastedHTML, sanitizeDocseraPastedText } from "./pasteSanitizer";

describe("paste sanitizer", () => {
  it("strips raw image-bearing HTML before the editor can parse it", () => {
    const sanitized = sanitizeDocseraPastedHTML(
      '<p>Safe</p><img src="https://example.com/image.png" alt="Raw image"><picture><source srcset="https://example.com/image.avif"><img src="https://example.com/fallback.png"></picture>'
    );

    expect(sanitized).toBe("<p>Safe</p>");
    expect(sanitized).not.toContain("img");
    expect(sanitized).not.toContain("picture");
    expect(sanitized).not.toContain("source");
    expect(sanitized).not.toContain("https://example.com/image.png");
  });

  it("normalizes pasted line endings without altering text content", () => {
    expect(sanitizeDocseraPastedText("Line one\r\nLine two\rLine three")).toBe("Line one\nLine two\nLine three");
  });
});
