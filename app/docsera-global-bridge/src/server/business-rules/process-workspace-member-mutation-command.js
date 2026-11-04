(function executeRule(current) {
    function cleanText(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function fail(message) {
        current.setValue('state', 'failed');
        current.setValue('error_message', cleanText(message) || 'Workspace membership mutation failed.');
        current.update();
    }

    if (!current) {
        return;
    }

    if (current.getValue('state') !== 'requested') {
        return;
    }

    var workspaceSysId = cleanText(current.getValue('workspace'));
    var targetUserSysId = cleanText(current.getValue('target_user'));
    var mutationKind = cleanText(current.getValue('mutation_kind'));
    var accessLevel = cleanText(current.getValue('access_level'));

    var workspace = new GlideRecord('x_2300756_docsera_workspace');
    if (!workspace.get(workspaceSysId)) {
        fail('Workspace could not be found.');
        return;
    }

    var adminGroupSysId = cleanText(workspace.getValue('admin_group'));
    var editorGroupSysId = cleanText(workspace.getValue('editor_group'));
    var bridge = new DocseraGlobalWorkspaceMembershipBridge();
    var result;

    if (mutationKind === 'validate_workspace_group_deletion') {
        result = bridge.validateWorkspaceGroupDeletionTargets(adminGroupSysId, editorGroupSysId);
    } else if (mutationKind === 'delete_workspace_groups') {
        result = bridge.deleteWorkspaceGroups(adminGroupSysId, editorGroupSysId);
    } else if (mutationKind === 'set') {
        result = bridge.setWorkspaceMembership(adminGroupSysId, editorGroupSysId, targetUserSysId, accessLevel);
    } else if (mutationKind === 'remove') {
        result = bridge.removeWorkspaceMembership(adminGroupSysId, editorGroupSysId, targetUserSysId);
    } else {
        fail('Unsupported workspace membership mutation kind.');
        return;
    }

    if (!result || result.status !== 'succeeded') {
        fail(result && result.errorMessage ? result.errorMessage : 'Workspace membership mutation failed.');
        return;
    }

    current.setValue('state', 'succeeded');
    current.setValue('error_message', '');
    current.update();
})(current, previous);
