import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

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
	'tile-icon/docsera-shell-icon.svg'
];

for (const file of requiredFiles) {
	readText(file);
}

const entryPoint = readText('src/index.js');
if (!entryPoint.includes("import './docsera-shell';")) {
	throw new Error('Shell entry point does not import the product shell module.');
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
	'Manual PDI validation'
]) {
	if (!shellReadme.includes(needle)) {
		throw new Error(`Missing "${needle}" in shell README.`);
	}
}

console.log('Docsera shell validation passed.');
