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
	buildWorkspaceGroupNames,
	createWorkspaceDraft,
	createWorkspaceCapabilityService,
	provisionWorkspace,
	slugifyWorkspaceName
} from '../src/workspaces/index.js';

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
	'src/workspaces/index.js',
	'src/workspaces/workspace-capabilities.js',
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

const shellSource = readText('src/docsera-shell/index.js');
for (const needle of [
	"createCustomElement('x-82900-docsera-shell'",
	"section: 'overview'",
	'Docsera app shell is mounted'
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

console.log('Docsera shell validation passed.');
