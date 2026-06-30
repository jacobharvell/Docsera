import {
	PAGE_PUBLICATION_STATES
} from './page-domain.js';

function cleanText(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

function normalizeSlug(value) {
	return cleanText(value).toLowerCase();
}

function resolveWorkspaceSlug(workspace) {
	if (!workspace || typeof workspace !== 'object') {
		return '';
	}

	return cleanText(workspace.workspaceSlug || workspace.slug || workspace.key);
}

function resolvePageSlug(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return cleanText(
		page.publishedSlug ||
		page.draftSlug ||
		page.slug ||
		page.pageSlug
	);
}

function resolvePageTitle(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return cleanText(page.publishedTitle || page.draftTitle || page.title);
}

function resolvePageBodyText(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return cleanText(page.publishedBodyText || page.draftBodyText || page.bodyText);
}

function resolvePageSummary(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return cleanText(page.summary || page.description || page.publishedBodyText || page.draftBodyText);
}

function resolvePageWorkspaceSysId(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return cleanText(page.workspaceSysId || page.workspace || page.workspaceId);
}

function resolvePageParentSysId(page) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	return cleanText(page.parentPageSysId || page.parentPage || page.parentPageId || page.parentId);
}

function resolvePageSiblingOrder(page) {
	if (!page || typeof page !== 'object') {
		return Number.POSITIVE_INFINITY;
	}

	const order = Number(page.siblingOrder ?? page.sortOrder ?? page.order);
	return Number.isFinite(order) ? order : Number.POSITIVE_INFINITY;
}

function isVisiblePublishedState(page) {
	return page && typeof page === 'object' && (
		page.publicationState === PAGE_PUBLICATION_STATES.published ||
		page.publicationState === PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
	);
}

function isReadablePage(page) {
	return Boolean(page && typeof page === 'object' && page.active !== false && isVisiblePublishedState(page));
}

function sortShellPages(left, right) {
	const leftOrder = resolvePageSiblingOrder(left);
	const rightOrder = resolvePageSiblingOrder(right);

	if (leftOrder !== rightOrder) {
		return leftOrder - rightOrder;
	}

	const titleComparison = resolvePageTitle(left).localeCompare(resolvePageTitle(right), undefined, {sensitivity: 'base'});
	if (titleComparison !== 0) {
		return titleComparison;
	}

	return normalizeSlug(resolvePageSlug(left)).localeCompare(normalizeSlug(resolvePageSlug(right)), undefined, {sensitivity: 'base'});
}

function buildPageNode(page, visiblePagesByParent, selectedPageSysId) {
	const children = buildPageTree(
		visiblePagesByParent,
		page.sysId,
		selectedPageSysId
	);

	return {
		sysId: page.sysId,
		pageSlug: resolvePageSlug(page),
		title: resolvePageTitle(page),
		summary: resolvePageSummary(page),
		bodyText: resolvePageBodyText(page),
		parentPageSysId: resolvePageParentSysId(page),
		siblingOrder: resolvePageSiblingOrder(page),
		isSelected: page.sysId === selectedPageSysId,
		hasChildren: children.length > 0,
		children
	};
}

function buildPageTree(visiblePages, parentPageSysId = '', selectedPageSysId = '') {
	const siblings = visiblePages
		.filter(page => resolvePageParentSysId(page) === cleanText(parentPageSysId))
		.sort(sortShellPages);

	return siblings.map(page => buildPageNode(page, visiblePages, selectedPageSysId));
}

