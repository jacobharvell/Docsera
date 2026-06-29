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
		workspaceSearch: '',
		selectedWorkspaceSlug: 'product-docs',
		createModalOpen: false,
		createModalError: '',
		createModalBusy: false,
		workspaceStatus: 'My Workspaces is ready.',
		workspaces: createMyWorkspacesDemoWorkspaces(),
		userAccess: createDemoAccessState(),
		newWorkspace: createWorkspaceModalDefaults()
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

const view = (state, {updateState}) => {
	const capabilityService = createWorkspaceCapabilitiesForDemo(state.userAccess);
	const launcher = buildMyWorkspacesViewModel(state.workspaces, capabilityService, state.workspaceSearch);
	const selectedWorkspace = getWorkspaceBySlug(state.workspaces, state.selectedWorkspaceSlug) ||
		launcher.filteredRows[0] ||
		launcher.accessibleRows[0] ||
		null;
	const selectedWorkspaceLabel = selectedWorkspace ? resolveWorkspaceCapabilityLabel(selectedWorkspace, capabilityService) : '';
	const selectedWorkspaceRoute = selectedWorkspace ? buildWorkspaceRoutePath(selectedWorkspace) : '/docsera';

	const openWorkspace = workspace => {
		if (!workspace) {
			return;
		}

		updateState({
			selectedWorkspaceSlug: workspace.workspaceSlug,
			workspaceStatus: `Opened ${workspace.name} at ${buildWorkspaceRoutePath(workspace)}`
		});
	};

	const openSettings = workspace => {
		if (!workspace) {
			return;
		}

		updateState({
			selectedWorkspaceSlug: workspace.workspaceSlug,
			workspaceStatus: `${workspace.name} settings are available for admins only.`
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
			const retainedSlugs = state.workspaces.map(workspace => workspace.workspaceSlug);
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
		<div className="docsera-shell">
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
								{launcher.filteredRows.map(workspace => (
									<div key={workspace.workspaceSlug} className="docsera-shell__workspace-row" role="listitem">
										<div className="docsera-shell__workspace-icon" aria-hidden="true">
											{renderIconGlyph(workspace)}
										</div>
										<div className="docsera-shell__workspace-copy">
											<div className="docsera-shell__workspace-headline">
												<button
													type="button"
													className="docsera-shell__workspace-name"
													on-click={() => openWorkspace(workspace)}
												>
													{workspace.name}
												</button>
												<span className="docsera-shell__role-pill">{workspace.roleLabel}</span>
											</div>
											{workspace.shortDescription ? (
												<p className="docsera-shell__workspace-description">{workspace.shortDescription}</p>
											) : null}
											<div className="docsera-shell__workspace-meta">
												<span className="docsera-shell__workspace-slug">{workspace.workspaceSlug}</span>
												{workspace.canManageSettings ? (
													<button
														type="button"
														className="docsera-shell__link-button"
														on-click={() => openSettings(workspace)}
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
												on-click={() => openWorkspace(workspace)}
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
};

createCustomElement('x-82900-docsera-shell', {
	renderer: {type: snabbdom},
	setInitialState: createInitialState,
	view,
	styles
});
