import {
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  createEmptyDocseraDocumentEnvelope,
  parseDocseraDocumentOrThrow,
  type DocseraDocumentEnvelope,
  type DocseraTiptapDocument
} from "../../shared/editor/document.ts";

export const SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION = DOCSERA_DOCUMENT_SCHEMA_VERSION;
export type ServerTiptapDocument = DocseraTiptapDocument;
export type ServerDocumentEnvelope = DocseraDocumentEnvelope;

export function createEmptyServerDocumentEnvelope(): ServerDocumentEnvelope {
  return createEmptyDocseraDocumentEnvelope();
}

export function parseServerDocument(value: unknown): ServerDocumentEnvelope {
  return parseDocseraDocumentOrThrow(value);
}