function buildBreadcrumbs(selectedPage, pageBySysId, workspace) {
	if (!selectedPage || typeof selectedPage !== 'object') {
		return [];
	}

	const breadcrumbs = [];

	const ancestors = [];
	const visited = new Set();
	let currentParentSysId = resolvePageParentSysId(selectedPage);

	while (currentParentSysId && !visited.has(currentParentSysId)) {
		visited.add(currentParentSysId);
		const ancestor = pageBySysId.get(currentParentSysId);
		if (!ancestor) {
			break;
		}

		ancestors.push(ancestor);
		currentParentSysId = resolvePageParentSysId(ancestor);
	}

	for (const ancestor of ancestors.reverse()) {
		breadcrumbs.push({
			label: resolvePageTitle(ancestor),
			pageSlug: resolvePageSlug(ancestor)
		});
	}

	breadcrumbs.push({
		label: resolvePageTitle(selectedPage),
		pageSlug: resolvePageSlug(selectedPage)
	});

	return breadcrumbs;
}

function buildTableOfContents(selectedPage) {
	if (!selectedPage || typeof selectedPage !== 'object') {
		return [];
	}

	const sections = Array.isArray(selectedPage.sections) ? selectedPage.sections : [];

	return sections
		.map((section, index) => {
			if (!section || typeof section !== 'object') {
				return null;
			}

			const label = cleanText(section.title || section.label || section.heading);
			if (!label) {
				return null;
			}

			const rawLevel = Number(section.level);
			const level = Number.isFinite(rawLevel) && rawLevel > 0 ? Math.min(Math.max(Math.floor(rawLevel), 1), 6) : 2;
			const slug = cleanText(section.id || section.slug || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));

			return {
				id: slug || `section-${index + 1}`,
				label,
				level
			};
		})
		.filter(Boolean);
}

function buildWorkspacePageRoutePath(workspaceSlug, pageSlug) {
	const normalizedWorkspaceSlug = cleanText(workspaceSlug);
	const normalizedPageSlug = cleanText(pageSlug);

	if (!normalizedWorkspaceSlug) {
		return '/docsera';
	}

	return normalizedPageSlug ? `/docsera/${normalizedWorkspaceSlug}/${normalizedPageSlug}` : `/docsera/${normalizedWorkspaceSlug}`;
}

function buildWorkspaceReaderPageLookup(visiblePages) {
	const pageBySysId = new Map();
	const pageBySlug = new Map();

	for (const page of visiblePages) {
		if (!page || typeof page !== 'object') {
			continue;
		}

		const sysId = cleanText(page.sysId || page.pageSysId || page.id);
		const slug = normalizeSlug(resolvePageSlug(page));

		if (sysId) {
			pageBySysId.set(sysId, page);
		}

		if (slug) {
			pageBySlug.set(slug, page);
		}
	}

	return {
		pageBySysId,
		pageBySlug
	};
}

function buildWorkspaceReaderPages(pages = [], workspaceSysId = '') {
	return (Array.isArray(pages) ? pages : [])
		.filter(page => resolvePageWorkspaceSysId(page) === cleanText(workspaceSysId) && isReadablePage(page))
		.slice()
		.sort(sortShellPages);
}

function buildWorkspaceRootPages(visiblePages = []) {
	return (Array.isArray(visiblePages) ? visiblePages : [])
		.filter(page => resolvePageParentSysId(page) === '')
		.sort(sortShellPages);
}

