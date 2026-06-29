const DEFAULT_WORKSPACE_ICON = Object.freeze({
	key: 'docsera-workspace',
	label: 'Docsera workspace icon',
	type: 'builtin'
});

export const WORKSPACE_LAUNCHER_ROLE_LABELS = Object.freeze({
	docseraAdmin: 'Docsera Admin',
	workspaceAdmin: 'Workspace Admin',
	workspaceEditor: 'Workspace Editor'
});

function cleanText(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

function normalizeQuery(value) {
	return cleanText(value).toLowerCase();
}

function resolveWorkspaceSlug(workspace) {
	if (!workspace || typeof workspace !== 'object') {
		return '';
	}

	return cleanText(workspace.workspaceSlug || workspace.slug || workspace.key);
}

function resolveWorkspaceIcon(workspace) {
	if (!workspace || typeof workspace !== 'object') {
		return DEFAULT_WORKSPACE_ICON;
	}

	const icon = workspace.icon;
	if (!icon || typeof icon !== 'object') {
		return DEFAULT_WORKSPACE_ICON;
	}

	return {
		...DEFAULT_WORKSPACE_ICON,
		...Object.fromEntries(
			Object.entries(icon).filter(([, value]) => value !== undefined && value !== null)
		)
	};
}

function buildWorkspaceSearchIndex(workspace) {
	const parts = [
		workspace.name,
		workspace.shortDescription,
		resolveWorkspaceSlug(workspace),
		workspace.roleLabel
	];

	return parts
		.map(part => cleanText(part).toLowerCase())
		.filter(Boolean)
		.join(' ');
}

function hasCapabilityMethod(capabilityService, methodName) {
	return capabilityService && typeof capabilityService[methodName] === 'function';
}

export function resolveWorkspaceCapabilityLabel(workspace, capabilityService) {
	if (!workspace || typeof workspace !== 'object') {
		return '';
	}

	if (hasCapabilityMethod(capabilityService, 'isDocseraAdmin') && capabilityService.isDocseraAdmin()) {
		return WORKSPACE_LAUNCHER_ROLE_LABELS.docseraAdmin;
	}

	if (hasCapabilityMethod(capabilityService, 'isWorkspaceAdmin') && capabilityService.isWorkspaceAdmin(workspace)) {
		return WORKSPACE_LAUNCHER_ROLE_LABELS.workspaceAdmin;
	}

	if (hasCapabilityMethod(capabilityService, 'isWorkspaceEditor') && capabilityService.isWorkspaceEditor(workspace)) {
		return WORKSPACE_LAUNCHER_ROLE_LABELS.workspaceEditor;
	}

	return '';
}

export function canManageWorkspaceSettings(workspace, capabilityService) {
	const label = resolveWorkspaceCapabilityLabel(workspace, capabilityService);
	return label === WORKSPACE_LAUNCHER_ROLE_LABELS.docseraAdmin || label === WORKSPACE_LAUNCHER_ROLE_LABELS.workspaceAdmin;
}

export function buildWorkspaceRoutePath(workspace) {
	const slug = resolveWorkspaceSlug(workspace);
	return slug ? `/docsera/${slug}` : '/docsera';
}

export function createWorkspaceModalDefaults() {
	return {
		name: '',
		shortDescription: '',
		icon: {
			...DEFAULT_WORKSPACE_ICON
		}
	};
}

export function prepareWorkspaceCreationInput(formState = {}, currentUserSysId = '') {
	const name = cleanText(formState.name);
	if (!name) {
		throw new TypeError('Workspace name is required.');
	}

	const icon = formState.icon && typeof formState.icon === 'object'
		? {...DEFAULT_WORKSPACE_ICON, ...formState.icon}
		: {...DEFAULT_WORKSPACE_ICON};

	return {
		name,
		shortDescription: cleanText(formState.shortDescription) || null,
		icon,
		createdBy: cleanText(currentUserSysId) || null
	};
}

export function buildMyWorkspacesViewModel(workspaces = [], capabilityService, searchQuery = '') {
	const accessibleRows = [];
	const query = normalizeQuery(searchQuery);

	for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
		if (!workspace || typeof workspace !== 'object') {
			continue;
		}

		if (workspace.active === false) {
			continue;
		}

		const roleLabel = resolveWorkspaceCapabilityLabel(workspace, capabilityService);
		if (!roleLabel) {
			continue;
		}

		const row = {
			...workspace,
			workspaceSlug: resolveWorkspaceSlug(workspace),
			name: cleanText(workspace.name),
			shortDescription: cleanText(workspace.shortDescription),
			icon: resolveWorkspaceIcon(workspace),
			roleLabel,
			canManageSettings: canManageWorkspaceSettings(workspace, capabilityService),
			searchIndex: buildWorkspaceSearchIndex({
				...workspace,
				roleLabel
			})
		};

		accessibleRows.push(row);
	}

	accessibleRows.sort((left, right) => {
		const nameComparison = left.name.localeCompare(right.name, undefined, {sensitivity: 'base'});
		if (nameComparison !== 0) {
			return nameComparison;
		}

		return left.workspaceSlug.localeCompare(right.workspaceSlug, undefined, {sensitivity: 'base'});
	});

	const filteredRows = query
		? accessibleRows.filter(row => row.searchIndex.includes(query))
		: accessibleRows;

	return {
		query,
		accessibleRows,
		filteredRows,
		hasAccessibleRows: accessibleRows.length > 0,
		hasFilteredRows: filteredRows.length > 0,
		isEmptyState: accessibleRows.length === 0,
		isNoResultsState: accessibleRows.length > 0 && filteredRows.length === 0
	};
}

