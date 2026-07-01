const DEFAULT_PAGE_TABLE = 'x_82900_odoc2_page';
const DEFAULT_PAGE_CONTENT_JSON = Object.freeze({
	type: 'doc',
	content: []
});
export const PAGE_TREE_MAX_DEPTH = 5;

const PAGE_PUBLICATION_STATES = Object.freeze({
	draft: 'draft',
	published: 'published',
	publishedWithUnpublishedChanges: 'published_with_unpublished_changes'
});

function cleanText(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

function toSlugFragment(value) {
	return cleanText(value)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

function normalizePageSlug(value, fallback = '') {
	return toSlugFragment(value) || fallback;
}

function resolveStableId(reference) {
	if (typeof reference === 'string') {
		return cleanText(reference);
	}

	if (!reference || typeof reference !== 'object') {
		return '';
	}

	return cleanText(
		reference.sysId ||
		reference.sys_id ||
		reference.sysID ||
		reference.id ||
		reference.pageSysId ||
		reference.pageId ||
		reference.workspaceSysId ||
		reference.workspaceId
	);
}

function resolvePageSysId(reference) {
	if (typeof reference === 'string') {
		return cleanText(reference);
	}

	if (!reference || typeof reference !== 'object') {
		return '';
	}

	return cleanText(
		reference.sysId ||
		reference.sys_id ||
		reference.sysID ||
		reference.id ||
		reference.pageSysId ||
		reference.pageId
	);
}

function resolveWorkspaceSysId(input) {
	if (typeof input === 'string') {
		return cleanText(input);
	}

	if (!input || typeof input !== 'object') {
		return '';
	}

	return resolveStableId(
		input.workspaceSysId ||
		input.workspace ||
		input.workspaceId ||
		input.sysId ||
		input.sys_id
	);
}

function resolvePageContext(input) {
	if (!input || typeof input !== 'object') {
		return {
			sysId: '',
			workspaceSysId: ''
		};
	}

	return {
		sysId: resolvePageSysId(input.parentPageSysId || input.parentPage || input.parentPageId),
		workspaceSysId: resolveWorkspaceSysId(
			input.parentPageWorkspaceSysId ||
			input.parentWorkspace ||
			input.parentPageWorkspace ||
			input.parentPage
		)
	};
}

function normalizePageContentJson(value) {
	if (!value || typeof value !== 'object') {
		return structuredClone(DEFAULT_PAGE_CONTENT_JSON);
	}

	return structuredClone(value);
}

function normalizePagePublicationState(value) {
	const candidate = cleanText(value);
	if (!candidate) {
		return PAGE_PUBLICATION_STATES.draft;
	}

	return Object.values(PAGE_PUBLICATION_STATES).includes(candidate)
		? candidate
		: PAGE_PUBLICATION_STATES.draft;
}

function samePageContentJson(left, right) {
	return JSON.stringify(normalizePageContentJson(left)) === JSON.stringify(normalizePageContentJson(right));
}

function hasPublishedPageSnapshot(page) {
	if (!page || typeof page !== 'object') {
		return false;
	}

	return Boolean(
		cleanText(page.publishedTitle) ||
		cleanText(page.publishedSlug) ||
		page.publishedContentJson ||
		cleanText(page.publishedBodyText)
	);
}

function hasPageDraftDifferencesFromPublished(page) {
	if (!hasPublishedPageSnapshot(page)) {
		return false;
	}

	const draftTitle = cleanText(page.draftTitle || page.publishedTitle || page.title);
	const draftSlug = cleanText(page.draftSlug || page.publishedSlug || page.slug || page.pageSlug).toLowerCase();
	const draftContentJson = normalizePageContentJson(page.draftContentJson || page.publishedContentJson);
	const publishedTitle = cleanText(page.publishedTitle);
	const publishedSlug = cleanText(page.publishedSlug || page.publishedSlugNormalized).toLowerCase();
	const publishedContentJson = page.publishedContentJson ? normalizePageContentJson(page.publishedContentJson) : null;

	return draftTitle !== publishedTitle ||
		draftSlug !== publishedSlug ||
		!samePageContentJson(draftContentJson, publishedContentJson);
}

function normalizeSiblingOrder(value, fallback = 1) {
	const order = Number(value);
	if (!Number.isFinite(order) || order < 1) {
		return fallback;
	}

	return Math.floor(order);
}

function resolvePageWorkspaceSysId(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return resolveWorkspaceSysId(page.workspaceSysId || page.workspace || page.workspaceId);
}

function resolvePageParentSysId(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return resolvePageSysId(page.parentPageSysId || page.parentPage || page.parentPageId || page.parentId);
}

function resolvePageSiblingOrder(page) {
	if (!page || typeof page !== 'object') {
		return null;
	}

	const order = Number(page.siblingOrder ?? page.sortOrder ?? page.order);
	return Number.isFinite(order) ? Math.floor(order) : null;
}

function buildPageBySysIdMap(pages = []) {
	const pagesBySysId = new Map();

	for (const page of Array.isArray(pages) ? pages : []) {
		if (!page || typeof page !== 'object') {
			continue;
		}

		const sysId = resolvePageSysId(page);
		if (sysId) {
			pagesBySysId.set(sysId, page);
		}
	}

	return pagesBySysId;
}

function buildPagesByParentMap(pages = []) {
	const pagesByParent = new Map();

	for (const page of Array.isArray(pages) ? pages : []) {
		if (!page || typeof page !== 'object') {
			continue;
		}

		const parentSysId = resolvePageParentSysId(page);
		if (!pagesByParent.has(parentSysId)) {
			pagesByParent.set(parentSysId, []);
		}

		pagesByParent.get(parentSysId).push(page);
	}

	return pagesByParent;
}

function comparePageSiblingPlacement(left, right) {
	const leftOrder = resolvePageSiblingOrder(left);
	const rightOrder = resolvePageSiblingOrder(right);

	if (leftOrder !== rightOrder) {
		return (leftOrder ?? Number.POSITIVE_INFINITY) - (rightOrder ?? Number.POSITIVE_INFINITY);
	}

	const leftTitle = cleanText(left.draftTitle || left.publishedTitle || left.title);
	const rightTitle = cleanText(right.draftTitle || right.publishedTitle || right.title);
	const titleComparison = leftTitle.localeCompare(rightTitle, undefined, {sensitivity: 'base'});
	if (titleComparison !== 0) {
		return titleComparison;
	}

	const leftSlug = cleanText(left.draftSlug || left.publishedSlug || left.slug || left.pageSlug);
	const rightSlug = cleanText(right.draftSlug || right.publishedSlug || right.slug || right.pageSlug);
	const slugComparison = leftSlug.localeCompare(rightSlug, undefined, {sensitivity: 'base'});
	if (slugComparison !== 0) {
		return slugComparison;
	}

	return resolvePageSysId(left).localeCompare(resolvePageSysId(right), undefined, {sensitivity: 'base'});
}

export function collectPageAncestorSysIds(pages = [], pageSysId = '') {
	const normalizedPageSysId = cleanText(pageSysId);
	if (!normalizedPageSysId) {
		return [];
	}

	const pagesBySysId = buildPageBySysIdMap(pages);
	const ancestors = [];
	const visited = new Set();
	let currentPage = pagesBySysId.get(normalizedPageSysId) || null;

	while (currentPage && !visited.has(resolvePageSysId(currentPage))) {
		const currentParentSysId = resolvePageParentSysId(currentPage);
		if (!currentParentSysId || visited.has(currentParentSysId)) {
			break;
		}

		visited.add(resolvePageSysId(currentPage));
		ancestors.push(currentParentSysId);
		currentPage = pagesBySysId.get(currentParentSysId) || null;
	}

	return ancestors;
}

export function resolvePageDepth(pages = [], pageSysId = '') {
	const normalizedPageSysId = cleanText(pageSysId);
	if (!normalizedPageSysId) {
		return 0;
	}

	const pagesBySysId = buildPageBySysIdMap(pages);
	if (!pagesBySysId.has(normalizedPageSysId)) {
		return 0;
	}

	return collectPageAncestorSysIds(pages, normalizedPageSysId).length + 1;
}

export function resolvePageSubtreeDepth(pages = [], rootPageSysId = '') {
	const normalizedRootPageSysId = cleanText(rootPageSysId);
	if (!normalizedRootPageSysId) {
		return 0;
	}

	const pagesBySysId = buildPageBySysIdMap(pages);
	if (!pagesBySysId.has(normalizedRootPageSysId)) {
		return 0;
	}

	const pagesByParent = buildPagesByParentMap(pages);
	const visited = new Set();
	const queue = [{
		sysId: normalizedRootPageSysId,
		depth: 1
	}];
	let maxDepth = 0;

	while (queue.length) {
		const current = queue.shift();
		if (!current || visited.has(current.sysId)) {
			continue;
		}

		visited.add(current.sysId);
		if (current.depth > maxDepth) {
			maxDepth = current.depth;
		}

		const childPages = pagesByParent.get(current.sysId) || [];
		for (const childPage of childPages) {
			const childSysId = resolvePageSysId(childPage);
			if (childSysId && !visited.has(childSysId)) {
				queue.push({
					sysId: childSysId,
					depth: current.depth + 1
				});
			}
		}
	}

	return maxDepth;
}

export function isPageDescendantOf(pages = [], pageSysId = '', ancestorPageSysId = '') {
	const normalizedPageSysId = cleanText(pageSysId);
	const normalizedAncestorPageSysId = cleanText(ancestorPageSysId);
	if (!normalizedPageSysId || !normalizedAncestorPageSysId || normalizedPageSysId === normalizedAncestorPageSysId) {
		return false;
	}

	return collectPageAncestorSysIds(pages, normalizedPageSysId).includes(normalizedAncestorPageSysId);
}

function normalizeSiblingGroupOrder(pages, workspaceSysId, parentPageSysId, nextPagesBySysId) {
	const normalizedWorkspaceSysId = cleanText(workspaceSysId);
	const normalizedParentPageSysId = cleanText(parentPageSysId);
	const siblings = (Array.isArray(pages) ? pages : []).filter(page => {
		if (!page || typeof page !== 'object') {
			return false;
		}

		if (normalizedWorkspaceSysId && resolvePageWorkspaceSysId(page) !== normalizedWorkspaceSysId) {
			return false;
		}

		return cleanText(resolvePageParentSysId(page)) === normalizedParentPageSysId;
	});

	siblings.forEach((page, index) => {
		nextPagesBySysId.set(resolvePageSysId(page), {
			...page,
			siblingOrder: index + 1
		});
	});
}

function buildSiblingGroupKey(workspaceSysId, parentPageSysId) {
	return `${cleanText(workspaceSysId)}::${cleanText(parentPageSysId)}`;
}

export function validatePageMoveTarget(pages = [], movingPageSysId = '', targetPageSysId = '', placement = 'inside', maxDepth = PAGE_TREE_MAX_DEPTH) {
	const normalizedMovingPageSysId = cleanText(movingPageSysId);
	const normalizedTargetPageSysId = cleanText(targetPageSysId);
	const normalizedPlacement = cleanText(placement).toLowerCase();
	const supportedPlacements = new Set(['before', 'after', 'inside']);
	const depthLimit = Number(maxDepth);

	if (!normalizedMovingPageSysId) {
		return {
			valid: false,
			error: 'A moved page is required.'
		};
	}

	if (!normalizedTargetPageSysId) {
		return {
			valid: false,
			error: 'A drop target is required.'
		};
	}

	if (!supportedPlacements.has(normalizedPlacement)) {
		return {
			valid: false,
			error: 'A valid drop position is required.'
		};
	}

	const pagesBySysId = buildPageBySysIdMap(pages);
	const movingPage = pagesBySysId.get(normalizedMovingPageSysId) || null;
	const targetPage = pagesBySysId.get(normalizedTargetPageSysId) || null;

	if (!movingPage || !targetPage) {
		return {
			valid: false,
			error: 'The page tree could not resolve the dragged page or drop target.'
		};
	}

	const movingWorkspaceSysId = resolvePageWorkspaceSysId(movingPage);
	const targetWorkspaceSysId = resolvePageWorkspaceSysId(targetPage);

	if (!movingWorkspaceSysId || movingWorkspaceSysId !== targetWorkspaceSysId) {
		return {
			valid: false,
			error: 'Pages must stay within the same workspace.'
		};
	}

	if (normalizedMovingPageSysId === normalizedTargetPageSysId) {
		return {
			valid: false,
			error: 'A page cannot be dropped into itself.'
		};
	}

	if (isPageDescendantOf(pages, normalizedTargetPageSysId, normalizedMovingPageSysId)) {
		return {
			valid: false,
			error: 'A page cannot be dropped into one of its descendants.'
		};
	}

	const destinationParentPageSysId = normalizedPlacement === 'inside'
		? normalizedTargetPageSysId
		: resolvePageParentSysId(targetPage);
	const destinationParentDepth = destinationParentPageSysId
		? resolvePageDepth(pages, destinationParentPageSysId)
		: 0;
	const movingSubtreeDepth = resolvePageSubtreeDepth(pages, normalizedMovingPageSysId);
	const movedPageDepth = normalizedPlacement === 'inside'
		? destinationParentDepth + 1
		: destinationParentDepth + 1;

	if (!Number.isFinite(depthLimit) || depthLimit < 1) {
		return {
			valid: false,
			error: 'The maximum nesting depth is not configured.'
		};
	}

	if (movedPageDepth + movingSubtreeDepth - 1 > depthLimit) {
		return {
			valid: false,
			error: `This move would exceed the maximum nesting depth of ${depthLimit} levels.`
		};
	}

	return {
		valid: true,
		error: '',
		movingPageSysId: normalizedMovingPageSysId,
		targetPageSysId: normalizedTargetPageSysId,
		placement: normalizedPlacement,
		workspaceSysId: movingWorkspaceSysId,
		destinationParentPageSysId,
		destinationParentDepth,
		movingSubtreeDepth,
		movedPageDepth
	};
}

export function applyPageMove(pages = [], movingPageSysId = '', targetPageSysId = '', placement = 'inside', maxDepth = PAGE_TREE_MAX_DEPTH) {
	if (!Array.isArray(pages)) {
		return [];
	}

	const validation = validatePageMoveTarget(pages, movingPageSysId, targetPageSysId, placement, maxDepth);
	if (!validation.valid) {
		throw new Error(validation.error);
	}

	const pagesBySysId = buildPageBySysIdMap(pages);
	const movingPage = pagesBySysId.get(validation.movingPageSysId);
	const sourceParentPageSysId = resolvePageParentSysId(movingPage);
	const destinationParentPageSysId = validation.destinationParentPageSysId;
	const workspaceSysId = validation.workspaceSysId;
	const sameSiblingGroup = buildSiblingGroupKey(workspaceSysId, sourceParentPageSysId) === buildSiblingGroupKey(workspaceSysId, destinationParentPageSysId);
	const sourceSiblingGroup = pages
		.filter(page => page && typeof page === 'object' && resolvePageWorkspaceSysId(page) === workspaceSysId && cleanText(resolvePageParentSysId(page)) === cleanText(sourceParentPageSysId) && resolvePageSysId(page) !== validation.movingPageSysId)
		.slice()
		.sort(comparePageSiblingPlacement);
	const destinationSiblingGroup = sameSiblingGroup
		? sourceSiblingGroup.slice()
		: pages
			.filter(page => page && typeof page === 'object' && resolvePageWorkspaceSysId(page) === workspaceSysId && cleanText(resolvePageParentSysId(page)) === cleanText(destinationParentPageSysId) && resolvePageSysId(page) !== validation.movingPageSysId)
			.slice()
			.sort(comparePageSiblingPlacement);

	const movedPage = {
		...movingPage,
		parentPageSysId: destinationParentPageSysId || null
	};

	const insertionIndex = (() => {
		if (validation.placement === 'inside') {
			return destinationSiblingGroup.length;
		}

		const targetIndex = destinationSiblingGroup.findIndex(page => resolvePageSysId(page) === validation.targetPageSysId);
		if (targetIndex < 0) {
			return destinationSiblingGroup.length;
		}

		return validation.placement === 'before' ? targetIndex : targetIndex + 1;
	})();

	destinationSiblingGroup.splice(insertionIndex, 0, movedPage);

	const nextPagesBySysId = new Map(pages.map(page => [resolvePageSysId(page), page]));
	nextPagesBySysId.set(validation.movingPageSysId, movedPage);
	if (sameSiblingGroup) {
		normalizeSiblingGroupOrder(destinationSiblingGroup, workspaceSysId, destinationParentPageSysId, nextPagesBySysId);
	} else {
		normalizeSiblingGroupOrder(sourceSiblingGroup, workspaceSysId, sourceParentPageSysId, nextPagesBySysId);
		normalizeSiblingGroupOrder(destinationSiblingGroup, workspaceSysId, destinationParentPageSysId, nextPagesBySysId);
	}

	return pages.map(page => {
		const sysId = resolvePageSysId(page);
		return nextPagesBySysId.has(sysId) ? nextPagesBySysId.get(sysId) : page;
	});
}

function isValidPageSlugFormat(value) {
	return /^[A-Za-z0-9._-]+$/.test(value);
}

function collectReservedPageSlugs(retainedPages = [], workspaceSysId = '', excludePageSysId = '') {
	if (!Array.isArray(retainedPages)) {
		return [];
	}

	const workspaceFilter = cleanText(workspaceSysId);
	const excludedPageSysId = cleanText(excludePageSysId);
	const reserved = new Set();

	for (const page of retainedPages) {
		if (typeof page === 'string') {
			const slug = normalizePageSlug(page);
			if (slug) {
				reserved.add(slug);
			}
			continue;
		}

		if (!page || typeof page !== 'object') {
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
			page.pageSlug,
			page.slug,
			page.routingSlug
		]) {
			const slug = normalizePageSlug(candidate);
			if (slug) {
				reserved.add(slug);
			}
		}
	}

	return [...reserved];
}

export function validatePageSettingsTitle(title) {
	const normalizedTitle = cleanText(title);

	if (!normalizedTitle) {
		return {
			valid: false,
			value: '',
			error: 'Page title is required.'
		};
	}

	return {
		valid: true,
		value: normalizedTitle,
		error: ''
	};
}

export function validatePageSettingsSlug(slug, retainedPages = [], workspaceSysId = '', currentPageSysId = '') {
	const rawSlug = typeof slug === 'string' ? slug : '';
	const normalizedSlug = rawSlug.trim();

	if (!normalizedSlug) {
		return {
			valid: false,
			value: '',
			error: 'Slug is required.'
		};
	}

	if (normalizedSlug !== rawSlug || !isValidPageSlugFormat(normalizedSlug)) {
		return {
			valid: false,
			value: normalizedSlug,
			error: 'Invalid slug. Slug must only include letters, numbers, dashes, periods, or underscores.'
		};
	}

	const reservedSlugs = new Set(collectReservedPageSlugs(retainedPages, workspaceSysId, currentPageSysId));
	const lowerCaseSlug = normalizedSlug.toLowerCase();

	if (reservedSlugs.has(lowerCaseSlug)) {
		return {
			valid: false,
			value: lowerCaseSlug,
			error: 'Slug must be unique within this workspace.'
		};
	}

	return {
		valid: true,
		value: lowerCaseSlug,
		error: ''
	};
}

export function updatePageDraftSettings(page, {title, slug} = {}) {
	if (!page || typeof page !== 'object') {
		throw new TypeError('A page record is required.');
	}

	const normalizedTitle = validatePageSettingsTitle(title).value || cleanText(page.draftTitle || page.publishedTitle || page.title);
	const normalizedSlug = typeof slug === 'string'
		? slug.trim().toLowerCase()
		: cleanText(page.draftSlug || page.publishedSlug || page.slug || page.pageSlug).toLowerCase();
	const nextPage = {
		...page,
		draftTitle: normalizedTitle,
		draftSlug: normalizedSlug,
		draftSlugNormalized: normalizedSlug
	};
	const nextPublicationState = page.publicationState === PAGE_PUBLICATION_STATES.published || page.publicationState === PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
		? (hasPageDraftDifferencesFromPublished(nextPage)
			? PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
			: PAGE_PUBLICATION_STATES.published)
		: normalizePagePublicationState(page.publicationState);

	return {
		...nextPage,
		publicationState: nextPublicationState
	};
}

export function resolvePagePublishingState(page) {
	const publicationState = normalizePagePublicationState(page && typeof page === 'object' ? page.publicationState : '');
	const hasPublishedVersion = hasPublishedPageSnapshot(page);
	const hasUnpublishedChanges = hasPageDraftDifferencesFromPublished(page);
	const canPublish = publicationState === PAGE_PUBLICATION_STATES.draft || hasUnpublishedChanges;

	return {
		publicationState,
		hasPublishedVersion,
		hasUnpublishedChanges,
		canPublish,
		publicationStatusLabel: publicationState === PAGE_PUBLICATION_STATES.draft
			? 'Draft'
			: hasUnpublishedChanges
				? 'Unpublished changes'
				: 'Published',
		publishActionLabel: publicationState === PAGE_PUBLICATION_STATES.draft
			? 'Publish draft'
			: hasUnpublishedChanges
				? 'Publish changes'
				: 'No changes to publish'
	};
}

export function buildPagePublishRecord(page) {
	if (!page || typeof page !== 'object') {
		throw new TypeError('A page record is required.');
	}

	const draftTitle = cleanText(page.draftTitle || page.publishedTitle || page.title);
	const draftSlug = cleanText(page.draftSlug || page.publishedSlug || page.slug || page.pageSlug).toLowerCase();
	const draftContentJson = normalizePageContentJson(page.draftContentJson || page.publishedContentJson);
	const draftBodyText = typeof page.draftBodyText === 'string'
		? cleanText(page.draftBodyText)
		: cleanText(page.bodyText || page.publishedBodyText);

	return {
		...page,
		draftTitle,
		draftSlug,
		draftSlugNormalized: draftSlug,
		draftContentJson,
		draftBodyText,
		publishedTitle: draftTitle,
		publishedSlug: draftSlug,
		publishedSlugNormalized: draftSlug,
		publishedContentJson: normalizePageContentJson(draftContentJson),
		publishedBodyText: draftBodyText,
		publicationState: PAGE_PUBLICATION_STATES.published
	};
}

export function collectPageSubtreeSysIds(pages = [], rootPageSysId = '') {
	if (!Array.isArray(pages)) {
		return [];
	}

	const normalizedRootPageSysId = cleanText(rootPageSysId);
	if (!normalizedRootPageSysId) {
		return [];
	}

	const pagesByParent = new Map();

	for (const page of pages) {
		if (!page || typeof page !== 'object') {
			continue;
		}

		const parentSysId = resolvePageParentSysId(page);
		if (!pagesByParent.has(parentSysId)) {
			pagesByParent.set(parentSysId, []);
		}

		pagesByParent.get(parentSysId).push(page);
	}

	const subtreeIds = new Set();
	const queue = [normalizedRootPageSysId];

	while (queue.length) {
		const currentSysId = queue.shift();
		if (!currentSysId || subtreeIds.has(currentSysId)) {
			continue;
		}

		subtreeIds.add(currentSysId);

		const childPages = pagesByParent.get(currentSysId) || [];
		for (const childPage of childPages) {
			const childSysId = resolvePageSysId(childPage);
			if (childSysId && !subtreeIds.has(childSysId)) {
				queue.push(childSysId);
			}
		}
	}

	return [...subtreeIds];
}

export function removePageSubtree(pages = [], rootPageSysId = '') {
	if (!Array.isArray(pages)) {
		return [];
	}

	const subtreeIds = new Set(collectPageSubtreeSysIds(pages, rootPageSysId));
	if (!subtreeIds.size) {
		return pages.slice();
	}

	return pages.filter(page => !subtreeIds.has(resolvePageSysId(page)));
}

export const PAGE_PERSISTENCE_MODEL = Object.freeze({
	tableName: DEFAULT_PAGE_TABLE,
	uniqueKeyField: 'draftSlugNormalized',
	slugField: 'draftSlugNormalized',
	siblingOrderScopeFields: Object.freeze(['workspaceSysId', 'parentPageSysId']),
	uniqueScopeFields: Object.freeze(['workspaceSysId']),
	fields: Object.freeze([
		{name: 'sysId', type: 'string', required: false},
		{name: 'workspaceSysId', type: 'reference', referenceTable: 'x_82900_odoc2_workspace', required: true},
		{name: 'parentPageSysId', type: 'reference', referenceTable: DEFAULT_PAGE_TABLE, required: false},
		{name: 'siblingOrder', type: 'integer', required: true, defaultValue: 1},
		{name: 'draftTitle', type: 'string', required: true},
		{name: 'draftSlug', type: 'string', required: true},
		{name: 'draftSlugNormalized', type: 'string', required: true, unique: true},
		{name: 'draftContentJson', type: 'object', required: true, defaultValue: DEFAULT_PAGE_CONTENT_JSON},
		{name: 'draftBodyText', type: 'string', required: false},
		{name: 'publishedTitle', type: 'string', required: false},
		{name: 'publishedSlug', type: 'string', required: false},
		{name: 'publishedSlugNormalized', type: 'string', required: false},
		{name: 'publishedContentJson', type: 'object', required: false},
		{name: 'publishedBodyText', type: 'string', required: false},
		{name: 'publicationState', type: 'choice', required: true, defaultValue: PAGE_PUBLICATION_STATES.draft},
		{name: 'active', type: 'boolean', required: true, defaultValue: true},
		{name: 'createdBy', type: 'reference', referenceTable: 'sys_user', required: false},
		{name: 'createdOn', type: 'datetime', required: false},
		{name: 'updatedOn', type: 'datetime', required: false}
	])
});

export {PAGE_PUBLICATION_STATES};

export function slugifyPageTitle(title) {
	const slug = toSlugFragment(title);
	return slug || 'page';
}

export function allocatePageSlug(title, retainedPages = [], workspaceSysId = '', explicitSlug = '') {
	const baseSlug = normalizePageSlug(explicitSlug || title, 'page');
	const reservedSlugs = new Set(collectReservedPageSlugs(retainedPages, workspaceSysId));

	if (!reservedSlugs.has(baseSlug)) {
		return baseSlug;
	}

	let suffix = 1;
	while (reservedSlugs.has(`${baseSlug}-${suffix}`)) {
		suffix += 1;
	}

	return `${baseSlug}-${suffix}`;
}

export function allocatePageSiblingOrder(retainedPages = [], workspaceSysId = '', parentPageSysId = '') {
	if (!Array.isArray(retainedPages)) {
		return 1;
	}

	const normalizedWorkspaceSysId = cleanText(workspaceSysId);
	const normalizedParentPageSysId = cleanText(parentPageSysId);
	let highestOrder = 0;

	for (const page of retainedPages) {
		if (!page || typeof page !== 'object') {
			continue;
		}

		if (normalizedWorkspaceSysId && resolvePageWorkspaceSysId(page) !== normalizedWorkspaceSysId) {
			continue;
		}

		if (cleanText(resolvePageParentSysId(page)) !== normalizedParentPageSysId) {
			continue;
		}

		const order = resolvePageSiblingOrder(page);
		if (order !== null && order > highestOrder) {
			highestOrder = order;
		}
	}

	return highestOrder + 1;
}

export function createPageDraft(input, retainedPages = []) {
	if (!input || typeof input !== 'object') {
		throw new TypeError('Page input must be an object.');
	}

	const title = cleanText(input.title || input.draftTitle);
	if (!title) {
		throw new TypeError('Page title is required.');
	}

	const workspaceSysId = resolveWorkspaceSysId(input.workspace || input.workspaceSysId);
	if (!workspaceSysId) {
		throw new TypeError('A workspace reference is required.');
	}

	const parentPage = resolvePageContext(input);
	if (parentPage.sysId && !parentPage.workspaceSysId) {
		throw new TypeError('A parent page workspace reference is required when a parent page is provided.');
	}

	if (parentPage.sysId && parentPage.workspaceSysId !== workspaceSysId) {
		throw new TypeError('A parent page must belong to the same workspace.');
	}

	if (parentPage.sysId) {
		const parentDepth = resolvePageDepth(retainedPages, parentPage.sysId);
		if (!parentDepth) {
			throw new TypeError('A valid parent page is required.');
		}

		if (parentDepth >= PAGE_TREE_MAX_DEPTH) {
			throw new TypeError(`A page cannot be nested deeper than ${PAGE_TREE_MAX_DEPTH} levels.`);
		}
	}

	const draftSlug = allocatePageSlug(
		title,
		retainedPages,
		workspaceSysId,
		input.slug || input.draftSlug || ''
	);

	const siblingOrder = input.siblingOrder !== undefined && input.siblingOrder !== null
		? normalizeSiblingOrder(input.siblingOrder)
		: allocatePageSiblingOrder(retainedPages, workspaceSysId, parentPage.sysId);

	const draftContentJson = normalizePageContentJson(input.draftContentJson || input.contentJson || input.bodyJson);
	const draftBodyText = cleanText(input.draftBodyText || input.bodyText) || null;
	const publicationState = normalizePagePublicationState(input.publicationState);

	return {
		tableName: PAGE_PERSISTENCE_MODEL.tableName,
		sysId: cleanText(input.sysId || input.pageSysId) || null,
		workspaceSysId,
		parentPageSysId: parentPage.sysId || null,
		siblingOrder,
		draftTitle: title,
		draftSlug,
		draftSlugNormalized: draftSlug.toLowerCase(),
		draftContentJson,
		draftBodyText,
		publishedTitle: cleanText(input.publishedTitle) || null,
		publishedSlug: cleanText(input.publishedSlug) || null,
		publishedSlugNormalized: cleanText(input.publishedSlug).toLowerCase() || null,
		publishedContentJson: input.publishedContentJson ? normalizePageContentJson(input.publishedContentJson) : null,
		publishedBodyText: cleanText(input.publishedBodyText) || null,
		publicationState,
		active: input.active !== undefined ? Boolean(input.active) : true,
		createdBy: cleanText(input.createdBy) || null,
		createdOn: input.createdOn || null,
		updatedOn: input.updatedOn || null
	};
}
