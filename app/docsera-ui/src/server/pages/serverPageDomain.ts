export const DOCSERA_PAGE_TABLE = "x_82900_docsera_page";

export type PagePublicationState = "draft" | "published" | "published_with_unpublished_changes";

export type PageContentJson = Record<string, unknown>;

export type PageRecord = {
  sysId?: string;
  workspaceSysId: string;
  parentPageSysId: string | null;
  siblingOrder: number;
  draftTitle: string;
  draftSlug: string;
  draftSlugNormalized: string;
  draftContentJson: PageContentJson;
  draftBodyText: string | null;
  publishedTitle: string | null;
  publishedSlug: string | null;
  publishedSlugNormalized: string | null;
  publishedContentJson: PageContentJson | null;
  publishedBodyText: string | null;
  publicationState: PagePublicationState;
  active: boolean;
};

export type PageDraftInput = {
  title?: string | null;
  workspaceSysId?: string | null;
  parentPageSysId?: string | null;
  parentPageWorkspaceSysId?: string | null;
  siblingOrder?: number | null;
  slug?: string | null;
  draftSlug?: string | null;
  draftContentJson?: PageContentJson | null;
  draftBodyText?: string | null;
  publishedTitle?: string | null;
  publishedSlug?: string | null;
  publishedContentJson?: PageContentJson | null;
  publishedBodyText?: string | null;
  publicationState?: PagePublicationState | string | null;
  active?: boolean | null;
  sysId?: string | null;
};

export type PageSlugReservation =
  | string
  | {
      draftSlug?: string;
      draftSlugNormalized?: string;
      publishedSlug?: string;
      publishedSlugNormalized?: string;
      slug?: string;
      routingSlug?: string;
      sysId?: string;
      pageSysId?: string;
      workspaceSysId?: string;
      workspace?: string;
      parentPageSysId?: string;
    };

const DEFAULT_PAGE_CONTENT_JSON: PageContentJson = Object.freeze({
  type: "doc",
  content: []
});

export const PAGE_PUBLICATION_STATES = Object.freeze({
  draft: "draft" as const,
  published: "published" as const,
  publishedWithUnpublishedChanges: "published_with_unpublished_changes" as const
});

export const PAGE_TREE_MAX_DEPTH = 5;

export type PageSettingsValidationResult = {
  valid: boolean;
  value: string;
  normalizedValue: string;
  error: string;
};

export type PageLike = {
  sysId?: string;
  workspaceSysId: string;
  parentPageSysId: string | null;
  siblingOrder: number;
  draftTitle?: string;
  draftSlug?: string;
  draftSlugNormalized?: string;
  publishedSlug?: string | null;
  publishedSlugNormalized?: string | null;
  slug?: string;
  pageSlug?: string;
  routingSlug?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clonePageContentJson(value: unknown): PageContentJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.parse(JSON.stringify(DEFAULT_PAGE_CONTENT_JSON)) as PageContentJson;
  }

  return JSON.parse(JSON.stringify(value)) as PageContentJson;
}

function toSlugFragment(value: string): string {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePageSlug(value: unknown, fallback = ""): string {
  return toSlugFragment(cleanText(value)) || fallback;
}

function normalizeSiblingOrder(value: unknown, fallback = 1): number {
  const order = Number(value);
  if (!Number.isFinite(order) || order < 1) {
    return fallback;
  }

  return Math.floor(order);
}

function normalizePagePublicationState(value: unknown): PagePublicationState {
  const candidate = cleanText(value);
  if (candidate === PAGE_PUBLICATION_STATES.published || candidate === PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges) {
    return candidate;
  }

  return PAGE_PUBLICATION_STATES.draft;
}

export function normalizeServiceNowBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  const candidate = cleanText(value).toLowerCase();
  if (!candidate) {
    return fallback;
  }

  if (candidate === "true" || candidate === "1") {
    return true;
  }

  if (candidate === "false" || candidate === "0") {
    return false;
  }

  return fallback;
}

function resolveWorkspaceSysId(input: unknown): string {
  if (typeof input === "string") {
    return cleanText(input);
  }

  if (!input || typeof input !== "object") {
    return "";
  }

  const candidate = input as Record<string, unknown>;
  return cleanText(
    candidate.workspaceSysId ??
      candidate.workspace ??
      candidate.workspaceId ??
      candidate.sysId ??
      candidate.sys_id ??
      candidate.id
  );
}