export function createDocseraShellDemoPages() {
	return [
		{
			sysId: 'page-product-overview',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: null,
			siblingOrder: 1,
			draftTitle: 'Overview',
			draftSlug: 'overview',
			draftBodyText: 'Overview content for the Product Docs workspace.',
			publishedTitle: 'Overview',
			publishedSlug: 'overview',
			publishedBodyText: 'Product Docs is the primary reader surface for launches, decisions, and guidance.',
			publicationState: PAGE_PUBLICATION_STATES.published,
			active: true,
			sections: [
				{
					id: 'workspace-purpose',
					title: 'Workspace purpose',
					level: 2
				},
				{
					id: 'how-to-navigate',
					title: 'How to navigate',
					level: 2
				}
			]
		},
		{
			sysId: 'page-product-guides',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: null,
			siblingOrder: 2,
			draftTitle: 'Guides',
			draftSlug: 'guides',
			draftBodyText: 'Draft guide index for authors.',
			publishedTitle: 'Guides',
			publishedSlug: 'guides',
			publishedBodyText: 'Guides collect implementation and rollout notes for the product team.',
			publicationState: PAGE_PUBLICATION_STATES.published,
			active: true,
			sections: [
				{
					id: 'published-entries',
					title: 'Published entries',
					level: 2
				}
			]
		},
		{
			sysId: 'page-product-guides-installation',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: 'page-product-guides',
			siblingOrder: 1,
			draftTitle: 'Installation',
			draftSlug: 'installation',
			draftBodyText: 'Draft installation notes for authoring users.',
			publishedTitle: 'Installation',
			publishedSlug: 'installation',
			publishedBodyText: 'Install the workspace shell with the standard ServiceNow deployment flow.',
			publicationState: PAGE_PUBLICATION_STATES.published,
			active: true,
			sections: [
				{
					id: 'check-prerequisites',
					title: 'Check prerequisites',
					level: 2
				},
				{
					id: 'deploy-the-shell',
					title: 'Deploy the shell',
					level: 2
				}
			]
		},
		{
			sysId: 'page-product-guides-runtime',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: 'page-product-guides',
			siblingOrder: 2,
			draftTitle: 'Runtime behavior',
			draftSlug: 'runtime-behavior',
			draftBodyText: 'Draft runtime behavior notes that should stay hidden in reader mode.',
			publishedTitle: 'Runtime behavior',
			publishedSlug: 'runtime-behavior',
			publishedBodyText: 'Runtime behavior is governed by the reader shell and the workspace capability boundary.',
			publicationState: PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges,
			active: true,
			sections: [
				{
					id: 'reader-shell-state',
					title: 'Reader shell state',
					level: 2
				},
				{
					id: 'hidden-authoring-boundaries',
					title: 'Hidden authoring boundaries',
					level: 2
				}
			]
		},
		{
			sysId: 'page-product-draft-playground',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: null,
			siblingOrder: 3,
			draftTitle: 'Draft Playground',
			draftSlug: 'draft-playground',
			draftBodyText: 'This page intentionally stays draft-only for not-found validation.',
			publicationState: PAGE_PUBLICATION_STATES.draft,
			active: true,
			sections: []
		},
		{
			sysId: 'page-support-home',
			workspaceSysId: 'workspace-support-001',
			parentPageSysId: null,
			siblingOrder: 1,
			draftTitle: 'Support Home',
			draftSlug: 'support-home',
			draftBodyText: 'Support runbooks index for service desk readers.',
			publishedTitle: 'Support Home',
			publishedSlug: 'support-home',
			publishedBodyText: 'Support runbooks collect reader-friendly operational guidance.',
			publicationState: PAGE_PUBLICATION_STATES.published,
			active: true,
			sections: [
				{
					id: 'common-routes',
					title: 'Common routes',
					level: 2
				}
			]
		},
		{
			sysId: 'page-support-escalation',
			workspaceSysId: 'workspace-support-001',
			parentPageSysId: 'page-support-home',
			siblingOrder: 1,
			draftTitle: 'Escalation',
			draftSlug: 'escalation',
			draftBodyText: 'Draft escalation steps for support editors.',
			publishedTitle: 'Escalation',
			publishedSlug: 'escalation',
			publishedBodyText: 'Use this checklist when a support issue needs escalation.',
			publicationState: PAGE_PUBLICATION_STATES.published,
			active: true,
			sections: [
				{
					id: 'triage',
					title: 'Triage',
					level: 2
				},
				{
					id: 'handoff',
					title: 'Handoff',
					level: 2
				}
			]
		},
		{
			sysId: 'page-support-draft-only',
			workspaceSysId: 'workspace-support-001',
			parentPageSysId: null,
			siblingOrder: 2,
			draftTitle: 'Draft-only note',
			draftSlug: 'draft-only-note',
			draftBodyText: 'Draft-only content is hidden from reader mode.',
			publicationState: PAGE_PUBLICATION_STATES.draft,
			active: true,
			sections: []
		},
		{
			sysId: 'page-reference-draft-home',
			workspaceSysId: 'workspace-reference-001',
			parentPageSysId: null,
			siblingOrder: 1,
			draftTitle: 'Reference Home',
			draftSlug: 'reference-home',
			draftBodyText: 'The reference library is intentionally empty for reader mode.',
			publicationState: PAGE_PUBLICATION_STATES.draft,
			active: true,
			sections: []
		}
	];
}

