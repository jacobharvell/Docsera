import { GlideRecord } from "@servicenow/glide";
import {
  createEmptyServerDocumentEnvelope,
  parseServerDocument,
  extractPlainTextFromServerDocument
} from "./serverEditorDocument.ts";
import {
  DOCSERA_PAGE_TABLE,
  normalizePageRecord,
  PAGE_PUBLICATION_STATES,
  resolvePagePublicationState,
  type PageContentJson,
  type PageRecord
} from "./serverPageDomain.ts";
import { mapPageRecord } from "./serviceNowPageRecords.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function serializePageContentJson(value: PageContentJson): string {
  return JSON.stringify(value ?? createEmptyServerDocumentEnvelope());
}

function loadExistingPageRecord(pageSysId: string): GlideRecord<typeof DOCSERA_PAGE_TABLE> {
  const record = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!record.get("sys_id", pageSysId)) {
    throw new Error("Page record could not be loaded.");
  }

  return record;
}

function rereadPageRecord(pageSysId: string): PageRecord {
  return mapPageRecord(loadExistingPageRecord(pageSysId));
}

export function createPageBodyContentJsonFromText(text: string): PageContentJson {
  const normalizedText = cleanText(text).replace(/\r\n/g, "\n");
  const lines = normalizedText ? normalizedText.split("\n") : [""];

  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: lines.map((line) => ({
        type: "paragraph",
        content: line
          ? [
              {
                type: "text",
                text: line
              }
            ]
          : []
      }))
    }
  };
}

export function buildPageBodySaveRecord(page: PageRecord, draftBodyText: string, draftRevision = page.draftRevision ?? 0): PageRecord {
  const normalizedPage = normalizePageRecord(page);
  const normalizedBodyText = cleanText(draftBodyText) || null;
  const draftContentJson = createPageBodyContentJsonFromText(normalizedBodyText ?? "");

  const nextPage = {
    ...normalizedPage,
    draftBodyText: normalizedBodyText,
    draftContentJson,
    draftRevision: Number.isSafeInteger(draftRevision) && draftRevision >= 0 ? draftRevision : normalizedPage.draftRevision ?? 0
  };

  return {
    ...nextPage,
    publicationState: resolvePagePublicationState(nextPage)
  };
}

export function buildPageContentSaveRecord(
  page: PageRecord,
  draftContentJson: PageContentJson,
  draftRevision = page.draftRevision ?? 0
): PageRecord {
  const normalizedPage = normalizePageRecord({
    ...page,
    draftContentJson
  });

  const nextPage = {
    ...normalizedPage,
    draftBodyText: extractPlainTextFromServerDocument(normalizedPage.draftContentJson) || null,
    draftRevision: Number.isSafeInteger(draftRevision) && draftRevision >= 0 ? draftRevision : normalizedPage.draftRevision ?? 0
  };

  return {
    ...nextPage,
    publicationState: resolvePagePublicationState(nextPage)
  };
}

export function savePageRecord(page: PageRecord): Promise<PageRecord> {
  const draft = normalizePageRecord(page);
  const record = draft.sysId ? loadExistingPageRecord(draft.sysId) : new GlideRecord(DOCSERA_PAGE_TABLE);

  if (!draft.sysId) {
    record.initialize();
  }

  record.setValue("workspace", draft.workspaceSysId);
  record.setValue("parent_page", draft.parentPageSysId ?? "");
  record.setValue("sibling_order", String(draft.siblingOrder));
  record.setValue("draft_title", draft.draftTitle);
  record.setValue("draft_slug", draft.draftSlug);
  record.setValue("draft_slug_normalized", draft.draftSlugNormalized);
  record.setValue("draft_content_json", serializePageContentJson(draft.draftContentJson));
  record.setValue("draft_revision", draft.draftRevision ?? 0);
  record.setValue("draft_body_text", draft.draftBodyText ?? "");
  record.setValue("published_title", draft.publishedTitle ?? "");
  record.setValue("published_slug", draft.publishedSlug ?? "");
  record.setValue("published_slug_normalized", draft.publishedSlugNormalized ?? "");
  record.setValue("published_content_json", draft.publishedContentJson ? serializePageContentJson(draft.publishedContentJson) : "");
  record.setValue("published_body_text", draft.publishedBodyText ?? "");
  record.setValue("published_at", draft.publishedAt ?? "");
  record.setValue("published_by", draft.publishedBySysId ?? "");
  record.setValue("publication_state", draft.publicationState);
  record.setValue("active", draft.active);

  const savedSysId = cleanText(draft.sysId ? record.update() : record.insert());
  if (!savedSysId) {
    throw new Error("Failed to save page record.");
  }

  return Promise.resolve(rereadPageRecord(savedSysId));
}

