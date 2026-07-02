import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(process.cwd());

function readText(relativePath) {
	const absolutePath = resolve(root, relativePath);
	if (!existsSync(absolutePath)) {
		throw new Error(`Missing required file: ${relativePath}`);
	}
	return readFileSync(absolutePath, 'utf8');
}

function mustContain(text, needles, fileLabel) {
	for (const needle of needles) {
		if (!text.includes(needle)) {
			throw new Error(`Missing "${needle}" in ${fileLabel}`);
		}
	}
}

const readme = readText('README.md');
mustContain(readme, ['app/docsera-shell/', 'poc/', 'Requirements Source Map.md'], 'README.md');

const shellReadme = readText('app/docsera-shell/README.md');
mustContain(
	shellReadme,
	[
		'Requirements Source Map.md',
		'Implementation Notes - Workspace Data Model and Group Provisioning.md',
		'Implementation Notes - Workspace Capability Checks.md',
		'Implementation Notes - My Workspaces Launcher.md',
		'Implementation Notes - Page Data Model and Slug Rules.md'
	],
	'app/docsera-shell/README.md'
);

const baseline = readText('docs/process/Docsera Repo, SDK, and Deployment Baseline.md');
mustContain(
	baseline,
	[
		'app/docsera-shell',
		'npm run validate',
		'poc/tiptap-component',
		'src/workspaces/workspace-domain.js',
		'Requirements Source Map.md'
	],
	'docs/process/Docsera Repo, SDK, and Deployment Baseline.md'
);

const runtimeCleanupNote = readText('docs/process/Implementation Notes - UI Builder Runtime Baggage Cleanup.md');
mustContain(
	runtimeCleanupNote,
	[
		'ADR-0002-direct-ui-page-host.md',
		'ADR-0003-frontend-stack.md',
		'app/docsera-shell/historical/ui-builder/now-ui.json',
		'React + TypeScript + Vite',
		'Validation results'
	],
	'docs/process/Implementation Notes - UI Builder Runtime Baggage Cleanup.md'
);

const requirementsSourceMap = readText('docs/process/Requirements Source Map.md');
mustContain(
	requirementsSourceMap,
	[
		'Accepted product requirements live in the Obsidian vault',
		'does not supersede those requirements',
		'Local Obsidian paths',
		'10 Roles, Workspace Membership, and Access Workflows.md',
		'20 My Workspaces.md',
		'21 Workspace Model.md',
		'22 Workspace Shell.md',
		'30 Page Model.md',
		'31 Page Settings.md',
		'41 Publishing Model.md',
		'60 Design System.md',
		'C:\\Users\\jacob\\OneDrive\\Documents\\Obsidian Vault\\Attachments'
	],
	'docs/process/Requirements Source Map.md'
);

const workspaceDoc = readText('docs/process/Implementation Notes - Workspace Data Model and Group Provisioning.md');
mustContain(
	workspaceDoc,
	[
		'workspaceSlug',
		'Docsera_<Workspace_Key>_Admins',
		'workspace group key is separate',
		'hr-docs-2',
		'Docsera default icon',
		'npm run validate:shell'
	],
	'docs/process/Implementation Notes - Workspace Data Model and Group Provisioning.md'
);

const pageDoc = readText('docs/process/Implementation Notes - Page Data Model and Slug Rules.md');
mustContain(
	pageDoc,
	[
		'workspaceSysId',
		'parentPageSysId',
		'siblingOrder',
		'benefits-1',
		'published_with_unpublished_changes',
		'/docsera/:workspaceSlug/:pageSlug',
		'reader shell now uses the flat route model'
	],
	'docs/process/Implementation Notes - Page Data Model and Slug Rules.md'
);

const capabilityDoc = readText('docs/process/Implementation Notes - Workspace Capability Checks.md');
mustContain(
	capabilityDoc,
	[
		'Workspace Admin',
		'Workspace Editor',
		'hasRole(roleName)',
		'isMemberOfGroup(groupSysId)',
		'workspace capability contract'
	],
	'docs/process/Implementation Notes - Workspace Capability Checks.md'
);

const myWorkspacesDoc = readText('docs/process/Implementation Notes - My Workspaces Launcher.md');
mustContain(
	myWorkspacesDoc,
	[
		'Full reader-mode shell behavior now lives in the product shell',
		'launcher entry surface'
	],
	'docs/process/Implementation Notes - My Workspaces Launcher.md'
);

console.log('Docsera doc validation passed.');
