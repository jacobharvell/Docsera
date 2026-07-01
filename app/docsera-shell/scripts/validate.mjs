import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
	deriveWorkspaceGroupKey,
	WORKSPACE_CAPABILITY_ROLE_NAMES,
	WORKSPACE_GROUP_ROLE_NAMES,
	WORKSPACE_PERSISTENCE_MODEL,
	allocateWorkspaceSlug,
	buildMyWorkspacesViewModel,
	buildWorkspaceGroupNames,
	buildWorkspaceRoutePath,
	createMyWorkspacesDemoWorkspaces,
	createWorkspaceModalDefaults,
	createWorkspaceDraft,
	createWorkspaceCapabilityService,
	prepareWorkspaceCreationInput,
	provisionWorkspace,
	resolveWorkspaceCapabilityLabel,
	slugifyWorkspaceName
} from '../src/workspaces/index.js';
import {
	allocatePageSiblingOrder,
	allocatePageSlug,
	applyPageMove,
	buildPageBodySaveRecord,
	buildPagePublishRecord,
	collectPageAncestorSysIds,
	collectPageSubtreeSysIds,
	buildWorkspaceShellViewModel,
	PAGE_PERSISTENCE_MODEL,
	PAGE_PUBLICATION_STATES,
	PAGE_BODY_EDITOR_STATUSES,
	PAGE_TREE_MAX_DEPTH,
	createPageDraft,
	createDocseraShellDemoPages,
	createPageBodyContentJsonFromText,
	flattenPageTree,
	clearPageBodyEditorSession,
	getPageBodyEditorSession,
	getPageBodyEditorStatusLabel,
	isPageDescendantOf,
	hasPendingPageBodyEditorChanges,
	pickNextVisiblePageAfterDelete,
	removePageSubtree,
	resolvePageDepth,
	resolvePageSubtreeDepth,
	resolvePagePublishingState,
	resolvePageBodyContentJson,
	normalizePageBodyContentJson,
	updatePageDraftSettings,
	validatePageMoveTarget,
	validatePageSettingsSlug,
	validatePageSettingsTitle,
	slugifyPageTitle
} from '../src/pages/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readText(relativePath) {
	const absolutePath = resolve(packageRoot, relativePath);
	if (!existsSync(absolutePath)) {
		throw new Error(`Missing required file: ${relativePath}`);
	}
	return readFileSync(absolutePath, 'utf8');
}

function parseJson(relativePath) {
	return JSON.parse(readText(relativePath));
}

const packageJson = parseJson('package.json');
if (packageJson.name !== 'docsera-app-shell') {
	throw new Error(`Unexpected package name: ${packageJson.name}`);
}
if (!packageJson.scripts || packageJson.scripts.verify !== 'node scripts/validate.mjs') {
	throw new Error('Package verify script does not point to the local validation entry point.');
}

const nowUi = parseJson('now-ui.json');
const component = nowUi.components && nowUi.components['x-82900-docsera-shell'];
if (!component) {
	throw new Error('Missing x-82900-docsera-shell component registration.');
}
if (nowUi.scopeName !== 'x_82900_odoc2') {
	throw new Error(`Unexpected scope name: ${nowUi.scopeName}`);
}

const requiredFiles = [
	'README.md',
	'pom.xml',
	'src/index.js',
	'src/docsera-shell/index.js',
	'src/docsera-shell/styles.scss',
	'src/docsera-shell/tokens.scss',
	'src/pages/index.js',
	'src/pages/page-editor.js',
	'src/pages/page-reader.js',
	'src/pages/page-domain.js',
	'src/workspaces/index.js',
	'src/workspaces/workspace-capabilities.js',
	'src/workspaces/workspace-launcher.js',
	'src/workspaces/workspace-domain.js',
	'tile-icon/docsera-shell-icon.svg'
];

for (const file of requiredFiles) {
	readText(file);
}

const entryPoint = readText('src/index.js');
if (!entryPoint.includes("import './docsera-shell';")) {
	throw new Error('Shell entry point does not import the product shell module.');
}
if (!entryPoint.includes("import './workspaces';")) {
	throw new Error('Shell entry point does not import the workspace domain module.');
}
if (!entryPoint.includes("import './pages';")) {
	throw new Error('Shell entry point does not import the page domain module.');
}

const shellSource = readText('src/docsera-shell/index.js');
for (const needle of [
	"createCustomElement('x-82900-docsera-shell'",
	'Workspace reader',
	'Page tree',
	'Table of contents',
	'Page Settings',
	'My Workspaces',
	'New page',
	'Create page',
	'Draft content',
	'Body editor',
	'Autosaves after a short idle delay',
	'Publish draft',
	'Publish changes',
	'No changes to publish',
	'pageEditorStatusLabel',
	'confirmSafePageEditorNavigation',
	'ensurePageBodyEditorHost',
	'ensurePageBodyEditorSession',
	'pagePublishBusy',
	'pageEditorIsFailed',
	'Delete page',
	'docsera-shell__editor-actions',
	'docsera-shell__tree-action--settings',
	'docsera-shell__tree-row-surface--drop-',
	'docsera-shell__tree-drag-handle',
	'docsera-shell__tree-drag-ghost',
	'docsera-shell__page-badge--changes',
	'handlePageTreeDrop',
	'startPageTreeDrag'
]) {
	if (!shellSource.includes(needle)) {
		throw new Error(`Missing "${needle}" in shell source.`);
	}
}

const shellReadme = readText('README.md');
for (const needle of [
	'The closed PoC stays in `../../poc/tiptap-component/`',
	'npm run validate',
	'Workspace foundation',
	'Manual PDI validation',
	'Requirements Source Map.md',
	'Implementation Notes - Workspace Data Model and Group Provisioning.md',
	'Implementation Notes - Workspace Capability Checks.md',
	'Implementation Notes - My Workspaces Launcher.md',
	'Implementation Notes - Page Data Model and Slug Rules.md'
]) {
	if (!shellReadme.includes(needle)) {
		throw new Error(`Missing "${needle}" in shell README.`);
	}
}

const demoWorkspaces = createMyWorkspacesDemoWorkspaces();
const demoUserAccess = {
	roles: [
		WORKSPACE_CAPABILITY_ROLE_NAMES.workspaceAdmin,
		WORKSPACE_CAPABILITY_ROLE_NAMES.workspaceEditor
	],
	groups: [
		'group-product-admin',
		'group-support-editor'
	]
};
const demoCapabilityService = createWorkspaceCapabilityService({
	hasRole: roleName => demoUserAccess.roles.includes(roleName),
	isMemberOfGroup: groupSysId => demoUserAccess.groups.includes(groupSysId)
});

const launcherView = buildMyWorkspacesViewModel(demoWorkspaces, demoCapabilityService, '');
assert.equal(launcherView.accessibleRows.length, 2);
assert.equal(launcherView.filteredRows.length, 2);
assert.equal(launcherView.isEmptyState, false);
assert.equal(launcherView.isNoResultsState, false);
assert.deepEqual(
	launcherView.filteredRows.map(workspace => workspace.name),
	['Product Docs', 'Support Runbooks']
);
assert.ok(!launcherView.filteredRows.some(workspace => workspace.name === 'Ops Archive'));
assert.ok(!launcherView.filteredRows.some(workspace => workspace.name === 'Reference Library'));

