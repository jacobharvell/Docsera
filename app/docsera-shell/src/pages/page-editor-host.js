import {
	createCustomElement,
	actionTypes
} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';
import {EditorState} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {Schema, Node as ProseMirrorNode} from 'prosemirror-model';
import {schema as basicSchema} from 'prosemirror-schema-basic';
import {history, undo, redo} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import {chainCommands, exitCode, baseKeymap} from 'prosemirror-commands';
import {normalizePageBodyContentJson} from './page-editor.js';
import styles from './page-editor-host.scss';

const {COMPONENT_RENDERED, COMPONENT_DISCONNECTED} = actionTypes;
const PAGE_EDITOR_HOST_TAG = 'x-82900-docsera-page-editor-host';
const EDITOR_READY_EVENT = 'docsera-editor-host-ready';
const EDITOR_CHANGE_EVENT = 'docsera-editor-host-change';
const EDITOR_ERROR_EVENT = 'docsera-editor-host-error';

const hostEntries = new WeakMap();
const hostObservers = new WeakMap();
const PAGE_EDITOR_SCHEMA = new Schema({
	nodes: basicSchema.spec.nodes,
	marks: basicSchema.spec.marks
});

function samePageEditorContent(left, right) {
	return JSON.stringify(normalizePageBodyContentJson(left)) === JSON.stringify(normalizePageBodyContentJson(right));
}

function createPageEditorState(contentJson) {
	const normalizedContentJson = normalizePageBodyContentJson(contentJson);
	const doc = ProseMirrorNode.fromJSON(PAGE_EDITOR_SCHEMA, normalizedContentJson);

	return EditorState.create({
		schema: PAGE_EDITOR_SCHEMA,
		doc,
		plugins: [
			history(),
			keymap({
				'Mod-z': undo,
				'Mod-y': redo,
				'Shift-Mod-z': redo,
				Enter: chainCommands(exitCode, baseKeymap.Enter)
			}),
			keymap(baseKeymap)
		]
	});
}

function getHostEntry(host) {
	if (!hostEntries.has(host)) {
		hostEntries.set(host, {
			editorElement: null,
			pageSysId: '',
			view: null
		});
	}

	return hostEntries.get(host);
}

function destroyHostEntry(host) {
	const entry = hostEntries.get(host);
	if (!entry) {
		return;
	}

	if (entry.view) {
		entry.view.destroy();
	}

	hostEntries.delete(host);
}

function readEditorInput(host) {
	const dataset = host && host.dataset ? host.dataset : {};
	const pageSysId = typeof dataset.pageSysId === 'string' ? dataset.pageSysId.trim() : '';
	const rawContentJson = typeof dataset.editorContentJson === 'string' ? dataset.editorContentJson.trim() : '';

	let contentJson = normalizePageBodyContentJson(null);

	if (rawContentJson) {
		try {
			contentJson = normalizePageBodyContentJson(JSON.parse(rawContentJson));
		} catch (error) {
			// Fall back to the default editor document.
		}
	}

	return {
		contentJson,
		pageSysId
	};
}

function emitEditorEvent(host, eventName, detail = {}) {
	host.dispatchEvent(new CustomEvent(eventName, {
		bubbles: true,
		composed: true,
		detail
	}));
}

function setEditorError(host, updateState, message, pageSysId) {
	const nextMessage = message || 'Editor host initialization failed.';
	host.setAttribute('data-editor-error', nextMessage);
	updateState({editorError: nextMessage});
	emitEditorEvent(host, EDITOR_ERROR_EVENT, {
		message: nextMessage,
		pageSysId
	});
}

function ensureEditor(host, updateState) {
	const root = host.shadowRoot;
	if (!root) {
		return;
	}

	const input = readEditorInput(host);
	const editorElement = root.querySelector('[data-docsera-page-editor="primary"]');
	if (!editorElement) {
		setEditorError(host, updateState, 'Editor mount surface was not available.', input.pageSysId);
		return;
	}

	const entry = getHostEntry(host);
	const needsNewView = !entry.view || entry.editorElement !== editorElement || entry.pageSysId !== input.pageSysId;
	if (needsNewView && entry.view) {
		entry.view.destroy();
		entry.view = null;
	}

	entry.editorElement = editorElement;
	entry.pageSysId = input.pageSysId;

	if (!entry.view) {
		try {
			entry.view = new EditorView(editorElement, {
				root,
				state: createPageEditorState(input.contentJson),
				dispatchTransaction(transaction) {
					const view = entry.view;
					if (!view) {
						return;
					}

					const nextEditorState = view.state.apply(transaction);
					view.updateState(nextEditorState);

					if (transaction.docChanged) {
						emitEditorEvent(host, EDITOR_CHANGE_EVENT, {
							contentJson: nextEditorState.doc.toJSON(),
							pageSysId: entry.pageSysId
						});
					}
				}
			});
			host.removeAttribute('data-editor-error');
			updateState({editorError: ''});
		} catch (error) {
			setEditorError(
				host,
				updateState,
				error && error.message ? String(error.message).slice(0, 200) : 'Editor host initialization failed.',
				input.pageSysId
			);
			return;
		}
	}

	const currentContentJson = entry.view.state.doc.toJSON();
	if (!samePageEditorContent(currentContentJson, input.contentJson)) {
		try {
			entry.view.updateState(createPageEditorState(input.contentJson));
		} catch (error) {
			setEditorError(
				host,
				updateState,
				error && error.message ? String(error.message).slice(0, 200) : 'Editor document update failed.',
				input.pageSysId
			);
			return;
		}
	}

	entry.view.setProps({
		editable: () => true
	});

	emitEditorEvent(host, EDITOR_READY_EVENT, {
		pageSysId: input.pageSysId
	});
}

function ensureHostObserver(host, updateState) {
	if (hostObservers.has(host) || typeof MutationObserver === 'undefined') {
		return;
	}

	const observer = new MutationObserver(mutations => {
		if (!Array.isArray(mutations) || !mutations.length) {
			return;
		}

		if (!mutations.some(mutation => mutation.type === 'attributes')) {
			return;
		}

		ensureEditor(host, updateState);
	});

	observer.observe(host, {
		attributeFilter: ['data-editor-content-json', 'data-page-sys-id', 'data-shell-theme'],
		attributes: true
	});

	hostObservers.set(host, observer);
}

function disconnectHostObserver(host) {
	const observer = hostObservers.get(host);
	if (!observer) {
		return;
	}

	observer.disconnect();
	hostObservers.delete(host);
}

const view = state => (
	<div className="docsera-page-editor-host">
		<div
			className="docsera-page-editor-host__surface"
			data-docsera-page-editor="primary"
		/>
		{state.editorError ? (
			<div className="docsera-page-editor-host__fallback" role="alert">
				{state.editorError}
			</div>
		) : null}
	</div>
);

createCustomElement(PAGE_EDITOR_HOST_TAG, {
	renderer: {type: snabbdom},
	setInitialState() {
		return {
			editorError: ''
		};
	},
	actionHandlers: {
		[COMPONENT_RENDERED]: ({host, updateState}) => {
			ensureHostObserver(host, updateState);
			ensureEditor(host, updateState);
		},
		[COMPONENT_DISCONNECTED]: ({host}) => {
			disconnectHostObserver(host);
			destroyHostEntry(host);
		}
	},
	view,
	styles
});

export {
	EDITOR_CHANGE_EVENT,
	EDITOR_ERROR_EVENT,
	EDITOR_READY_EVENT,
	PAGE_EDITOR_HOST_TAG
};
