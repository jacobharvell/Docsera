import {
  createEmptyDocseraDocumentEnvelope,
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  type DocseraDocumentEnvelope,
  type DocseraTiptapDocument
} from "./document";

export type DocseraDocumentFixtureCase = {
  input: unknown;
  label: string;
  expected: {
    migratedLegacyDocument?: boolean;
    ok: boolean;
    reason?: "invalid-json" | "invalid-envelope" | "invalid-document" | "unsupported-schema-version";
  };
};

export function createLegacyDocseraDocument(text = "Legacy canonical content"): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text
          }
        ]
      }
    ]
  };
}

export function createCanonicalDocseraDocumentEnvelope(text = "Canonical content"): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: createLegacyDocseraDocument(text)
  };
}

export function createLargeCanonicalDocseraDocumentEnvelope(paragraphCount = 1200): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: Array.from({ length: paragraphCount }, (_, index) => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `Docsera canonical capacity caf\u00e9 na\u00efve paragraph ${index + 1}${index === paragraphCount - 1 ? "\n" : ""}`
          }
        ]
      }))
    }
  };
}

export function createDocseraDocumentFixtureCorpus(): DocseraDocumentFixtureCase[] {
  const currentEnvelope = createEmptyDocseraDocumentEnvelope();

  return [
    {
      input: currentEnvelope,
      label: "current envelope",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createLegacyDocseraDocument(),
      label: "legacy raw document",
      expected: {
        ok: true,
        migratedLegacyDocument: true
      }
    },
    {
      input: "not-json",
      label: "malformed JSON",
      expected: {
        ok: false,
        reason: "invalid-json"
      }
    },
    {
      input: {
        schemaVersion: 0,
        document: { type: "doc", content: [] }
      },
      label: "unsupported lower schema version",
      expected: {
        ok: false,
        reason: "unsupported-schema-version"
      }
    },
    {
      input: {
        schemaVersion: 2,
        document: { type: "doc", content: [] }
      },
      label: "unsupported higher schema version",
      expected: {
        ok: false,
        reason: "unsupported-schema-version"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: null
      },
      label: "missing document root",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "paragraph",
          content: []
        }
      },
      label: "invalid document root",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        type: "doc",
        content: {}
      },
      label: "invalid legacy content shape",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        document: {
          type: "doc",
          content: []
        }
      },
      label: "missing envelope version",
      expected: {
        ok: false,
        reason: "invalid-envelope"
      }
    }
  ];
}
