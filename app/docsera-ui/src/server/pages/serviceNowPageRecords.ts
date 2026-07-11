import type { PageRecord as ServerPageRecord } from "./serverPageDomain.ts";
import { parseServerDocument } from "./serverEditorDocument.ts";
import { normalizePageRecord, normalizeServiceNowBoolean } from "./serverPageDomain.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonValue(value: unknown): unknown {
  const text = cleanText(value);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The stored page content is not valid JSON.");
  }
}

function parsePersistedDraftContentJson(value: unknown) {
  const text = cleanText(value);
  if (!text) {
    throw new Error("The stored page content does not use a supported document envelope.");
  }

  return parseJsonValue(text);
}

function parseOptionalPersistedContentJson(value: unknown): unknown | null {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  return parseServerDocument(text);
}

export function mapPageRecord(record: {
  getUniqueValue: () => string;
  getValue: (fieldName: string) => unknown;
  getDisplayValue: (fieldName: string) => unknown;
}): ServerPageRecord {
  return normalizePageRecord({
    sysId: cleanText(record.getUniqueValue()),
    workspaceSysId: cleanText(record.getValue("workspace")),
    parentPageSysId: cleanText(record.getValue("parent_page")) || null,
    siblingOrder: Number(record.getValue("sibling_order")) || 1,
    draftTitle: cleanText(record.getValue("draft_title")),
    draftSlug: cleanText(record.getValue("draft_slug")),
    draftSlugNormalized: cleanText(record.getValue("draft_slug_normalized")),
    draftContentJson: parsePersistedDraftContentJson(record.getValue("draft_content_json")),
    draftRevision: Number(record.getValue("draft_revision")) || 0,
    draftBodyText: cleanText(record.getValue("draft_body_text")) || null,
    publishedTitle: cleanText(record.getValue("published_title")) || null,
    publishedSlug: cleanText(record.getValue("published_slug")) || null,
    publishedSlugNormalized: cleanText(record.getValue("published_slug_normalized")) || null,
    publishedContentJson: parseOptionalPersistedContentJson(record.getValue("published_content_json")),
    publishedBodyText: cleanText(record.getValue("published_body_text")) || null,
    publicationState: cleanText(record.getValue("publication_state")) || "draft",
    active: normalizeServiceNowBoolean(record.getValue("active"), true)
  });
}
