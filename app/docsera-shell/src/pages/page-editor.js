import {PAGE_PUBLICATION_STATES} from './page-domain.js';

const DEFAULT_PAGE_BODY_CONTENT_JSON = Object.freeze({
	type: 'doc',
	content: [
		{
			type: 'paragraph'
		}
	]
});

export const PAGE_BODY_EDITOR_STATUSES = Object.freeze({
	saved: 'saved',
	dirty: 'dirty',
	saving: 'saving',
	failed: 'failed'
});

function cleanText(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

function cloneJson(value) {
	return value ? structuredClone(value) : structuredClone(DEFAULT_PAGE_BODY_CONTENT_JSON);
}

function isPlainObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeHeadingLevel(level) {
	const parsed = Number(level);
	if (!Number.isFinite(parsed)) {
		return 2;
	}

	return Math.min(Math.max(Math.floor(parsed), 1), 6);
}

function normalizePageBodyInlineNode(node) {
	if (!isPlainObject(node) || typeof node.type !== 'string') {
		return null;
	}

	if (node.type === 'text') {
		const text = typeof node.text === 'string' ? node.text : '';
		if (!text) {
			return null;
		}

		const normalizedText = {
			type: 'text',
			text
		};

		if (Array.isArray(node.marks) && node.marks.length) {
			normalizedText.marks = node.marks
				.filter(isPlainObject)
				.map(mark => {
					const type = cleanText(mark.type);
					if (!type) {
						return null;
					}

					const normalizedMark = {type};
					if (isPlainObject(mark.attrs) && Object.keys(mark.attrs).length) {
						normalizedMark.attrs = structuredClone(mark.attrs);
					}
					return normalizedMark;
				})
				.filter(Boolean);
		}

		return normalizedText;
	}

	if (node.type === 'hard_break' || node.type === 'image') {
		const normalizedNode = {
			type: node.type
		};

		if (isPlainObject(node.attrs) && Object.keys(node.attrs).length) {
			normalizedNode.attrs = structuredClone(node.attrs);
		}

		return normalizedNode;
	}

	return null;
}

function normalizePageBodyInlineContent(content) {
	return (Array.isArray(content) ? content : [])
		.map(normalizePageBodyInlineNode)
		.filter(Boolean);
}

function normalizePageBodyBlockNode(node) {
	if (!isPlainObject(node) || typeof node.type !== 'string') {
		return null;
	}

	if (node.type === 'heading') {
		const children = normalizePageBodyInlineContent(node.content);
		return {
			type: 'paragraph',
			content: children.length ? children : [{type: 'text', text: ''}]
		};
	}

	if (node.type === 'blockquote' || node.type === 'code_block' || node.type === 'paragraph') {
		if (node.type === 'code_block') {
			const codeText = Array.isArray(node.content)
				? node.content.map(extractNodeText).filter(Boolean).join('\n')
				: '';

			return {
				type: 'code_block',
				content: [{type: 'text', text: codeText}]
			};
		}

		const children = normalizePageBodyInlineContent(node.content);
		return {
			type: 'paragraph',
			content: children.length ? children : [{type: 'text', text: ''}]
		};
	}

	if (node.type === 'horizontal_rule') {
		return {
			type: 'horizontal_rule'
		};
	}

	return null;
}

function flushPageBodyInlineBuffer(target, inlineBuffer) {
	if (!inlineBuffer.length) {
		return;
	}

	target.push({
		type: 'paragraph',
		content: inlineBuffer.splice(0, inlineBuffer.length)
	});
}

export function normalizePageBodyContent(value) {
	if (!isPlainObject(value) || value.type !== 'doc') {
		return cloneJson(DEFAULT_PAGE_BODY_CONTENT_JSON);
	}

	const content = Array.isArray(value.content) ? value.content : [];
	const normalizedContent = [];
	const inlineBuffer = [];

	for (const node of content) {
		if (node && typeof node === 'object' && !Array.isArray(node)) {
			if (node.type === 'text' || node.type === 'hard_break' || node.type === 'image') {
				const inlineNode = normalizePageBodyInlineNode(node);
				if (inlineNode) {
					inlineBuffer.push(inlineNode);
				}
				continue;
			}
		}

		flushPageBodyInlineBuffer(normalizedContent, inlineBuffer);
		const normalizedNode = normalizePageBodyBlockNode(node);
		if (normalizedNode) {
			normalizedContent.push(normalizedNode);
		}
	}

	flushPageBodyInlineBuffer(normalizedContent, inlineBuffer);

	return {
		type: 'doc',
		content: normalizedContent.length ? normalizedContent : [{type: 'paragraph'}]
	};
}

export function normalizePageBodyContentJson(value) {
	return normalizePageBodyContent(value);
}

function splitTextLines(text) {
	return String(text || '')
		.replace(/\r\n/g, '\n')
		.split('\n');
}

function textLineToParagraph(line) {
	return {
		type: 'paragraph',
		content: line ? [{type: 'text', text: line}] : []
	};
}

export function createPageBodyContentJsonFromText(text) {
	const lines = splitTextLines(text);
	const paragraphs = lines.length ? lines.map(textLineToParagraph) : [textLineToParagraph('')];
	return normalizePageBodyContentJson({
		type: 'doc',
		content: paragraphs
	});
}

function extractNodeText(node) {
	if (!isPlainObject(node)) {
		return '';
	}

	if (node.type === 'text') {
		return typeof node.text === 'string' ? node.text : '';
	}

	if (node.type === 'hard_break') {
		return '\n';
	}

	const children = Array.isArray(node.content) ? node.content : [];
	const pieces = children.map(extractNodeText).filter(Boolean);

	if (node.type === 'heading' || node.type === 'paragraph' || node.type === 'blockquote') {
		return pieces.join('').trim();
	}

	if (node.type === 'code_block') {
		return pieces.join('');
	}

	return pieces.join(' ').trim();
}

export function extractPageBodyTextFromContentJson(value) {
	const content = normalizePageBodyContentJson(value);
	const text = Array.isArray(content.content)
		? content.content.map(extractNodeText).filter(Boolean)
		: [];

	return text.join('\n\n').trim();
}

export function resolvePageBodyContentJson(page, preferDraft = false) {
	if (!page || typeof page !== 'object') {
		return cloneJson(DEFAULT_PAGE_BODY_CONTENT_JSON);
	}

	const bodyJson = preferDraft
		? page.draftContentJson || page.publishedContentJson
		: page.publishedContentJson || page.draftContentJson;
	const bodyText = preferDraft
		? page.draftBodyText || page.publishedBodyText
		: page.publishedBodyText || page.draftBodyText;

	if (bodyJson) {
		return normalizePageBodyContentJson(bodyJson);
	}

	if (typeof bodyText === 'string' && bodyText.trim()) {
		return createPageBodyContentJsonFromText(bodyText);
	}

	return cloneJson(DEFAULT_PAGE_BODY_CONTENT_JSON);
}

export function buildPageBodySaveRecord(page, contentJson) {
	if (!page || typeof page !== 'object') {
		throw new TypeError('A page record is required.');
	}

	const nextContentJson = normalizePageBodyContentJson(contentJson);
	const nextBodyText = extractPageBodyTextFromContentJson(nextContentJson);
	const nextPublicationState = page.publicationState === PAGE_PUBLICATION_STATES.published
		? PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
		: page.publicationState;

	return {
		...page,
		draftContentJson: nextContentJson,
		draftBodyText: nextBodyText,
		publicationState: nextPublicationState
	};
}

function contentKey(value) {
	return JSON.stringify(normalizePageBodyContentJson(value));
}

function isSavingStatus(value) {
	return value === PAGE_BODY_EDITOR_STATUSES.saving;
}

export function createPageBodyEditorSession({
	pageSysId = '',
	initialContentJson,
	autosaveDelayMs = 800,
	savePageBodyContent,
	onChange
} = {}) {
	const normalizedPageSysId = cleanText(pageSysId);
	if (!normalizedPageSysId) {
		throw new TypeError('A page sys_id is required.');
	}

	if (typeof savePageBodyContent !== 'function') {
		throw new TypeError('A savePageBodyContent callback is required.');
	}

	const listeners = new Set();
	if (typeof onChange === 'function') {
		listeners.add(onChange);
	}

	let currentContentJson = normalizePageBodyContentJson(initialContentJson);
	let savedContentJson = cloneJson(currentContentJson);
	let status = PAGE_BODY_EDITOR_STATUSES.saved;
	let error = '';
	let timer = null;
	let savePromise = null;
	let disposed = false;

	const notify = () => {
		const snapshot = getSnapshot();
		for (const listener of listeners) {
			listener(snapshot);
		}
		return snapshot;
	};

	const scheduleAutosave = () => {
		if (disposed) {
			return;
		}

		if (timer) {
			clearTimeout(timer);
		}

		timer = setTimeout(() => {
			timer = null;
			void flushAutosave('idle').catch(() => {});
		}, Math.max(0, Number(autosaveDelayMs) || 0));
	};

	const runSave = async reason => {
		if (disposed) {
			return getSnapshot();
		}

		const currentKey = contentKey(currentContentJson);
		const savedKey = contentKey(savedContentJson);
		if (!currentKey || currentKey === savedKey) {
			status = PAGE_BODY_EDITOR_STATUSES.saved;
			error = '';
			notify();
			return getSnapshot();
		}

		status = PAGE_BODY_EDITOR_STATUSES.saving;
		error = '';
		notify();

		const contentToSave = cloneJson(currentContentJson);
		savePromise = Promise.resolve().then(() => savePageBodyContent({
			pageSysId: normalizedPageSysId,
			contentJson: cloneJson(contentToSave),
			reason
		}));

		try {
			await savePromise;
			savedContentJson = cloneJson(contentToSave);
			status = PAGE_BODY_EDITOR_STATUSES.saved;
			error = '';
			notify();
		} catch (saveError) {
			status = PAGE_BODY_EDITOR_STATUSES.failed;
			error = saveError && saveError.message ? saveError.message : 'Save failed.';
			notify();
			throw saveError;
		} finally {
			const saveSucceeded = contentKey(savedContentJson) === contentKey(contentToSave);
			savePromise = null;
			if (!disposed && saveSucceeded && contentKey(currentContentJson) !== contentKey(savedContentJson)) {
				scheduleAutosave();
			}
		}

		return getSnapshot();
	};

	async function flushAutosave(reason = 'manual') {
		if (disposed) {
			return getSnapshot();
		}

		if (timer) {
			clearTimeout(timer);
			timer = null;
		}

		if (savePromise) {
			await savePromise;
			return getSnapshot();
		}

		return runSave(reason);
	}

	function recordContentChange(nextContentJson) {
		if (disposed) {
			return getSnapshot();
		}

		const normalizedContentJson = normalizePageBodyContentJson(nextContentJson);
		if (contentKey(normalizedContentJson) === contentKey(currentContentJson)) {
			return getSnapshot();
		}

		currentContentJson = normalizedContentJson;
		status = PAGE_BODY_EDITOR_STATUSES.dirty;
		error = '';
		scheduleAutosave();
		return notify();
	}

	function markSaved(nextContentJson) {
		if (disposed) {
			return getSnapshot();
		}

		currentContentJson = normalizePageBodyContentJson(nextContentJson);
		savedContentJson = cloneJson(currentContentJson);
		status = PAGE_BODY_EDITOR_STATUSES.saved;
		error = '';
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		return notify();
	}

	function suspendAutosave() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	}

	function addListener(listener) {
		if (typeof listener !== 'function') {
			return () => {};
		}

		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	function getSnapshot() {
		const currentKey = contentKey(currentContentJson);
		const savedKey = contentKey(savedContentJson);
		const hasUnsavedChanges = Boolean(
			status === PAGE_BODY_EDITOR_STATUSES.dirty ||
			status === PAGE_BODY_EDITOR_STATUSES.failed ||
			timer ||
			savePromise ||
			currentKey !== savedKey
		);

		return {
			pageSysId: normalizedPageSysId,
			contentJson: cloneJson(currentContentJson),
			savedContentJson: cloneJson(savedContentJson),
			status,
			statusLabel: getPageBodyEditorStatusLabel(status),
			error,
			hasUnsavedChanges,
			isDirty: status === PAGE_BODY_EDITOR_STATUSES.dirty,
			isSaving: status === PAGE_BODY_EDITOR_STATUSES.saving || Boolean(savePromise),
			isFailed: status === PAGE_BODY_EDITOR_STATUSES.failed,
			hasPendingSave: Boolean(timer),
			canRetry: status === PAGE_BODY_EDITOR_STATUSES.failed || hasUnsavedChanges
		};
	}

	function dispose() {
		disposed = true;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	}

	return Object.freeze({
		addListener,
		dispose,
		flushAutosave,
		getSnapshot,
		markSaved,
		recordContentChange,
		suspendAutosave,
		updateSaveCallback(nextSavePageBodyContent) {
			if (typeof nextSavePageBodyContent === 'function') {
				savePageBodyContent = nextSavePageBodyContent;
			}
		},
		updateOnChange(nextOnChange) {
			if (typeof nextOnChange === 'function') {
				listeners.clear();
				listeners.add(nextOnChange);
			}
		}
	});
}

const pageBodyEditorSessions = new Map();

export function getPageBodyEditorSession(pageSysId, options = {}) {
	const normalizedPageSysId = cleanText(pageSysId);
	if (!normalizedPageSysId) {
		return null;
	}

	const existingSession = pageBodyEditorSessions.get(normalizedPageSysId);
	if (existingSession) {
		if (typeof options.savePageBodyContent === 'function') {
			existingSession.updateSaveCallback(options.savePageBodyContent);
		}

		if (typeof options.onChange === 'function') {
			existingSession.updateOnChange(options.onChange);
		}

		return existingSession;
	}

	const session = createPageBodyEditorSession({
		pageSysId: normalizedPageSysId,
		initialContentJson: options.initialContentJson,
		autosaveDelayMs: options.autosaveDelayMs,
		savePageBodyContent: options.savePageBodyContent,
		onChange: options.onChange
	});

	pageBodyEditorSessions.set(normalizedPageSysId, session);
	return session;
}

export function clearPageBodyEditorSession(pageSysId) {
	const normalizedPageSysId = cleanText(pageSysId);
	if (!normalizedPageSysId) {
		return;
	}

	const session = pageBodyEditorSessions.get(normalizedPageSysId);
	if (session) {
		session.dispose();
		pageBodyEditorSessions.delete(normalizedPageSysId);
	}
}

export function getPageBodyEditorStatusLabel(status) {
	switch (status) {
		case PAGE_BODY_EDITOR_STATUSES.dirty:
			return 'Unsaved changes';
		case PAGE_BODY_EDITOR_STATUSES.saving:
			return 'Saving';
		case PAGE_BODY_EDITOR_STATUSES.failed:
			return 'Save failed';
		case PAGE_BODY_EDITOR_STATUSES.saved:
		default:
			return 'Saved';
	}
}

export function hasPendingPageBodyEditorChanges() {
	for (const session of pageBodyEditorSessions.values()) {
		const snapshot = session.getSnapshot();
		if (snapshot.hasUnsavedChanges || snapshot.isSaving || snapshot.isFailed || snapshot.hasPendingSave) {
			return true;
		}
	}

	return false;
}

export function getPageBodyEditorSessionSnapshot(pageSysId) {
	const normalizedPageSysId = cleanText(pageSysId);
	if (!normalizedPageSysId) {
		return null;
	}

	const session = pageBodyEditorSessions.get(normalizedPageSysId);
	return session ? session.getSnapshot() : null;
}
