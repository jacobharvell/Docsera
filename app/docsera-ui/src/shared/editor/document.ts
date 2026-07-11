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

export type DocseraDocumentParseFailureReason =
  | "invalid-json"
  | "invalid-envelope"
  | "invalid-document"
  | "unsupported-schema-version";

export type ParseDocseraDocumentResult =
  | {
      ok: true;
      envelope: DocseraDocumentEnvelope;
      migratedLegacyDocument: boolean;
    }
  | {
      ok: false;
      reason: DocseraDocumentParseFailureReason;
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

function hasSchemaVersion(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "schemaVersion");
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

function createFailure(reason: DocseraDocumentParseFailureReason, message: string): ParseDocseraDocumentResult {
  return {
    ok: false,
    reason,
    message
  };
}

export function parseDocseraDocument(value: unknown): ParseDocseraDocumentResult {
  let parsedValue = value;

  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return createFailure("invalid-json", "The stored page content is not valid JSON.");
    }
  }

  if (!isRecord(parsedValue)) {
    return createFailure("invalid-envelope", "The stored page content does not use a supported document envelope.");
  }

  if (hasSchemaVersion(parsedValue)) {
    if (parsedValue.schemaVersion !== DOCSERA_DOCUMENT_SCHEMA_VERSION) {
      return createFailure(
        "unsupported-schema-version",
        "The stored page content uses an unsupported document schema version."
      );
    }

    if (!isTiptapDocument(parsedValue.document)) {
      return createFailure("invalid-document", "The stored page content does not contain a valid TipTap document.");
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

  if (parsedValue.type === "doc") {
    if (!isTiptapDocument(parsedValue)) {
      return createFailure("invalid-document", "The stored page content does not contain a valid TipTap document.");
    }

    return {
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: cloneDocument(parsedValue)
      },
      migratedLegacyDocument: true
    };
  }

  return createFailure("invalid-envelope", "The stored page content does not use a supported document envelope.");
}

export function parseDocseraDocumentOrThrow(value: unknown): DocseraDocumentEnvelope {
  const parsed = parseDocseraDocument(value);
  if (!parsed.ok) {
    throw new TypeError(parsed.message);
  }

  return parsed.envelope;
}

export function serializeDocseraDocument(envelope: DocseraDocumentEnvelope): string {
  return JSON.stringify(parseDocseraDocumentOrThrow(envelope));
}
