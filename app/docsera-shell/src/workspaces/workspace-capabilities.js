const DEFAULT_DOCSERA_ADMIN_ROLE_NAME = 'x_82900_odoc2.docsera_admin';

export const WORKSPACE_CAPABILITY_ROLE_NAMES = Object.freeze({
	docseraAdmin: DEFAULT_DOCSERA_ADMIN_ROLE_NAME,
	workspaceAdmin: 'x_82900_odoc2.workspace_admin',
	workspaceEditor: 'x_82900_odoc2.workspace_editor'
});

function cleanText(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

function resolveWorkspaceGroupSysId(workspace, fieldName) {
	if (!workspace || typeof workspace !== 'object') {
		return '';
	}

	return cleanText(workspace[fieldName]);
}

function ensureCallable(value, description) {
	if (typeof value !== 'function') {
		throw new TypeError(`${description} is required.`);
	}
}

function hasWorkspaceGroupMembership(dependencies, groupSysId) {
	if (!groupSysId) {
		return false;
	}

	return Boolean(dependencies.isMemberOfGroup(groupSysId));
}

function hasScopedRole(dependencies, roleName) {
	if (!roleName) {
		return false;
	}

	return Boolean(dependencies.hasRole(roleName));
}

function canUseWorkspaceGroup(dependencies, roleName, groupSysId) {
	return hasScopedRole(dependencies, roleName) && hasWorkspaceGroupMembership(dependencies, groupSysId);
}

export function createWorkspaceCapabilityService(dependencies = {}) {
	ensureCallable(dependencies.hasRole, 'A hasRole dependency');
	ensureCallable(dependencies.isMemberOfGroup, 'An isMemberOfGroup dependency');

	const roleNames = {
		docseraAdmin: cleanText(dependencies.docseraAdminRoleName) || WORKSPACE_CAPABILITY_ROLE_NAMES.docseraAdmin,
		workspaceAdmin: cleanText(dependencies.workspaceAdminRoleName) || WORKSPACE_CAPABILITY_ROLE_NAMES.workspaceAdmin,
		workspaceEditor: cleanText(dependencies.workspaceEditorRoleName) || WORKSPACE_CAPABILITY_ROLE_NAMES.workspaceEditor
	};

	function isDocseraAdmin() {
		return hasScopedRole(dependencies, roleNames.docseraAdmin);
	}

	function isWorkspaceAdmin(workspace) {
		if (isDocseraAdmin()) {
			return true;
		}

		return canUseWorkspaceGroup(
			dependencies,
			roleNames.workspaceAdmin,
			resolveWorkspaceGroupSysId(workspace, 'adminGroupSysId')
		);
	}

	function isWorkspaceEditor(workspace) {
		if (isDocseraAdmin()) {
			return true;
		}

		if (isWorkspaceAdmin(workspace)) {
			return true;
		}

		return canUseWorkspaceGroup(
			dependencies,
			roleNames.workspaceEditor,
			resolveWorkspaceGroupSysId(workspace, 'editorGroupSysId')
		);
	}

	function canViewWorkspace(workspace) {
		if (!workspace || typeof workspace !== 'object') {
			return false;
		}

		return workspace.active !== false;
	}

	return Object.freeze({
		roleNames: Object.freeze({...roleNames}),
		isDocseraAdmin,
		isWorkspaceAdmin,
		isWorkspaceEditor,
		canViewWorkspace
	});
}
