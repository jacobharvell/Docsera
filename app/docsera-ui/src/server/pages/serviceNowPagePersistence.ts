import { GlideRecord } from "@servicenow/glide";
import { createEmptyServerDocumentEnvelope } from "./serverEditorDocument.ts";
import { DOCSERA_PAGE_TABLE, normalizePageRecord, type PageContentJson, type PageRecord } from "./serverPageDomain.ts";
import { mapPageRecord } from "./serviceNowPageRecords.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function serializePageContentJson(value: PageContentJson): string {
  return JSON.stringify(value ?? createEmptyServerDocumentEnvelope());
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

  return {
    ...normalizedPage,
    draftBodyText: normalizedBodyText,
    draftContentJson: createPageBodyContentJsonFromText(normalizedBodyText ?? ""),
    draftRevision: Number.isSafeInteger(draftRevision) && draftRevision >= 0 ? draftRevision : normalizedPage.draftRevision ?? 0
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

  return {
    ...normalizedPage,
    draftRevision: Number.isSafeInteger(draftRevision) && draftRevision >= 0 ? draftRevision : normalizedPage.draftRevision ?? 0
  };
}

export function savePageRecord(page: PageRecord): Promise<PageRecord> {
  const draft = normalizePageRecord(page);
  const record = new GlideRecord(DOCSERA_PAGE_TABLE);

  if (draft.sysId) {
    if (!record.get("sys_id", draft.sysId)) {
      throw new Error("Page record could not be loaded.");
    }
  } else {
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
  record.setValue("publication_state", draft.publicationState);
  record.setValue("active", draft.active);

  const savedSysId = cleanText(draft.sysId ? record.update() : record.insert());
  if (!savedSysId) {
    throw new Error("Failed to save page record.");
  }

  const savedRecord = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!savedRecord.get("sys_id", savedSysId)) {
    throw new Error("Page record could not be loaded after save.");
  }

  return Promise.resolve(mapPageRecord(savedRecord));
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

  record.setValue("draft_body_text", draft.draftBodyText ?? "");
  record.setValue("draft_content_json", serializePageContentJson(draft.draftContentJson));
  record.setValue("draft_revision", acceptedRevision);

  const updatedSysId = cleanText(record.update());
  if (!updatedSysId) {
    throw new Error("Failed to save page record.");
  }

  return Promise.resolve({ ...draft, draftRevision: acceptedRevision });
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
