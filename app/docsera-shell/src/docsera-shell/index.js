import {
	createCustomElement
} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';
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
	createDocseraShellDemoPages
} from '../pages';
import {
	PAGE_PUBLICATION_STATES,
	createPageDraft
} from '../pages/page-domain.js';
import {
	provisionWorkspace
} from '../workspaces/workspace-domain.js';
import styles from './styles.scss';

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

function renderPageTreeNodes(nodes, {
	selectPage,
	createChildPage,
	selectedPageSlug,
	canCreatePages
}) {
	if (!Array.isArray(nodes) || nodes.length === 0) {
		return null;
	}

	return (
		<ul className="docsera-shell__tree-list" role="list">
			{nodes.map(node => (
				<li key={node.sysId} className="docsera-shell__tree-item">
					<div className="docsera-shell__tree-row">
						<button
							type="button"
							className={`docsera-shell__tree-button${node.pageSlug === selectedPageSlug ? ' docsera-shell__tree-button--selected' : ''}`}
							on-click={() => selectPage(node)}
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
						{canCreatePages ? (
							<button
								type="button"
								className="docsera-shell__tree-action"
								on-click={() => createChildPage(node)}
							>
								New child
							</button>
						) : null}
					</div>
					{node.children.length ? renderPageTreeNodes(node.children, {
						selectPage,
						createChildPage,
						selectedPageSlug,
						canCreatePages
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
									on-click={() => selectBreadcrumb(crumb)}
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

function renderWorkspaceReaderSurface(state, shell, updateState) {
	const selectWorkspaceFromLauncher = workspace => {
		if (!workspace) {
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
			shellNavigationCollapsed: false,
			workspaceStatus: nextShell.status === 'empty-workspace'
				? `${workspace.name} opened with no visible pages.`
				: `Opened ${workspace.name} at ${nextShell.routeTargetPath}`
		});
	};

	const openWorkspaceLauncher = () => updateState({
		surfaceMode: 'launcher',
		workspaceStatus: 'My Workspaces is the launcher entry point for Docsera.'
	});

	const selectPage = page => {
		if (!page || !shell.workspace) {
			return;
		}

		updateState({
			selectedWorkspaceSlug: shell.workspace.workspaceSlug,
			selectedPageSlug: page.pageSlug,
			workspaceStatus: `Selected ${page.title} at ${shell.workspace.workspaceSlug}/${page.pageSlug}`
		});
	};

	const selectBreadcrumb = crumb => {
		if (!crumb || !shell.workspace) {
			return;
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

	const workspacePages = shell.workspace ? getWorkspacePagesForCreation(state.pages, shell.workspace.sysId) : [];
	const canCreatePages = Boolean(shell.canCreatePages && shell.workspace);

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
						<button type="button" className="docsera-shell__button docsera-shell__button--secondary" on-click={openWorkspaceLauncher}>
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
							<button type="button" className="docsera-shell__button" on-click={openWorkspaceLauncher}>
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

		const openWorkspace = workspaceItem => {
			if (!workspaceItem) {
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
														on-click={() => openWorkspace(workspaceItem)}
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
													on-click={() => openWorkspace(workspaceItem)}
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

	const openLauncher = () => updateState({
		surfaceMode: 'launcher',
		workspaceStatus: 'My Workspaces is the launcher entry point for Docsera.'
	});

	const toggleNav = () => updateState({
		shellNavigationCollapsed: !state.shellNavigationCollapsed
	});

	const toggleTheme = () => updateState({
		shellTheme: state.shellTheme === 'dark' ? 'light' : 'dark'
	});

	const selectPage = page => {
		if (!page || !shell.workspace) {
			return;
		}

		updateState({
			selectedWorkspaceSlug: shell.workspace.workspaceSlug,
			selectedPageSlug: page.pageSlug,
			workspaceStatus: `Selected ${page.title} at /docsera/${shell.workspace.workspaceSlug}/${page.pageSlug}`
		});
	};

	const selectBreadcrumb = (crumb, isWorkspaceCrumb) => {
		if (!crumb || !shell.workspace) {
			return;
		}

		if (isWorkspaceCrumb) {
			updateState({
				selectedWorkspaceSlug: shell.workspace.workspaceSlug,
				selectedPageSlug: shell.firstVisiblePageSlug || '',
				workspaceStatus: `Returned to ${shell.workspace.name}.`
			});
			return;
		}

		updateState({
			selectedWorkspaceSlug: shell.workspace.workspaceSlug,
			selectedPageSlug: crumb.pageSlug,
			workspaceStatus: `Selected ${crumb.label} at /docsera/${shell.workspace.workspaceSlug}/${crumb.pageSlug}`
		});
	};

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
					<button type="button" className="docsera-shell__button docsera-shell__button--secondary" on-click={openLauncher}>
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

			<div className="docsera-shell__reader-frame">
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

					<div className="docsera-shell__reader-nav-summary">
						<span className="docsera-shell__toolbar-chip">{shell.visiblePages.length} visible pages</span>
						<span className="docsera-shell__toolbar-chip">{shell.routeTargetPath}</span>
					</div>

					<nav className="docsera-shell__tree" aria-label="Workspace page tree">
						{shell.pageTree.length ? renderPageTreeNodes(shell.pageTree, {
							selectPage,
							createChildPage: openCreatePageModal,
							selectedPageSlug: shell.selectedPageSlug,
							canCreatePages
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
	const capabilityService = createWorkspaceCapabilitiesForDemo(state.userAccess);
	const shell = buildWorkspaceShellViewModel({
		workspaces: state.workspaces,
		pages: state.pages,
		capabilityService,
		selectedWorkspaceSlug: state.selectedWorkspaceSlug,
		selectedPageSlug: state.selectedPageSlug
	});

	return renderWorkspaceReaderSurface(
		state,
		shell,
		updateState
	);
};

createCustomElement('x-82900-docsera-shell', {
	renderer: {type: snabbdom},
	setInitialState: createInitialState,
	view,
	styles
});
