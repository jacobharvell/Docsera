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

  it("preserves hard breaks inside substantive pasted paragraphs", () => {
    expect(sanitizeDocseraPastedHTML("<p>Alpha<br>Beta</p>")).toBe("<p>Alpha<br>Beta</p>");
  });

  it("normalizes pasted line endings without altering text content", () => {
    expect(sanitizeDocseraPastedText("Line one\r\nLine two\rLine three")).toBe("Line one\nLine two\nLine three");
  });

  it("preserves valid Docsera semantic color attributes while stripping arbitrary pasted color styles", () => {
    const sanitized = sanitizeDocseraPastedHTML(
      '<p><span style="color:#175cd3" data-docsera-text-color="blue">Blue</span><mark data-docsera-highlight-color="yellow" style="background:red">Yellow</mark><span data-docsera-text-color="#175cd3">Bad</span><mark data-docsera-highlight-color="teal">Bad</mark><strong style="color:red">Plain</strong></p>'
    );

    expect(sanitized).toContain('<span data-docsera-text-color="blue">Blue</span>');
    expect(sanitized).toContain('<mark data-docsera-highlight-color="yellow">Yellow</mark>');
    expect(sanitized).toContain("<span>Bad</span>");
    expect(sanitized).toContain("<mark>Bad</mark>");
    expect(sanitized).toContain("<strong>Plain</strong>");
    expect(sanitized).not.toContain("style=");
    expect(sanitized).not.toContain("#175cd3");
    expect(sanitized).not.toContain("teal");
  });

  it("preserves supported paragraph and heading text alignment while stripping unrelated pasted styles", () => {
    const sanitized = sanitizeDocseraPastedHTML(
      '<p style="color:red; text-align: center; margin-left:2rem">Centered</p><h2 style="text-align:right; font-size:40px">Right</h2><p style="text-align: justify">Justify</p><div style="text-align:center">Unsupported</div>'
    );

    expect(sanitized).toContain('<p style="text-align: center;">Centered</p>');
    expect(sanitized).toContain('<h2 style="text-align: right;">Right</h2>');
    expect(sanitized).toContain("<p>Justify</p>");
    expect(sanitized).toContain("<div>Unsupported</div>");
    expect(sanitized).not.toContain("color:red");
    expect(sanitized).not.toContain("margin-left");
    expect(sanitized).not.toContain("font-size");
    expect(sanitized).not.toContain("justify");
  });

  it("preserves existing Docsera structural clipboard attributes while filtering semantic color attributes", () => {
    const sanitized = sanitizeDocseraPastedHTML(
      '<div data-docsera-accordion="true" data-docsera-accordion-id="accordion-1" style="color:red"><div data-docsera-accordion-item="true" data-docsera-accordion-item-id="item-1"><p data-docsera-accordion-title="true">Title</p><div data-docsera-accordion-content="true"><div data-docsera-columns="true"><div data-docsera-column="true"><span data-docsera-text-color="#175cd3" style="color:#175cd3">Bad text</span><mark data-docsera-highlight-color="teal" style="background:teal">Bad highlight</mark></div></div></div></div></div>'
    );

    expect(sanitized).toContain('data-docsera-accordion="true"');
    expect(sanitized).toContain('data-docsera-accordion-id="accordion-1"');
    expect(sanitized).toContain('data-docsera-accordion-item="true"');
    expect(sanitized).toContain('data-docsera-accordion-item-id="item-1"');
    expect(sanitized).toContain('data-docsera-accordion-title="true"');
    expect(sanitized).toContain('data-docsera-accordion-content="true"');
    expect(sanitized).toContain('data-docsera-columns="true"');
    expect(sanitized).toContain('data-docsera-column="true"');
    expect(sanitized).toContain("<span>Bad text</span>");
    expect(sanitized).toContain("<mark>Bad highlight</mark>");
    expect(sanitized).not.toContain("style=");
    expect(sanitized).not.toContain('data-docsera-text-color="#175cd3"');
    expect(sanitized).not.toContain('data-docsera-highlight-color="teal"');
  });
});
