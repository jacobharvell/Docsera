import { describe, expect, it } from "vitest";
import { mapPageRecord } from "./serviceNowPageRecords";

function createRecord(activeValue: unknown) {
  return {
    getUniqueValue: () => "page-001",
    getValue: (fieldName: string) => {
      switch (fieldName) {
        case "workspace":
          return "workspace-001";
        case "parent_page":
          return "";
        case "sibling_order":
          return "1";
        case "draft_title":
          return "Overview";
        case "draft_slug":
          return "overview";
        case "draft_slug_normalized":
          return "overview";
        case "draft_content_json":
          return JSON.stringify({
            type: "doc",
            content: []
          });
        case "draft_body_text":
          return "";
        case "published_title":
        case "published_slug":
        case "published_slug_normalized":
        case "published_content_json":
        case "published_body_text":
        case "publication_state":
          return "";
        case "active":
          return activeValue;
        default:
          return "";
      }
    },
    getDisplayValue: () => ""
  };
}

describe("page record mapping", () => {
  it.each([
    ["true", true],
    ["1", true],
    [true, true],
    ["false", false],
    ["0", false],
    [false, false]
  ])("normalizes ServiceNow active value %o to %s", (activeValue, expectedActive) => {
    const page = mapPageRecord(createRecord(activeValue));

    expect(page.active).toBe(expectedActive);
    expect(page.sysId).toBe("page-001");
    expect(page.draftTitle).toBe("Overview");
  });
});
