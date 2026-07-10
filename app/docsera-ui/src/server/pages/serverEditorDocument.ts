export const SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type ServerTiptapDocument = {
  type: "doc";
  content?: unknown[];
  [key: string]: unknown;
};

export type ServerDocumentEnvelope = {
  schemaVersion: typeof SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION;
  document: ServerTiptapDocument;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTiptapDocument(value: unknown): value is ServerTiptapDocument {
  return isRecord(value) && value.type === "doc" && (value.content === undefined || Array.isArray(value.content));
}

function cloneDocument(document: ServerTiptapDocument): ServerTiptapDocument {
  return JSON.parse(JSON.stringify(document)) as ServerTiptapDocument;
}

export function createEmptyServerDocumentEnvelope(): ServerDocumentEnvelope {
  return {
    schemaVersion: SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: { type: "doc", content: [] }
  };
}

export function parseServerDocument(value: unknown): ServerDocumentEnvelope {
  let parsedValue = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      throw new TypeError("The stored page content is not valid JSON.");
    }
  }

  if (isTiptapDocument(parsedValue)) {
    return {
      schemaVersion: SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: cloneDocument(parsedValue)
    };
  }

  if (!isRecord(parsedValue)) {
    throw new TypeError("The stored page content does not use a supported document envelope.");
  }

  if (parsedValue.schemaVersion !== SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION) {
    throw new TypeError("The stored page content uses an unsupported document schema version.");
  }

  if (!isTiptapDocument(parsedValue.document)) {
    throw new TypeError("The stored page content does not contain a valid TipTap document.");
  }

  return {
    schemaVersion: SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: cloneDocument(parsedValue.document)
  };
}
