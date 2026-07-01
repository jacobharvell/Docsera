import {
	createCustomElement
} from '@servicenow/ui-core';
import {actionTypes} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';
import {EditorState} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {Schema, Node as ProseMirrorNode} from 'prosemirror-model';
import {schema as basicSchema} from 'prosemirror-schema-basic';
import {history, undo, redo} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import {toggleMark, chainCommands, exitCode, baseKeymap} from 'prosemirror-commands';
import {
	WORKSPACE_CAPABILITY_ROLE_NAMES,
	buildMyWorkspacesViewModel,
	buildWorkspaceRoutePath,
	createLocalWorkspaceProvisioningDependencies,
	createMyWorkspacesDemoWorkspaces,
	createWorkspaceCapabilityService,
	createWorkspaceModalDefaults,
	prepareWorkspaceCreationInput,
	resolveWorkspaceCapabilityLabel,
	summarizeWorkspaceCreationResult
} from '../workspaces';
import {
	buildWorkspaceShellViewModel,
	applyPageMove,
	buildPageBodySaveRecord,
	buildPagePublishRecord,
	collectPageSubtreeSysIds,
	createDocseraShellDemoPages,
	createPageBodyEditorSession,
	clearPageBodyEditorSession,
	flushPageBodyEditorSession,
	getPageBodyEditorSession,
	getPageBodyEditorSessionSnapshot,
	getPageBodyEditorStatusLabel,
	hasPendingPageBodyEditorChanges,
	normalizePageBodyContentJson,
	resolvePagePublishingState,
	resolvePageBodyContentJson,
	PAGE_TREE_MAX_DEPTH,
	pickNextVisiblePageAfterDelete,
	removePageSubtree,
	validatePageMoveTarget,
	updatePageDraftSettings,
	validatePageSettingsSlug,
	validatePageSettingsTitle
} from '../pages';
import {
	PAGE_PUBLICATION_STATES,
	createPageDraft
} from '../pages/page-domain.js';
import {
	provisionWorkspace
} from '../workspaces/workspace-domain.js';
import styles from './styles.scss';

const {COMPONENT_RENDERED, COMPONENT_DISCONNECTED} = actionTypes;
const PAGE_EDITOR_AUTOSAVE_DELAY_MS = 900;

const CURRENT_USER_SYS_ID = 'user-docsera-launcher';

function createDemoAccessState() {
	return {
		roles: [
			WORKSPACE_CAPABILITY_ROLE_NAMES.workspaceAdmin,
			WORKSPACE_CAPABILITY_ROLE_NAMES.workspaceEditor
		],
		groups: [
			'group-product-admin',
			'group-support-editor'
		]
	};
}

function createWorkspaceCapabilitiesForDemo(accessState) {
	return createWorkspaceCapabilityService({
		hasRole: roleName => accessState.roles.includes(roleName),
		isMemberOfGroup: groupSysId => accessState.groups.includes(groupSysId)
	});
}

function createInitialState() {
	return {
		surfaceMode: 'shell',
		workspaceSearch: '',
		pageTreeSearch: '',
		selectedWorkspaceSlug: 'product-docs',
		selectedPageSlug: '',
		shellNavigationCollapsed: false,
		shellTheme: 'light',
		createModalOpen: false,
		createModalError: '',
		createModalBusy: false,
		createPageModalOpen: false,
		createPageModalError: '',
		createPageModalBusy: false,
		pageSettingsOpen: false,
		pageSettingsPageSysId: '',
		pageSettingsTitle: '',
		pageSettingsSlug: '',
		pageSettingsErrors: {
			title: '',
			slug: '',
			general: ''
		},
		pageSettingsActiveField: '',
		pageSettingsFieldSnapshot: {
			title: '',
			slug: ''
		},
		pageSettingsDeleteOpen: false,
		pageSettingsDeletePageSysId: '',
		pageSettingsDeleteError: '',
		pageTreeDrag: createPageTreeDragDefaults(),
		pageEditorPageSysId: '',
		pageEditorStatus: 'saved',
		pageEditorStatusLabel: 'Saved',
		pageEditorStatusDetail: '',
		pageEditorHasUnsavedChanges: false,
		pageEditorIsSaving: false,
		pageEditorIsFailed: false,
		pageEditorHasPendingSave: false,
		pagePublishPageSysId: '',
		pagePublishBusy: false,
		pagePublishError: '',
		workspaceStatus: 'Workspace shell is ready.',
		workspaces: createMyWorkspacesDemoWorkspaces(),
		pages: createDocseraShellDemoPages(),
		userAccess: createDemoAccessState(),
		newWorkspace: createWorkspaceModalDefaults(),
		newPage: createPageModalDefaults()
	};
}

function getWorkspaceBySlug(workspaces, workspaceSlug) {
	if (!workspaceSlug) {
		return null;
	}

	return workspaces.find(workspace => workspace.workspaceSlug === workspaceSlug) || null;
}

function renderIconGlyph(workspace) {
	const label = workspace && workspace.icon && workspace.icon.label ? workspace.icon.label : workspace.name;
	return cleanGlyph(label);
}

function cleanGlyph(value) {
	if (typeof value !== 'string') {
		return 'D';
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return 'D';
	}

	return trimmed.charAt(0).toUpperCase();
}

function resetNewWorkspaceForm() {
	return createWorkspaceModalDefaults();
}

function createPageModalDefaults(parentPage = null) {
	return {
		title: '',
		parentPageSysId: parentPage ? parentPage.sysId || '' : '',
		parentPageTitle: parentPage ? parentPage.title || '' : ''
	};
}

function createPageSettingsDefaults(page = null) {
	return {
		pageSysId: page ? page.sysId || '' : '',
		title: page ? page.draftTitle || page.publishedTitle || page.title || '' : '',
		slug: page ? page.draftSlug || page.publishedSlug || page.slug || page.pageSlug || '' : '',
		errors: {
			title: '',
			slug: '',
			general: ''
		},
		activeField: 'title',
		fieldSnapshot: {
			title: page ? page.draftTitle || page.publishedTitle || page.title || '' : '',
			slug: page ? page.draftSlug || page.publishedSlug || page.slug || page.pageSlug || '' : ''
		}
	};
}

function createPageDeleteDefaults(page = null) {
	return {
		open: false,
		pageSysId: page ? page.sysId || '' : '',
		error: ''
	};
}

function createPageTreeDragDefaults() {
	return {
		active: false,
		sourcePageSysId: '',
		sourcePageTitle: '',
		targetPageSysId: '',
		targetPlacement: '',
		targetValid: false,
		invalidReason: ''
	};
}

const pageEditorHostEntries = new WeakMap();
const pageEditorFailedDemoPages = new Set();
let pageEditorBeforeUnloadHandler = null;
let latestDocseraShellState = null;

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

function getPageEditorHostEntry(host) {
	if (!pageEditorHostEntries.has(host)) {
		pageEditorHostEntries.set(host, {
			view: null,
			editorElement: null,
			pageSysId: ''
		});
	}

	return pageEditorHostEntries.get(host);
}

function destroyPageEditorHostEntry(host) {
	const entry = pageEditorHostEntries.get(host);
	if (!entry) {
		return;
	}

	if (entry.view) {
		entry.view.destroy();
	}

	pageEditorHostEntries.delete(host);
}

function updatePageEditorUiState(updateState, snapshot, currentState = null) {
	if (typeof updateState !== 'function' || !snapshot) {
		return;
	}

	const current = currentState || latestDocseraShellState || {};
	if (
		current.pageEditorPageSysId === snapshot.pageSysId &&
		current.pageEditorStatus === snapshot.status &&
		current.pageEditorStatusLabel === snapshot.statusLabel &&
		current.pageEditorStatusDetail === (snapshot.error || (snapshot.isSaving
			? 'Autosaving body content...'
			: snapshot.hasPendingSave
				? 'Changes will autosave after a short idle delay.'
				: '')) &&
		current.pageEditorHasUnsavedChanges === snapshot.hasUnsavedChanges &&
		current.pageEditorIsSaving === snapshot.isSaving &&
		current.pageEditorIsFailed === snapshot.isFailed &&
		current.pageEditorHasPendingSave === snapshot.hasPendingSave
	) {
		return;
	}

	updateState({
		pageEditorPageSysId: snapshot.pageSysId,
		pageEditorStatus: snapshot.status,
		pageEditorStatusLabel: snapshot.statusLabel,
		pageEditorStatusDetail: snapshot.error || (snapshot.isSaving
			? 'Autosaving body content...'
			: snapshot.hasPendingSave
				? 'Changes will autosave after a short idle delay.'
				: ''),
		pageEditorHasUnsavedChanges: snapshot.hasUnsavedChanges,
		pageEditorIsSaving: snapshot.isSaving,
		pageEditorIsFailed: snapshot.isFailed,
		pageEditorHasPendingSave: snapshot.hasPendingSave
	});
}

function attachPageEditorBeforeUnloadGuard() {
	if (pageEditorBeforeUnloadHandler || typeof window === 'undefined') {
		return;
	}

	pageEditorBeforeUnloadHandler = event => {
		if (!hasPendingPageBodyEditorChanges()) {
			return;
		}

		event.preventDefault();
		event.returnValue = '';
		return '';
	};

	window.addEventListener('beforeunload', pageEditorBeforeUnloadHandler);
}

function createPageEditorSaveHandler(updateState, pageSysId) {
	return async ({contentJson}) => {
		const currentState = latestDocseraShellState || {};
		const currentPages = Array.isArray(currentState.pages) ? currentState.pages : [];
		const currentPage = findPageBySysId(currentPages, pageSysId);
		if (!currentPage) {
			throw new Error('The selected page could not be saved.');
		}

		if (currentPage.draftBodyAutosaveFailureMode === 'fail-once' && !pageEditorFailedDemoPages.has(pageSysId)) {
			pageEditorFailedDemoPages.add(pageSysId);
			throw new Error('Simulated demo save failure.');
		}

		const updatedPage = buildPageBodySaveRecord(currentPage, contentJson);
		const nextPages = currentPages.map(page => (page && page.sysId === pageSysId ? {
			...page,
			...updatedPage,
			sysId: page.sysId
		} : page));

		updateState({
			pages: nextPages,
			workspaceStatus: `Autosaved body content for ${updatedPage.draftTitle || updatedPage.publishedTitle || 'page'}.`
		});

		return updatedPage;
	};
}

function ensurePageBodyEditorSession(page, updateState) {
	if (!page || typeof updateState !== 'function') {
		return null;
	}

	const session = getPageBodyEditorSession(page.sysId, {
		initialContentJson: resolvePageBodyContentJson(page, true),
		autosaveDelayMs: PAGE_EDITOR_AUTOSAVE_DELAY_MS,
		savePageBodyContent: createPageEditorSaveHandler(updateState, page.sysId),
		onChange: snapshot => updatePageEditorUiState(updateState, snapshot, latestDocseraShellState)
	});

	updatePageEditorUiState(updateState, session.getSnapshot(), latestDocseraShellState);
	return session;
}

