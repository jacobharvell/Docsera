const DEFAULT_PAGE_TABLE = 'x_82900_odoc2_page';
const DEFAULT_PAGE_CONTENT_JSON = Object.freeze({
	type: 'doc',
	content: []
});

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

function collectReservedPageSlugs(retainedPages = [], workspaceSysId = '') {
	if (!Array.isArray(retainedPages)) {
		return [];
	}

	const workspaceFilter = cleanText(workspaceSysId);
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
