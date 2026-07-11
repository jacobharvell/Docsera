import { describe, expect, it } from "vitest";
import { createEmptyDocseraDocumentEnvelope, parseDocseraDocument } from "../src/shared/editor/document";
import { createDocseraDocumentFixtureCorpus } from "../src/shared/editor/documentFixtures";
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

  it.each(createDocseraDocumentFixtureCorpus())("matches on $label", ({ input, expected }) => {
    const clientResult = parseDocseraDocument(input);

    if (expected.ok) {
      expect(clientResult).toMatchObject({
        ok: true,
        migratedLegacyDocument: expected.migratedLegacyDocument
      });
      expect(parseServerDocument(input)).toEqual(clientResult.envelope);
      return;
    }

    expect(clientResult).toMatchObject({
      ok: false,
      reason: expected.reason
    });
    if (clientResult.ok) {
      return;
    }

    expect(() => parseServerDocument(input)).toThrow(clientResult.message);
  });
});