const productWorkspace = launcherView.filteredRows.find(workspace => workspace.workspaceSlug === 'product-docs');
const supportWorkspace = launcherView.filteredRows.find(workspace => workspace.workspaceSlug === 'support-runbooks');

assert.equal(resolveWorkspaceCapabilityLabel(productWorkspace, demoCapabilityService), 'Workspace Admin');
assert.equal(resolveWorkspaceCapabilityLabel(supportWorkspace, demoCapabilityService), 'Workspace Editor');
assert.equal(productWorkspace.canManageSettings, true);
assert.equal(supportWorkspace.canManageSettings, false);
assert.equal(buildWorkspaceRoutePath(productWorkspace), '/docsera/product-docs');

const searchView = buildMyWorkspacesViewModel(demoWorkspaces, demoCapabilityService, 'operational');
assert.equal(searchView.filteredRows.length, 1);
assert.equal(searchView.filteredRows[0].name, 'Support Runbooks');
assert.equal(searchView.isNoResultsState, false);

const noResultsView = buildMyWorkspacesViewModel(demoWorkspaces, demoCapabilityService, 'nonexistent term');
assert.equal(noResultsView.filteredRows.length, 0);
assert.equal(noResultsView.isNoResultsState, true);
assert.equal(noResultsView.isEmptyState, false);

const emptyView = buildMyWorkspacesViewModel([
	{
		sysId: 'workspace-read-only',
		name: 'Read Only',
		workspaceSlug: 'read-only',
		shortDescription: 'Visible to nobody in My Workspaces',
		active: true,
		adminGroupSysId: '',
		editorGroupSysId: ''
	}
], demoCapabilityService, '');
assert.equal(emptyView.isEmptyState, true);
assert.equal(emptyView.filteredRows.length, 0);

const docseraAdminCapabilityService = createWorkspaceCapabilityService({
	hasRole: roleName => roleName === WORKSPACE_CAPABILITY_ROLE_NAMES.docseraAdmin,
	isMemberOfGroup: () => false
});
assert.equal(resolveWorkspaceCapabilityLabel(productWorkspace, docseraAdminCapabilityService), 'Docsera Admin');
assert.equal(buildMyWorkspacesViewModel(demoWorkspaces, docseraAdminCapabilityService, '').filteredRows.length, 3);

const modalDefaults = createWorkspaceModalDefaults();
assert.deepEqual(modalDefaults.icon, {
	key: 'docsera-workspace',
	label: 'Docsera workspace icon',
	type: 'builtin'
});

assert.deepEqual(prepareWorkspaceCreationInput({
	name: '  Launch Docs  ',
	shortDescription: '  Product launch collateral  ',
	icon: {
		key: 'custom-workspace',
		label: 'Custom workspace',
		type: 'builtin'
	}
}, '  user-123  '), {
	name: 'Launch Docs',
	shortDescription: 'Product launch collateral',
	icon: {
		key: 'custom-workspace',
		label: 'Custom workspace',
		type: 'builtin'
	},
	createdBy: 'user-123'
});

assert.throws(() => prepareWorkspaceCreationInput({name: '   '}), /required/i);

assert.equal(slugifyWorkspaceName('HR Docs'), 'hr-docs');
assert.equal(slugifyWorkspaceName('  Platform / Docs  '), 'platform-docs');
assert.equal(slugifyWorkspaceName('!!!'), 'workspace');
assert.equal(allocateWorkspaceSlug('HR Docs', ['hr-docs']), 'hr-docs-2');
assert.equal(allocateWorkspaceSlug('HR Docs', ['hr-docs', 'hr-docs-2']), 'hr-docs-3');
assert.equal(deriveWorkspaceGroupKey('HR Docs', 'hr-docs'), 'HR_Docs');
assert.equal(deriveWorkspaceGroupKey('HR Docs', 'hr-docs-2'), 'HR_Docs_2');

assert.deepEqual(buildWorkspaceGroupNames('HR_Docs'), {
	admin: 'Docsera_HR_Docs_Admins',
	editor: 'Docsera_HR_Docs_Editors'
});
assert.ok(!buildWorkspaceGroupNames('HR_Docs').admin.includes('-'));
assert.ok(!buildWorkspaceGroupNames('HR_Docs').editor.includes('-'));

assert.equal(WORKSPACE_PERSISTENCE_MODEL.tableName, 'x_82900_odoc2_workspace');
assert.equal(WORKSPACE_CAPABILITY_ROLE_NAMES.docseraAdmin, 'x_82900_odoc2.docsera_admin');
assert.equal(WORKSPACE_GROUP_ROLE_NAMES.admin, 'x_82900_odoc2.workspace_admin');
assert.equal(WORKSPACE_GROUP_ROLE_NAMES.editor, 'x_82900_odoc2.workspace_editor');
assert.equal(slugifyPageTitle('Page Title'), 'page-title');
assert.equal(PAGE_PERSISTENCE_MODEL.tableName, 'x_82900_odoc2_page');
assert.equal(PAGE_PUBLICATION_STATES.draft, 'draft');
assert.equal(PAGE_PUBLICATION_STATES.published, 'published');
assert.equal(PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges, 'published_with_unpublished_changes');
assert.equal(PAGE_TREE_MAX_DEPTH, 5);

const draft = createWorkspaceDraft({
	name: 'HR Docs',
	shortDescription: 'People operations',
	createdBy: 'user-123'
}, ['hr-docs']);

assert.equal(draft.workspaceSlug, 'hr-docs-2');
assert.equal(draft.workspaceGroupKey, 'HR_Docs_2');
assert.equal(draft.adminGroupName, 'Docsera_HR_Docs_2_Admins');
assert.equal(draft.editorGroupName, 'Docsera_HR_Docs_2_Editors');
assert.equal(draft.active, true);
assert.equal(draft.createdBy, 'user-123');
assert.deepEqual(draft.icon, {
	key: 'docsera-workspace',
	label: 'Docsera workspace icon',
	type: 'builtin'
});

const suppliedIconDraft = createWorkspaceDraft({
	name: 'HR Docs',
	icon: {
		key: 'custom-workspace',
		label: ' Custom Workspace ',
		theme: 'cool'
	}
});

assert.deepEqual(suppliedIconDraft.icon, {
	key: 'custom-workspace',
	label: 'Custom Workspace',
	type: 'builtin',
	theme: 'cool'
});
assert.ok(!suppliedIconDraft.adminGroupName.includes('-'));
assert.ok(!suppliedIconDraft.editorGroupName.includes('-'));
assert.equal(suppliedIconDraft.workspaceGroupKey, 'HR_Docs');
assert.equal(suppliedIconDraft.adminGroupName, 'Docsera_HR_Docs_Admins');
assert.equal(suppliedIconDraft.editorGroupName, 'Docsera_HR_Docs_Editors');

const rootPage = createPageDraft({
	workspaceSysId: 'workspace-001',
	title: 'Benefits'
});

assert.equal(rootPage.workspaceSysId, 'workspace-001');
assert.equal(rootPage.parentPageSysId, null);
assert.equal(rootPage.siblingOrder, 1);
assert.equal(rootPage.draftTitle, 'Benefits');
assert.equal(rootPage.draftSlug, 'benefits');
assert.equal(rootPage.draftSlugNormalized, 'benefits');
assert.equal(rootPage.publicationState, PAGE_PUBLICATION_STATES.draft);
assert.equal(rootPage.publishedTitle, null);
assert.equal(rootPage.publishedSlug, null);
assert.equal(rootPage.publishedContentJson, null);

