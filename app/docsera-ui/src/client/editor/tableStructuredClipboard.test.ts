import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  createStructuredTableClipboardPayload,
  doesStructuredTableClipboardDataMatchPayload,
  STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME
} from "./tableStructuredClipboard";

function createClipboardData(text: string, provenanceToken?: string) {
  return {
    getData: (type: string) => {
      if (type === "text/plain") {
        return text;
      }

      if (type === STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME) {
        return provenanceToken ?? "";
      }

      return "";
    }
  };
}

function createCellContent(text: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      content: [{ type: "text", text }]
    }
  ];
}

describe("structured table clipboard correspondence", () => {
  it("uses the browser web custom format identifier for provenance", () => {
    expect(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME.startsWith("web ")).toBe(true);
  });

  it("matches corresponding row clipboard data and rejects unrelated data", () => {
    const payload = createStructuredTableClipboardPayload(
      "row",
      [createCellContent("Row1"), createCellContent("Row2")],
      1,
      "row-token"
    );

    expect(doesStructuredTableClipboardDataMatchPayload(createClipboardData("Row1\nRow2", "row-token"), payload)).toBe(true);
    expect(doesStructuredTableClipboardDataMatchPayload(createClipboardData("Row1\nRow2"), payload)).toBe(false);
    expect(doesStructuredTableClipboardDataMatchPayload(createClipboardData("Row1\nRow2", "different-token"), payload)).toBe(false);
    expect(doesStructuredTableClipboardDataMatchPayload(null, payload)).toBe(false);
  });

  it("matches corresponding column clipboard data and rejects unrelated data", () => {
    const payload = createStructuredTableClipboardPayload(
      "column",
      [createCellContent("Col1"), createCellContent("Col2"), createCellContent("Col3")],
      1,
      "column-token"
    );

    expect(doesStructuredTableClipboardDataMatchPayload(createClipboardData("Col1\nCol2\nCol3", "column-token"), payload)).toBe(true);
    expect(doesStructuredTableClipboardDataMatchPayload(createClipboardData("Col1\nCol2\nCol3"), payload)).toBe(false);
    expect(
      doesStructuredTableClipboardDataMatchPayload(createClipboardData("Col1\nCol2\nCol3", "different-token"), payload)
    ).toBe(false);
    expect(doesStructuredTableClipboardDataMatchPayload(undefined, payload)).toBe(false);
  });
});