export function createMyWorkspacesDemoWorkspaces() {
	return [
		{
			sysId: 'workspace-product-001',
			name: 'Product Docs',
			workspaceSlug: 'product-docs',
			shortDescription: 'Release notes, decisions, and launch guidance.',
			icon: {
				key: 'product-docs',
				label: 'Product Docs icon',
				type: 'builtin'
			},
			active: true,
			adminGroupSysId: 'group-product-admin',
			editorGroupSysId: 'group-product-editor'
		},
		{
			sysId: 'workspace-support-001',
			name: 'Support Runbooks',
			workspaceSlug: 'support-runbooks',
			shortDescription: 'Operational playbooks for the support team.',
			icon: {
				key: 'support-runbooks',
				label: 'Support Runbooks icon',
				type: 'builtin'
			},
			active: true,
			adminGroupSysId: 'group-support-admin',
			editorGroupSysId: 'group-support-editor'
		},
		{
			sysId: 'workspace-ops-001',
			name: 'Ops Archive',
			workspaceSlug: 'ops-archive',
			shortDescription: 'Inactive archive kept for migration testing.',
			icon: {
				key: 'ops-archive',
				label: 'Ops Archive icon',
				type: 'builtin'
			},
			active: false,
			adminGroupSysId: 'group-ops-admin',
			editorGroupSysId: 'group-ops-editor'
		},
		{
			sysId: 'workspace-reference-001',
			name: 'Reference Library',
			workspaceSlug: 'reference-library',
			shortDescription: 'Read-only reference content that should not appear here.',
			icon: {
				key: 'reference-library',
				label: 'Reference Library icon',
				type: 'builtin'
			},
			active: true,
			adminGroupSysId: '',
			editorGroupSysId: ''
		}
	];
}

export function createLocalWorkspaceProvisioningDependencies(currentUserSysId, membershipState = []) {
	const groupMemberships = Array.isArray(membershipState) ? membershipState : [];

	return {
		persistWorkspace: async draft => ({
			...draft,
			sysId: draft.workspaceSlug
		}),
		createGroup: async groupInput => ({
			name: groupInput.name,
			sys_id: `${groupInput.name}-sys-id`
		}),
		assignGroupRole: async () => undefined,
		addUserToGroup: async ({groupSysId}) => {
			if (groupSysId && !groupMemberships.includes(groupSysId)) {
				groupMemberships.push(groupSysId);
			}
			return {
				userSysId: currentUserSysId,
				groupSysId
			};
		},
		updateWorkspace: async workspace => workspace
	};
}

export function summarizeWorkspaceCreationResult(result) {
	if (!result || typeof result !== 'object' || !result.workspace) {
		return '';
	}

	const workspace = result.workspace;
	return `${workspace.name} created at ${buildWorkspaceRoutePath(workspace)}`;
}