const sameWorkspaceParent = {
	sysId: 'page-parent-001',
	workspaceSysId: 'workspace-001',
	siblingOrder: 1
};

const sameWorkspaceSibling = {
	sysId: 'page-sibling-001',
	workspaceSysId: 'workspace-001',
	parentPageSysId: 'page-parent-001',
	siblingOrder: 2
};

const otherWorkspaceParent = {
	sysId: 'page-parent-002',
	workspaceSysId: 'workspace-002'
};

const childPage = createPageDraft(
	{
		workspaceSysId: 'workspace-001',
		title: 'Team Benefits',
		parentPage: sameWorkspaceParent
	},
	[
		sameWorkspaceParent,
		sameWorkspaceSibling,
		{
			sysId: 'root-other-001',
			workspaceSysId: 'workspace-001',
			siblingOrder: 9
		}
	]
);

assert.equal(childPage.parentPageSysId, 'page-parent-001');
assert.equal(childPage.siblingOrder, 3);
assert.equal(childPage.draftSlug, 'team-benefits');

assert.throws(() => createPageDraft({
	workspaceSysId: 'workspace-001',
	title: 'Invalid Parent',
	parentPage: otherWorkspaceParent
}), /same workspace/i);

assert.equal(allocatePageSiblingOrder([
	{
		workspaceSysId: 'workspace-001',
		parentPageSysId: 'page-parent-001',
		siblingOrder: 1
	},
	{
		workspaceSysId: 'workspace-001',
		parentPageSysId: 'page-parent-001',
		siblingOrder: 3
	},
	{
		workspaceSysId: 'workspace-001',
		parentPageSysId: 'other-parent',
		siblingOrder: 99
	},
	{
		workspaceSysId: 'workspace-002',
		parentPageSysId: 'page-parent-001',
		siblingOrder: 50
	}
], 'workspace-001', 'page-parent-001'), 4);

assert.equal(allocatePageSiblingOrder([
	{
		workspaceSysId: 'workspace-001',
		siblingOrder: 1
	},
	{
		workspaceSysId: 'workspace-001',
		siblingOrder: 2
	},
	{
		workspaceSysId: 'workspace-001',
		parentPageSysId: 'page-parent-001',
		siblingOrder: 10
	}
], 'workspace-001', ''), 3);

assert.equal(allocatePageSlug('Benefits', [], 'workspace-001'), 'benefits');
assert.equal(allocatePageSlug('Benefits', [
	{
		workspaceSysId: 'workspace-001',
		draftSlug: 'benefits'
	}
], 'workspace-001'), 'benefits-1');
assert.equal(allocatePageSlug('Benefits', [
	{
		workspaceSysId: 'workspace-001',
		draftSlug: 'BENEFITS'
	},
	{
		workspaceSysId: 'workspace-001',
		publishedSlug: 'benefits-1',
		publicationState: 'published'
	}
], 'workspace-001'), 'benefits-2');
assert.equal(allocatePageSlug('Benefits', [
	{
		workspaceSysId: 'workspace-002',
		draftSlug: 'benefits'
	}
], 'workspace-001'), 'benefits');
assert.equal(allocatePageSlug('Benefits', [
	{
		workspaceSysId: 'workspace-001',
		draftSlug: 'benefits'
	},
	{
		workspaceSysId: 'workspace-001',
		publishedSlug: 'benefits-1',
		publicationState: 'published'
	},
	{
		workspaceSysId: 'workspace-001',
		draftSlug: 'benefits-2',
		publishedSlug: 'BENEFITS-2',
		publicationState: 'published_with_unpublished_changes'
	}
], 'workspace-001'), 'benefits-3');

assert.equal(slugifyPageTitle('Team Overview'), 'team-overview');
assert.equal(slugifyPageTitle('!!!'), 'page');

const duplicateTitleDraft = createPageDraft({
	workspaceSysId: 'workspace-001',
	title: 'Benefits'
}, [
	rootPage
]);

assert.equal(duplicateTitleDraft.draftSlug, 'benefits-1');
assert.equal(duplicateTitleDraft.draftTitle, 'Benefits');
assert.equal(duplicateTitleDraft.publishedTitle, null);
assert.equal(duplicateTitleDraft.publishedSlug, null);
assert.equal(duplicateTitleDraft.draftContentJson.type, 'doc');
assert.deepEqual(duplicateTitleDraft.draftContentJson.content, []);

const pageSettingsValidationPages = [
	{
		sysId: 'page-settings-home',
		workspaceSysId: 'workspace-001',
		draftTitle: 'Home',
		draftSlug: 'home',
		publishedTitle: 'Home',
		publishedSlug: 'home',
		publicationState: PAGE_PUBLICATION_STATES.published,
		active: true
	},
	{
		sysId: 'page-settings-guides',
		workspaceSysId: 'workspace-001',
		draftTitle: 'Guides',
		draftSlug: 'guides',
		publishedTitle: 'Guides',
		publishedSlug: 'guides',
		publicationState: PAGE_PUBLICATION_STATES.published,
		active: true
	},
	{
		sysId: 'page-settings-home-copy',
		workspaceSysId: 'workspace-002',
		draftTitle: 'Home Copy',
		draftSlug: 'home',
		publishedTitle: 'Home Copy',
		publishedSlug: 'home',
		publicationState: PAGE_PUBLICATION_STATES.published,
		active: true
	}
];

assert.deepEqual(validatePageSettingsTitle('  Product Overview  '), {
	valid: true,
	value: 'Product Overview',
	error: ''
});
assert.equal(validatePageSettingsTitle('   ').valid, false);
assert.equal(validatePageSettingsTitle('   ').error, 'Page title is required.');

assert.deepEqual(validatePageSettingsSlug('Overview', pageSettingsValidationPages, 'workspace-001', 'page-settings-home'), {
	valid: true,
	value: 'overview',
	error: ''
});
assert.equal(validatePageSettingsSlug('   ', pageSettingsValidationPages, 'workspace-001', 'page-settings-home').error, 'Slug is required.');
assert.equal(validatePageSettingsSlug('overview/intro', pageSettingsValidationPages, 'workspace-001', 'page-settings-home').error, 'Invalid slug. Slug must only include letters, numbers, dashes, periods, or underscores.');
assert.equal(validatePageSettingsSlug('GUIDES', pageSettingsValidationPages, 'workspace-001', 'page-settings-home').error, 'Slug must be unique within this workspace.');
assert.deepEqual(validatePageSettingsSlug('home', pageSettingsValidationPages, 'workspace-002', 'page-settings-home-copy'), {
	valid: true,
	value: 'home',
	error: ''
});
assert.deepEqual(validatePageSettingsSlug('home', pageSettingsValidationPages, 'workspace-001', 'page-settings-home'), {
	valid: true,
	value: 'home',
	error: ''
});

const updatedPageSettingsPage = updatePageDraftSettings(pageSettingsValidationPages[1], {
	title: '  Guides Updated  ',
	slug: 'Guides-Updated'
});

assert.equal(updatedPageSettingsPage.draftTitle, 'Guides Updated');
assert.equal(updatedPageSettingsPage.draftSlug, 'guides-updated');
assert.equal(updatedPageSettingsPage.draftSlugNormalized, 'guides-updated');
assert.equal(updatedPageSettingsPage.publicationState, PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges);

