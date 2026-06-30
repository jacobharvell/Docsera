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

function resolvePageSlug(page, preferDraft = false) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	if (preferDraft) {
		return cleanText(
			page.draftSlug ||
			page.publishedSlug ||
			page.slug ||
			page.pageSlug
		);
	}

	return cleanText(
		page.publishedSlug ||
		page.draftSlug ||
		page.slug ||
		page.pageSlug
	);
}

function resolvePageTitle(page, preferDraft = false) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	if (preferDraft) {
		return cleanText(page.draftTitle || page.publishedTitle || page.title);
	}

	return cleanText(page.publishedTitle || page.draftTitle || page.title);
}

function resolvePageBodyText(page, preferDraft = false) {
	if (!page || typeof page !== 'object') {
		return '';
	}

	if (preferDraft) {
		return cleanText(page.draftBodyText || page.publishedBodyText || page.bodyText);
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

function isAuthoringVisiblePage(page) {
	return Boolean(page && typeof page === 'object' && page.active !== false);
}

function sortShellPages(left, right, preferDraftFields = false) {
	const leftOrder = resolvePageSiblingOrder(left);
	const rightOrder = resolvePageSiblingOrder(right);

	if (leftOrder !== rightOrder) {
		return leftOrder - rightOrder;
	}

	const titleComparison = resolvePageTitle(left, preferDraftFields).localeCompare(resolvePageTitle(right, preferDraftFields), undefined, {sensitivity: 'base'});
	if (titleComparison !== 0) {
		return titleComparison;
	}

	return normalizeSlug(resolvePageSlug(left, preferDraftFields)).localeCompare(normalizeSlug(resolvePageSlug(right, preferDraftFields)), undefined, {sensitivity: 'base'});
}

function buildPageNode(page, visiblePagesByParent, selectedPageSysId, preferDraftFields = false) {
	const children = buildPageTree(
		visiblePagesByParent,
		page.sysId,
		selectedPageSysId,
		preferDraftFields
	);

	return {
		sysId: page.sysId,
		pageSlug: resolvePageSlug(page, preferDraftFields),
		title: resolvePageTitle(page, preferDraftFields),
		summary: resolvePageSummary(page),
		bodyText: resolvePageBodyText(page, preferDraftFields),
		parentPageSysId: resolvePageParentSysId(page),
		siblingOrder: resolvePageSiblingOrder(page),
		publicationState: page.publicationState,
		isDraft: page.publicationState === PAGE_PUBLICATION_STATES.draft,
		isSelected: page.sysId === selectedPageSysId,
		hasChildren: children.length > 0,
		children
	};
}

function buildPageTree(visiblePages, parentPageSysId = '', selectedPageSysId = '', preferDraftFields = false) {
	const siblings = visiblePages
		.filter(page => resolvePageParentSysId(page) === cleanText(parentPageSysId))
		.sort((left, right) => sortShellPages(left, right, preferDraftFields));

	return siblings.map(page => buildPageNode(page, visiblePages, selectedPageSysId, preferDraftFields));
}

function buildBreadcrumbs(selectedPage, pageBySysId, workspace, preferDraftFields = false) {
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
			label: resolvePageTitle(ancestor, preferDraftFields),
			pageSlug: resolvePageSlug(ancestor, preferDraftFields)
		});
	}

	breadcrumbs.push({
		label: resolvePageTitle(selectedPage, preferDraftFields),
		pageSlug: resolvePageSlug(selectedPage, preferDraftFields)
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

function buildWorkspaceReaderPageLookup(visiblePages, preferDraftFields = false) {
	const pageBySysId = new Map();
	const pageBySlug = new Map();

	for (const page of visiblePages) {
		if (!page || typeof page !== 'object') {
			continue;
		}

		const sysId = cleanText(page.sysId || page.pageSysId || page.id);
		const preferredSlug = normalizeSlug(resolvePageSlug(page, preferDraftFields));
		const fallbackSlug = preferDraftFields ? normalizeSlug(resolvePageSlug(page, false)) : '';

		if (sysId) {
			pageBySysId.set(sysId, page);
		}

		if (preferredSlug) {
			pageBySlug.set(preferredSlug, page);
		}

		if (fallbackSlug) {
			pageBySlug.set(fallbackSlug, page);
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
		.sort((left, right) => sortShellPages(left, right, false));
}

function buildWorkspaceAuthoringPages(pages = [], workspaceSysId = '') {
	return (Array.isArray(pages) ? pages : [])
		.filter(page => resolvePageWorkspaceSysId(page) === cleanText(workspaceSysId) && isAuthoringVisiblePage(page))
		.slice()
		.sort((left, right) => sortShellPages(left, right, true));
}

function buildWorkspaceRootPages(visiblePages = [], preferDraftFields = false) {
	return (Array.isArray(visiblePages) ? visiblePages : [])
		.filter(page => resolvePageParentSysId(page) === '')
		.sort((left, right) => sortShellPages(left, right, preferDraftFields));
}

export function flattenPageTree(pageTree = []) {
	const flattened = [];

	const visit = nodes => {
		for (const node of Array.isArray(nodes) ? nodes : []) {
			if (!node || typeof node !== 'object') {
				continue;
			}

			flattened.push(node);
			if (Array.isArray(node.children) && node.children.length) {
				visit(node.children);
			}
		}
	};

	visit(pageTree);
	return flattened;
}

export function pickNextVisiblePageAfterDelete(pageTree = [], deletedPageSysId = '') {
	const flattened = flattenPageTree(pageTree);
	if (!flattened.length) {
		return '';
	}

	const deletedRootIndex = flattened.findIndex(node => node && node.sysId === deletedPageSysId);
	if (deletedRootIndex < 0) {
		return flattened[0].pageSlug || '';
	}

	const deletedIds = new Set();
	const queue = [flattened[deletedRootIndex]];
	while (queue.length) {
		const node = queue.shift();
		if (!node || deletedIds.has(node.sysId)) {
			continue;
		}

		deletedIds.add(node.sysId);
		if (Array.isArray(node.children) && node.children.length) {
			queue.push(...node.children);
		}
	}

	for (let index = deletedRootIndex + 1; index < flattened.length; index += 1) {
		const candidate = flattened[index];
		if (candidate && !deletedIds.has(candidate.sysId)) {
			return candidate.pageSlug || '';
		}
	}

	const firstRemaining = flattened.find(node => node && !deletedIds.has(node.sysId));
	return firstRemaining ? firstRemaining.pageSlug || '' : '';
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
			sysId: 'page-product-draft-branch',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: 'page-product-draft-playground',
			siblingOrder: 1,
			draftTitle: 'Draft Branch',
			draftSlug: 'draft-branch',
			draftBodyText: 'Draft-only branch used to exercise deep nesting and drag/drop moves.',
			publicationState: PAGE_PUBLICATION_STATES.draft,
			active: true,
			sections: []
		},
		{
			sysId: 'page-product-draft-branch-child',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: 'page-product-draft-branch',
			siblingOrder: 1,
			draftTitle: 'Draft Branch Child',
			draftSlug: 'draft-branch-child',
			draftBodyText: 'Second level in the deep draft-only chain.',
			publicationState: PAGE_PUBLICATION_STATES.draft,
			active: true,
			sections: []
		},
		{
			sysId: 'page-product-draft-branch-grandchild',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: 'page-product-draft-branch-child',
			siblingOrder: 1,
			draftTitle: 'Draft Branch Grandchild',
			draftSlug: 'draft-branch-grandchild',
			draftBodyText: 'Third nested page in the deep draft-only chain.',
			publicationState: PAGE_PUBLICATION_STATES.draft,
			active: true,
			sections: []
		},
		{
			sysId: 'page-product-draft-branch-leaf',
			workspaceSysId: 'workspace-product-001',
			parentPageSysId: 'page-product-draft-branch-grandchild',
			siblingOrder: 1,
			draftTitle: 'Draft Branch Leaf',
			draftSlug: 'draft-branch-leaf',
			draftBodyText: 'Fifth level page in the deep nesting chain.',
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
			allPages: [],
			firstVisiblePageSlug: '',
			routeTargetPath: '/docsera',
			canManageWorkspaceSettings: false,
			canShowAuthoringControls: false,
			canCreatePages: false,
			pageMode: 'reader'
		};
	}

	const canShowAuthoringControls = Boolean(
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
	);
	const allPages = buildWorkspaceAuthoringPages(pages, workspace.sysId);
	const visiblePages = canShowAuthoringControls
		? allPages
		: buildWorkspaceReaderPages(pages, workspace.sysId);
	const {pageBySysId, pageBySlug} = buildWorkspaceReaderPageLookup(visiblePages, canShowAuthoringControls);
	const requestedPageSlug = normalizeSlug(selectedPageSlug);
	const rootPages = buildWorkspaceRootPages(visiblePages, canShowAuthoringControls);
	const firstVisiblePage = rootPages[0] || visiblePages[0] || null;
	const selectedPage = requestedPageSlug ? pageBySlug.get(requestedPageSlug) || null : firstVisiblePage;
	const selectedPageView = selectedPage ? {
		...selectedPage,
		title: resolvePageTitle(selectedPage, canShowAuthoringControls),
		pageSlug: resolvePageSlug(selectedPage, canShowAuthoringControls),
		bodyText: resolvePageBodyText(selectedPage, canShowAuthoringControls)
	} : null;
	const status = visiblePages.length === 0
		? 'empty-workspace'
		: requestedPageSlug && !selectedPage
			? 'page-not-found'
			: 'ready';
	const selectedPageSlugValue = selectedPage ? resolvePageSlug(selectedPage, canShowAuthoringControls) : requestedPageSlug;

	return {
		status,
		workspace,
		workspaceSlug: resolveWorkspaceSlug(workspace),
		selectedPage: selectedPageView,
		selectedPageSlug: selectedPageSlugValue,
		pageTree: buildPageTree(visiblePages, '', selectedPage ? selectedPage.sysId : '', canShowAuthoringControls),
		breadcrumbs: selectedPage ? buildBreadcrumbs(selectedPage, pageBySysId, workspace, canShowAuthoringControls) : [],
		tableOfContents: selectedPage ? buildTableOfContents(selectedPage) : [],
		visiblePages,
		allPages,
		firstVisiblePageSlug: firstVisiblePage ? resolvePageSlug(firstVisiblePage, canShowAuthoringControls) : '',
		routeTargetPath: buildWorkspacePageRoutePath(resolveWorkspaceSlug(workspace), selectedPage ? resolvePageSlug(selectedPage, canShowAuthoringControls) : selectedPageSlugValue),
		canManageWorkspaceSettings: Boolean(capabilityService && typeof capabilityService.isWorkspaceAdmin === 'function' && capabilityService.isWorkspaceAdmin(workspace)),
		canShowAuthoringControls,
		canCreatePages: canShowAuthoringControls && workspace.active !== false,
		pageMode: canShowAuthoringControls ? 'authoring' : 'reader'
	};
}
