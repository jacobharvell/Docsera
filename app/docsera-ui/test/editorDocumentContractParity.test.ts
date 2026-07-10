import { describe, expect, it } from "vitest";
import { createEmptyDocseraDocumentEnvelope, parseDocseraDocument } from "../src/shared/editor/document";
import { createEmptyServerDocumentEnvelope, parseServerDocument } from "../src/server/pages/serverEditorDocument";

describe("client/server editor document contract parity", () => {
  it("uses the same current envelope and legacy migration behavior", () => {
    expect(createEmptyServerDocumentEnvelope()).toEqual(createEmptyDocseraDocumentEnvelope());

    const legacy = { type: "doc", content: [{ type: "paragraph" }] };
    const clientResult = parseDocseraDocument(legacy);
    expect(clientResult.ok).toBe(true);
    if (!clientResult.ok) {
      return;
    }

    expect(parseServerDocument(legacy)).toEqual(clientResult.envelope);
  });

  it("rejects unsupported versions on both boundaries", () => {
    const unsupported = { schemaVersion: 2, document: { type: "doc", content: [] } };
    expect(parseDocseraDocument(unsupported)).toMatchObject({ ok: false, reason: "unsupported-schema-version" });
    expect(() => parseServerDocument(unsupported)).toThrow("unsupported document schema version");
  });
});