const publishedPageWithChanges = {
	sysId: 'page-publishing-baseline',
	workspaceSysId: 'workspace-001',
	parentPageSysId: 'page-settings-home',
	siblingOrder: 3,
	draftTitle: 'Guides Updated',
	draftSlug: 'guides-updated',
	draftSlugNormalized: 'guides-updated',
	draftContentJson: createPageBodyContentJsonFromText('Updated draft body'),
	draftBodyText: 'Updated draft body',
	publishedTitle: 'Guides',
	publishedSlug: 'guides',
	publishedSlugNormalized: 'guides',
	publishedContentJson: createPageBodyContentJsonFromText('Published body'),
	publishedBodyText: 'Published body',
	publicationState: PAGE_PUBLICATION_STATES.published
};

const publishableDraftState = resolvePagePublishingState(rootPage);
assert.equal(publishableDraftState.publicationStatusLabel, 'Draft');
assert.equal(publishableDraftState.publishActionLabel, 'Publish draft');
assert.equal(publishableDraftState.canPublish, true);
assert.equal(publishableDraftState.hasUnpublishedChanges, false);

const publishableChangedState = resolvePagePublishingState(publishedPageWithChanges);
assert.equal(publishableChangedState.publicationStatusLabel, 'Unpublished changes');
assert.equal(publishableChangedState.publishActionLabel, 'Publish changes');
assert.equal(publishableChangedState.canPublish, true);
assert.equal(publishableChangedState.hasUnpublishedChanges, true);

const publishBlockedState = resolvePagePublishingState({
	...publishedPageWithChanges,
	draftTitle: 'Guides',
	draftSlug: 'guides',
	draftContentJson: createPageBodyContentJsonFromText('Published body'),
	draftBodyText: 'Published body'
});
assert.equal(publishBlockedState.publicationStatusLabel, 'Published');
assert.equal(publishBlockedState.publishActionLabel, 'No changes to publish');
assert.equal(publishBlockedState.canPublish, false);
assert.equal(publishBlockedState.hasUnpublishedChanges, false);

const updatedPageSettingsCleared = updatePageDraftSettings({
	...publishedPageWithChanges,
	publicationState: PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges,
	draftTitle: 'Guides',
	draftSlug: 'guides',
	draftContentJson: createPageBodyContentJsonFromText('Published body'),
	draftBodyText: 'Published body'
}, {
	title: 'Guides',
	slug: 'guides'
});
assert.equal(updatedPageSettingsCleared.publicationState, PAGE_PUBLICATION_STATES.published);

const publishedPreview = buildPagePublishRecord(publishedPageWithChanges);
assert.equal(publishedPreview.publicationState, PAGE_PUBLICATION_STATES.published);
assert.equal(publishedPreview.draftTitle, 'Guides Updated');
assert.equal(publishedPreview.publishedTitle, 'Guides Updated');
assert.equal(publishedPreview.draftSlug, 'guides-updated');
assert.equal(publishedPreview.publishedSlug, 'guides-updated');
assert.equal(publishedPreview.publishedSlugNormalized, 'guides-updated');
assert.equal(publishedPreview.publishedBodyText, 'Updated draft body');
assert.equal(publishedPreview.parentPageSysId, 'page-settings-home');
assert.equal(publishedPreview.siblingOrder, 3);
assert.equal(publishedPreview.workspaceSysId, 'workspace-001');

const draftPublishPreview = buildPagePublishRecord(rootPage);
assert.equal(draftPublishPreview.publicationState, PAGE_PUBLICATION_STATES.published);
assert.equal(draftPublishPreview.publishedTitle, rootPage.draftTitle);
assert.equal(draftPublishPreview.publishedSlug, rootPage.draftSlug);
assert.equal(draftPublishPreview.publishedSlugNormalized, rootPage.draftSlugNormalized);

const subtreeFixture = [
	{sysId: 'page-root', parentPageSysId: null},
	{sysId: 'page-child-a', parentPageSysId: 'page-root'},
	{sysId: 'page-child-b', parentPageSysId: 'page-root'},
	{sysId: 'page-grandchild', parentPageSysId: 'page-child-a'},
	{sysId: 'page-sibling', parentPageSysId: null}
];

assert.deepEqual(collectPageSubtreeSysIds(subtreeFixture, 'page-root').sort(), [
	'page-child-a',
	'page-child-b',
	'page-grandchild',
	'page-root'
]);
assert.deepEqual(removePageSubtree(subtreeFixture, 'page-root').map(page => page.sysId), ['page-sibling']);

const treeFixture = [
	{
		sysId: 'page-root-a',
		pageSlug: 'root-a',
		title: 'Root A',
		children: [
			{
				sysId: 'page-child-a',
				pageSlug: 'child-a',
				title: 'Child A',
				children: []
			}
		]
	},
	{
		sysId: 'page-root-b',
		pageSlug: 'root-b',
		title: 'Root B',
		children: []
	},
	{
		sysId: 'page-root-c',
		pageSlug: 'root-c',
		title: 'Root C',
		children: []
	}
];

assert.deepEqual(flattenPageTree(treeFixture).map(node => node.sysId), [
	'page-root-a',
	'page-child-a',
	'page-root-b',
	'page-root-c'
]);
assert.equal(pickNextVisiblePageAfterDelete(treeFixture, 'page-root-a'), 'root-b');
assert.equal(pickNextVisiblePageAfterDelete(treeFixture, 'page-root-c'), 'root-a');

const calls = {
	persistWorkspace: [],
	createGroup: [],
	assignGroupRole: [],
	addUserToGroup: [],
	updateWorkspace: []
};

const result = await provisionWorkspace(
	{
		name: 'HR Docs',
		shortDescription: 'People operations',
		createdBy: 'user-123'
	},
	{
		persistWorkspace: async workspace => {
			calls.persistWorkspace.push(workspace);
			return {...workspace, sysId: 'workspace-001'};
		},
		createGroup: async groupInput => {
			calls.createGroup.push(groupInput);
			return {
				name: groupInput.name,
				sys_id: `${groupInput.name}-sys-id`
			};
		},
		assignGroupRole: async roleInput => {
			calls.assignGroupRole.push(roleInput);
		},
		addUserToGroup: async membershipInput => {
			calls.addUserToGroup.push(membershipInput);
		},
		updateWorkspace: async workspace => {
			calls.updateWorkspace.push(workspace);
			return {...workspace, saved: true};
		}
	},
	['hr-docs']
);

assert.equal(calls.persistWorkspace.length, 1);
assert.equal(calls.createGroup.length, 2);
assert.equal(calls.assignGroupRole.length, 2);
assert.equal(calls.addUserToGroup.length, 1);
assert.equal(calls.updateWorkspace.length, 1);
assert.equal(result.workspace.saved, true);
assert.equal(result.workspace.workspaceSlug, 'hr-docs-2');
assert.equal(result.workspace.workspaceGroupKey, 'HR_Docs_2');
assert.deepEqual(result.workspace.icon, {
	key: 'docsera-workspace',
	label: 'Docsera workspace icon',
	type: 'builtin'
});
assert.equal(result.workspace.adminGroupSysId, 'Docsera_HR_Docs_2_Admins-sys-id');
assert.equal(result.workspace.editorGroupSysId, 'Docsera_HR_Docs_2_Editors-sys-id');
assert.deepEqual(calls.addUserToGroup[0], {
	groupSysId: 'Docsera_HR_Docs_2_Admins-sys-id',
	userSysId: 'user-123'
});

