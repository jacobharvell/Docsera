var DocseraGlobalWorkspaceProvisioningBridge = Class.create();

DocseraGlobalWorkspaceProvisioningBridge.prototype = {
    initialize: function () {},

    processRequest: function (requestSysId) {
        var requestId = this._cleanText(requestSysId);
        if (!requestId) {
            return {
                status: 'ignored',
            };
        }

        var request = this._claimRequest(requestId);
        if (!request) {
            return {
                status: 'ignored',
            };
        }

        var createdGroupIds = [];
        var workspaceSysId = '';
        var stage = 'validation';

        try {
            var payload = this._readRequestPayload(request);
            this._validateRequestPayload(payload);

            stage = 'create_admin_group';
            var adminGroup = this._createGroup(
                payload.adminGroupName,
                'Workspace admin group for ' + payload.workspaceName
            );
            createdGroupIds.push(adminGroup.sysId);

            stage = 'create_editor_group';
            var editorGroup = this._createGroup(
                payload.editorGroupName,
                'Workspace editor group for ' + payload.workspaceName
            );
            createdGroupIds.push(editorGroup.sysId);

            stage = 'assign_admin_role';
            this._assignRoleToGroup(adminGroup.sysId, this._ROLE_NAMES.workspaceAdmin);

            stage = 'assign_editor_role';
            this._assignRoleToGroup(editorGroup.sysId, this._ROLE_NAMES.editor);

            stage = 'create_workspace';
            workspaceSysId = this._createWorkspaceRecord(payload, adminGroup.sysId, editorGroup.sysId);

            stage = 'finalize_uploaded_icon';
            this._finalizeUploadedIconAsset(request, payload, workspaceSysId);

            stage = 'mark_succeeded';
            this._markRequestSucceeded(requestId, workspaceSysId, adminGroup.sysId, editorGroup.sysId);

            return {
                status: 'succeeded',
                workspaceSysId: workspaceSysId,
            };
        } catch (error) {
            this._rollbackCreatedWorkspace(workspaceSysId);
            this._restoreUploadedIconAssetClaim(requestId);
            this._rollbackCreatedGroups(createdGroupIds);
            this._markRequestFailed(requestId, this._errorCodeForStage(stage), this._safeMessageForStage(stage));
            this._logError('processRequest.' + stage, error);

            return {
                status: 'failed',
            };
        }
    },

    _DOCSERA_SCOPE: 'x_82900_docsera',
    _REQUEST_TABLE: 'x_82900_docsera_workspace_provision_request',
    _WORKSPACE_TABLE: 'x_82900_docsera_workspace',
    _WORKSPACE_ICON_ASSET_TABLE: 'x_82900_docsera_workspace_icon_asset',

    _ROLE_NAMES: {
        workspaceAdmin: 'x_82900_docsera.workspace_admin',
        editor: 'x_82900_docsera.editor',
    },

    _cleanText: function (value) {
        return typeof value === 'string' ? value.trim() : '';
    },

    _normalizeBoolean: function (value) {
        var normalized = String(value).toLowerCase();
        return value === true || value === 1 || normalized === 'true' || normalized === '1' || normalized === 'yes';
    },

    _serializeBoolean: function (value) {
        return value ? 'true' : 'false';
    },

    _claimRequest: function (requestSysId) {
        var request = new GlideRecord(this._REQUEST_TABLE);
        if (!request.get(requestSysId)) {
            return null;
        }

        if (this._cleanText(request.getValue('state')) !== 'requested') {
            return null;
        }

        request.setValue('state', 'processing');
        request.setValue('error_code', '');
        request.setValue('error_message', '');
        request.update();

        var claimed = new GlideRecord(this._REQUEST_TABLE);
        if (!claimed.get(requestSysId)) {
            return null;
        }

        return claimed;
    },

    _readRequestPayload: function (request) {
        return {
            adminGroupName: this._cleanText(request.getValue('admin_group_name')),
            editorGroupName: this._cleanText(request.getValue('editor_group_name')),
            iconAssetPath: this._cleanText(request.getValue('icon_asset_path')),
            iconKey: this._cleanText(request.getValue('icon_key')),
            iconLabel: this._cleanText(request.getValue('icon_label')),
            iconType: this._cleanText(request.getValue('icon_type')) === 'uploaded' ? 'uploaded' : 'builtin',
            pageWidth: this._cleanText(request.getValue('page_width')) === 'full' ? 'full' : 'readable',
            requestedBySysId: this._cleanText(request.getValue('requested_by')),
            shortDescription: this._cleanText(request.getValue('short_description')),
            tocDefaultVisible: this._normalizeBoolean(request.getValue('toc_default_visible')),
            workspaceGroupKey: this._cleanText(request.getValue('workspace_group_key')),
            workspaceName: this._cleanText(request.getValue('name')),
            workspaceSlug: this._cleanText(request.getValue('workspace_slug')),
            workspaceStatus: this._cleanText(request.getValue('workspace_status')) === 'inactive' ? 'inactive' : 'active',
        };
    },

    _validateRequestPayload: function (payload) {
        if (!payload.requestedBySysId) {
            throw new Error('Missing workspace creator.');
        }

        if (!payload.workspaceName || payload.workspaceName.length > 160) {
            throw new Error('Invalid workspace name.');
        }

        if (!payload.workspaceSlug || payload.workspaceSlug.length > 160) {
            throw new Error('Invalid workspace slug.');
        }

        if (!this._isValidWorkspaceGroupKey(payload.workspaceGroupKey)) {
            throw new Error('Invalid workspace group key.');
        }

        var expectedNames = this._buildExpectedGroupNames(payload.workspaceGroupKey);
        if (
            payload.adminGroupName !== expectedNames.admin ||
            payload.editorGroupName !== expectedNames.editor
        ) {
            throw new Error('Provisioning group names did not match the Docsera contract.');
        }
    },

    _isValidWorkspaceGroupKey: function (value) {
        return /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(this._cleanText(value));
    },

    _buildExpectedGroupNames: function (workspaceGroupKey) {
        return {
            admin: 'Docsera_' + workspaceGroupKey + '_Admins',
            editor: 'Docsera_' + workspaceGroupKey + '_Editors',
        };
    },

    _createGroup: function (name, description) {
        var existing = new GlideRecord('sys_user_group');
        existing.addQuery('name', name);
        existing.setLimit(1);
        existing.query();
        if (existing.next()) {
            throw new Error('A required workspace access group already exists.');
        }

        var group = new GlideRecord('sys_user_group');
        group.initialize();
        group.setValue('name', name);
        group.setValue('description', description);

        var sysId = this._cleanText(group.insert());
        if (!sysId) {
            throw new Error('A required workspace access group could not be created.');
        }

        return {
            sysId: sysId,
            name: name,
        };
    },

    _getRoleSysId: function (roleName) {
        var role = new GlideRecord('sys_user_role');
        role.addQuery('name', roleName);
        role.setLimit(1);
        role.query();

        if (!role.next()) {
            throw new Error('A required Docsera role is missing.');
        }

        return this._cleanText(role.getUniqueValue());
    },

    _assignRoleToGroup: function (groupSysId, roleName) {
        var roleSysId = this._getRoleSysId(roleName);
        var membership = new GlideRecord('sys_group_has_role');
        membership.addQuery('group', groupSysId);
        membership.addQuery('role', roleSysId);
        membership.setLimit(1);
        membership.query();

        if (membership.next()) {
            return;
        }

        membership.initialize();
        membership.setValue('group', groupSysId);
        membership.setValue('role', roleSysId);

        if (!this._cleanText(membership.insert())) {
            throw new Error('A required workspace role could not be assigned.');
        }
    },

    _createWorkspaceRecord: function (payload, adminGroupSysId, editorGroupSysId) {
        var workspace = new GlideRecord(this._WORKSPACE_TABLE);
        workspace.initialize();
        workspace.setValue('name', payload.workspaceName);
        workspace.setValue('workspace_slug', payload.workspaceSlug);
        workspace.setValue('short_description', payload.shortDescription || '');
        workspace.setValue('icon_type', payload.iconType);
        workspace.setValue('icon_key', payload.iconKey);
        workspace.setValue('icon_label', payload.iconLabel);
        workspace.setValue('icon_asset_path', payload.iconAssetPath || '');
        workspace.setValue('status', payload.workspaceStatus);
        workspace.setValue('admin_group', adminGroupSysId);
        workspace.setValue('editor_group', editorGroupSysId);
        workspace.setValue('creator', payload.requestedBySysId);
        workspace.setValue('toc_default_visible', this._serializeBoolean(payload.tocDefaultVisible));
        workspace.setValue('page_width', payload.pageWidth);

        var workspaceSysId = this._cleanText(workspace.insert());
        if (!workspaceSysId) {
            throw new Error('The Docsera workspace record could not be created.');
        }

        return workspaceSysId;
    },

    _markRequestSucceeded: function (requestSysId, workspaceSysId, adminGroupSysId, editorGroupSysId) {
        var request = new GlideRecord(this._REQUEST_TABLE);
        if (!request.get(requestSysId)) {
            return;
        }

        request.setValue('workspace', workspaceSysId);
        request.setValue('admin_group', adminGroupSysId);
        request.setValue('editor_group', editorGroupSysId);
        request.setValue('error_code', '');
        request.setValue('error_message', '');
        request.setValue('state', 'succeeded');
        request.update();
    },

    _finalizeUploadedIconAsset: function (request, payload, workspaceSysId) {
        if (payload.iconType !== 'uploaded') {
            return;
        }
        var assetKey = this._cleanText(payload.iconKey);
        if (!assetKey) {
            throw new Error('Uploaded workspace icon key was missing.');
        }
        var asset = new GlideRecord(this._WORKSPACE_ICON_ASSET_TABLE);
        asset.addQuery('asset_key', assetKey);
        asset.addQuery('state', 'claimed');
        asset.addQuery('provision_request', this._cleanText(request.getUniqueValue()));
        asset.addQuery('workspace', '');
        asset.setValue('workspace', workspaceSysId);
        asset.setValue('provision_request', this._cleanText(request.getUniqueValue()));
        asset.setValue('state', 'claimed');
        asset.updateMultiple();

        var verified = new GlideRecord(this._WORKSPACE_ICON_ASSET_TABLE);
        verified.addQuery('asset_key', assetKey);
        verified.setLimit(1);
        verified.query();
        if (
            !verified.next() ||
            this._cleanText(verified.getValue('state')) !== 'claimed' ||
            this._cleanText(verified.getValue('provision_request')) !== this._cleanText(request.getUniqueValue()) ||
            this._cleanText(verified.getValue('workspace')) !== workspaceSysId
        ) {
            throw new Error('Uploaded workspace icon asset finalization could not be verified.');
        }
    },

    _markRequestFailed: function (requestSysId, errorCode, errorMessage) {
        var request = new GlideRecord(this._REQUEST_TABLE);
        if (!request.get(requestSysId)) {
            return;
        }

        request.setValue('state', 'failed');
        request.setValue('error_code', errorCode);
        request.setValue('error_message', this._truncateSafeMessage(errorMessage));
        request.update();
    },

    _truncateSafeMessage: function (value) {
        var message = this._cleanText(value) || 'Workspace provisioning failed.';
        return message.length > 255 ? message.substring(0, 255) : message;
    },

    _errorCodeForStage: function (stage) {
        switch (stage) {
            case 'validation':
                return 'invalid_request';
            case 'create_admin_group':
            case 'create_editor_group':
                return 'group_create_failed';
            case 'assign_admin_role':
            case 'assign_editor_role':
                return 'role_assignment_failed';
            case 'create_workspace':
                return 'workspace_create_failed';
            case 'finalize_uploaded_icon':
                return 'workspace_icon_finalize_failed';
            default:
                return 'provisioning_failed';
        }
    },

    _safeMessageForStage: function (stage) {
        switch (stage) {
            case 'validation':
                return 'Workspace provisioning request was invalid.';
            case 'create_admin_group':
            case 'create_editor_group':
                return 'Failed to create workspace access groups.';
            case 'assign_admin_role':
            case 'assign_editor_role':
                return 'Failed to assign Docsera roles to workspace groups.';
            case 'create_workspace':
                return 'Failed to create the workspace record after provisioning access groups.';
            case 'finalize_uploaded_icon':
                return 'Failed to attach the uploaded workspace icon to the new workspace.';
            default:
                return 'Workspace provisioning failed.';
        }
    },

    _rollbackCreatedWorkspace: function (workspaceSysId) {
        var sysId = this._cleanText(workspaceSysId);
        if (!sysId) {
            return;
        }

        var workspace = new GlideRecord(this._WORKSPACE_TABLE);
        if (workspace.get(sysId)) {
            workspace.deleteRecord();
        }
    },

    _restoreUploadedIconAssetClaim: function (requestSysId) {
        var request = new GlideRecord(this._REQUEST_TABLE);
        if (!request.get(requestSysId) || this._cleanText(request.getValue('icon_type')) !== 'uploaded') {
            return;
        }

        var asset = new GlideRecord(this._WORKSPACE_ICON_ASSET_TABLE);
        asset.addQuery('asset_key', this._cleanText(request.getValue('icon_key')));
        asset.addQuery('state', 'claimed');
        asset.addQuery('provision_request', this._cleanText(request.getUniqueValue()));
        asset.setLimit(1);
        asset.query();
        if (!asset.next()) {
            return;
        }
        asset.setValue('state', 'staged');
        asset.setValue('provision_request', '');
        asset.setValue('workspace', '');
        asset.update();
    },

    _rollbackCreatedGroups: function (groupSysIds) {
        for (var index = groupSysIds.length - 1; index >= 0; index -= 1) {
            this._deleteProvisionedGroup(groupSysIds[index]);
        }
    },

    _deleteProvisionedGroup: function (groupSysId) {
        var sysId = this._cleanText(groupSysId);
        if (!sysId) {
            return;
        }

        var group = new GlideRecord('sys_user_group');
        if (!group.get(sysId)) {
            return;
        }

        var actualName = this._cleanText(group.getValue('name'));
        if (!/^Docsera_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_(Admins|Editors)$/.test(actualName)) {
            throw new Error('Rollback target was not a Docsera-owned workspace group.');
        }

        group.deleteRecord();
    },

    _logError: function (event, error) {
        var message = error && error.message ? error.message : String(error);
        gs.error('[Docsera global workspace worker] ' + event + ': ' + message);
    },

    type: 'DocseraGlobalWorkspaceProvisioningBridge',
};
