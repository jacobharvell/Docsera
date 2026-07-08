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

function resolvePageSysId(reference: unknown): string {
  if (typeof reference === "string") {
    return cleanText(reference);
  }

  if (!reference || typeof reference !== "object") {
    return "";
  }

  const candidate = reference as Record<string, unknown>;
  return cleanText(candidate.sysId ?? candidate.sys_id ?? candidate.id ?? candidate.pageSysId ?? candidate.pageId);
}

function resolvePageWorkspaceSysId(page: unknown): string {
  if (!page || typeof page !== "object") {
    return "";
  }

  const candidate = page as Record<string, unknown>;
  return cleanText(candidate.workspaceSysId ?? candidate.workspace ?? candidate.workspaceId);
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

function collectReservedPageSlugs(retainedPages: PageLike[] = [], workspaceSysId = "", excludePageSysId = ""): string[] {
  const workspaceFilter = cleanText(workspaceSysId);
  const excludedPageSysId = cleanText(excludePageSysId);
  const reserved = new Set<string>();

  for (const page of retainedPages) {
    if (!page || typeof page !== "object") {
      continue;
    }

    if (workspaceFilter && resolvePageWorkspaceSysId(page) && resolvePageWorkspaceSysId(page) !== workspaceFilter) {
      continue;
    }

    if (excludedPageSysId && resolvePageSysId(page) === excludedPageSysId) {
      continue;
    }

    for (const candidate of resolvePageSlugCandidates(page)) {
      reserved.add(candidate.toLowerCase());
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