assert.equal(calls.createGroup[0].workspaceGroupKey, 'HR_Docs_2');
assert.equal(calls.createGroup[0].workspaceSlug, 'hr-docs-2');

const demoPages = createDocseraShellDemoPages();
assert.ok(demoPages.length >= 5);
assert.equal(resolvePageDepth(demoPages, 'page-product-draft-playground'), 1);
assert.equal(resolvePageDepth(demoPages, 'page-product-draft-branch-leaf'), 5);
assert.equal(resolvePageSubtreeDepth(demoPages, 'page-product-draft-branch'), 4);
assert.deepEqual(collectPageAncestorSysIds(demoPages, 'page-product-draft-branch-leaf'), [
	'page-product-draft-branch-grandchild',
	'page-product-draft-branch-child',
	'page-product-draft-branch',
	'page-product-draft-playground'
]);
assert.equal(isPageDescendantOf(demoPages, 'page-product-draft-branch-leaf', 'page-product-draft-branch'), true);
assert.equal(isPageDescendantOf(demoPages, 'page-product-draft-branch', 'page-product-draft-branch-leaf'), false);
assert.throws(() => createPageDraft({
	workspaceSysId: 'workspace-product-001',
	title: 'Too Deep',
	parentPage: {
		sysId: 'page-product-draft-branch-leaf',
		workspaceSysId: 'workspace-product-001'
	}
}, demoPages), /nested deeper than 5 levels/i);

const shellAuthoringCapabilityService = createWorkspaceCapabilityService({
	hasRole: roleName => demoUserAccess.roles.includes(roleName),
	isMemberOfGroup: groupSysId => demoUserAccess.groups.includes(groupSysId)
});

const shellReaderCapabilityService = createWorkspaceCapabilityService({
	hasRole: () => false,
	isMemberOfGroup: () => false
});

const changedPages = demoPages.map(page => (
	page.sysId === 'page-product-overview'
		? {
			...page,
			draftTitle: 'Overview updated',
			draftSlug: 'overview-updated',
			publicationState: PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
		}
		: page
));

const authoringChangedView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: changedPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'overview-updated'
});

assert.equal(authoringChangedView.selectedPage.title, 'Overview updated');
assert.equal(authoringChangedView.selectedPageSlug, 'overview-updated');
assert.equal(authoringChangedView.routeTargetPath, '/docsera/product-docs/overview-updated');
assert.equal(authoringChangedView.pageTree[0].title, 'Overview updated');

const readerChangedView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: changedPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'overview'
});

assert.equal(readerChangedView.selectedPage.title, 'Overview');
assert.equal(readerChangedView.selectedPageSlug, 'overview');
assert.equal(readerChangedView.routeTargetPath, '/docsera/product-docs/overview');
assert.equal(readerChangedView.pageTree[0].title, 'Overview');
assert.equal(readerChangedView.pageTree[0].bodyText, 'Product Docs is the primary reader surface for launches, decisions, and guidance.');
assert.equal(readerChangedView.breadcrumbs[0].label, 'Overview');
assert.equal(readerChangedView.selectedPage.bodyText, 'Product Docs is the primary reader surface for launches, decisions, and guidance.');
assert.equal(readerChangedView.selectedPage.pageSlug, 'overview');
assert.equal('draftTitle' in readerChangedView.selectedPage, false);
assert.equal('draftSlug' in readerChangedView.selectedPage, false);
assert.equal('draftBodyText' in readerChangedView.selectedPage, false);
assert.equal('draftContentJson' in readerChangedView.selectedPage, false);

const viewerOnlyPublishedPage = {
	sysId: 'page-viewer-only-published-change',
	workspaceSysId: 'workspace-product-001',
	parentPageSysId: null,
	siblingOrder: 4,
	draftTitle: 'Guides Draft',
	draftSlug: 'guides-draft',
	draftContentJson: createPageBodyContentJsonFromText('Draft body that must stay hidden.'),
	draftBodyText: 'Draft body that must stay hidden.',
	publishedTitle: 'Guides',
	publishedSlug: 'guides',
	publishedSlugNormalized: 'guides',
	publishedContentJson: createPageBodyContentJsonFromText('Published body that readers should see.'),
	publishedBodyText: 'Published body that readers should see.',
	publicationState: PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges,
	active: true,
	sections: [
		{
			id: 'published-reader-section',
			title: 'Published reader section',
			level: 2
		}
	]
};

const viewerOnlyPublishedView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: [viewerOnlyPublishedPage],
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'guides-draft'
});

assert.equal(viewerOnlyPublishedView.status, 'page-not-found');
assert.equal(viewerOnlyPublishedView.selectedPageSlug, '');
assert.equal(viewerOnlyPublishedView.routeTargetPath, '/docsera/product-docs');
assert.equal(viewerOnlyPublishedView.pageTree[0].title, 'Guides');
assert.equal(viewerOnlyPublishedView.pageTree[0].pageSlug, 'guides');
assert.equal(viewerOnlyPublishedView.pageTree[0].bodyText, 'Published body that readers should see.');
assert.equal(viewerOnlyPublishedView.pageTree[0].summary, 'Published body that readers should see.');
assert.equal(viewerOnlyPublishedView.pageTree[0].bodyContentJson.content.length > 0, true);
assert.equal(viewerOnlyPublishedView.selectedPage, null);

const viewerOnlyPublishedSlugView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: [viewerOnlyPublishedPage],
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'guides'
});

assert.equal(viewerOnlyPublishedSlugView.status, 'ready');
assert.equal(viewerOnlyPublishedSlugView.selectedPage.title, 'Guides');
assert.equal(viewerOnlyPublishedSlugView.selectedPage.pageSlug, 'guides');
assert.equal(viewerOnlyPublishedSlugView.selectedPage.bodyText, 'Published body that readers should see.');
assert.equal(viewerOnlyPublishedSlugView.routeTargetPath, '/docsera/product-docs/guides');
assert.equal('draftTitle' in viewerOnlyPublishedSlugView.selectedPage, false);
assert.equal('draftSlug' in viewerOnlyPublishedSlugView.selectedPage, false);
assert.equal('draftBodyText' in viewerOnlyPublishedSlugView.selectedPage, false);
assert.equal('draftContentJson' in viewerOnlyPublishedSlugView.selectedPage, false);
assert.equal(viewerOnlyPublishedSlugView.pageTree[0].title, 'Guides');
assert.equal(viewerOnlyPublishedSlugView.pageTree[0].pageSlug, 'guides');
assert.equal(viewerOnlyPublishedSlugView.pageTree[0].bodyText, 'Published body that readers should see.');
assert.equal(viewerOnlyPublishedSlugView.breadcrumbs[0].label, 'Guides');

const shellAuthoringView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs'
});