function resolvePageSysId(reference: unknown): string {
  if (typeof reference === "string") {
    return cleanText(reference);
  }

  if (!reference || typeof reference !== "object") {
    return "";
  }

  const candidate = reference as Record<string, unknown>;
  return cleanText(
    candidate.sysId ??
      candidate.sys_id ??
      candidate.sysID ??
      candidate.id ??
      candidate.pageSysId ??
      candidate.pageId
  );
}

function resolvePageWorkspaceSysId(page: unknown): string {
  if (!page || typeof page !== "object") {
    return "";
  }

  const candidate = page as Record<string, unknown>;
  return resolveWorkspaceSysId(candidate.workspaceSysId ?? candidate.workspace ?? candidate.workspaceId);
}

function resolvePageParentSysId(page: unknown): string {
  if (!page || typeof page !== "object") {
    return "";
  }

  const candidate = page as Record<string, unknown>;
  return resolvePageSysId(candidate.parentPageSysId ?? candidate.parentPage ?? candidate.parentPageId ?? candidate.parentId);
}

function resolvePageSlugCandidates(page: PageLike): string[] {
  return [
    page.draftSlug,
    page.draftSlugNormalized,
    page.publishedSlug,
    page.publishedSlugNormalized,
    page.slug,
    page.pageSlug,
    page.routingSlug
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);
}