/**
 * Saves only the draft fields used by autosave for a single active editor
 * session. The caller-provided revision remains a sequential stale-request
 * guard, but this helper does not claim atomic cross-session protection.
 */
export function savePageDraftRecord(page: PageRecord, expectedRevision: unknown): Promise<PageRecord | null> {
  const draft = normalizePageRecord(page);
  if (!draft.sysId || typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("A saved page and expected draft revision are required.");
  }
  const currentRevision = expectedRevision;
  const acceptedRevision = currentRevision + 1;
  const record = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!record.get("sys_id", draft.sysId)) {
    throw new Error("Page record could not be loaded.");
  }

  const persistedRevision = Number(record.getValue("draft_revision"));
  if (!Number.isSafeInteger(persistedRevision) || persistedRevision < 0) {
    throw new Error("Page record has an invalid persisted draft revision.");
  }
  if (persistedRevision !== currentRevision) {
    return Promise.resolve(null);
  }

  const persistedPublishedSnapshot = {
    publishedTitle: cleanText(record.getValue("published_title")) || null,
    publishedSlug: cleanText(record.getValue("published_slug")) || null,
    publishedSlugNormalized: cleanText(record.getValue("published_slug_normalized")) || null,
    publishedContentJson: cleanText(record.getValue("published_content_json"))
      ? parseServerDocument(String(record.getValue("published_content_json")))
      : null,
    publishedBodyText: cleanText(record.getValue("published_body_text")) || null
  };
  const persistedDraftSnapshot = {
    ...draft,
    ...persistedPublishedSnapshot,
    publicationState: resolvePagePublicationState({
      ...draft,
      ...persistedPublishedSnapshot
    })
  };

  record.setValue("draft_body_text", persistedDraftSnapshot.draftBodyText ?? "");
  record.setValue("draft_content_json", serializePageContentJson(persistedDraftSnapshot.draftContentJson));
  record.setValue("draft_revision", acceptedRevision);
  record.setValue("publication_state", persistedDraftSnapshot.publicationState);

  const updatedSysId = cleanText(record.update());
  if (!updatedSysId) {
    throw new Error("Failed to save page record.");
  }

  return Promise.resolve({ ...persistedDraftSnapshot, draftRevision: acceptedRevision });
}

export function buildPublishedPageRecord(
  page: PageRecord,
  input: {
    publishedAt: string;
    publishedByDisplayName?: string | null;
    publishedBySysId: string;
  }
): PageRecord {
  const normalizedPage = normalizePageRecord(page);
  const publishedTitle = cleanText(normalizedPage.draftTitle);
  const publishedSlug = cleanText(normalizedPage.draftSlugNormalized || normalizedPage.draftSlug).toLowerCase();
  const publishedBodyText = extractPlainTextFromServerDocument(normalizedPage.draftContentJson) || null;

  return {
    ...normalizedPage,
    draftSlug: publishedSlug,
    draftSlugNormalized: publishedSlug,
    draftBodyText: publishedBodyText,
    publishedTitle,
    publishedSlug,
    publishedSlugNormalized: publishedSlug,
    publishedContentJson: parseServerDocument(normalizedPage.draftContentJson),
    publishedBodyText,
    publishedAt: cleanText(input.publishedAt) || null,
    publishedBySysId: cleanText(input.publishedBySysId) || null,
    publishedByDisplayName: cleanText(input.publishedByDisplayName) || null,
    publicationState: PAGE_PUBLICATION_STATES.published
  };
}