assert.equal(shellAuthoringView.status, 'ready');
assert.equal(shellAuthoringView.workspace.workspaceSlug, 'product-docs');
assert.equal(shellAuthoringView.selectedPageSlug, 'overview');
assert.equal(shellAuthoringView.routeTargetPath, '/docsera/product-docs/overview');
assert.equal(shellAuthoringView.visiblePages.length, 9);
assert.equal(shellAuthoringView.pageTree.length, 3);
assert.equal(shellAuthoringView.pageTree[0].title, 'Overview');
assert.equal(shellAuthoringView.pageTree[1].title, 'Guides');
assert.equal(shellAuthoringView.pageTree[1].children.length, 2);
assert.equal(shellAuthoringView.pageTree[2].title, 'Draft Playground');
assert.equal(shellAuthoringView.pageTree[2].children.length, 1);
assert.equal(shellAuthoringView.pageTree[2].isDraft, true);
assert.deepEqual(shellAuthoringView.breadcrumbs.map(item => item.label), ['Overview']);
assert.equal(shellAuthoringView.tableOfContents.length, 2);
assert.equal(shellAuthoringView.canShowAuthoringControls, true);
assert.equal(shellAuthoringView.canCreatePages, true);
assert.equal(shellAuthoringView.pageMode, 'authoring');

const authoringSearchByChainView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	pageTreeSearchQuery: 'draft-branch-leaf'
});

assert.equal(authoringSearchByChainView.isPageTreeSearchActive, true);
assert.equal(authoringSearchByChainView.isPageTreeNoResultsState, false);
assert.equal(authoringSearchByChainView.pageTree.length, shellAuthoringView.pageTree.length);
assert.equal(authoringSearchByChainView.filteredPageTree.length, 1);
assert.deepEqual(flattenPageTree(authoringSearchByChainView.filteredPageTree).map(page => page.title), [
	'Draft Playground',
	'Draft Branch',
	'Draft Branch Child',
	'Draft Branch Grandchild',
	'Draft Branch Leaf'
]);

const authoringSearchByBodyView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	pageTreeSearchQuery: 'not-found validation'
});

assert.equal(authoringSearchByBodyView.isPageTreeSearchActive, true);
assert.equal(authoringSearchByBodyView.isPageTreeNoResultsState, false);
assert.equal(authoringSearchByBodyView.filteredPageTree.length, 1);
assert.equal(authoringSearchByBodyView.filteredPageTree[0].title, 'Draft Playground');

const readerSearchByBodyView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	pageTreeSearchQuery: 'guidance'
});

assert.equal(readerSearchByBodyView.isPageTreeSearchActive, true);
assert.equal(readerSearchByBodyView.isPageTreeNoResultsState, false);
assert.equal(readerSearchByBodyView.filteredPageTree.length, 1);
assert.equal(readerSearchByBodyView.filteredPageTree[0].title, 'Overview');

const viewerDraftSearchView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'draft-playground',
	pageTreeSearchQuery: 'draft-branch-leaf'
});

assert.equal(viewerDraftSearchView.status, 'page-not-found');
assert.equal(viewerDraftSearchView.isPageTreeSearchActive, true);
assert.equal(viewerDraftSearchView.isPageTreeNoResultsState, true);
assert.equal(viewerDraftSearchView.filteredPageTree.length, 0);
assert.ok(!viewerDraftSearchView.visiblePages.some(page => page.pageSlug === 'draft-playground'));

const blankSearchView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	pageTreeSearchQuery: '   '
});

assert.equal(blankSearchView.isPageTreeSearchActive, false);
assert.equal(blankSearchView.isPageTreeNoResultsState, false);
assert.equal(blankSearchView.filteredPageTree.length, shellAuthoringView.pageTree.length);
assert.equal(blankSearchView.pageTreeSearchQuery, '');

const emptyWorkspaceSearchView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'reference-library',
	pageTreeSearchQuery: 'anything'
});

assert.equal(emptyWorkspaceSearchView.status, 'empty-workspace');
assert.equal(emptyWorkspaceSearchView.isPageTreeSearchActive, true);
assert.equal(emptyWorkspaceSearchView.isPageTreeNoResultsState, false);
assert.equal(emptyWorkspaceSearchView.filteredPageTree.length, 0);

const validInsideMove = validatePageMoveTarget(demoPages, 'page-product-overview', 'page-product-guides', 'inside', PAGE_TREE_MAX_DEPTH);
assert.equal(validInsideMove.valid, true);
assert.equal(validInsideMove.destinationParentPageSysId, 'page-product-guides');

const validAfterMove = validatePageMoveTarget(demoPages, 'page-product-guides-runtime', 'page-product-draft-playground', 'before', PAGE_TREE_MAX_DEPTH);
assert.equal(validAfterMove.valid, true);
assert.equal(validAfterMove.destinationParentPageSysId, '');

const invalidSelfMove = validatePageMoveTarget(demoPages, 'page-product-guides', 'page-product-guides', 'inside', PAGE_TREE_MAX_DEPTH);
assert.equal(invalidSelfMove.valid, false);
assert.match(invalidSelfMove.error, /itself/i);

const invalidDescendantMove = validatePageMoveTarget(demoPages, 'page-product-guides', 'page-product-guides-installation', 'inside', PAGE_TREE_MAX_DEPTH);
assert.equal(invalidDescendantMove.valid, false);
assert.match(invalidDescendantMove.error, /descendants/i);

const invalidDepthMove = validatePageMoveTarget(demoPages, 'page-product-draft-branch', 'page-product-guides-installation', 'inside', PAGE_TREE_MAX_DEPTH);
assert.equal(invalidDepthMove.valid, false);
assert.match(invalidDepthMove.error, /maximum nesting depth/i);

const invalidCrossWorkspaceMove = validatePageMoveTarget(demoPages, 'page-product-overview', 'page-support-home', 'inside', PAGE_TREE_MAX_DEPTH);
assert.equal(invalidCrossWorkspaceMove.valid, false);
assert.match(invalidCrossWorkspaceMove.error, /same workspace/i);

const movedOverviewPages = applyPageMove(demoPages, 'page-product-overview', 'page-product-guides', 'inside', PAGE_TREE_MAX_DEPTH);
const movedOverviewView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: movedOverviewPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'overview'
});

assert.equal(movedOverviewView.selectedPageSlug, 'overview');
assert.equal(movedOverviewView.routeTargetPath, '/docsera/product-docs/overview');
assert.deepEqual(movedOverviewView.breadcrumbs.map(item => item.label), ['Guides', 'Overview']);
assert.equal(movedOverviewView.pageTree[0].title, 'Guides');
assert.equal(movedOverviewView.pageTree[0].children[2].title, 'Overview');

const movedRuntimePages = applyPageMove(demoPages, 'page-product-guides-runtime', 'page-product-draft-playground', 'before', PAGE_TREE_MAX_DEPTH);
const movedRuntimeView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: movedRuntimePages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'runtime-behavior'
});

assert.equal(movedRuntimeView.selectedPageSlug, 'runtime-behavior');
assert.equal(movedRuntimeView.selectedPage.title, 'Runtime behavior');
assert.equal(movedRuntimeView.routeTargetPath, '/docsera/product-docs/runtime-behavior');
assert.deepEqual(movedRuntimeView.breadcrumbs.map(item => item.label), ['Runtime behavior']);
assert.equal(movedRuntimeView.pageTree[2].pageSlug, 'runtime-behavior');

const movedLeafPages = applyPageMove(demoPages, 'page-product-draft-branch-leaf', 'page-product-guides', 'inside', PAGE_TREE_MAX_DEPTH);
const movedLeafPage = movedLeafPages.find(page => page.sysId === 'page-product-draft-branch-leaf');
assert.equal(movedLeafPage.parentPageSysId, 'page-product-guides');
assert.equal(movedLeafPage.siblingOrder, 3);

