const DEFAULT_WORKSPACE_TABLE = 'x_82900_odoc2_workspace';
const DEFAULT_WORKSPACE_ROLE_PREFIX = 'x_82900_odoc2';
const DEFAULT_WORKSPACE_ICON = Object.freeze({
	key: 'docsera-workspace',
	label: 'Docsera workspace icon',
	type: 'builtin'
});

function cleanText(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

function toSlugFragment(value) {
	return cleanText(value)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

function resolveGroupSysId(group) {
	if (!group || typeof group !== 'object') {
		return '';
	}

	return group.sys_id || group.sysId || group.sysID || '';
}

function normalizeWorkspaceIcon(icon) {
	if (!icon) {
		return DEFAULT_WORKSPACE_ICON;
	}

	if (typeof icon === 'string') {
		return {
			...DEFAULT_WORKSPACE_ICON,
			value: cleanText(icon)
		};
	}

	if (typeof icon !== 'object') {
		return DEFAULT_WORKSPACE_ICON;
	}

	const normalized = {
		...DEFAULT_WORKSPACE_ICON
	};

	for (const [key, value] of Object.entries(icon)) {
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (trimmed) {
				normalized[key] = trimmed;
			}
			continue;
		}

		if (value !== undefined && value !== null) {
			normalized[key] = value;
		}
	}

	return normalized;
}

function normalizeRetainedWorkspaceKeys(retainedWorkspaces) {
	if (!Array.isArray(retainedWorkspaces)) {
		return [];
	}

	return retainedWorkspaces
		.map(entry => {
			if (typeof entry === 'string') {
				return cleanText(entry);
			}

			if (!entry || typeof entry !== 'object') {
				return '';
			}

			return cleanText(
				entry.workspaceSlug ||
				entry.workspaceKey ||
				entry.slug ||
				entry.key ||
				entry.name
			);
		})
		.filter(Boolean);
}

export const WORKSPACE_PERSISTENCE_MODEL = Object.freeze({
	tableName: DEFAULT_WORKSPACE_TABLE,
	uniqueKeyField: 'workspaceSlug',
	fields: Object.freeze([
		{name: 'name', type: 'string', required: true},
		{name: 'workspaceSlug', type: 'string', required: true, unique: true},
		{name: 'shortDescription', type: 'string', required: false},
		{name: 'icon', type: 'object', required: true, defaultValue: DEFAULT_WORKSPACE_ICON},
		{name: 'active', type: 'boolean', required: true, defaultValue: true},
		{name: 'adminGroupSysId', type: 'reference', referenceTable: 'sys_user_group', required: false},
		{name: 'editorGroupSysId', type: 'reference', referenceTable: 'sys_user_group', required: false},
		{name: 'createdBy', type: 'reference', referenceTable: 'sys_user', required: false},
		{name: 'createdOn', type: 'datetime', required: false}
	])
});

export const WORKSPACE_GROUP_ROLE_NAMES = Object.freeze({
	admin: `${DEFAULT_WORKSPACE_ROLE_PREFIX}.workspace_admin`,
	editor: `${DEFAULT_WORKSPACE_ROLE_PREFIX}.workspace_editor`
});

export function slugifyWorkspaceName(name) {
	const slug = toSlugFragment(name);
	return slug || 'workspace';
}

function toWorkspaceTitleFragment(value) {
	return cleanText(value)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(part => {
			if (part === part.toUpperCase()) {
				return part;
			}

			return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
		})
		.join('_');
}

export function deriveWorkspaceGroupKey(name, workspaceSlug) {
	const titleKey = toWorkspaceTitleFragment(name);
	const slugSuffixMatch = cleanText(workspaceSlug).match(/-(\d+)$/);
	const suffix = slugSuffixMatch ? `_${slugSuffixMatch[1]}` : '';
	const baseKey = titleKey || 'Workspace';

	return `${baseKey}${suffix}`;
}

export function allocateWorkspaceSlug(name, retainedWorkspaces = []) {
	const baseSlug = slugifyWorkspaceName(name);
	const retainedKeys = new Set(normalizeRetainedWorkspaceKeys(retainedWorkspaces));

	if (!retainedKeys.has(baseSlug)) {
		return baseSlug;
	}

	let suffix = 2;
	while (retainedKeys.has(`${baseSlug}-${suffix}`)) {
		suffix += 1;
	}

	return `${baseSlug}-${suffix}`;
}

export function buildWorkspaceGroupNames(workspaceKey) {
	const key = cleanText(workspaceKey) || 'workspace';

	return Object.freeze({
		admin: `Docsera_${key}_Admins`,
		editor: `Docsera_${key}_Editors`
	});
}

export function createWorkspaceDraft(input, retainedWorkspaces = []) {
	if (!input || typeof input !== 'object') {
		throw new TypeError('Workspace input must be an object.');
	}

	const name = cleanText(input.name);
	if (!name) {
		throw new TypeError('Workspace name is required.');
	}

	const workspaceSlug = allocateWorkspaceSlug(name, retainedWorkspaces);
	const workspaceGroupKey = deriveWorkspaceGroupKey(name, workspaceSlug);
	const groupNames = buildWorkspaceGroupNames(workspaceGroupKey);

	return {
		tableName: WORKSPACE_PERSISTENCE_MODEL.tableName,
		name,
		workspaceSlug,
		workspaceGroupKey,
		shortDescription: cleanText(input.shortDescription) || null,
		icon: normalizeWorkspaceIcon(input.icon),
		active: input.active !== undefined ? Boolean(input.active) : true,
		adminGroupName: groupNames.admin,
		editorGroupName: groupNames.editor,
		adminGroupRoleName: WORKSPACE_GROUP_ROLE_NAMES.admin,
		editorGroupRoleName: WORKSPACE_GROUP_ROLE_NAMES.editor,
		createdBy: cleanText(input.createdBy) || null,
		createdOn: input.createdOn || null
	};
}

async function assignGroupRoleIfSupported(dependencies, groupSysId, roleName) {
	if (!roleName || typeof dependencies.assignGroupRole !== 'function') {
		return;
	}

	await dependencies.assignGroupRole({
		groupSysId,
		roleName
	});
}

export async function provisionWorkspace(input, dependencies, retainedWorkspaces = []) {
	if (!dependencies || typeof dependencies !== 'object') {
		throw new TypeError('Workspace provisioning dependencies are required.');
	}

	if (typeof dependencies.persistWorkspace !== 'function') {
		throw new TypeError('A persistWorkspace dependency is required.');
	}

	if (typeof dependencies.createGroup !== 'function') {
		throw new TypeError('A createGroup dependency is required.');
	}

	if (typeof dependencies.addUserToGroup !== 'function') {
		throw new TypeError('An addUserToGroup dependency is required.');
	}

	const draft = createWorkspaceDraft(input, retainedWorkspaces);
	const persistedWorkspace = await dependencies.persistWorkspace(draft);

	const adminGroup = await dependencies.createGroup({
		name: draft.adminGroupName,
		description: `Workspace admin group for ${draft.name}`,
		workspaceGroupKey: draft.workspaceGroupKey,
		workspaceSlug: draft.workspaceSlug,
		type: 'admin'
	});
	const editorGroup = await dependencies.createGroup({
		name: draft.editorGroupName,
		description: `Workspace editor group for ${draft.name}`,
		workspaceGroupKey: draft.workspaceGroupKey,
		workspaceSlug: draft.workspaceSlug,
		type: 'editor'
	});

	const adminGroupSysId = resolveGroupSysId(adminGroup);
	const editorGroupSysId = resolveGroupSysId(editorGroup);

	if (!adminGroupSysId || !editorGroupSysId) {
		throw new Error('Group creation did not return stable sys_id values.');
	}

	await assignGroupRoleIfSupported(dependencies, adminGroupSysId, draft.adminGroupRoleName);
	await assignGroupRoleIfSupported(dependencies, editorGroupSysId, draft.editorGroupRoleName);

	if (draft.createdBy) {
		await dependencies.addUserToGroup({
			groupSysId: adminGroupSysId,
			userSysId: draft.createdBy
		});
	}

	const workspaceWithGroups = {
		...persistedWorkspace,
		workspaceSlug: draft.workspaceSlug,
		workspaceGroupKey: draft.workspaceGroupKey,
		adminGroupSysId,
		editorGroupSysId,
		adminGroupName: draft.adminGroupName,
		editorGroupName: draft.editorGroupName
	};

	if (typeof dependencies.updateWorkspace === 'function') {
		return {
			draft,
			workspace: await dependencies.updateWorkspace(workspaceWithGroups),
			adminGroup,
			editorGroup
		};
	}

	return {
		draft,
		workspace: workspaceWithGroups,
		adminGroup,
		editorGroup
	};
}