export function savePublishedPageRecord(page: PageRecord, expectedRevision: unknown): Promise<PageRecord | null> {
  const draft = normalizePageRecord(page);
  if (!draft.sysId || typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("A saved page and expected draft revision are required.");
  }

  const record = loadExistingPageRecord(draft.sysId);

  const persistedRevision = Number(record.getValue("draft_revision"));
  if (!Number.isSafeInteger(persistedRevision) || persistedRevision < 0) {
    throw new Error("Page record has an invalid persisted draft revision.");
  }
  if (persistedRevision !== expectedRevision) {
    return Promise.resolve(null);
  }

  const persistedPage = mapPageRecord(record);
  const nextPublishedPage = {
    ...persistedPage,
    publishedTitle: draft.publishedTitle,
    publishedSlug: draft.publishedSlug,
    publishedSlugNormalized: draft.publishedSlugNormalized,
    publishedContentJson: draft.publishedContentJson,
    publishedBodyText: draft.publishedBodyText,
    publishedAt: draft.publishedAt,
    publishedBySysId: draft.publishedBySysId,
    publishedByDisplayName: draft.publishedByDisplayName
  };

  record.setValue("published_title", nextPublishedPage.publishedTitle ?? "");
  record.setValue("published_slug", nextPublishedPage.publishedSlug ?? "");
  record.setValue("published_slug_normalized", nextPublishedPage.publishedSlugNormalized ?? "");
  record.setValue(
    "published_content_json",
    nextPublishedPage.publishedContentJson ? serializePageContentJson(nextPublishedPage.publishedContentJson) : ""
  );
  record.setValue("published_body_text", nextPublishedPage.publishedBodyText ?? "");
  record.setValue("published_at", nextPublishedPage.publishedAt ?? "");
  record.setValue("published_by", nextPublishedPage.publishedBySysId ?? "");
  record.setValue("publication_state", resolvePagePublicationState(nextPublishedPage));

  const updatedSysId = cleanText(record.update());
  if (!updatedSysId) {
    throw new Error("Failed to save page record.");
  }

  return Promise.resolve(rereadPageRecord(updatedSysId));
}

export function savePageSettingsRecord(page: PageRecord): Promise<PageRecord> {
  const draft = normalizePageRecord(page);
  if (!draft.sysId) {
    throw new Error("A saved page is required.");
  }

  const record = loadExistingPageRecord(draft.sysId);
  const persistedPage = mapPageRecord(record);
  const nextPage = {
    ...persistedPage,
    draftTitle: draft.draftTitle,
    draftSlug: draft.draftSlug,
    draftSlugNormalized: draft.draftSlugNormalized
  };

  record.setValue("draft_title", nextPage.draftTitle);
  record.setValue("draft_slug", nextPage.draftSlug);
  record.setValue("draft_slug_normalized", nextPage.draftSlugNormalized);
  record.setValue("publication_state", resolvePagePublicationState(nextPage));

  const updatedSysId = cleanText(record.update());
  if (!updatedSysId) {
    throw new Error("Failed to save page record.");
  }

  return Promise.resolve(rereadPageRecord(updatedSysId));
}

export function deletePageRecord(pageSysId: string): Promise<void> {
  const normalizedPageSysId = cleanText(pageSysId);
  if (!normalizedPageSysId) {
    throw new Error("Page record could not be loaded.");
  }

  const record = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!record.get("sys_id", normalizedPageSysId)) {
    throw new Error("Page record could not be loaded.");
  }

  const deleted = record.deleteRecord();
  if (!deleted) {
    throw new Error("Failed to delete page record.");
  }

  return Promise.resolve();
}
