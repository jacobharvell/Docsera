import { describe, expect, it } from "vitest";
import { mapPageRecord } from "./serviceNowPageRecords";
import { createEmptyDocseraDocumentEnvelope, parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import {
  createDocseraDocumentFixtureCorpus,
  createLegacyDocseraDocument
} from "../../shared/editor/documentFixtures";

type MockRecordOptions = {
  activeValue: unknown;
  draftContentJson?: unknown;
  draftBodyText?: unknown;
  publishedContentJson?: unknown;
  publishedBodyText?: unknown;
  publishedAt?: unknown;
  publishedBy?: unknown;
  publishedByDisplayValue?: unknown;
  siblingOrder?: unknown;
  omitPublishedContentJson?: boolean;
  omitDraftContentJson?: boolean;
};

function createRecord({
  activeValue,
  draftContentJson = JSON.stringify({ schemaVersion: 1, document: { type: "doc", content: [] } }),
  draftBodyText = "",
  publishedContentJson = "",
  publishedBodyText = "",
  publishedAt = "",
  publishedBy = "",
  publishedByDisplayValue = "",
  siblingOrder = "1",
  omitPublishedContentJson = false,
  omitDraftContentJson = false
}: MockRecordOptions) {
  return {
    getUniqueValue: () => "page-001",
    getValue: (fieldName: string) => {
      switch (fieldName) {
        case "workspace":
          return "workspace-001";
        case "parent_page":
          return "";
        case "sibling_order":
          return siblingOrder;
        case "draft_title":
          return "Overview";
        case "draft_slug":
          return "overview";
        case "draft_slug_normalized":
          return "overview";
        case "draft_content_json":
          return omitDraftContentJson ? undefined : draftContentJson;
        case "draft_body_text":
          return draftBodyText;
        case "published_title":
        case "published_slug":
        case "published_slug_normalized":
        case "publication_state":
          return "";
        case "published_content_json":
          return omitPublishedContentJson ? undefined : publishedContentJson;
        case "published_body_text":
          return publishedBodyText;
        case "published_at":
          return publishedAt;
        case "published_by":
          return publishedBy;
        case "active":
          return activeValue;
        default:
          return "";
      }
    },
    getDisplayValue: (fieldName: string) => {
      if (fieldName === "published_by") {
        return publishedByDisplayValue;
      }

      if (fieldName === "published_at") {
        return publishedAt;
      }

      return "";
    }
  };
}

describe("page record mapping", () => {
  it("preserves persisted rank zero as numeric zero", () => {
    const page = mapPageRecord(createRecord({ activeValue: true, siblingOrder: "0" }));

    expect(page.siblingOrder).toBe(0);
  });

  it.each([
    ["blank", "", 1],
    ["whitespace", "   ", 1],
    ["null", null, 1]
  ])("maps persisted %s sibling order to the established fallback", (_label, siblingOrder, expected) => {
    const page = mapPageRecord(createRecord({ activeValue: true, siblingOrder }));

    expect(page.siblingOrder).toBe(expected);
  });

  it.each([
    ["true", true],
    ["1", true],
    [true, true],
    ["false", false],
    ["0", false],
    [false, false]
  ])("normalizes ServiceNow active value %o to %s", (activeValue, expectedActive) => {
    const page = mapPageRecord(createRecord({ activeValue }));

    expect(page.active).toBe(expectedActive);
    expect(page.sysId).toBe("page-001");
    expect(page.draftTitle).toBe("Overview");
    expect(page.draftContentJson).toEqual({ schemaVersion: 1, document: { type: "doc", content: [] } });
  });

  it("maps published actor and timestamp metadata from the record", () => {
    const page = mapPageRecord(
      createRecord({
        activeValue: true,
        publishedAt: "2026-07-15 09:30:00",
        publishedBy: "user-123",
        publishedByDisplayValue: "Priya Writer"
      })
    );

    expect(page.publishedAt).toBe("2026-07-15 09:30:00");
    expect(page.publishedBySysId).toBe("user-123");
    expect(page.publishedByDisplayName).toBe("Priya Writer");
  });

  it("rejects an empty persisted draft_content_json string", () => {
    expect(() =>
      mapPageRecord(
        createRecord({
          activeValue: true,
          draftContentJson: ""
        })
      )
    ).toThrow("supported document envelope");
  });

  it("rejects a whitespace-only persisted draft_content_json value", () => {
    expect(() =>
      mapPageRecord(
        createRecord({
          activeValue: true,
          draftContentJson: "   \n\t  "
        })
      )
    ).toThrow("supported document envelope");
  });

  it.each([
    ["null", null],
    ["absent", undefined]
  ])("rejects a %s persisted draft_content_json value", (_label, draftContentJson) => {
    expect(() =>
      mapPageRecord(
        createRecord({
          activeValue: true,
          draftContentJson,
          omitDraftContentJson: draftContentJson === undefined
        })
      )
    ).toThrow("supported document envelope");
  });

  it("does not fall back to draft_body_text when draft_content_json is missing", () => {
    expect(() =>
      mapPageRecord(
        createRecord({
          activeValue: true,
          omitDraftContentJson: true,
          draftBodyText: "body-text fallback must not be used"
        })
      )
    ).toThrow("supported document envelope");
  });

  it.each([
    ["blank string", ""],
    ["whitespace", "   \n\t  "],
    ["null", null],
    ["absent", undefined]
  ])("accepts %s published content as null for draft-only pages", (_label, publishedContentJson) => {
    const page = mapPageRecord(
      createRecord({
        activeValue: true,
        publishedContentJson,
        omitPublishedContentJson: publishedContentJson === undefined
      })
    );

    expect(page.publishedContentJson).toBeNull();
  });

  it("rejects malformed nonblank published JSON instead of converting it to null", () => {
    expect(() =>
      mapPageRecord(
        createRecord({
          activeValue: true,
          publishedContentJson: "{not-json"
        })
      )
    ).toThrow("not valid JSON");
  });

  it("does not fall back to published_body_text when published_content_json is blank", () => {
    const page = mapPageRecord(
      createRecord({
        activeValue: true,
        publishedContentJson: "",
        publishedBodyText: "body-text fallback must not be used"
      })
    );

    expect(page.publishedContentJson).toBeNull();
    expect(page.publishedBodyText).toBe("body-text fallback must not be used");
  });

  it.each([
    ["unsupported schema", JSON.stringify({ schemaVersion: 999, document: { type: "doc", content: [] } })],
    ["invalid envelope", JSON.stringify({ document: { type: "doc", content: [] } })],
    ["invalid document", JSON.stringify({ schemaVersion: 1, document: { type: "doc", content: {} } })]
  ])("rejects %s published content", (_label, publishedContentJson) => {
    expect(() =>
      mapPageRecord(
        createRecord({
          activeValue: true,
          publishedContentJson
        })
      )
    ).toThrow(
      _label === "unsupported schema"
        ? "unsupported document schema version"
        : _label === "invalid envelope"
          ? "supported document envelope"
          : "valid TipTap document"
    );
  });

  it.each(createDocseraDocumentFixtureCorpus().filter((fixture) => fixture.expected.ok && !fixture.expected.migratedLegacyDocument))(
    "accepts the current canonical envelope for $label",
    ({ input }) => {
      const canonicalEnvelope = parseDocseraDocumentOrThrow(input);
      const page = mapPageRecord(
        createRecord({
          activeValue: true,
          draftContentJson: JSON.stringify(input),
          publishedContentJson: JSON.stringify(input)
        })
      );

      expect(page.draftContentJson).toEqual(canonicalEnvelope);
      expect(page.publishedContentJson).toEqual(canonicalEnvelope);
    }
  );

  it("normalizes legacy raw TipTap records into the canonical envelope", () => {
    const legacyDocument = createLegacyDocseraDocument("Legacy");
    const page = mapPageRecord(
      createRecord({
        activeValue: true,
        draftContentJson: JSON.stringify(legacyDocument),
        publishedContentJson: JSON.stringify(legacyDocument)
      })
    );

    expect(page.draftContentJson).toEqual({
      schemaVersion: 1,
      document: legacyDocument
    });
    expect(page.publishedContentJson).toEqual({
      schemaVersion: 1,
      document: legacyDocument
    });
  });

  it.each(createDocseraDocumentFixtureCorpus().filter((fixture) => !fixture.expected.ok))(
    "rejects $label instead of returning editable empty content",
    ({ input, expected }) => {
      const storedValue = typeof input === "string" ? input : JSON.stringify(input);
      expect(() =>
        mapPageRecord(
          createRecord({
            activeValue: true,
            draftContentJson: storedValue,
            publishedContentJson: storedValue
          })
        )
      ).toThrow(
        expected.reason === "invalid-json"
          ? "not valid JSON"
          : expected.reason === "unsupported-schema-version"
            ? "unsupported document schema version"
            : expected.reason === "invalid-envelope"
              ? "supported document envelope"
              : "valid TipTap document"
      );
    }
  );
});
