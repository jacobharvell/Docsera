export const DOCSERA_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type DocseraTiptapDocument = {
  type: "doc";
  content?: unknown[];
  [key: string]: unknown;
};

export type DocseraDocumentEnvelope = {
  schemaVersion: typeof DOCSERA_DOCUMENT_SCHEMA_VERSION;
  document: DocseraTiptapDocument;
};

export type ParseDocseraDocumentResult =
  | {
      ok: true;
      envelope: DocseraDocumentEnvelope;
      migratedLegacyDocument: boolean;
    }
  | {
      ok: false;
      reason: "invalid-json" | "invalid-envelope" | "invalid-document" | "unsupported-schema-version";
      message: string;
    };

export function createEmptyDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: []
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTiptapDocument(value: unknown): value is DocseraTiptapDocument {
  if (!isRecord(value) || value.type !== "doc") {
    return false;
  }

  return value.content === undefined || Array.isArray(value.content);
}

function cloneDocument(document: DocseraTiptapDocument): DocseraTiptapDocument {
  return JSON.parse(JSON.stringify(document)) as DocseraTiptapDocument;
}

export function parseDocseraDocument(value: unknown): ParseDocseraDocumentResult {
  let parsedValue = value;

  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return {
        ok: false,
        reason: "invalid-json",
        message: "The stored page content is not valid JSON."
      };
    }
  }

  if (!isRecord(parsedValue)) {
    return {
      ok: false,
      reason: "invalid-envelope",
      message: "The stored page content does not use a supported document envelope."
    };
  }

  if (isTiptapDocument(parsedValue)) {
    return {
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: cloneDocument(parsedValue)
      },
      migratedLegacyDocument: true
    };
  }

  if (parsedValue.schemaVersion !== DOCSERA_DOCUMENT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unsupported-schema-version",
      message: "The stored page content uses an unsupported document schema version."
    };
  }

  if (!isTiptapDocument(parsedValue.document)) {
    return {
      ok: false,
      reason: "invalid-document",
      message: "The stored page content does not contain a valid TipTap document."
    };
  }

  return {
    ok: true,
    envelope: {
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: cloneDocument(parsedValue.document)
    },
    migratedLegacyDocument: false
  };
}

export function serializeDocseraDocument(envelope: DocseraDocumentEnvelope): string {
  const parsed = parseDocseraDocument(envelope);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return JSON.stringify(parsed.envelope);
}