function renderPageBodyEditorSurface({shell, state, onPublish}) {
	if (!shell.selectedPage || !shell.canEditPageBody) {
		return null;
	}

	const publicationState = resolvePagePublishingState(shell.selectedPage);
	const bodySessionSnapshot = getPageBodyEditorSessionSnapshot(shell.selectedPage.sysId);
	const hasLocalBodyChanges = Boolean(
		bodySessionSnapshot &&
		(
			bodySessionSnapshot.hasUnsavedChanges ||
			bodySessionSnapshot.isSaving ||
			bodySessionSnapshot.hasPendingSave ||
			bodySessionSnapshot.isFailed
		)
	);
	const hasLocalPageSettingsChanges = Boolean(
		state.pageSettingsOpen &&
		state.pageSettingsPageSysId === shell.selectedPage.sysId &&
		(
			state.pageSettingsTitle !== (shell.selectedPage.draftTitle || shell.selectedPage.publishedTitle || shell.selectedPage.title || '') ||
			state.pageSettingsSlug !== (shell.selectedPage.draftSlug || shell.selectedPage.publishedSlug || shell.selectedPage.slug || shell.selectedPage.pageSlug || '')
		)
	);
	const hasLocalPublishChanges = hasLocalBodyChanges || hasLocalPageSettingsChanges;
	const isPublishingSelectedPage = state.pagePublishBusy && state.pagePublishPageSysId === shell.selectedPage.sysId;
	const statusClass = `docsera-shell__editor-status-chip docsera-shell__editor-status-chip--${state.pageEditorStatus || 'saved'}`;
	const publicationBadgeLabel = shell.selectedPage.publicationState === PAGE_PUBLICATION_STATES.draft
		? 'Draft'
		: (publicationState.hasUnpublishedChanges || hasLocalPublishChanges)
			? 'Unpublished changes'
			: 'Published';
	const publicationBadgeClass = shell.selectedPage.publicationState === PAGE_PUBLICATION_STATES.draft
		? 'docsera-shell__page-badge docsera-shell__page-badge--draft'
		: publicationBadgeLabel === 'Unpublished changes'
			? 'docsera-shell__page-badge docsera-shell__page-badge--changes'
			: 'docsera-shell__page-badge docsera-shell__page-badge--published';
	const publishButtonLabel = isPublishingSelectedPage
		? 'Publishing...'
		: (publicationState.canPublish || hasLocalPublishChanges)
			? publicationState.publicationState === PAGE_PUBLICATION_STATES.draft
				? 'Publish draft'
				: 'Publish changes'
			: 'No changes to publish';
	const publishButtonDisabled = state.pagePublishBusy || (!publicationState.canPublish && !hasLocalPublishChanges);

	return (
		<section className="docsera-shell__editor-shell" aria-labelledby="docsera-body-editor-title">
			<div className="docsera-shell__reader-content-head docsera-shell__editor-head">
				<div>
					<p className="docsera-shell__rail-title">Body editor</p>
					<div className="docsera-shell__reader-title-row">
						<h1 id="docsera-body-editor-title" className="docsera-shell__reader-title">{shell.selectedPage.title}</h1>
						<span className={publicationBadgeClass}>{publicationState.publicationStatusLabel}</span>
					</div>
					<p className="docsera-shell__reader-lede">
						Edit the body content here. Title and slug remain in Page Settings until you publish.
					</p>
				</div>
				<div className="docsera-shell__editor-actions">
					<span className="docsera-shell__toolbar-chip">{shell.routeTargetPath}</span>
					<button
						type="button"
						className="docsera-shell__button"
						on-click={state.pagePublishBusy ? undefined : event => {
							event.preventDefault();
							if (typeof onPublish === 'function') {
								onPublish();
							}
						}}
						disabled={publishButtonDisabled}
					>
						{publishButtonLabel}
					</button>
					<span className={statusClass} title={state.pageEditorStatusDetail || state.pageEditorStatusLabel} aria-live="polite" aria-atomic="true">
						{state.pageEditorStatusLabel || getPageBodyEditorStatusLabel(state.pageEditorStatus)}
					</span>
				</div>
			</div>

			<div className="docsera-shell__editor-frame">
				<div
					className="docsera-shell__editor-surface"
					data-docsera-page-editor="primary"
					data-page-sys-id={shell.selectedPage.sysId}
					aria-label={`Body editor for ${shell.selectedPage.title}`}
				/>
				<div className="docsera-shell__editor-help">
					<div className="docsera-shell__editor-help-copy">Autosaves after a short idle delay. Leave the page with unsaved changes to trigger a warning.</div>
					{state.pageEditorIsFailed ? (
						<div className="docsera-shell__editor-error" role="alert">
							{state.pageEditorStatusDetail || 'Save failed. Your local changes are still available.'}
						</div>
					) : state.pageEditorHasPendingSave ? (
						<div className="docsera-shell__editor-note">Saving will complete automatically before you navigate away where practical.</div>
					) : null}
					{state.pagePublishError && state.pagePublishPageSysId === shell.selectedPage.sysId ? (
						<div className="docsera-shell__editor-error" role="alert">
							{state.pagePublishError}
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}

function ensurePageBodyEditorHost(host, state, updateState, shell) {
	if (!host || !shell || !shell.selectedPage || !shell.canEditPageBody) {
		destroyPageEditorHostEntry(host);
		return;
	}

	const editorElement = host.shadowRoot
		? host.shadowRoot.querySelector('[data-docsera-page-editor="primary"]')
		: null;
	if (!editorElement) {
		destroyPageEditorHostEntry(host);
		return;
	}

	attachPageEditorBeforeUnloadGuard();
	const session = ensurePageBodyEditorSession(shell.selectedPage, updateState);
	if (!session) {
		return;
	}

	const snapshot = session.getSnapshot();
	const entry = getPageEditorHostEntry(host);
	const needsNewView = !entry.view || entry.editorElement !== editorElement || entry.pageSysId !== shell.selectedPage.sysId;
	if (needsNewView && entry.view) {
		entry.view.destroy();
		entry.view = null;
	}

	entry.editorElement = editorElement;
	entry.pageSysId = shell.selectedPage.sysId;

	if (!entry.view) {
		entry.view = new EditorView(editorElement, {
			state: createPageEditorState(snapshot.contentJson),
			dispatchTransaction(transaction) {
				const view = entry.view;
				if (!view) {
					return;
				}

				const nextEditorState = view.state.apply(transaction);
				view.updateState(nextEditorState);

				if (transaction.docChanged) {
					session.recordContentChange(nextEditorState.doc.toJSON());
				}
			}
		});
	}

	const currentContentJson = entry.view.state.doc.toJSON();
	if (!samePageEditorContent(currentContentJson, snapshot.contentJson)) {
		entry.view.updateState(createPageEditorState(snapshot.contentJson));
	}

	entry.view.setProps({
		editable: () => true
	});
}

function resetCreatePageForm(parentPage = null) {
	return createPageModalDefaults(parentPage);
}

function getWorkspacePagesForCreation(pages, workspaceSysId) {
	return (Array.isArray(pages) ? pages : []).filter(page => page && page.workspaceSysId === workspaceSysId);
}

function findPageBySysId(pages, sysId) {
	if (!sysId) {
		return null;
	}

	return (Array.isArray(pages) ? pages : []).find(page => page && page.sysId === sysId) || null;
}

function createLocalPageSysId(workspaceSlug, pageSlug) {
	const toKey = value => {
		if (typeof value !== 'string') {
			return 'page';
		}

		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.replace(/-{2,}/g, '-') || 'page';
	};

	const safeWorkspaceSlug = toKey(workspaceSlug || 'workspace');
	const safePageSlug = toKey(pageSlug || 'page');
	return `page-${safeWorkspaceSlug}-${safePageSlug}-${Date.now().toString(36)}`;
}

function buildPageTreeDragGhost(pageTitle) {
	const ghost = document.createElement('div');
	ghost.className = 'docsera-shell__tree-drag-ghost';

	const title = document.createElement('div');
	title.className = 'docsera-shell__tree-drag-ghost-title';
	title.textContent = pageTitle || 'Page';
	ghost.appendChild(title);

	const meta = document.createElement('div');
	meta.className = 'docsera-shell__tree-drag-ghost-meta';
	meta.textContent = 'Move page';
	ghost.appendChild(meta);

	document.body.appendChild(ghost);
	return ghost;
}

function resolvePageTreeRowPlacement(rowRect, clientY) {
	if (!rowRect) {
		return 'inside';
	}

	const relativeY = Math.max(0, clientY - rowRect.top);
	const rowHeight = Math.max(1, rowRect.height || 1);

	if (relativeY <= rowHeight * 0.25) {
		return 'before';
	}

	if (relativeY >= rowHeight * 0.75) {
		return 'after';
	}

	return 'inside';
}

function resolvePageTreeDropTarget(treeElement, {
	clientX = 0,
	clientY = 0,
	sourcePageSysId = '',
	pages = []
} = {}) {
	if (!treeElement || typeof treeElement.querySelectorAll !== 'function' || !Array.isArray(pages) || !pages.length) {
		return {
			targetPageSysId: '',
			targetPlacement: '',
			targetValid: false,
			invalidReason: ''
		};
	}

	const rowElements = Array.from(treeElement.querySelectorAll('[data-docsera-page-row="true"]'));
	const rows = rowElements
		.map(rowElement => ({
			rowElement,
			pageSysId: rowElement.dataset.pageSysId || '',
			rect: rowElement.getBoundingClientRect()
		}))
		.filter(row => row.pageSysId);

	if (!rows.length) {
		return {
			targetPageSysId: '',
			targetPlacement: '',
			targetValid: false,
			invalidReason: ''
		};
	}

	const elementHits = Array.from(document.elementsFromPoint(clientX, clientY));
	const directRowElement = elementHits
		.map(hit => (hit && typeof hit.closest === 'function' ? hit.closest('[data-docsera-page-row="true"]') : null))
		.find(Boolean);
	const directRow = directRowElement
		? rows.find(row => row.rowElement === directRowElement) || null
		: null;

	const tryResolveTarget = row => {
		if (!row) {
			return null;
		}

		const targetPlacement = resolvePageTreeRowPlacement(row.rect, clientY);
		const validation = validatePageMoveTarget(pages, sourcePageSysId, row.pageSysId, targetPlacement, PAGE_TREE_MAX_DEPTH);
		return {
			targetPageSysId: row.pageSysId,
			targetPlacement,
			targetValid: validation.valid,
			invalidReason: validation.valid ? '' : validation.error
		};
	};

	if (directRow) {
		return tryResolveTarget(directRow);
	}

	const nearestRow = rows
		.map(row => {
			const distance = clientY < row.rect.top
				? row.rect.top - clientY
				: clientY > row.rect.bottom
					? clientY - row.rect.bottom
					: 0;

			return {
				...row,
				distance
			};
		})
		.sort((left, right) => left.distance - right.distance || left.rect.top - right.rect.top || left.rect.left - right.rect.left)[0];

	if (!nearestRow) {
		return {
			targetPageSysId: '',
			targetPlacement: '',
			targetValid: false,
			invalidReason: ''
		};
	}

	for (const candidate of rows
		.map(row => {
			const distance = clientY < row.rect.top
				? row.rect.top - clientY
				: clientY > row.rect.bottom
					? clientY - row.rect.bottom
					: 0;

			return {
				...row,
				distance
			};
		})
		.sort((left, right) => left.distance - right.distance || left.rect.top - right.rect.top || left.rect.left - right.rect.left)) {
		const targetPlacement = resolvePageTreeRowPlacement(candidate.rect, clientY);
		const validation = validatePageMoveTarget(pages, sourcePageSysId, candidate.pageSysId, targetPlacement, PAGE_TREE_MAX_DEPTH);
		if (validation.valid) {
			return {
				targetPageSysId: candidate.pageSysId,
				targetPlacement,
				targetValid: true,
				invalidReason: ''
			};
		}
	}

	const fallbackPlacement = resolvePageTreeRowPlacement(nearestRow.rect, clientY);
	const fallbackValidation = validatePageMoveTarget(pages, sourcePageSysId, nearestRow.pageSysId, fallbackPlacement, PAGE_TREE_MAX_DEPTH);
	return {
		targetPageSysId: nearestRow.pageSysId,
		targetPlacement: fallbackPlacement,
		targetValid: false,
		invalidReason: fallbackValidation.error
	};
}

function renderPageTreeNodes(nodes, {
	selectPage,
	openPageSettings,
	createChildPage,
	selectedPageSlug,
	pageSettingsPageSysId,
	canCreatePages,
	canManagePageSettings,
	canDragPages,
	pageTreeDrag,
	startPageTreeDrag,
	handlePageTreeDragEnd
}) {
	if (!Array.isArray(nodes) || nodes.length === 0) {
		return null;
	}

	return (
		<ul className="docsera-shell__tree-list" role="list">
			{nodes.map(node => (
				<li key={node.sysId} className="docsera-shell__tree-item">
					<div
						className={`docsera-shell__tree-row-surface${canDragPages ? ' docsera-shell__tree-row-surface--draggable' : ''}${pageTreeDrag.active && pageTreeDrag.sourcePageSysId === node.sysId ? ' docsera-shell__tree-row-surface--dragging' : ''}${pageTreeDrag.active && pageTreeDrag.targetPageSysId === node.sysId && pageTreeDrag.targetValid ? ` docsera-shell__tree-row-surface--drop-${pageTreeDrag.targetPlacement}` : ''}${pageTreeDrag.active && pageTreeDrag.targetPageSysId === node.sysId && !pageTreeDrag.targetValid ? ' docsera-shell__tree-row-surface--drop-invalid' : ''}${node.pageSlug === selectedPageSlug ? ' docsera-shell__tree-row-surface--selected' : ''}`}
						data-docsera-page-row="true"
						data-page-sys-id={node.sysId}
						draggable={canDragPages}
						aria-grabbed={pageTreeDrag.active && pageTreeDrag.sourcePageSysId === node.sysId ? 'true' : 'false'}
						on-dragstart={event => startPageTreeDrag(node, event)}
						on-dragend={handlePageTreeDragEnd}
					>
						{canDragPages ? (
							<span className="docsera-shell__tree-drag-handle" aria-hidden="true">⋮⋮</span>
						) : null}
						<button
							type="button"
							className={`docsera-shell__tree-button${node.pageSlug === selectedPageSlug ? ' docsera-shell__tree-button--selected' : ''}`}
							on-click={event => {
								event.stopPropagation();
								void selectPage(node);
							}}
						>
							<span className="docsera-shell__tree-button-title">{node.title}</span>
							<span className="docsera-shell__tree-button-meta">
								{node.isDraft ? (
									<span className="docsera-shell__page-badge docsera-shell__page-badge--draft">Draft</span>
								) : null}
								{node.hasChildren ? (
									<span className="docsera-shell__tree-button-count">{node.children.length}</span>
								) : null}
							</span>
						</button>
						{canManagePageSettings ? (
							<button
								type="button"
								className={`docsera-shell__tree-action docsera-shell__tree-action--settings${node.sysId === pageSettingsPageSysId ? ' docsera-shell__tree-action--active' : ''}`}
								aria-label={node.sysId === pageSettingsPageSysId ? `Collapse settings for ${node.title}` : `Open settings for ${node.title}`}
								on-click={event => {
									event.stopPropagation();
									void openPageSettings(node);
								}}
							>
								<span aria-hidden="true">{node.sysId === pageSettingsPageSysId ? 'Close' : 'Settings'}</span>
							</button>
						) : null}
						{canCreatePages ? (
							<button
								type="button"
								className="docsera-shell__tree-action"
								on-click={event => {
									event.stopPropagation();
									createChildPage(node);
								}}
								>
								New child
							</button>
						) : null}
					</div>
					{node.children.length ? renderPageTreeNodes(node.children, {
						selectPage,
						openPageSettings,
						createChildPage,
						selectedPageSlug,
						pageSettingsPageSysId,
						canCreatePages,
						canManagePageSettings,
						canDragPages,
						pageTreeDrag,
						startPageTreeDrag,
						handlePageTreeDragEnd
					}) : null}
				</li>
			))}
		</ul>
	);
}

function renderBreadcrumbs(breadcrumbs, selectBreadcrumb) {
	if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) {
		return null;
	}

	return (
		<nav className="docsera-shell__breadcrumbs" aria-label="Breadcrumb">
			<ol className="docsera-shell__breadcrumb-list">
				{breadcrumbs.map((crumb, index) => {
					const isLast = index === breadcrumbs.length - 1;
					const label = crumb.label || '';

					return (
						<li key={`${crumb.pageSlug || 'root'}-${index}`} className="docsera-shell__breadcrumb-item">
							{isLast ? (
								<span className="docsera-shell__breadcrumb-current">{label}</span>
							) : (
								<button
								type="button"
								className="docsera-shell__breadcrumb-link"
								on-click={() => void selectBreadcrumb(crumb)}
							>
									{label}
								</button>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

function renderTableOfContents(items, selectedPage) {
	return (
		<div className="docsera-shell__toc-panel">
			<div className="docsera-shell__rail-title">Table of contents</div>
			<h2 className="docsera-shell__toc-title">On this page</h2>
			{items.length ? (
				<ul className="docsera-shell__toc-list">
					{items.map(item => (
						<li key={item.id} className={`docsera-shell__toc-item docsera-shell__toc-item--level-${item.level}`}>
							<a href={`#${item.id}`} className="docsera-shell__toc-link">
								{item.label}
							</a>
						</li>
					))}
				</ul>
			) : (
				<div className="docsera-shell__toc-empty">
					{selectedPage ? 'This page does not expose headings yet.' : 'Select a page to see headings here.'}
				</div>
			)}
		</div>
	);
}

function renderPageCreationModal({
	state,
	canCreatePages,
	workspaceName,
	workspaceSlug,
	workspacePages,
	createPage,
	closeCreatePageModal,
	updateCreateField
}) {
	if (!state.createPageModalOpen || !canCreatePages) {
		return null;
	}

	const selectedParent = state.newPage.parentPageSysId
		? findPageBySysId(workspacePages, state.newPage.parentPageSysId)
		: null;
	const parentLabel = selectedParent ? selectedParent.draftTitle || selectedParent.publishedTitle || 'Parent page' : 'Root page';

	return (
		<div className="docsera-shell__modal-backdrop" role="presentation" on-click={closeCreatePageModal}>
			<div
				className="docsera-shell__modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="docsera-create-page-title"
				on-click={event => event.stopPropagation()}
			>
				<form className="docsera-shell__modal-form" on-submit={createPage}>
					<div className="docsera-shell__modal-head">
						<div>
							<p className="docsera-shell__rail-title">New page</p>
							<h2 id="docsera-create-page-title">Create page in {workspaceName}</h2>
						</div>
						<button type="button" className="docsera-shell__icon-button" on-click={closeCreatePageModal}>
							Close
						</button>
					</div>

					<p className="docsera-shell__modal-copy">
						Pages start as drafts. Root pages are created at the workspace root and child pages attach to the selected parent.
					</p>

					<label className="docsera-shell__field">
						<span className="docsera-shell__field-label">Page title</span>
						<input
							type="text"
							value={state.newPage.title}
							placeholder="e.g. Release checklist"
							aria-required="true"
							on-input={event => updateCreateField('title', event.target.value)}
						/>
					</label>

					<div className="docsera-shell__field">
						<span className="docsera-shell__field-label">Parent page</span>
						<div className="docsera-shell__page-parent">
							<div className="docsera-shell__page-parent-label">{parentLabel}</div>
							<div className="docsera-shell__page-parent-copy">
								{selectedParent ? `/docsera/${workspaceSlug}/${selectedParent.draftSlug || selectedParent.publishedSlug || selectedParent.pageSlug}` : 'This page will be created at the workspace root.'}
							</div>
						</div>
					</div>

					{state.createPageModalError ? (
						<div className="docsera-shell__modal-error" role="alert">
							{state.createPageModalError}
						</div>
					) : null}

					<div className="docsera-shell__modal-actions">
						<button
							type="button"
							className="docsera-shell__button docsera-shell__button--secondary"
							on-click={closeCreatePageModal}
							disabled={state.createPageModalBusy}
						>
							Cancel
						</button>
						<button
							type="submit"
							className="docsera-shell__button"
							disabled={state.createPageModalBusy}
						>
							{state.createPageModalBusy ? 'Creating...' : 'Create page'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

function renderPageSettingsOverlay({
	state,
	page,
	canManagePageSettings,
	workspacePages,
	workspaceName,
	workspaceSlug,
	closePageSettingsPanel,
	startPageSettingsField,
	finishPageSettingsField,
	cancelPageSettingsField,
	updatePageSettingsField,
	openDeletePageConfirmation,
	handlePageSettingsKeydown
}) {
	if (!state.pageSettingsOpen || !page || !canManagePageSettings) {
		return null;
	}

	const pageTitle = page.draftTitle || page.publishedTitle || page.title || 'Untitled page';
	const pageSlug = page.draftSlug || page.publishedSlug || page.slug || page.pageSlug || '';
	const hasDescendants = collectPageSubtreeSysIds(workspacePages, page.sysId).length > 1;

	return (
		<aside
			className="docsera-shell__page-settings"
			role="complementary"
			aria-labelledby="docsera-page-settings-title"
			on-click={event => event.stopPropagation()}
			on-keydown={handlePageSettingsKeydown}
		>
			<div className="docsera-shell__page-settings-head">
				<div>
					<p className="docsera-shell__rail-title">Page Settings</p>
					<h2 id="docsera-page-settings-title">Page Settings</h2>
				</div>
				<button type="button" className="docsera-shell__icon-button" on-click={() => closePageSettingsPanel()}>
					Close
				</button>
			</div>

			<div className="docsera-shell__page-settings-context">
				<div className="docsera-shell__page-settings-context-title">{pageTitle}</div>
				<div className="docsera-shell__page-settings-context-meta">
					{workspaceName}
					<span aria-hidden="true">/</span>
					<span>{workspaceSlug}</span>
					<span aria-hidden="true">/</span>
					<span>{pageSlug}</span>
				</div>
			</div>

			{state.pageSettingsErrors.general ? (
				<div className="docsera-shell__page-settings-error" role="alert">
					{state.pageSettingsErrors.general}
				</div>
			) : null}

			<div className="docsera-shell__page-settings-rows">
				<div className="docsera-shell__page-settings-row">
					<div className="docsera-shell__page-settings-row-label">
						<span className="docsera-shell__page-settings-row-icon" aria-hidden="true">T</span>
						<span>Title</span>
					</div>
					<div className="docsera-shell__page-settings-row-body">
						{state.pageSettingsActiveField === 'title' ? (
							<input
								type="text"
								className={`docsera-shell__page-settings-input${state.pageSettingsErrors.title ? ' docsera-shell__page-settings-input--invalid' : ''}`}
								value={state.pageSettingsTitle}
								aria-invalid={state.pageSettingsErrors.title ? 'true' : 'false'}
								autoFocus={true}
								on-input={event => updatePageSettingsField('title', event.target.value)}
								on-blur={() => finishPageSettingsField('title')}
								on-keydown={event => {
									if (event.key === 'Enter') {
										event.preventDefault();
										event.stopPropagation();
										finishPageSettingsField('title');
									}

									if (event.key === 'Escape') {
										event.preventDefault();
										event.stopPropagation();
										cancelPageSettingsField('title');
									}
								}}
							/>
						) : (
							<button
								type="button"
								className="docsera-shell__page-settings-value"
								on-click={event => {
									event.stopPropagation();
									startPageSettingsField('title');
								}}
							>
								{state.pageSettingsTitle || 'Untitled page'}
							</button>
						)}
						{state.pageSettingsErrors.title ? (
							<div className="docsera-shell__page-settings-field-error" role="alert">
								{state.pageSettingsErrors.title}
							</div>
						) : null}
					</div>
				</div>

				<div className="docsera-shell__page-settings-row">
					<div className="docsera-shell__page-settings-row-label">
						<span className="docsera-shell__page-settings-row-icon" aria-hidden="true">#</span>
						<span>Slug</span>
					</div>
					<div className="docsera-shell__page-settings-row-body">
						{state.pageSettingsActiveField === 'slug' ? (
							<input
								type="text"
								className={`docsera-shell__page-settings-input${state.pageSettingsErrors.slug ? ' docsera-shell__page-settings-input--invalid' : ''}`}
								value={state.pageSettingsSlug}
								aria-invalid={state.pageSettingsErrors.slug ? 'true' : 'false'}
								on-input={event => updatePageSettingsField('slug', event.target.value)}
								on-blur={() => finishPageSettingsField('slug')}
								on-keydown={event => {
									if (event.key === 'Enter') {
										event.preventDefault();
										event.stopPropagation();
										finishPageSettingsField('slug');
									}

									if (event.key === 'Escape') {
										event.preventDefault();
										event.stopPropagation();
										cancelPageSettingsField('slug');
									}
								}}
							/>
						) : (
							<button
								type="button"
								className="docsera-shell__page-settings-value"
								on-click={event => {
									event.stopPropagation();
									startPageSettingsField('slug');
								}}
							>
								{state.pageSettingsSlug || 'page-slug'}
							</button>
						)}
						{state.pageSettingsErrors.slug ? (
							<div className="docsera-shell__page-settings-field-error" role="alert">
								{state.pageSettingsErrors.slug}
							</div>
						) : null}
					</div>
				</div>
			</div>

			<section className="docsera-shell__page-settings-danger">
				<div>
					<p className="docsera-shell__rail-title">Danger zone</p>
					<p className="docsera-shell__page-settings-danger-copy">
						Delete this page and its descendants from the authoring tree.
					</p>
					{hasDescendants ? (
						<p className="docsera-shell__page-settings-danger-copy">
							This page has child pages. Deleting it will also delete the nested child pages and their contents.
						</p>
					) : null}
				</div>
				<button
					type="button"
					className="docsera-shell__button docsera-shell__button--destructive"
					on-click={() => openDeletePageConfirmation(page)}
				>
					Delete page
				</button>
			</section>
		</aside>
	);
}

function renderDeletePageConfirmationDialog({
	state,
	page,
	canManagePageSettings,
	workspacePages,
	closeDeletePageConfirmation,
	confirmDeletePage
}) {
	if (!state.pageSettingsDeleteOpen || !page || !canManagePageSettings) {
		return null;
	}

	const subtreeIds = collectPageSubtreeSysIds(workspacePages, page.sysId);
	const hasChildren = subtreeIds.length > 1;

	return (
		<div className="docsera-shell__modal-backdrop" role="presentation" on-click={closeDeletePageConfirmation}>
			<div
				className="docsera-shell__modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="docsera-delete-page-title"
				on-click={event => event.stopPropagation()}
			>
				<div className="docsera-shell__modal-form">
					<div className="docsera-shell__modal-head">
						<div>
							<p className="docsera-shell__rail-title">Delete page</p>
							<h2 id="docsera-delete-page-title">Delete {page.draftTitle || page.publishedTitle || page.title || 'page'}?</h2>
						</div>
						<button type="button" className="docsera-shell__icon-button" on-click={closeDeletePageConfirmation}>
							Close
						</button>
					</div>

					<p className="docsera-shell__modal-copy">
						This will permanently delete this page.
					</p>

					{hasChildren ? (
						<p className="docsera-shell__modal-copy docsera-shell__modal-copy--warning">
							All child pages and content inside this page will also be deleted.
						</p>
					) : null}

					{state.pageSettingsDeleteError ? (
						<div className="docsera-shell__modal-error" role="alert">
							{state.pageSettingsDeleteError}
						</div>
					) : null}

					<div className="docsera-shell__modal-actions">
						<button
							type="button"
							className="docsera-shell__button docsera-shell__button--secondary"
							on-click={closeDeletePageConfirmation}
						>
							Cancel
						</button>
						<button
							type="button"
							className="docsera-shell__button docsera-shell__button--destructive"
							on-click={confirmDeletePage}
						>
							Delete page
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function renderWorkspaceReaderSurface(state, shell, updateState) {
	const currentEditorPage = shell.canEditPageBody && shell.selectedPage ? shell.selectedPage : null;
	const currentEditorSession = currentEditorPage
		? ensurePageBodyEditorSession(currentEditorPage, updateState)
		: null;

	const confirmSafePageEditorNavigation = async () => {
		if (!currentEditorSession) {
			return true;
		}

		const snapshotBeforeFlush = currentEditorSession.getSnapshot();
		if (snapshotBeforeFlush.hasPendingSave || snapshotBeforeFlush.isSaving) {
			try {
				await currentEditorSession.flushAutosave('navigation');
			} catch (error) {
				// Fall through to the warning prompt below.
			}
		}

		const snapshot = currentEditorSession.getSnapshot();
		if (!snapshot.hasUnsavedChanges && !snapshot.isFailed && !snapshot.hasPendingSave && !snapshot.isSaving) {
			return true;
		}

		const shouldLeave = window.confirm(
			snapshot.isFailed
				? 'Autosave failed. Leave this page and keep the local changes in this browser session?'
				: 'You have unsaved changes. Leave this page and keep editing later?'
		);

		if (shouldLeave) {
			currentEditorSession.suspendAutosave();
		}

		return shouldLeave;
	};

	const selectWorkspaceFromLauncher = async workspace => {
		if (!workspace) {
			return;
		}

		if (!(await confirmSafePageEditorNavigation())) {
			return;
		}

		const nextShell = buildWorkspaceShellViewModel({
			workspaces: state.workspaces,
			pages: state.pages,
			capabilityService: createWorkspaceCapabilitiesForDemo(state.userAccess),
			selectedWorkspaceSlug: workspace.workspaceSlug,
			selectedPageSlug: ''
		});

			updateState({
				surfaceMode: 'shell',
				selectedWorkspaceSlug: workspace.workspaceSlug,
				selectedPageSlug: nextShell.firstVisiblePageSlug || '',
				pageTreeSearch: '',
				shellNavigationCollapsed: false,
				workspaceStatus: nextShell.status === 'empty-workspace'
					? `${workspace.name} opened with no visible pages.`
				: `Opened ${workspace.name} at ${nextShell.routeTargetPath}`
		});
	};

	const openWorkspaceLauncher = async () => {
		if (!(await confirmSafePageEditorNavigation())) {
			return;
		}

		updateState({
			surfaceMode: 'launcher',
			workspaceStatus: 'My Workspaces is the launcher entry point for Docsera.'
		});
	};

	const selectPage = async page => {
		if (!page || !shell.workspace) {
			return;
		}

		if (shell.selectedPage && shell.selectedPage.sysId === page.sysId) {
			return;
		}

		if (!(await confirmSafePageEditorNavigation())) {
			return;
		}

		const currentSettingsPage = getPageSettingsPage();
		const isCurrentSettingsPage = Boolean(
			state.pageSettingsOpen &&
			currentSettingsPage &&
			shell.selectedPage &&
			currentSettingsPage.sysId === shell.selectedPage.sysId &&
			currentSettingsPage.sysId === page.sysId
		);

		if (state.pageSettingsOpen) {
			if (!closePageSettingsPanel({nextSelectedPageSlug: page.pageSlug})) {
				return;
			}

			if (isCurrentSettingsPage) {
				return;
			}
		}

		updateState({
			selectedWorkspaceSlug: shell.workspace.workspaceSlug,
			selectedPageSlug: page.pageSlug,
			workspaceStatus: `Selected ${page.title} at ${shell.workspace.workspaceSlug}/${page.pageSlug}`
		});
	};

	const selectBreadcrumb = async crumb => {
		if (!crumb || !shell.workspace) {
			return;
		}

		if (!(await confirmSafePageEditorNavigation())) {
			return;
		}

		const currentSettingsPage = getPageSettingsPage();
		const isCurrentSettingsPageBreadcrumb = Boolean(
			state.pageSettingsOpen &&
			currentSettingsPage &&
			shell.selectedPage &&
			currentSettingsPage.sysId === shell.selectedPage.sysId &&
			crumb.pageSlug === shell.selectedPageSlug
		);

		if (state.pageSettingsOpen) {
			if (!closePageSettingsPanel({nextSelectedPageSlug: crumb.pageSlug})) {
				return;
			}

			if (isCurrentSettingsPageBreadcrumb) {
				return;
			}
		}

		updateState({
			selectedWorkspaceSlug: shell.workspace.workspaceSlug,
			selectedPageSlug: crumb.pageSlug,
			workspaceStatus: `Selected ${crumb.label} from breadcrumbs.`
		});
	};

	const toggleNav = () => updateState({
		shellNavigationCollapsed: !state.shellNavigationCollapsed
	});

	const toggleTheme = () => updateState({
		shellTheme: state.shellTheme === 'dark' ? 'light' : 'dark'
	});

	const canManagePageSettings = Boolean(shell.canShowAuthoringControls && shell.workspace);
	const getPageSettingsPage = () => (
		state.pageSettingsPageSysId
			? findPageBySysId(shell.allPages, state.pageSettingsPageSysId)
			: null
	);
	const clearPageSettingsErrors = () => ({
		title: '',
		slug: '',
		general: ''
	});
	const clearPageSettingsState = () => ({
		pageSettingsOpen: false,
		pageSettingsPageSysId: '',
		pageSettingsTitle: '',
		pageSettingsSlug: '',
		pageSettingsErrors: clearPageSettingsErrors(),
		pageSettingsActiveField: '',
		pageSettingsFieldSnapshot: {
			title: '',
			slug: ''
		},
		pageSettingsDeleteOpen: false,
		pageSettingsDeletePageSysId: '',
		pageSettingsDeleteError: ''
	});
	const resetPageSettingsFields = page => {
		const defaults = createPageSettingsDefaults(page || null);
		updateState({
			pageSettingsOpen: Boolean(page),
			pageSettingsPageSysId: defaults.pageSysId,
			pageSettingsTitle: defaults.title,
			pageSettingsSlug: defaults.slug,
			pageSettingsErrors: clearPageSettingsErrors(),
			pageSettingsActiveField: defaults.activeField,
			pageSettingsFieldSnapshot: defaults.fieldSnapshot,
			pageSettingsDeleteOpen: false,
			pageSettingsDeletePageSysId: '',
			pageSettingsDeleteError: ''
		});
	};
	const closePageSettingsPanel = ({nextSelectedPageSlug = null} = {}) => {
		if (!state.pageSettingsOpen) {
			return true;
		}

		const currentPage = getPageSettingsPage();
		if (!currentPage) {
			updateState(clearPageSettingsState());
			return true;
		}

		const titleValidation = validatePageSettingsTitle(state.pageSettingsTitle);
		const slugValidation = validatePageSettingsSlug(
			state.pageSettingsSlug,
			state.pages,
			shell.workspace ? shell.workspace.sysId : '',
			currentPage.sysId
		);

		if (!titleValidation.valid || !slugValidation.valid) {
			updateState({
				pageSettingsErrors: {
					title: titleValidation.valid ? '' : titleValidation.error,
					slug: slugValidation.valid ? '' : slugValidation.error,
					general: ''
				},
				pageSettingsActiveField: !titleValidation.valid ? 'title' : 'slug'
			});
			return false;
		}

		const savedPage = updatePageDraftSettings(currentPage, {
			title: titleValidation.value,
			slug: slugValidation.value
		});
		const nextPages = state.pages.map(page => (
			page && page.sysId === currentPage.sysId ? savedPage : page
		));
		const selectedSlug = nextSelectedPageSlug !== null ? nextSelectedPageSlug : savedPage.draftSlug;

		updateState({
			pages: nextPages,
			selectedWorkspaceSlug: shell.workspace ? shell.workspace.workspaceSlug : state.selectedWorkspaceSlug,
			selectedPageSlug: selectedSlug,
			...clearPageSettingsState(),
			pageSettingsDeleteOpen: false,
			pageSettingsDeletePageSysId: '',
			pageSettingsDeleteError: '',
			workspaceStatus: `Saved page settings for ${savedPage.draftTitle}.`
		});

		return true;
	};
	const startPageSettingsField = field => {
		if (!canManagePageSettings || !state.pageSettingsOpen) {
			return;
		}

		if (state.pageSettingsActiveField && state.pageSettingsActiveField !== field) {
			if (!finishPageSettingsField(state.pageSettingsActiveField)) {
				return;
			}
		}

		const currentValue = field === 'title' ? state.pageSettingsTitle : state.pageSettingsSlug;
		updateState({
			pageSettingsActiveField: field,
			pageSettingsFieldSnapshot: {
				...state.pageSettingsFieldSnapshot,
				[field]: currentValue
			},
			pageSettingsErrors: {
				...state.pageSettingsErrors,
				[field]: ''
			}
		});
	};
	const finishPageSettingsField = field => {
		if (!canManagePageSettings || !state.pageSettingsOpen) {
			return true;
		}

		if (field === 'title') {
			const validation = validatePageSettingsTitle(state.pageSettingsTitle);
			if (!validation.valid) {
				updateState({
					pageSettingsErrors: {
						...state.pageSettingsErrors,
						title: validation.error
					},
					pageSettingsActiveField: 'title'
				});
				return false;
			}

			updateState({
				pageSettingsTitle: validation.value,
				pageSettingsErrors: {
					...state.pageSettingsErrors,
					title: ''
				},
				pageSettingsActiveField: ''
			});
			return true;
		}

		if (field === 'slug') {
			const currentPage = getPageSettingsPage();
			if (!currentPage) {
				return false;
			}

			const validation = validatePageSettingsSlug(
				state.pageSettingsSlug,
				state.pages,
				shell.workspace ? shell.workspace.sysId : '',
				currentPage.sysId
			);
			if (!validation.valid) {
				updateState({
					pageSettingsErrors: {
						...state.pageSettingsErrors,
						slug: validation.error
					},
					pageSettingsActiveField: 'slug'
				});
				return false;
			}

			updateState({
				pageSettingsSlug: validation.value,
				pageSettingsErrors: {
					...state.pageSettingsErrors,
					slug: ''
				},
				pageSettingsActiveField: ''
			});
			return true;
		}

		return true;
	};
	const cancelPageSettingsField = field => {
		if (!state.pageSettingsOpen) {
			return;
		}

		const snapshot = state.pageSettingsFieldSnapshot && state.pageSettingsFieldSnapshot[field] !== undefined
			? state.pageSettingsFieldSnapshot[field]
			: '';

		updateState({
			pageSettingsTitle: field === 'title' ? snapshot : state.pageSettingsTitle,
			pageSettingsSlug: field === 'slug' ? snapshot : state.pageSettingsSlug,
			pageSettingsErrors: {
				...state.pageSettingsErrors,
				[field]: ''
			},
			pageSettingsActiveField: ''
		});
	};
	const openPageSettings = async page => {
		if (!canManagePageSettings || !page) {
			return;
		}

		if (shell.selectedPage && shell.selectedPage.sysId !== page.sysId && !(await confirmSafePageEditorNavigation())) {
			return;
		}

		const currentPage = getPageSettingsPage();
		if (state.pageSettingsOpen && currentPage && currentPage.sysId === page.sysId) {
			closePageSettingsPanel({nextSelectedPageSlug: page.pageSlug});
			return;
		}

		if (state.pageSettingsOpen && currentPage && currentPage.sysId !== page.sysId) {
			if (!closePageSettingsPanel({nextSelectedPageSlug: page.pageSlug})) {
				return;
			}
		}

		resetPageSettingsFields(page);
		updateState({
			selectedWorkspaceSlug: shell.workspace ? shell.workspace.workspaceSlug : state.selectedWorkspaceSlug,
			selectedPageSlug: page.pageSlug,
			workspaceStatus: `Opened Page Settings for ${page.title}.`
		});
	};
	const openPageSettingsForSelectedPage = async () => {
		if (!shell.selectedPage) {
			return;
		}

		await openPageSettings(shell.selectedPage);
	};
	const publishSelectedPage = async () => {
		if (!canManagePageSettings || !shell.workspace || !shell.selectedPage) {
			return;
		}

		const selectedPageSysId = shell.selectedPage.sysId || '';
		if (!selectedPageSysId || state.pagePublishBusy) {
			return;
		}

		const workspacePages = Array.isArray((latestDocseraShellState || state).pages)
			? (latestDocseraShellState || state).pages
			: state.pages;
		const currentPage = findPageBySysId(workspacePages, selectedPageSysId);
		if (!currentPage) {
			updateState({
				pagePublishPageSysId: selectedPageSysId,
				pagePublishBusy: false,
				pagePublishError: 'The selected page could not be published.',
				workspaceStatus: 'Publish failed because the selected page could not be found.'
			});
			return;
		}

		const currentPageSettingsSnapshot = state.pageSettingsOpen && state.pageSettingsPageSysId === selectedPageSysId
			? {
				title: state.pageSettingsTitle,
				slug: state.pageSettingsSlug
			}
			: null;
		const titleValidation = currentPageSettingsSnapshot
			? validatePageSettingsTitle(currentPageSettingsSnapshot.title)
			: {valid: true, value: currentPage.draftTitle || currentPage.publishedTitle || currentPage.title || '', error: ''};
		const slugValidation = currentPageSettingsSnapshot
			? validatePageSettingsSlug(
				currentPageSettingsSnapshot.slug,
				workspacePages,
				shell.workspace.sysId,
				currentPage.sysId
			)
			: {valid: true, value: currentPage.draftSlug || currentPage.publishedSlug || currentPage.slug || currentPage.pageSlug || '', error: ''};

		if (!titleValidation.valid || !slugValidation.valid) {
			updateState({
				pagePublishPageSysId: selectedPageSysId,
				pagePublishBusy: false,
				pagePublishError: 'Resolve Page Settings before publishing.',
				pageSettingsErrors: {
					title: titleValidation.valid ? '' : titleValidation.error,
					slug: slugValidation.valid ? '' : slugValidation.error,
					general: ''
				},
				pageSettingsActiveField: !titleValidation.valid ? 'title' : !slugValidation.valid ? 'slug' : state.pageSettingsActiveField,
				workspaceStatus: `Publish blocked for ${currentPage.draftTitle || currentPage.publishedTitle || 'page'} until Page Settings are valid.`
			});
			return;
		}

		updateState({
			pagePublishPageSysId: selectedPageSysId,
			pagePublishBusy: true,
			pagePublishError: '',
			...(currentPageSettingsSnapshot ? {
				pageSettingsErrors: clearPageSettingsErrors(),
				pageSettingsActiveField: ''
			} : {}),
			workspaceStatus: `Publishing ${currentPage.draftTitle || currentPage.publishedTitle || 'page'}...`
		});

		const bodySnapshot = getPageBodyEditorSessionSnapshot(selectedPageSysId);
		if (bodySnapshot && (bodySnapshot.hasUnsavedChanges || bodySnapshot.isSaving || bodySnapshot.hasPendingSave || bodySnapshot.isFailed)) {
			try {
				await flushPageBodyEditorSession(selectedPageSysId, 'publish');
			} catch (error) {
				updateState({
					pagePublishBusy: false,
					pagePublishError: error && error.message ? error.message : 'The body content could not be saved before publishing.',
					workspaceStatus: `Publish failed for ${currentPage.draftTitle || currentPage.publishedTitle || 'page'}.`
				});
				return;
			}
		}

		await Promise.resolve();

		const latestPages = Array.isArray((latestDocseraShellState || state).pages)
			? (latestDocseraShellState || state).pages
			: state.pages;
		const refreshedPage = findPageBySysId(latestPages, selectedPageSysId);
		if (!refreshedPage) {
			updateState({
				pagePublishBusy: false,
				pagePublishError: 'The selected page could not be published.',
				workspaceStatus: `Publish failed for ${currentPage.draftTitle || currentPage.publishedTitle || 'page'}.`
			});
			return;
		}

		const nextDraftPage = currentPageSettingsSnapshot
			? updatePageDraftSettings(refreshedPage, {
				title: titleValidation.value,
				slug: slugValidation.value
			})
			: refreshedPage;
		const publishedPage = buildPagePublishRecord(nextDraftPage);
		const nextPages = latestPages.map(page => (
			page && page.sysId === selectedPageSysId ? publishedPage : page
		));

		updateState({
			pages: nextPages,
			selectedWorkspaceSlug: shell.workspace.workspaceSlug,
			selectedPageSlug: publishedPage.draftSlug,
			pagePublishBusy: false,
			pagePublishError: '',
			...(currentPageSettingsSnapshot ? clearPageSettingsState() : {}),
			workspaceStatus: `Published ${publishedPage.draftTitle || publishedPage.publishedTitle || 'page'}.`
		});
	};
	const openDeletePageConfirmation = page => {
		if (!canManagePageSettings || !page) {
			return;
		}

		updateState({
			pageSettingsDeleteOpen: true,
			pageSettingsDeletePageSysId: page.sysId,
			pageSettingsDeleteError: ''
		});
	};
	const closeDeletePageConfirmation = () => updateState({
		pageSettingsDeleteOpen: false,
		pageSettingsDeletePageSysId: '',
		pageSettingsDeleteError: ''
	});
	const confirmDeletePage = () => {
		if (!shell.workspace || !state.pageSettingsDeletePageSysId) {
			return;
		}

		const page = findPageBySysId(state.pages, state.pageSettingsDeletePageSysId);
		if (!page) {
			updateState({
				pageSettingsDeleteError: 'Something went wrong while deleting the page. The page was not deleted. Please try again.'
			});
			return;
		}

		try {
			const subtreeIds = new Set(collectPageSubtreeSysIds(state.pages, page.sysId));
			const selectedPageDeleted = Boolean(shell.selectedPage && subtreeIds.has(shell.selectedPage.sysId));
			const nextSelectedPageSlug = selectedPageDeleted
				? pickNextVisiblePageAfterDelete(shell.pageTree, page.sysId)
				: state.selectedPageSlug;
			const nextPages = removePageSubtree(state.pages, page.sysId);
			for (const deletedPageSysId of subtreeIds) {
				clearPageBodyEditorSession(deletedPageSysId);
			}
			const nextShell = buildWorkspaceShellViewModel({
				workspaces: state.workspaces,
				pages: nextPages,
				capabilityService: createWorkspaceCapabilitiesForDemo(state.userAccess),
				selectedWorkspaceSlug: shell.workspace.workspaceSlug,
				selectedPageSlug: nextSelectedPageSlug
			});

			updateState({
				pages: nextPages,
				selectedWorkspaceSlug: shell.workspace.workspaceSlug,
				selectedPageSlug: nextShell.selectedPageSlug || '',
				pageSettingsDeleteOpen: false,
				pageSettingsDeletePageSysId: '',
				pageSettingsDeleteError: '',
				pageSettingsOpen: state.pageSettingsPageSysId === page.sysId ? false : state.pageSettingsOpen,
				pageSettingsPageSysId: state.pageSettingsPageSysId === page.sysId ? '' : state.pageSettingsPageSysId,
				pageSettingsTitle: state.pageSettingsPageSysId === page.sysId ? '' : state.pageSettingsTitle,
				pageSettingsSlug: state.pageSettingsPageSysId === page.sysId ? '' : state.pageSettingsSlug,
				pageSettingsErrors: state.pageSettingsPageSysId === page.sysId ? clearPageSettingsErrors() : state.pageSettingsErrors,
				pageSettingsActiveField: state.pageSettingsPageSysId === page.sysId ? '' : state.pageSettingsActiveField,
				pageSettingsFieldSnapshot: state.pageSettingsPageSysId === page.sysId ? {
					title: '',
					slug: ''
				} : state.pageSettingsFieldSnapshot,
				workspaceStatus: `Deleted ${page.title}.`
			});
		} catch (error) {
			updateState({
				pageSettingsDeleteError: error && error.message ? error.message : 'Something went wrong while deleting the page. The page was not deleted. Please try again.'
			});
		}
	};
	const handlePageSettingsFrameClick = event => {
		if (!state.pageSettingsOpen) {
			return;
		}

		const panelElement = event && event.target && typeof event.target.closest === 'function'
			? event.target.closest('.docsera-shell__page-settings')
			: null;
		if (panelElement) {
			return;
		}

		closePageSettingsPanel();
	};
	const handlePageSettingsKeydown = event => {
		if (!state.pageSettingsOpen || !event || event.key !== 'Escape') {
			return;
		}

		if (state.pageSettingsActiveField) {
			event.stopPropagation();
			cancelPageSettingsField(state.pageSettingsActiveField);
			return;
		}

		event.stopPropagation();
		closePageSettingsPanel();
	};
	const updatePageSettingsField = (field, value) => {
		if (!state.pageSettingsOpen) {
			return;
		}

		const fieldStateKey = field === 'title' ? 'pageSettingsTitle' : 'pageSettingsSlug';
		updateState({
			[fieldStateKey]: value,
			pageSettingsErrors: {
				...state.pageSettingsErrors,
				[field]: ''
			}
		});
	};
	const pageTreeDrag = state.pageTreeDrag || createPageTreeDragDefaults();
	const canDragPages = Boolean(shell.canShowAuthoringControls && shell.workspace);
	const clearPageTreeDragState = () => {
		if (!pageTreeDrag.active && !pageTreeDrag.sourcePageSysId && !pageTreeDrag.targetPageSysId) {
			return;
		}

		updateState({
			pageTreeDrag: createPageTreeDragDefaults()
		});
	};
	const updatePageTreeDragState = nextDragState => {
		const normalizedNextState = {
			...createPageTreeDragDefaults(),
			...(nextDragState || {})
		};
		const currentState = pageTreeDrag || createPageTreeDragDefaults();
		const stateKeys = [
			'active',
			'sourcePageSysId',
			'sourcePageTitle',
			'targetPageSysId',
			'targetPlacement',
			'targetValid',
			'invalidReason'
		];

		if (stateKeys.every(key => currentState[key] === normalizedNextState[key])) {
			return;
		}

		updateState({
			pageTreeDrag: normalizedNextState
		});
	};
	const startPageTreeDrag = (page, event) => {
		if (!canDragPages || !page || !event || !event.dataTransfer) {
			return;
		}

		event.stopPropagation();

		const ghost = buildPageTreeDragGhost(page.title || 'Page');
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', page.title || 'Page');
		event.dataTransfer.setDragImage(ghost, 24, 18);
		window.setTimeout(() => {
			if (ghost && ghost.parentNode) {
				ghost.parentNode.removeChild(ghost);
			}
		}, 0);

		updatePageTreeDragState({
			active: true,
			sourcePageSysId: page.sysId || '',
			sourcePageTitle: page.title || page.draftTitle || page.publishedTitle || 'Page',
			targetPageSysId: '',
			targetPlacement: '',
			targetValid: false,
			invalidReason: ''
		});
	};
	const handlePageTreeDragOver = event => {
		if (!canDragPages || !pageTreeDrag.active || !shell.workspace || !event || !event.currentTarget) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const nextTarget = resolvePageTreeDropTarget(event.currentTarget, {
			clientX: event.clientX,
			clientY: event.clientY,
			sourcePageSysId: pageTreeDrag.sourcePageSysId,
			pages: shell.allPages
		});
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = nextTarget.targetValid ? 'move' : 'none';
		}

		updatePageTreeDragState({
			...pageTreeDrag,
			...nextTarget,
			active: true
		});
	};
	const handlePageTreeDragLeave = event => {
		if (!canDragPages || !pageTreeDrag.active || !event) {
			return;
		}

		const relatedTarget = event.relatedTarget;
		if (relatedTarget && event.currentTarget && typeof event.currentTarget.contains === 'function' && event.currentTarget.contains(relatedTarget)) {
			return;
		}

		updatePageTreeDragState({
			...pageTreeDrag,
			targetPageSysId: '',
			targetPlacement: '',
			targetValid: false,
			invalidReason: '',
			active: true
		});
	};
	const handlePageTreeDragEnd = () => {
		clearPageTreeDragState();
	};
	const handlePageTreeDrop = event => {
		if (!canDragPages || !pageTreeDrag.active || !shell.workspace || !event || !event.currentTarget) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const nextTarget = resolvePageTreeDropTarget(event.currentTarget, {
			clientX: event.clientX,
			clientY: event.clientY,
			sourcePageSysId: pageTreeDrag.sourcePageSysId,
			pages: shell.allPages
		});

		if (!nextTarget.targetValid) {
			updateState({
				workspaceStatus: nextTarget.invalidReason || 'That drop target is not valid.'
			});
			clearPageTreeDragState();
			return;
		}

		try {
			const nextPages = applyPageMove(
				state.pages,
				pageTreeDrag.sourcePageSysId,
				nextTarget.targetPageSysId,
				nextTarget.targetPlacement,
				PAGE_TREE_MAX_DEPTH
			);
			const nextShell = buildWorkspaceShellViewModel({
				workspaces: state.workspaces,
				pages: nextPages,
				capabilityService: createWorkspaceCapabilitiesForDemo(state.userAccess),
				selectedWorkspaceSlug: shell.workspace.workspaceSlug,
				selectedPageSlug: shell.selectedPageSlug
			});
			const movedPage = findPageBySysId(nextPages, pageTreeDrag.sourcePageSysId);
			const targetPage = findPageBySysId(nextPages, nextTarget.targetPageSysId);
			const targetLabel = targetPage ? targetPage.title || targetPage.draftTitle || targetPage.publishedTitle || 'page' : 'page';
			const moveLabel = nextTarget.targetPlacement === 'inside' ? 'inside' : nextTarget.targetPlacement;

			updateState({
				pages: nextPages,
				selectedWorkspaceSlug: shell.workspace.workspaceSlug,
				selectedPageSlug: nextShell.selectedPageSlug || shell.selectedPageSlug,
				pageTreeDrag: createPageTreeDragDefaults(),
				workspaceStatus: movedPage
					? `Moved ${movedPage.title || movedPage.draftTitle || movedPage.publishedTitle || 'page'} ${moveLabel} ${targetLabel}.`
					: 'Page move saved.'
			});
		} catch (error) {
			updateState({
				workspaceStatus: error && error.message ? error.message : 'The page move could not be saved.'
			});
			clearPageTreeDragState();
		}
	};

	const workspacePages = shell.workspace ? getWorkspacePagesForCreation(state.pages, shell.workspace.sysId) : [];
	const canCreatePages = Boolean(shell.canCreatePages && shell.workspace);
	const pageSettingsPage = getPageSettingsPage();
	const deletePage = state.pageSettingsDeletePageSysId
		? findPageBySysId(state.pages, state.pageSettingsDeletePageSysId)
		: null;

	const openCreatePageModal = parentPage => {
		if (!canCreatePages) {
			return;
		}

		updateState({
			createPageModalOpen: true,
			createPageModalError: '',
			createPageModalBusy: false,
			newPage: resetCreatePageForm(parentPage || null)
		});
	};

	const closeCreatePageModal = () => updateState({
		createPageModalOpen: false,
		createPageModalError: '',
		createPageModalBusy: false,
		newPage: resetCreatePageForm()
	});

	const updateCreatePageField = (field, value) => {
		updateState({
			newPage: {
				...state.newPage,
				[field]: value
			}
		});
	};

	const createPage = async event => {
		event.preventDefault();

		if (!shell.workspace) {
			return;
		}

		const title = typeof state.newPage.title === 'string' ? state.newPage.title.trim() : '';
		if (!title) {
			updateState({
				createPageModalError: 'Page title is required.'
			});
			return;
		}

		try {
			updateState({
				createPageModalBusy: true,
				createPageModalError: ''
			});

			const parentPage = state.newPage.parentPageSysId
				? findPageBySysId(workspacePages, state.newPage.parentPageSysId)
				: null;
			const draft = createPageDraft({
				workspaceSysId: shell.workspace.sysId,
				title,
				parentPage
			}, workspacePages);
			const createdPage = {
				...draft,
				sysId: createLocalPageSysId(shell.workspace.workspaceSlug, draft.draftSlug)
			};
			const nextPages = [...state.pages, createdPage];

			updateState({
				pages: nextPages,
				selectedWorkspaceSlug: shell.workspace.workspaceSlug,
				selectedPageSlug: createdPage.draftSlug,
				createPageModalOpen: false,
				createPageModalBusy: false,
				createPageModalError: '',
				newPage: resetCreatePageForm(),
				workspaceStatus: parentPage
					? `Created child page ${createdPage.draftTitle} under ${parentPage.draftTitle || parentPage.publishedTitle || 'the selected parent'} at /docsera/${shell.workspace.workspaceSlug}/${createdPage.draftSlug}`
					: `Created root page ${createdPage.draftTitle} at /docsera/${shell.workspace.workspaceSlug}/${createdPage.draftSlug}`
			});
		} catch (error) {
			updateState({
				createPageModalBusy: false,
				createPageModalError: error && error.message ? error.message : 'Page creation failed.'
			});
		}
	};

	const workspace = shell.workspace;
	const workspaceName = workspace ? workspace.name : 'Workspace not found';
	const workspaceDescription = workspace ? workspace.shortDescription : '';
	const workspaceIcon = workspace ? renderIconGlyph(workspace) : 'D';
	const navCollapsed = state.shellNavigationCollapsed;
	const themeClass = state.shellTheme === 'dark' ? 'docsera-shell--theme-dark' : 'docsera-shell--theme-light';

	if (shell.status === 'workspace-not-found') {
		return (
			<div className={`docsera-shell ${themeClass} docsera-shell--reader`}>
				<header className="docsera-shell__header docsera-shell__header--reader">
					<div className="docsera-shell__brand">
						<span className="docsera-shell__brand-mark" aria-hidden="true">D</span>
						<div>
							<div className="docsera-shell__brand-name">Docsera</div>
							<div className="docsera-shell__brand-subtitle">Workspace reader</div>
						</div>
					</div>
					<div className="docsera-shell__header-meta">
						<button type="button" className="docsera-shell__button docsera-shell__button--secondary" on-click={() => void openWorkspaceLauncher()}>
							My Workspaces
						</button>
					</div>
				</header>

				<main className="docsera-shell__reader-empty">
					<div className="docsera-shell__state">
						<h1>Workspace not found</h1>
						<p>
							The selected workspace is unavailable or inactive. Return to My Workspaces to choose another workspace.
						</p>
						<div className="docsera-shell__state-actions">
							<button type="button" className="docsera-shell__button" on-click={() => void openWorkspaceLauncher()}>
								My Workspaces
							</button>
						</div>
					</div>
				</main>
			</div>
		);
	}

	if (state.surfaceMode === 'launcher') {
		const capabilityService = createWorkspaceCapabilitiesForDemo(state.userAccess);
		const launcher = buildMyWorkspacesViewModel(state.workspaces, capabilityService, state.workspaceSearch);
		const selectedWorkspace = getWorkspaceBySlug(state.workspaces, state.selectedWorkspaceSlug) ||
			launcher.filteredRows[0] ||
			launcher.accessibleRows[0] ||
			null;
		const selectedWorkspaceLabel = selectedWorkspace ? resolveWorkspaceCapabilityLabel(selectedWorkspace, capabilityService) : '';
		const selectedWorkspaceRoute = selectedWorkspace ? buildWorkspaceRoutePath(selectedWorkspace) : '/docsera';

		const openWorkspace = async workspaceItem => {
			if (!workspaceItem) {
				return;
			}

			if (!(await confirmSafePageEditorNavigation())) {
				return;
			}

			const nextShell = buildWorkspaceShellViewModel({
				workspaces: state.workspaces,
				pages: state.pages,
				capabilityService,
				selectedWorkspaceSlug: workspaceItem.workspaceSlug,
				selectedPageSlug: ''
			});

			updateState({
				surfaceMode: 'shell',
				selectedWorkspaceSlug: workspaceItem.workspaceSlug,
				selectedPageSlug: nextShell.firstVisiblePageSlug || '',
				shellNavigationCollapsed: false,
				workspaceStatus: `Opened ${workspaceItem.name} at ${nextShell.routeTargetPath}`
			});
		};

		const openSettings = workspaceItem => {
			if (!workspaceItem) {
				return;
			}

			updateState({
				selectedWorkspaceSlug: workspaceItem.workspaceSlug,
				workspaceStatus: `${workspaceItem.name} settings are available for admins only.`
			});
		};

		const openCreateWorkspaceModal = () => updateState({
			createModalOpen: true,
			createModalError: '',
			newWorkspace: resetNewWorkspaceForm()
		});

		const closeCreateWorkspaceModal = () => updateState({
			createModalOpen: false,
			createModalError: '',
			createModalBusy: false,
			newWorkspace: resetNewWorkspaceForm()
		});

		const updateCreateField = (field, value) => {
			updateState({
				newWorkspace: {
					...state.newWorkspace,
					[field]: value
				}
			});
		};

		const createWorkspace = async event => {
			event.preventDefault();

			try {
				const input = prepareWorkspaceCreationInput(state.newWorkspace, CURRENT_USER_SYS_ID);
				const retainedSlugs = state.workspaces.map(workspaceItem => workspaceItem.workspaceSlug);
				const provisioningDependencies = createLocalWorkspaceProvisioningDependencies(
					CURRENT_USER_SYS_ID,
					state.userAccess.groups
				);

				updateState({
					createModalBusy: true,
					createModalError: ''
				});

				const result = await provisionWorkspace(
					input,
					provisioningDependencies,
					retainedSlugs
				);

				const createdWorkspace = result.workspace;
				const nextWorkspaces = [createdWorkspace, ...state.workspaces];

				updateState({
					workspaces: nextWorkspaces,
					selectedWorkspaceSlug: createdWorkspace.workspaceSlug,
					createModalOpen: false,
					createModalBusy: false,
					createModalError: '',
					newWorkspace: resetNewWorkspaceForm(),
					workspaceStatus: summarizeWorkspaceCreationResult(result)
				});
			} catch (error) {
				updateState({
					createModalBusy: false,
					createModalError: error && error.message ? error.message : 'Workspace creation failed.'
				});
			}
		};

		return (
			<div className={`docsera-shell ${themeClass}`}>
				<header className="docsera-shell__header">
					<div className="docsera-shell__brand">
						<span className="docsera-shell__brand-mark" aria-hidden="true">D</span>
						<div>
							<div className="docsera-shell__brand-name">Docsera</div>
							<div className="docsera-shell__brand-subtitle">Workspace launcher</div>
						</div>
					</div>
					<div className="docsera-shell__header-meta">
						<span className="docsera-shell__badge">My Workspaces</span>
						<button
							type="button"
							className="docsera-shell__button docsera-shell__button--secondary"
							on-click={openCreateWorkspaceModal}
						>
							New Workspace
						</button>
					</div>
				</header>

				<div className="docsera-shell__frame">
					<aside className="docsera-shell__rail" aria-label="Docsera workspace launcher">
						<div className="docsera-shell__rail-section">
							<p className="docsera-shell__rail-title">Current surface</p>
							<h2 className="docsera-shell__rail-headline">My Workspaces</h2>
							<p className="docsera-shell__rail-copy">
								Active workspaces where you have Docsera Admin, Workspace Admin, or Workspace Editor capability.
							</p>
						</div>

						<div className="docsera-shell__rail-section">
							<p className="docsera-shell__rail-title">Selection</p>
							<div className="docsera-shell__selector">
								<div className="docsera-shell__selector-icon" aria-hidden="true">
									{renderIconGlyph(selectedWorkspace || {name: 'Docsera'})}
								</div>
								<div className="docsera-shell__selector-copy">
									<div className="docsera-shell__selector-name">
										{selectedWorkspace ? selectedWorkspace.name : 'No workspace selected'}
									</div>
									<div className="docsera-shell__selector-note">
										{selectedWorkspace ? selectedWorkspaceRoute : 'Open a workspace from the list to target the shell boundary.'}
									</div>
								</div>
							</div>
						</div>

						<div className="docsera-shell__rail-section docsera-shell__rail-section--push">
							<p className="docsera-shell__rail-title">Entry point</p>
							<button
								type="button"
								className="docsera-shell__link-button"
								on-click={() => updateState({workspaceStatus: 'My Workspaces is the launcher entry point for Docsera.'})}
							>
								My Workspaces
							</button>
							<div className="docsera-shell__rail-note">
								Footer launcher entry point for shell navigation.
							</div>
						</div>
					</aside>

					<main className="docsera-shell__panel">
						<section className="docsera-shell__surface">
							<div className="docsera-shell__surface-head">
								<div>
									<h1 className="docsera-shell__headline">My Workspaces</h1>
									<p className="docsera-shell__lede">
										Search active workspaces, create a new workspace, or open workspace settings when your role allows it.
									</p>
								</div>
								<div className="docsera-shell__surface-actions">
									<button
										type="button"
										className="docsera-shell__button"
										on-click={openCreateWorkspaceModal}
									>
										New Workspace
									</button>
								</div>
							</div>

							<div className="docsera-shell__toolbar">
								<label className="docsera-shell__search">
									<span className="docsera-shell__search-label">Search</span>
									<input
										type="search"
										value={state.workspaceSearch}
										placeholder="Search by workspace name or description"
										on-input={event => updateState({workspaceSearch: event.target.value})}
									/>
								</label>

								<div className="docsera-shell__toolbar-meta">
									<span className="docsera-shell__toolbar-chip">
										{launcher.accessibleRows.length} accessible
									</span>
									<span className="docsera-shell__toolbar-chip">
										{launcher.filteredRows.length} shown
									</span>
									{state.workspaceSearch ? (
										<button
											type="button"
											className="docsera-shell__link-button"
											on-click={() => updateState({workspaceSearch: ''})}
										>
											Clear filter
										</button>
									) : null}
								</div>
							</div>

							{launcher.isEmptyState ? (
								<div className="docsera-shell__state">
									<h2>No workspaces yet</h2>
									<p>
										You do not currently have any active Docsera Admin, Workspace Admin, or Workspace Editor workspaces.
									</p>
									<div className="docsera-shell__state-actions">
										<button type="button" className="docsera-shell__button" on-click={openCreateWorkspaceModal}>
											New Workspace
										</button>
									</div>
								</div>
							) : launcher.isNoResultsState ? (
								<div className="docsera-shell__state">
									<h2>No matching workspaces</h2>
									<p>
										Try a different search term or clear the filter to return to your active workspace list.
									</p>
									<div className="docsera-shell__state-actions">
										<button
											type="button"
											className="docsera-shell__button docsera-shell__button--secondary"
											on-click={() => updateState({workspaceSearch: ''})}
										>
											Clear filter
										</button>
									</div>
								</div>
							) : (
								<div className="docsera-shell__workspace-list" role="list" aria-label="Active workspaces">
									{launcher.filteredRows.map(workspaceItem => (
										<div key={workspaceItem.workspaceSlug} className="docsera-shell__workspace-row" role="listitem">
											<div className="docsera-shell__workspace-icon" aria-hidden="true">
												{renderIconGlyph(workspaceItem)}
											</div>
											<div className="docsera-shell__workspace-copy">
												<div className="docsera-shell__workspace-headline">
													<button
														type="button"
														className="docsera-shell__workspace-name"
														on-click={() => void openWorkspace(workspaceItem)}
													>
														{workspaceItem.name}
													</button>
													<span className="docsera-shell__role-pill">{workspaceItem.roleLabel}</span>
												</div>
												{workspaceItem.shortDescription ? (
													<p className="docsera-shell__workspace-description">{workspaceItem.shortDescription}</p>
												) : null}
												<div className="docsera-shell__workspace-meta">
													<span className="docsera-shell__workspace-slug">{workspaceItem.workspaceSlug}</span>
													{workspaceItem.canManageSettings ? (
														<button
															type="button"
															className="docsera-shell__link-button"
															on-click={() => openSettings(workspaceItem)}
														>
															Workspace settings
														</button>
													) : (
														<span className="docsera-shell__workspace-muted">Settings hidden for editors</span>
													)}
												</div>
											</div>
											<div className="docsera-shell__workspace-actions">
												<button
													type="button"
													className="docsera-shell__button docsera-shell__button--secondary"
													on-click={() => void openWorkspace(workspaceItem)}
												>
													Open
												</button>
											</div>
										</div>
									))}
								</div>
							)}
						</section>

						<aside className="docsera-shell__inspector">
							<div className="docsera-shell__inspector-panel">
								<p className="docsera-shell__rail-title">Workspace boundary</p>
								<h2>Route target</h2>
								<p className="docsera-shell__inspector-copy">
									Click a workspace to target the shell boundary. Full reader-mode shell behavior is still a future task.
								</p>
								<div className="docsera-shell__inspector-route">{selectedWorkspaceRoute}</div>
								{selectedWorkspace ? (
									<div className="docsera-shell__inspector-meta">
										<div>
											<div className="docsera-shell__inspector-label">Selected workspace</div>
											<div className="docsera-shell__inspector-value">{selectedWorkspace.name}</div>
										</div>
										<div>
											<div className="docsera-shell__inspector-label">Capability</div>
											<div className="docsera-shell__inspector-value">{selectedWorkspaceLabel || 'No access'}</div>
										</div>
									</div>
								) : null}
							</div>

							<div className="docsera-shell__inspector-panel docsera-shell__inspector-panel--quiet">
								<p className="docsera-shell__rail-title">Status</p>
								<div className="docsera-shell__status-text">{state.workspaceStatus}</div>
							</div>
						</aside>
					</main>
				</div>

				{state.createModalOpen ? (
					<div className="docsera-shell__modal-backdrop" role="presentation" on-click={closeCreateWorkspaceModal}>
						<div
							className="docsera-shell__modal"
							role="dialog"
							aria-modal="true"
							aria-labelledby="docsera-create-workspace-title"
							on-click={event => event.stopPropagation()}
						>
							<form className="docsera-shell__modal-form" on-submit={createWorkspace}>
								<div className="docsera-shell__modal-head">
									<div>
										<p className="docsera-shell__rail-title">New workspace</p>
										<h2 id="docsera-create-workspace-title">Create workspace</h2>
									</div>
									<button type="button" className="docsera-shell__icon-button" on-click={closeCreateWorkspaceModal}>
										Close
									</button>
								</div>

								<p className="docsera-shell__modal-copy">
									Workspace name is required. The default Docsera icon will be used until icon selection lands.
								</p>

								<label className="docsera-shell__field">
									<span className="docsera-shell__field-label">Workspace name</span>
									<input
										type="text"
										value={state.newWorkspace.name}
										placeholder="e.g. Product Docs"
										aria-required="true"
										on-input={event => updateCreateField('name', event.target.value)}
									/>
								</label>

								<label className="docsera-shell__field">
									<span className="docsera-shell__field-label">Short description</span>
									<textarea
										rows="3"
										value={state.newWorkspace.shortDescription}
										placeholder="Optional workspace summary"
										on-input={event => updateCreateField('shortDescription', event.target.value)}
									/>
								</label>

								<div className="docsera-shell__field">
									<span className="docsera-shell__field-label">Workspace icon</span>
									<div className="docsera-shell__icon-picker">
										<div className="docsera-shell__workspace-icon" aria-hidden="true">
											D
										</div>
										<div>
											<div className="docsera-shell__icon-picker-title">
												{state.newWorkspace.icon.label}
											</div>
											<div className="docsera-shell__icon-picker-copy">
												Default built-in icon
											</div>
										</div>
									</div>
								</div>

								{state.createModalError ? (
									<div className="docsera-shell__modal-error" role="alert">
										{state.createModalError}
									</div>
								) : null}

								<div className="docsera-shell__modal-actions">
									<button
										type="button"
										className="docsera-shell__button docsera-shell__button--secondary"
										on-click={closeCreateWorkspaceModal}
										disabled={state.createModalBusy}
									>
										Cancel
									</button>
									<button
										type="submit"
										className="docsera-shell__button"
										disabled={state.createModalBusy}
									>
										{state.createModalBusy ? 'Creating...' : 'Create workspace'}
									</button>
								</div>
							</form>
						</div>
					</div>
				) : null}
			</div>
		);
	}

	const shellClass = `docsera-shell ${themeClass} docsera-shell--reader${navCollapsed ? ' docsera-shell--nav-collapsed' : ''}`;

	return (
		<div className={shellClass}>
			<header className="docsera-shell__header docsera-shell__header--reader">
				<div className="docsera-shell__brand">
					<span className="docsera-shell__brand-mark" aria-hidden="true">D</span>
					<div>
						<div className="docsera-shell__brand-name">Docsera</div>
						<div className="docsera-shell__brand-subtitle">Workspace reader</div>
					</div>
				</div>

				<div className="docsera-shell__workspace-identity">
					<div className="docsera-shell__workspace-identity-icon" aria-hidden="true">
						{workspaceIcon}
					</div>
					<div className="docsera-shell__workspace-identity-copy">
						<div className="docsera-shell__workspace-identity-name">{workspaceName}</div>
					</div>
				</div>

				<div className="docsera-shell__header-meta docsera-shell__header-meta--reader">
					<span className="docsera-shell__badge">Reader mode</span>
					{canCreatePages ? (
						<button type="button" className="docsera-shell__button docsera-shell__button--secondary" on-click={() => openCreatePageModal(null)}>
							New page
						</button>
					) : null}
					<button type="button" className="docsera-shell__button docsera-shell__button--secondary" on-click={() => void openWorkspaceLauncher()}>
						My Workspaces
					</button>
					<button type="button" className="docsera-shell__button docsera-shell__button--secondary" on-click={toggleNav}>
						{navCollapsed ? 'Expand nav' : 'Collapse nav'}
					</button>
					<button type="button" className="docsera-shell__button docsera-shell__button--secondary" on-click={toggleTheme}>
						{state.shellTheme === 'dark' ? 'Light mode' : 'Dark mode'}
					</button>
				</div>
			</header>

			<div className="docsera-shell__reader-frame" on-click={handlePageSettingsFrameClick}>
				<aside className={`docsera-shell__reader-nav${navCollapsed ? ' docsera-shell__reader-nav--collapsed' : ''}`} aria-label="Workspace pages">
					<div className="docsera-shell__reader-nav-head">
						<p className="docsera-shell__rail-title">Navigation</p>
						<div className="docsera-shell__reader-nav-title-row">
							<h2 className="docsera-shell__reader-nav-title">Page tree</h2>
							{canCreatePages ? (
								<button type="button" className="docsera-shell__tree-action docsera-shell__tree-action--inline" on-click={() => openCreatePageModal(null)}>
									New page
								</button>
							) : null}
						</div>
						<p className="docsera-shell__reader-nav-copy">
							{canCreatePages ? 'Authoring hierarchy. Draft pages remain visible to editors and admins.' : 'Read-only hierarchy. Viewer mode hides authoring controls.'}
						</p>
					</div>

					<div className="docsera-shell__reader-nav-search">
						<label className="docsera-shell__search" htmlFor="docsera-page-tree-search">
							<span className="docsera-shell__search-label">Search pages</span>
						</label>
						<div className="docsera-shell__search-row">
							<input
								id="docsera-page-tree-search"
								type="search"
								value={state.pageTreeSearch}
								placeholder="Filter by title, slug, summary, or body text"
								aria-controls="docsera-page-tree"
								on-input={event => updateState({pageTreeSearch: event.target.value})}
							/>
							{state.pageTreeSearch ? (
								<button
									type="button"
									className="docsera-shell__button docsera-shell__button--secondary docsera-shell__search-clear"
									on-click={() => updateState({pageTreeSearch: ''})}
								>
									Clear search
								</button>
							) : null}
						</div>
					</div>

					<div className="docsera-shell__reader-nav-summary">
						<span className="docsera-shell__toolbar-chip">{shell.visiblePages.length} visible pages</span>
						<span className="docsera-shell__toolbar-chip">{shell.routeTargetPath}</span>
					</div>

					<nav
						id="docsera-page-tree"
						className={`docsera-shell__tree${canDragPages ? ' docsera-shell__tree--droppable' : ''}`}
						aria-label="Workspace page tree"
						on-dragover={handlePageTreeDragOver}
						on-drop={handlePageTreeDrop}
						on-dragleave={handlePageTreeDragLeave}
					>
						{shell.isPageTreeNoResultsState ? (
							<div className="docsera-shell__toc-empty" role="status" aria-live="polite">
								<div className="docsera-shell__state docsera-shell__state--compact">
									<div>No matching pages.</div>
									<div>Try another search term or clear the filter to restore the full tree.</div>
									<button
										type="button"
										className="docsera-shell__button docsera-shell__button--secondary"
										on-click={() => updateState({pageTreeSearch: ''})}
									>
										Clear search
									</button>
								</div>
							</div>
						) : shell.pageTree.length ? renderPageTreeNodes(shell.filteredPageTree, {
							selectPage,
							openPageSettings,
							createChildPage: openCreatePageModal,
							selectedPageSlug: shell.selectedPageSlug,
							pageSettingsPageSysId: state.pageSettingsPageSysId,
							canCreatePages,
							canManagePageSettings,
							canDragPages,
							pageTreeDrag,
							startPageTreeDrag,
							handlePageTreeDragEnd
						}) : (
							<div className="docsera-shell__toc-empty">
								{canCreatePages ? (
									<div className="docsera-shell__state docsera-shell__state--compact">
										<div>No pages in this workspace yet.</div>
										<div>Authorized users can create the first root page.</div>
										<button type="button" className="docsera-shell__button" on-click={() => openCreatePageModal(null)}>
											Create root page
										</button>
									</div>
								) : (
									'No visible pages in this workspace yet.'
								)}
							</div>
						)}
					</nav>
				</aside>

				<main className="docsera-shell__reader-main">
					{renderBreadcrumbs(shell.breadcrumbs, selectBreadcrumb)}

					{shell.status === 'empty-workspace' ? (
						<section className="docsera-shell__reader-empty-state">
							<h1>{workspaceName}</h1>
							<p>
								{canCreatePages
									? 'This workspace has no pages yet. Create the first root page to start the tree.'
									: 'This workspace has no visible pages yet. Published pages will appear here when they are available.'}
							</p>
							{canCreatePages ? (
								<div className="docsera-shell__state-actions">
									<button
										type="button"
										className="docsera-shell__button"
										on-click={() => openCreatePageModal(null)}
									>
										Create root page
									</button>
								</div>
							) : null}
						</section>
					) : shell.status === 'page-not-found' ? (
						<section className="docsera-shell__reader-empty-state">
							<h1>Page not found</h1>
							<p>
								The selected page is unavailable or not published for this reader surface.
							</p>
							<div className="docsera-shell__state-actions">
								<button
									type="button"
									className="docsera-shell__button docsera-shell__button--secondary"
									on-click={() => updateState({selectedPageSlug: shell.firstVisiblePageSlug || ''})}
								>
									Open first visible page
								</button>
							</div>
						</section>
					) : shell.canEditPageBody ? (
						renderPageBodyEditorSurface({
							shell,
							state,
							onPublish: publishSelectedPage
						})
					) : (
						<article className="docsera-shell__reader-content">
							<div className="docsera-shell__reader-content-head">
								<div>
									<p className="docsera-shell__rail-title">{shell.selectedPage && shell.selectedPage.publicationState === PAGE_PUBLICATION_STATES.draft ? 'Draft content' : 'Published content'}</p>
									<div className="docsera-shell__reader-title-row">
										<h1 className="docsera-shell__reader-title">{shell.selectedPage ? shell.selectedPage.title : workspaceName}</h1>
										{shell.selectedPage && shell.selectedPage.publicationState === PAGE_PUBLICATION_STATES.draft ? (
											<span className="docsera-shell__page-badge docsera-shell__page-badge--draft">Draft</span>
										) : null}
									</div>
									<p className="docsera-shell__reader-lede">
										{shell.selectedPage ? shell.selectedPage.summary || shell.selectedPage.bodyText : workspaceDescription || 'Select a page to read the workspace content.'}
									</p>
								</div>
								<div className="docsera-shell__reader-meta">
									<span className="docsera-shell__toolbar-chip">{shell.routeTargetPath}</span>
									{shell.selectedPage ? (
										<span className="docsera-shell__toolbar-chip">{shell.selectedPageSlug}</span>
									) : null}
								</div>
							</div>

							<div className="docsera-shell__reader-body">
								{shell.selectedPage ? (
									<>
										<section className="docsera-shell__reader-prose">
											<div className="docsera-shell__reader-text">
												{shell.selectedPage.bodyText || shell.selectedPage.summary || 'This page does not expose a readable body yet.'}
											</div>
										</section>

										{Array.isArray(shell.selectedPage.sections) && shell.selectedPage.sections.length ? (
											<div className="docsera-shell__reader-sections">
												{shell.selectedPage.sections.map(section => (
													<section key={section.id || section.title} className="docsera-shell__reader-section" id={section.id}>
														<h2 className="docsera-shell__reader-section-title">{section.title}</h2>
														{section.body ? (
															<p className="docsera-shell__reader-section-copy">{section.body}</p>
														) : null}
													</section>
												))}
											</div>
										) : null}
									</>
								) : null}
							</div>
						</article>
					)}
				</main>

				<aside className="docsera-shell__reader-rail" aria-label="Page context">
					<div className="docsera-shell__inspector-panel">
						<p className="docsera-shell__rail-title">Workspace identity</p>
						<h2>{workspaceName}</h2>
						<div className="docsera-shell__inspector-meta">
							<div>
								<div className="docsera-shell__inspector-label">Workspace slug</div>
								<div className="docsera-shell__inspector-value">{shell.workspaceSlug || 'n/a'}</div>
							</div>
							<div>
								<div className="docsera-shell__inspector-label">Route target</div>
								<div className="docsera-shell__inspector-value">{shell.routeTargetPath}</div>
							</div>
						</div>
					</div>

					{renderTableOfContents(shell.tableOfContents, shell.selectedPage)}

					<div className="docsera-shell__inspector-panel docsera-shell__inspector-panel--quiet">
						<p className="docsera-shell__rail-title">Status</p>
						<div className="docsera-shell__status-text">
							{state.workspaceStatus}
						</div>
					</div>
				</aside>
			</div>
			{renderPageSettingsOverlay({
				state,
				page: pageSettingsPage,
				canManagePageSettings,
				workspacePages: state.pages,
				workspaceName,
				workspaceSlug: shell.workspace ? shell.workspace.workspaceSlug : '',
				closePageSettingsPanel,
				startPageSettingsField,
				finishPageSettingsField,
				cancelPageSettingsField,
				updatePageSettingsField,
				openDeletePageConfirmation,
				handlePageSettingsKeydown
			})}
			{renderDeletePageConfirmationDialog({
				state,
				page: deletePage,
				canManagePageSettings,
				workspacePages: state.pages,
				closeDeletePageConfirmation,
				confirmDeletePage
			})}
			{renderPageCreationModal({
				state,
				canCreatePages,
				workspaceName,
				workspaceSlug: shell.workspace ? shell.workspace.workspaceSlug : '',
				workspacePages,
				createPage,
				closeCreatePageModal,
				updateCreateField: updateCreatePageField
			})}
		</div>
	);
}

const view = (state, {updateState}) => {
	latestDocseraShellState = state;
	const capabilityService = createWorkspaceCapabilitiesForDemo(state.userAccess);
	const shell = buildWorkspaceShellViewModel({
		workspaces: state.workspaces,
		pages: state.pages,
		capabilityService,
		selectedWorkspaceSlug: state.selectedWorkspaceSlug,
		selectedPageSlug: state.selectedPageSlug,
		pageTreeSearchQuery: state.pageTreeSearch
	});

	return renderWorkspaceReaderSurface(
		state,
		shell,
		updateState
	);
};

createCustomElement('x-82900-docsera-shell', {
	renderer: {type: snabbdom},
	actionHandlers: {
		[COMPONENT_RENDERED]: ({host, state, updateState}) => {
			const capabilityService = createWorkspaceCapabilitiesForDemo(state.userAccess);
			const shell = buildWorkspaceShellViewModel({
				workspaces: state.workspaces,
				pages: state.pages,
				capabilityService,
				selectedWorkspaceSlug: state.selectedWorkspaceSlug,
				selectedPageSlug: state.selectedPageSlug
			});

			ensurePageBodyEditorHost(host, state, updateState, shell);
		},
		[COMPONENT_DISCONNECTED]: ({host}) => {
			destroyPageEditorHostEntry(host);
		}
	},
	setInitialState: createInitialState,
	view,
	styles
});