const movedLeafView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: movedLeafPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'draft-branch-leaf'
});

assert.equal(movedLeafView.selectedPageSlug, 'draft-branch-leaf');
assert.equal(movedLeafView.routeTargetPath, '/docsera/product-docs/draft-branch-leaf');
assert.deepEqual(movedLeafView.breadcrumbs.map(item => item.label), ['Guides', 'Draft Branch Leaf']);

const movedBranchPages = applyPageMove(demoPages, 'page-product-draft-branch', 'page-product-draft-playground', 'before', PAGE_TREE_MAX_DEPTH);
const movedBranchPage = movedBranchPages.find(page => page.sysId === 'page-product-draft-branch');
const movedBranchLeafPage = movedBranchPages.find(page => page.sysId === 'page-product-draft-branch-leaf');
assert.equal(movedBranchPage.parentPageSysId, null);
assert.equal(movedBranchPage.siblingOrder, 3);
assert.equal(movedBranchLeafPage.parentPageSysId, 'page-product-draft-branch-grandchild');

const movedBranchView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: movedBranchPages,
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'draft-branch-leaf'
});

assert.deepEqual(movedBranchView.breadcrumbs.map(item => item.label), [
	'Draft Branch',
	'Draft Branch Child',
	'Draft Branch Grandchild',
	'Draft Branch Leaf'
]);

const shellReaderView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs'
});

assert.equal(shellReaderView.status, 'ready');
assert.equal(shellReaderView.visiblePages.length, 4);
assert.equal(shellReaderView.pageTree.length, 2);
assert.equal(shellReaderView.canCreatePages, false);
assert.ok(!shellReaderView.pageTree.some(page => page.title === 'Draft Playground'));

const guidePageView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'installation'
});

assert.equal(guidePageView.status, 'ready');
assert.equal(guidePageView.selectedPageSlug, 'installation');
assert.equal(guidePageView.routeTargetPath, '/docsera/product-docs/installation');
assert.deepEqual(guidePageView.breadcrumbs.map(item => item.label), ['Guides', 'Installation']);
assert.equal(guidePageView.tableOfContents.length, 2);

const missingPageView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: 'draft-playground'
});

assert.equal(missingPageView.status, 'page-not-found');
assert.equal(missingPageView.routeTargetPath, '/docsera/product-docs');

const emptyWorkspaceView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'reference-library'
});

assert.equal(emptyWorkspaceView.status, 'empty-workspace');
assert.equal(emptyWorkspaceView.visiblePages.length, 0);
assert.equal(emptyWorkspaceView.pageTree.length, 0);

const unknownWorkspaceView = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: demoPages,
	capabilityService: shellReaderCapabilityService,
	selectedWorkspaceSlug: 'missing-workspace'
});

assert.equal(unknownWorkspaceView.status, 'workspace-not-found');
assert.equal(unknownWorkspaceView.routeTargetPath, '/docsera');

const createdRootDraft = createPageDraft({
	workspaceSysId: 'workspace-product-001',
	title: 'Release Notes'
}, demoPages);
assert.equal(createdRootDraft.siblingOrder, 4);
assert.equal(createdRootDraft.publicationState, PAGE_PUBLICATION_STATES.draft);

const createdRootPage = {
	...createdRootDraft,
	sysId: 'page-product-docs-release-notes'
};

const authoringAfterCreate = buildWorkspaceShellViewModel({
	workspaces: demoWorkspaces,
	pages: [...demoPages, createdRootPage],
	capabilityService: shellAuthoringCapabilityService,
	selectedWorkspaceSlug: 'product-docs',
	selectedPageSlug: createdRootPage.draftSlug
});

assert.equal(authoringAfterCreate.selectedPageSlug, 'release-notes');
assert.equal(authoringAfterCreate.routeTargetPath, '/docsera/product-docs/release-notes');
assert.equal(authoringAfterCreate.pageTree.some(page => page.pageSlug === 'release-notes'), true);

assert.equal(authoringAfterCreate.canEditPageBody, true);
assert.equal(authoringAfterCreate.selectedPage.bodyContentJson.type, 'doc');

assert.equal(getPageBodyEditorStatusLabel(PAGE_BODY_EDITOR_STATUSES.saved), 'Saved');
assert.equal(getPageBodyEditorStatusLabel(PAGE_BODY_EDITOR_STATUSES.dirty), 'Unsaved changes');
assert.equal(getPageBodyEditorStatusLabel(PAGE_BODY_EDITOR_STATUSES.saving), 'Saving');
assert.equal(getPageBodyEditorStatusLabel(PAGE_BODY_EDITOR_STATUSES.failed), 'Save failed');

const bodyContentFromText = createPageBodyContentJsonFromText('First line\nSecond line');
assert.equal(bodyContentFromText.type, 'doc');
assert.equal(bodyContentFromText.content.length, 2);

const malformedImportedBody = normalizePageBodyContentJson({
	type: 'doc',
	content: [
		{
			type: 'text',
			text: 'Loose top-level text'
		},
		{
			type: 'hard_break'
		},
		{
			type: 'image',
			attrs: {
				src: 'https://example.invalid/image.png',
				alt: 'Example image'
			}
		}
	]
});

assert.equal(malformedImportedBody.type, 'doc');
assert.equal(malformedImportedBody.content[0].type, 'paragraph');
assert.equal(malformedImportedBody.content[0].content[0].type, 'text');
assert.equal(malformedImportedBody.content[0].content[0].text, 'Loose top-level text');
assert.equal(malformedImportedBody.content[0].content[1].type, 'hard_break');
assert.equal(malformedImportedBody.content[0].content[2].type, 'image');

const publishedSavePreview = buildPageBodySaveRecord(demoPages[0], bodyContentFromText);
assert.equal(publishedSavePreview.publicationState, PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges);
assert.equal(publishedSavePreview.draftBodyText, 'First line\n\nSecond line');

const publishedBodyStatePage = {
	sysId: 'page-published-body',
	workspaceSysId: 'workspace-001',
	draftTitle: 'Body Page',
	draftSlug: 'body-page',
	draftSlugNormalized: 'body-page',
	draftContentJson: createPageBodyContentJsonFromText('Published body'),
	draftBodyText: 'Published body',
	publishedTitle: 'Body Page',
	publishedSlug: 'body-page',
	publishedSlugNormalized: 'body-page',
	publishedContentJson: createPageBodyContentJsonFromText('Published body'),
	publishedBodyText: 'Published body',
	publicationState: PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
};
const publishedSaveNoChangePreview = buildPageBodySaveRecord(publishedBodyStatePage, createPageBodyContentJsonFromText('Published body'));
assert.equal(publishedSaveNoChangePreview.publicationState, PAGE_PUBLICATION_STATES.published);

const emptyDraftBodyPublishSource = {
	...publishedBodyStatePage,
	draftContentJson: createPageBodyContentJsonFromText(''),
	draftBodyText: '',
	publishedContentJson: createPageBodyContentJsonFromText('Stale published body'),
	publishedBodyText: 'Stale published body',
	publicationState: PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
};
const emptyDraftBodyPublishPreview = buildPagePublishRecord(emptyDraftBodyPublishSource);
assert.equal(emptyDraftBodyPublishPreview.publishedBodyText, '');
assert.equal(emptyDraftBodyPublishPreview.publishedContentJson.type, 'doc');
assert.equal(emptyDraftBodyPublishPreview.publicationState, PAGE_PUBLICATION_STATES.published);