function isValidPageSlugFormat(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

function collectReservedPageSlugs(retainedPages: PageSlugReservation[] = [], workspaceSysId = "", excludePageSysId = ""): string[] {
  const workspaceFilter = cleanText(workspaceSysId);
  const excludedPageSysId = cleanText(excludePageSysId);
  const reserved = new Set<string>();

  for (const page of retainedPages) {
    if (typeof page === "string") {
      const slug = normalizePageSlug(page);
      if (slug) {
        reserved.add(slug.toLowerCase());
      }
      continue;
    }

    if (!page || typeof page !== "object") {
      continue;
    }

    if (workspaceFilter && resolvePageWorkspaceSysId(page) && resolvePageWorkspaceSysId(page) !== workspaceFilter) {
      continue;
    }

    if (excludedPageSysId && resolvePageSysId(page) === excludedPageSysId) {
      continue;
    }

    for (const candidate of [
      page.draftSlug,
      page.draftSlugNormalized,
      page.publishedSlug,
      page.publishedSlugNormalized,
      page.slug,
      page.routingSlug
    ]) {
      const slug = normalizePageSlug(candidate);
      if (slug) {
        reserved.add(slug.toLowerCase());
      }
    }
  }

  return [...reserved];
}

export function validatePageSettingsTitle(title: unknown): PageSettingsValidationResult {
  const normalizedTitle = cleanText(title);

  if (!normalizedTitle) {
    return {
      valid: false,
      value: "",
      normalizedValue: "",
      error: "Page title is required."
    };
  }

  if (normalizedTitle.length > 160) {
    return {
      valid: false,
      value: normalizedTitle,
      normalizedValue: normalizedTitle,
      error: "Page title must be 160 characters or fewer."
    };
  }

  return {
    valid: true,
    value: normalizedTitle,
    normalizedValue: normalizedTitle,
    error: ""
  };
}

export function validatePageSettingsSlug(
  slug: unknown,
  retainedPages: PageLike[] = [],
  workspaceSysId = "",
  currentPageSysId = ""
): PageSettingsValidationResult {
  const rawSlug = typeof slug === "string" ? slug : "";
  const normalizedSlug = rawSlug.trim();

  if (!normalizedSlug) {
    return {
      valid: false,
      value: "",
      normalizedValue: "",
      error: "Slug is required."
    };
  }

  if (normalizedSlug !== rawSlug || !isValidPageSlugFormat(normalizedSlug)) {
    return {
      valid: false,
      value: normalizedSlug,
      normalizedValue: normalizedSlug.toLowerCase(),
      error: "Invalid slug. Slug must only include letters, numbers, dashes, periods, or underscores."
    };
  }

  const normalizedValue = normalizedSlug.toLowerCase();
  const currentPage = retainedPages.find((page) => resolvePageSysId(page) === cleanText(currentPageSysId));
  if (currentPage) {
    const currentSlugCandidates = resolvePageSlugCandidates(currentPage).map((value) => value.toLowerCase());
    if (currentSlugCandidates.includes(normalizedValue)) {
      return {
        valid: true,
        value: normalizedSlug,
        normalizedValue,
        error: ""
      };
    }
  }

  const reservedSlugs = new Set(collectReservedPageSlugs(retainedPages, workspaceSysId, currentPageSysId));

  if (reservedSlugs.has(normalizedValue)) {
    return {
      valid: false,
      value: normalizedSlug,
      normalizedValue,
      error: "Slug must be unique within this workspace."
    };
  }

  return {
    valid: true,
    value: normalizedSlug,
    normalizedValue,
    error: ""
  };
}

export function collectPageSubtreeSysIds(pages: PageLike[] = [], rootPageSysId = ""): string[] {
  const normalizedRootPageSysId = cleanText(rootPageSysId);
  if (!normalizedRootPageSysId) {
    return [];
  }

  const pagesByParent = new Map<string, PageLike[]>();

  for (const page of pages) {
    if (!page || typeof page !== "object") {
      continue;
    }

    const parentSysId = cleanText(resolvePageParentSysId(page));
    if (!pagesByParent.has(parentSysId)) {
      pagesByParent.set(parentSysId, []);
    }

    pagesByParent.get(parentSysId)?.push(page);
  }

  const subtreeIds = new Set<string>();
  const queue = [normalizedRootPageSysId];

  while (queue.length) {
    const currentSysId = queue.shift();
    if (!currentSysId || subtreeIds.has(currentSysId)) {
      continue;
    }

    subtreeIds.add(currentSysId);

    const childPages = pagesByParent.get(currentSysId) ?? [];
    for (const childPage of childPages) {
      const childSysId = resolvePageSysId(childPage);
      if (childSysId && !subtreeIds.has(childSysId)) {
        queue.push(childSysId);
      }
    }
  }

  return [...subtreeIds];
}

export function removePageSubtree(pages: PageLike[] = [], rootPageSysId = ""): PageLike[] {
  const subtreeIds = new Set(collectPageSubtreeSysIds(pages, rootPageSysId));
  if (!subtreeIds.size) {
    return Array.isArray(pages) ? pages.slice() : [];
  }

  return pages.filter((page) => !subtreeIds.has(resolvePageSysId(page)));
}

export function pickNextVisiblePageAfterDelete(pages: PageLike[] = [], deletedPageSysId = ""): string {
  const normalizedDeletedPageSysId = cleanText(deletedPageSysId);
  if (!normalizedDeletedPageSysId) {
    return "";
  }

  const subtreeIds = new Set(collectPageSubtreeSysIds(pages, normalizedDeletedPageSysId));
  if (!subtreeIds.size) {
    return "";
  }

  const orderedPages = Array.isArray(pages) ? pages : [];
  const firstDeletedIndex = orderedPages.findIndex((page) => subtreeIds.has(resolvePageSysId(page)));
  let lastDeletedIndex = firstDeletedIndex;

  for (let index = firstDeletedIndex + 1; index < orderedPages.length; index += 1) {
    if (subtreeIds.has(resolvePageSysId(orderedPages[index]))) {
      lastDeletedIndex = index;
    }
  }

  for (let index = lastDeletedIndex + 1; index < orderedPages.length; index += 1) {
    const candidate = cleanText(resolvePageSysId(orderedPages[index]));
    if (candidate && !subtreeIds.has(candidate)) {
      return candidate;
    }
  }

  for (let index = firstDeletedIndex - 1; index >= 0; index -= 1) {
    const candidate = cleanText(resolvePageSysId(orderedPages[index]));
    if (candidate && !subtreeIds.has(candidate)) {
      return candidate;
    }
  }

  return "";
}

export function allocatePageSlug(
  title: string,
  retainedPages: PageSlugReservation[] = [],
  workspaceSysId = "",
  explicitSlug = ""
): string {
  const baseSlug = normalizePageSlug(explicitSlug || title, "page");
  const reservedSlugs = new Set(collectReservedPageSlugs(retainedPages, workspaceSysId).map((slug) => slug.toLowerCase()));

  if (!reservedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 1;
  while (reservedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

export function allocatePageSiblingOrder(
  retainedPages: PageSlugReservation[] = [],
  workspaceSysId = "",
  parentPageSysId = ""
): number {
  const normalizedWorkspaceSysId = cleanText(workspaceSysId);
  const normalizedParentPageSysId = cleanText(parentPageSysId);
  let highestOrder = 0;

  for (const page of retainedPages) {
    if (!page || typeof page !== "object") {
      continue;
    }

    if (normalizedWorkspaceSysId && resolvePageWorkspaceSysId(page) !== normalizedWorkspaceSysId) {
      continue;
    }

    if (cleanText(resolvePageParentSysId(page)) !== normalizedParentPageSysId) {
      continue;
    }

    const order = Number((page as Record<string, unknown>).siblingOrder);
    if (Number.isFinite(order) && order > highestOrder) {
      highestOrder = Math.floor(order);
    }
  }

  return highestOrder + 1;
}

export function createPageDraft(input: PageDraftInput, retainedPages: PageSlugReservation[] = []): PageRecord {
  if (!input || typeof input !== "object") {
    throw new TypeError("Page input must be an object.");
  }

  const title = cleanText(input.title);
  if (!title) {
    throw new TypeError("Page title is required.");
  }

  if (title.length > 160) {
    throw new TypeError("Page title must be 160 characters or fewer.");
  }

  const workspaceSysId = cleanText(input.workspaceSysId);
  if (!workspaceSysId) {
    throw new TypeError("A workspace reference is required.");
  }

  const parentPageSysId = cleanText(input.parentPageSysId);
  const parentPageWorkspaceSysId = cleanText(input.parentPageWorkspaceSysId);
  if (parentPageSysId && parentPageWorkspaceSysId && parentPageWorkspaceSysId !== workspaceSysId) {
    throw new TypeError("A parent page must belong to the same workspace.");
  }

  const draftSlug = allocatePageSlug(title, retainedPages, workspaceSysId, input.slug || input.draftSlug || "");
  const siblingOrder =
    input.siblingOrder !== undefined && input.siblingOrder !== null
      ? normalizeSiblingOrder(input.siblingOrder)
      : allocatePageSiblingOrder(retainedPages, workspaceSysId, parentPageSysId);

  return {
    sysId: cleanText(input.sysId) || undefined,
    workspaceSysId,
    parentPageSysId: parentPageSysId || null,
    siblingOrder,
    draftTitle: title,
    draftSlug,
    draftSlugNormalized: draftSlug.toLowerCase(),
    draftContentJson: clonePageContentJson(input.draftContentJson ?? null),
    draftBodyText: cleanText(input.draftBodyText) || null,
    publishedTitle: cleanText(input.publishedTitle) || null,
    publishedSlug: cleanText(input.publishedSlug) || null,
    publishedSlugNormalized: cleanText(input.publishedSlug).toLowerCase() || null,
    publishedContentJson: input.publishedContentJson ? clonePageContentJson(input.publishedContentJson) : null,
    publishedBodyText: cleanText(input.publishedBodyText) || null,
    publicationState: normalizePagePublicationState(input.publicationState),
    active: input.active !== undefined && input.active !== null ? Boolean(input.active) : true
  };
}

export function normalizePageRecord(row: Record<string, unknown>): PageRecord {
  return {
    sysId: cleanText(row.sysId) || undefined,
    workspaceSysId: cleanText(row.workspaceSysId),
    parentPageSysId: cleanText(row.parentPageSysId) || null,
    siblingOrder: normalizeSiblingOrder(row.siblingOrder),
    draftTitle: cleanText(row.draftTitle),
    draftSlug: cleanText(row.draftSlug),
    draftSlugNormalized: cleanText(row.draftSlugNormalized),
    draftContentJson: clonePageContentJson(row.draftContentJson),
    draftBodyText: cleanText(row.draftBodyText) || null,
    publishedTitle: cleanText(row.publishedTitle) || null,
    publishedSlug: cleanText(row.publishedSlug) || null,
    publishedSlugNormalized: cleanText(row.publishedSlugNormalized) || null,
    publishedContentJson: row.publishedContentJson ? clonePageContentJson(row.publishedContentJson) : null,
    publishedBodyText: cleanText(row.publishedBodyText) || null,
    publicationState: normalizePagePublicationState(row.publicationState),
    active: row.active === undefined ? true : normalizeServiceNowBoolean(row.active, true)
  };
}
