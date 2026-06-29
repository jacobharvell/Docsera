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
mustContain(readme, ['app/docsera-shell/', 'poc/'], 'README.md');

const baseline = readText('docs/process/Docsera Repo, SDK, and Deployment Baseline.md');
mustContain(
	baseline,
	['app/docsera-shell', 'npm run validate', 'poc/tiptap-component', 'src/workspaces/workspace-domain.js'],
	'docs/process/Docsera Repo, SDK, and Deployment Baseline.md'
);

const workspaceDoc = readText('docs/process/Workspace Data Model and Group Provisioning.md');
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
	'docs/process/Workspace Data Model and Group Provisioning.md'
);

const pageDoc = readText('docs/process/Page Data Model and Slug Rules.md');
mustContain(
	pageDoc,
	[
		'workspaceSysId',
		'parentPageSysId',
		'siblingOrder',
		'benefits-1',
		'published_with_unpublished_changes',
		'/docsera/:workspaceSlug/:pageSlug'
	],
	'docs/process/Page Data Model and Slug Rules.md'
);

const capabilityDoc = readText('docs/process/Workspace Capability Checks.md');
mustContain(
	capabilityDoc,
	[
		'Workspace Admin',
		'Workspace Editor',
		'hasRole(roleName)',
		'isMemberOfGroup(groupSysId)',
		'workspace capability contract'
	],
	'docs/process/Workspace Capability Checks.md'
);

console.log('Docsera doc validation passed.');