export function buildWorkspaceShellViewModel({
	workspaces = [],
	pages = [],
	capabilityService,
	selectedWorkspaceSlug = '',
	selectedPageSlug = ''
} = {}) {
	const workspaceSlug = normalizeSlug(selectedWorkspaceSlug);
	const workspace = (Array.isArray(workspaces) ? workspaces : []).find(item => {
		if (!item || typeof item !== 'object') {
			return false;
		}

		return normalizeSlug(item.workspaceSlug) === workspaceSlug && item.active !== false;
	}) || null;

	if (!workspace) {
		return {
			status: 'workspace-not-found',
			workspace: null,
			workspaceSlug,
			selectedPage: null,
			selectedPageSlug: normalizeSlug(selectedPageSlug),
			pageTree: [],
			breadcrumbs: [],
			tableOfContents: [],
			visiblePages: [],
			firstVisiblePageSlug: '',
			routeTargetPath: '/docsera',
			canManageWorkspaceSettings: false,
			canShowAuthoringControls: false
		};
	}

	const visiblePages = buildWorkspaceReaderPages(pages, workspace.sysId);
	const {pageBySysId, pageBySlug} = buildWorkspaceReaderPageLookup(visiblePages);
	const requestedPageSlug = normalizeSlug(selectedPageSlug);
	const rootPages = buildWorkspaceRootPages(visiblePages);
	const firstVisiblePage = rootPages[0] || visiblePages[0] || null;
	const selectedPage = requestedPageSlug ? pageBySlug.get(requestedPageSlug) || null : firstVisiblePage;
	const status = visiblePages.length === 0
		? 'empty-workspace'
		: requestedPageSlug && !selectedPage
			? 'page-not-found'
			: 'ready';
	const selectedPageSlugValue = selectedPage ? resolvePageSlug(selectedPage) : requestedPageSlug;

	return {
		status,
		workspace,
		workspaceSlug: resolveWorkspaceSlug(workspace),
		selectedPage,
		selectedPageSlug: selectedPageSlugValue,
		pageTree: buildPageTree(visiblePages, '', selectedPage ? selectedPage.sysId : ''),
		breadcrumbs: selectedPage ? buildBreadcrumbs(selectedPage, pageBySysId, workspace) : [],
		tableOfContents: selectedPage ? buildTableOfContents(selectedPage) : [],
		visiblePages,
		firstVisiblePageSlug: firstVisiblePage ? resolvePageSlug(firstVisiblePage) : '',
		routeTargetPath: buildWorkspacePageRoutePath(resolveWorkspaceSlug(workspace), selectedPageSlugValue),
		canManageWorkspaceSettings: Boolean(capabilityService && typeof capabilityService.isWorkspaceAdmin === 'function' && capabilityService.isWorkspaceAdmin(workspace)),
		canShowAuthoringControls: Boolean(
			capabilityService &&
			typeof capabilityService.isDocseraAdmin === 'function' &&
			capabilityService.isDocseraAdmin()
		) || Boolean(
			capabilityService &&
			typeof capabilityService.isWorkspaceAdmin === 'function' &&
			capabilityService.isWorkspaceAdmin(workspace)
		) || Boolean(
			capabilityService &&
			typeof capabilityService.isWorkspaceEditor === 'function' &&
			capabilityService.isWorkspaceEditor(workspace)
		)
	};
}