const draftContentFromSelection = resolvePageBodyContentJson(demoPages[0], true);
assert.equal(draftContentFromSelection.type, 'doc');

const editorWait = ms => new Promise(resolve => setTimeout(resolve, ms));

clearPageBodyEditorSession('page-editor-debounce-test');
const autosaveSnapshots = [];
const autosavePayloads = [];
const autosaveSession = getPageBodyEditorSession('page-editor-debounce-test', {
	initialContentJson: createPageBodyContentJsonFromText('Initial body'),
	autosaveDelayMs: 25,
	savePageBodyContent: async ({contentJson}) => {
		autosavePayloads.push(contentJson);
	},
	onChange: snapshot => autosaveSnapshots.push(snapshot.status)
});

assert.equal(autosaveSession.getSnapshot().status, PAGE_BODY_EDITOR_STATUSES.saved);
autosaveSession.recordContentChange(createPageBodyContentJsonFromText('Edited once'));
autosaveSession.recordContentChange(createPageBodyContentJsonFromText('Edited twice'));
assert.equal(hasPendingPageBodyEditorChanges(), true);
await editorWait(10);
assert.equal(autosavePayloads.length, 0);
await editorWait(40);
assert.equal(autosavePayloads.length, 1);
assert.equal(autosaveSession.getSnapshot().status, PAGE_BODY_EDITOR_STATUSES.saved);
assert.equal(autosaveSession.getSnapshot().hasUnsavedChanges, false);
assert.ok(autosaveSnapshots.includes(PAGE_BODY_EDITOR_STATUSES.dirty));
assert.ok(autosaveSnapshots.includes(PAGE_BODY_EDITOR_STATUSES.saving));
assert.ok(autosaveSnapshots.includes(PAGE_BODY_EDITOR_STATUSES.saved));
clearPageBodyEditorSession('page-editor-debounce-test');

clearPageBodyEditorSession('page-editor-failure-test');
let failureAttemptCount = 0;
const failureSession = getPageBodyEditorSession('page-editor-failure-test', {
	initialContentJson: createPageBodyContentJsonFromText('Initial body'),
	autosaveDelayMs: 15,
	savePageBodyContent: async ({contentJson}) => {
		failureAttemptCount += 1;
		if (failureAttemptCount === 1) {
			throw new Error('simulated save failure');
		}
		return contentJson;
	}
});

failureSession.recordContentChange(createPageBodyContentJsonFromText('Will fail once'));
await editorWait(30);
assert.equal(failureSession.getSnapshot().status, PAGE_BODY_EDITOR_STATUSES.failed);
assert.equal(failureSession.getSnapshot().hasUnsavedChanges, true);
assert.equal(failureAttemptCount, 1);

failureSession.recordContentChange(createPageBodyContentJsonFromText('Will retry after another edit'));
await editorWait(30);
assert.equal(failureSession.getSnapshot().status, PAGE_BODY_EDITOR_STATUSES.saved);
assert.equal(failureAttemptCount, 2);
clearPageBodyEditorSession('page-editor-failure-test');
assert.equal(hasPendingPageBodyEditorChanges(), false);

const createdChildDraft = createPageDraft({
	workspaceSysId: 'workspace-product-001',
	title: 'Troubleshooting',
	parentPage: {
		sysId: 'page-product-guides',
		workspaceSysId: 'workspace-product-001'
	}
}, demoPages);

assert.equal(createdChildDraft.parentPageSysId, 'page-product-guides');
assert.equal(createdChildDraft.siblingOrder, 3);
assert.equal(createdChildDraft.draftSlug, 'troubleshooting');

const activeWorkspace = {
	active: true,
	adminGroupSysId: 'group-admin-001',
	editorGroupSysId: 'group-editor-001'
};

const brokenWorkspace = {
	active: true,
	adminGroupSysId: ' ',
	editorGroupSysId: null
};

const userState = {
	roles: new Set(),
	groups: new Set()
};

const capabilityService = createWorkspaceCapabilityService({
	hasRole: roleName => userState.roles.has(roleName),
	isMemberOfGroup: groupSysId => userState.groups.has(groupSysId)
});

assert.equal(capabilityService.roleNames.docseraAdmin, WORKSPACE_CAPABILITY_ROLE_NAMES.docseraAdmin);
assert.equal(capabilityService.isDocseraAdmin(), false);
assert.equal(capabilityService.canViewWorkspace(activeWorkspace), true);
assert.equal(capabilityService.canViewWorkspace({active: false}), false);

userState.roles.add(WORKSPACE_CAPABILITY_ROLE_NAMES.docseraAdmin);
assert.equal(capabilityService.isDocseraAdmin(), true);
assert.equal(capabilityService.isWorkspaceAdmin(activeWorkspace), true);
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), true);

userState.roles.clear();
userState.groups.clear();
userState.roles.add(WORKSPACE_GROUP_ROLE_NAMES.admin);
assert.equal(capabilityService.isDocseraAdmin(), false);
assert.equal(capabilityService.isWorkspaceAdmin(activeWorkspace), false);
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), false);

userState.groups.add(activeWorkspace.adminGroupSysId);
assert.equal(capabilityService.isWorkspaceAdmin(activeWorkspace), true);
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), true);

userState.roles.clear();
assert.equal(capabilityService.isWorkspaceAdmin(activeWorkspace), false);
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), false);

userState.roles.add(WORKSPACE_GROUP_ROLE_NAMES.admin);
assert.equal(capabilityService.isWorkspaceAdmin(activeWorkspace), true);
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), true);

userState.roles.clear();
userState.groups.clear();
userState.roles.add(WORKSPACE_GROUP_ROLE_NAMES.editor);
assert.equal(capabilityService.isWorkspaceAdmin(activeWorkspace), false);
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), false);

userState.groups.add(activeWorkspace.editorGroupSysId);
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), true);

userState.roles.clear();
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), false);

userState.roles.add(WORKSPACE_GROUP_ROLE_NAMES.editor);
userState.groups.clear();
assert.equal(capabilityService.isWorkspaceEditor(activeWorkspace), false);
assert.equal(capabilityService.isWorkspaceAdmin(brokenWorkspace), false);
assert.equal(capabilityService.isWorkspaceEditor(brokenWorkspace), false);

const workspaceSurface = readText('src/workspaces/workspace-domain.js') + readText('src/workspaces/workspace-capabilities.js');
for (const needle of ['workspaceMembership', 'membershipTable', 'workspace_membership']) {
	if (workspaceSurface.includes(needle)) {
		throw new Error(`Unexpected custom workspace membership table reference: ${needle}`);
	}
}

const shellSurface = readText('src/docsera-shell/index.js');
for (const needle of [
	'selectedWorkspaceSlug: workspace.workspaceSlug',
	'shellNavigationCollapsed',
	'shellTheme',
	'Page tree',
	'Table of contents',
	'Workspace not found',
	'Page not found',
	'My Workspaces'
]) {
	if (!shellSurface.includes(needle)) {
		throw new Error(`Missing "${needle}" in shell surface source.`);
	}
}

if (shellSurface.includes('shell.workspaceSlug ? `/${shell.workspaceSlug}` : \'Workspace shell\'')) {
	throw new Error('Reader header still renders the workspace slug inside the workspace identity block.');
}

console.log('Docsera shell validation passed.');
