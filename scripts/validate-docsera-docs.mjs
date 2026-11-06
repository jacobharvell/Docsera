import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, extname, relative, resolve} from 'node:path';

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

function markdownFiles(relativeDirectory) {
	const absoluteDirectory = resolve(root, relativeDirectory);
	return readdirSync(absoluteDirectory, {withFileTypes: true}).flatMap((entry) => {
		const child = resolve(absoluteDirectory, entry.name);
		if (entry.isDirectory()) {
			return markdownFiles(relative(root, child));
		}
		return extname(entry.name).toLowerCase() === '.md' ? [child] : [];
	});
}

const documentationMarkdown = [
	resolve(root, 'README.md'),
	resolve(root, 'CONTRIBUTING.md'),
	resolve(root, 'SUPPORT.md'),
	resolve(root, 'SECURITY.md'),
	...markdownFiles('docs'),
	...markdownFiles('releases'),
	resolve(root, 'app/docsera-global-bridge/update-set/README.md')
];

function assertLocalMarkdownLinksResolve() {
	const brokenLinks = [];
	for (const absolutePath of documentationMarkdown) {
		const text = readFileSync(absolutePath, 'utf8');
		const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
		for (const match of text.matchAll(linkPattern)) {
			const target = match[1].trim().replace(/^<|>$/g, '');
			if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
				continue;
			}
			const targetPath = decodeURIComponent(target.split(/[?#]/, 1)[0]);
			if (!targetPath || !existsSync(resolve(dirname(absolutePath), targetPath))) {
				brokenLinks.push(`${relative(root, absolutePath)} -> ${target}`);
			}
		}
	}
	if (brokenLinks.length > 0) {
		throw new Error(`Broken local Markdown links:\n${brokenLinks.join('\n')}`);
	}
}

function assertCurrentReleaseTerminology() {
	const obsoleteTerminology = [];
	for (const absolutePath of documentationMarkdown) {
		const text = readFileSync(absolutePath, 'utf8');
		if (/frozen/i.test(text)) {
			obsoleteTerminology.push(relative(root, absolutePath));
		}
	}
	if (obsoleteTerminology.length > 0) {
		throw new Error(
			`Obsolete frozen release terminology in:\n${obsoleteTerminology.join('\n')}`
		);
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
		'sole consumer release pair',
		'No other XML in this repository is a supported consumer installation artifact.'
	],
	'releases/README.md'
);

const docsReadme = readText('docs/README.md');
mustContain(
	docsReadme,
	[
		'Installation',
		'Architecture',
		'Editor',
		'Security',
		'Testing and maintenance',
		'Release evidence',
		'Docsera 0.1.0 release instructions'
	],
	'docs/README.md'
);

for (const currentReference of [
	'docs/architecture/overview.md',
	'docs/guides/development-setup.md',
	'docs/guides/installing-docsera.md',
	'docs/guides/testing-and-maintenance.md',
	'docs/guides/update-set-installation.md',
	'docs/reference/access-and-provisioning.md',
	'docs/reference/editor-interactions.md',
	'docs/reference/page-state-and-hierarchy.md',
	'docs/reference/publishing-and-change-sets.md',
	'docs/reference/servicenow-runtime.md',
	'docs/reference/workspace-domain.md',
	'docs/reference/editor/document-model-and-blocks.md',
	'docs/reference/editor/markdown-and-source.md',
	'docs/reference/editor/media.md',
	'docs/release/qualification.md',
	'docs/security/authorization-boundaries.md'
]) {
	readText(currentReference);
}

assertLocalMarkdownLinksResolve();
assertCurrentReleaseTerminology();

console.log('Docsera doc validation passed.');
