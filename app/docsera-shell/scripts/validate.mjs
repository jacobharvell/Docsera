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
	buildWorkspaceShellViewModel,
	PAGE_PERSISTENCE_MODEL,
	PAGE_PUBLICATION_STATES,
	createPageDraft,
	createDocseraShellDemoPages,
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
	'My Workspaces',
	'New page',
	'Create page',
	'Draft content'
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
	'Manual PDI validation'
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

const shellAuthoringCapabilityService = createWorkspaceCapabilityService({
	hasRole: roleName => demoUserAccess.roles.includes(roleName),
	isMemberOfGroup: groupSysId => demoUserAccess.groups.includes(groupSysId)
});

const shellReaderCapabilityService = createWorkspaceCapabilityService({
	hasRole: () => false,
	isMemberOfGroup: () => false
});

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
assert.equal(shellAuthoringView.visiblePages.length, 5);
assert.equal(shellAuthoringView.pageTree.length, 3);
assert.equal(shellAuthoringView.pageTree[0].title, 'Overview');
assert.equal(shellAuthoringView.pageTree[1].title, 'Guides');
assert.equal(shellAuthoringView.pageTree[1].children.length, 2);
assert.equal(shellAuthoringView.pageTree[2].title, 'Draft Playground');
assert.equal(shellAuthoringView.pageTree[2].isDraft, true);
assert.deepEqual(shellAuthoringView.breadcrumbs.map(item => item.label), ['Overview']);
assert.equal(shellAuthoringView.tableOfContents.length, 2);
assert.equal(shellAuthoringView.canShowAuthoringControls, true);
assert.equal(shellAuthoringView.canCreatePages, true);
assert.equal(shellAuthoringView.pageMode, 'authoring');

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
assert.equal(missingPageView.routeTargetPath, '/docsera/product-docs/draft-playground');

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
