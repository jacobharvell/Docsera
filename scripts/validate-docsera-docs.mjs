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
mustContain(
	readme,
	[
		'releases/0.1.0/',
		'releases/README.md',
		'scoped-first, Global-second',
		'app/docsera-ui/',
		'app/docsera-global-bridge/',
		'MIT License'
	],
	'README.md'
);

const rootPackage = JSON.parse(readText('package.json'));
const rootValidate = rootPackage.scripts?.validate;
if (
	typeof rootValidate !== 'string' ||
	!rootValidate.includes('validate:frontend') ||
	!rootValidate.includes('validate:docs') ||
	rootValidate.includes('validate:shell')
) {
	throw new Error('Root validate must run active frontend and documentation validation without the archived shell.');
}

for (const obsoleteScript of ['validate:shell', 'package:direct-ui-page']) {
	if (obsoleteScript in (rootPackage.scripts ?? {})) {
		throw new Error(`Obsolete root script must not remain: ${obsoleteScript}`);
	}
}

const releasesReadme = readText('releases/README.md');
mustContain(
	releasesReadme,
	[
		'0.1.0/docsera_application_0.1.0.xml',
		'0.1.0/docsera_global_companion_0.1.0.xml',
		'scoped first, then Global',
		'sole frozen consumer release pair',
		'No other XML in this repository is a supported consumer installation artifact.'
	],
	'releases/README.md'
);

const processReadme = readText('docs/process/README.md');
mustContain(
	processReadme,
	[
		'Current implementation contracts',
		'Editor Runtime Interaction Contract',
		'Release, security, and historical evidence',
		'frozen 0.1.0 release',
		'not current installation instructions'
	],
	'docs/process/README.md'
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
		'npm run validate'
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
