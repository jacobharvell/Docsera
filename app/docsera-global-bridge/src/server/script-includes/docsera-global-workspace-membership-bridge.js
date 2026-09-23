var DocseraGlobalWorkspaceMembershipBridge = Class.create();

DocseraGlobalWorkspaceMembershipBridge.prototype = {
    initialize: function () {},

    setWorkspaceMembership: function (adminGroupSysId, editorGroupSysId, userSysId, accessLevel) {
        try {
            var adminGroup = this._cleanSysId(adminGroupSysId);
            var editorGroup = this._cleanSysId(editorGroupSysId);
            var user = this._cleanSysId(userSysId);
            var level = this._cleanText(accessLevel).toLowerCase();

            this._validateInputs(adminGroup, editorGroup, user);
            if (level !== 'admin' && level !== 'editor') {
                throw new Error('Invalid workspace membership access level.');
            }

            this._validateWorkspaceGroupPair(adminGroup, editorGroup);

            if (level === 'admin') {
                this._addUserToGroup(adminGroup, user);
                this._removeUserFromGroup(editorGroup, user);
            } else {
                this._addUserToGroup(editorGroup, user);
                this._removeUserFromGroup(adminGroup, user);
            }

            return {
                status: 'succeeded',
            };
        } catch (error) {
            this._logError('setWorkspaceMembership', error);
            return {
                status: 'failed',
                errorMessage: 'Workspace membership could not be updated.',
            };
        }
    },

    removeWorkspaceMembership: function (adminGroupSysId, editorGroupSysId, userSysId) {
        try {
            var adminGroup = this._cleanSysId(adminGroupSysId);
            var editorGroup = this._cleanSysId(editorGroupSysId);
            var user = this._cleanSysId(userSysId);

            this._validateInputs(adminGroup, editorGroup, user);
            this._validateWorkspaceGroupPair(adminGroup, editorGroup);
            this._removeUserFromGroup(adminGroup, user);
            this._removeUserFromGroup(editorGroup, user);

            return {
                status: 'succeeded',
            };
        } catch (error) {
            this._logError('removeWorkspaceMembership', error);
            return {
                status: 'failed',
                errorMessage: 'Workspace membership could not be removed.',
            };
        }
    },

    deleteWorkspaceGroups: function (adminGroupSysId, editorGroupSysId) {
        try {
            var adminGroup = this._cleanSysId(adminGroupSysId);
            var editorGroup = this._cleanSysId(editorGroupSysId);

            this._validateGroupPairInputs(adminGroup, editorGroup);
            var targets = this._validateWorkspaceGroupDeletionTargets(adminGroup, editorGroup, true);
            if (targets.editorGroup) {
                targets.editorGroup.deleteRecord();
            }
            if (targets.adminGroup) {
                targets.adminGroup.deleteRecord();
            }

            return {
                status: 'succeeded',
            };
        } catch (error) {
            this._logError('deleteWorkspaceGroups', error);
            return {
                status: 'failed',
                errorMessage: 'Workspace access groups could not be deleted.',
            };
        }
    },

    validateWorkspaceGroupDeletionTargets: function (adminGroupSysId, editorGroupSysId) {
        try {
            var adminGroup = this._cleanSysId(adminGroupSysId);
            var editorGroup = this._cleanSysId(editorGroupSysId);

            this._validateGroupPairInputs(adminGroup, editorGroup);
            this._validateWorkspaceGroupDeletionTargets(adminGroup, editorGroup, false);

            return {
                status: 'succeeded',
            };
        } catch (error) {
            this._logError('validateWorkspaceGroupDeletionTargets', error);
            return {
                status: 'failed',
                errorMessage: 'Workspace access groups could not be validated.',
            };
        }
    },

    _cleanText: function (value) {
        return typeof value === 'string' ? value.trim() : '';
    },

    _cleanSysId: function (value) {
        var text = this._cleanText(value);
        return /^[0-9a-fA-F]{32}$/.test(text) ? text : '';
    },

    _validateInputs: function (adminGroupSysId, editorGroupSysId, userSysId) {
        this._validateGroupPairInputs(adminGroupSysId, editorGroupSysId);
        if (!userSysId) {
            throw new Error('Workspace membership mutation inputs were invalid.');
        }
    },

    _validateGroupPairInputs: function (adminGroupSysId, editorGroupSysId) {
        if (!adminGroupSysId || !editorGroupSysId) {
            throw new Error('Workspace membership mutation inputs were invalid.');
        }
        if (adminGroupSysId === editorGroupSysId) {
            throw new Error('Workspace Admin and Editor groups must be distinct.');
        }
    },

    _validateWorkspaceGroupPair: function (adminGroupSysId, editorGroupSysId) {
        var workspace = new GlideRecord('x_82900_docsera_workspace');
        workspace.addQuery('admin_group', adminGroupSysId);
        workspace.addQuery('editor_group', editorGroupSysId);
        workspace.setLimit(1);
        workspace.query();

        if (!workspace.next()) {
            throw new Error('Workspace membership group pair is not owned by a Docsera workspace.');
        }
    },

    _addUserToGroup: function (groupSysId, userSysId) {
        var existing = new GlideRecord('sys_user_grmember');
        existing.addQuery('group', groupSysId);
        existing.addQuery('user', userSysId);
        existing.setLimit(1);
        existing.query();
        if (existing.next()) {
            return;
        }

        var membership = new GlideRecord('sys_user_grmember');
        membership.initialize();
        membership.setValue('group', groupSysId);
        membership.setValue('user', userSysId);
        if (!this._cleanText(membership.insert())) {
            throw new Error('Workspace group membership could not be created.');
        }
    },

    _removeUserFromGroup: function (groupSysId, userSysId) {
        var memberships = new GlideRecord('sys_user_grmember');
        memberships.addQuery('group', groupSysId);
        memberships.addQuery('user', userSysId);
        memberships.query();
        while (memberships.next()) {
            memberships.deleteRecord();
        }
    },

    _validateWorkspaceGroupDeletionTargets: function (adminGroupSysId, editorGroupSysId, allowMissingTargets) {
        this._validateWorkspaceGroupPair(adminGroupSysId, editorGroupSysId);
        var adminGroup = this._loadGeneratedWorkspaceGroup(adminGroupSysId, 'Admins', allowMissingTargets);
        var editorGroup = this._loadGeneratedWorkspaceGroup(editorGroupSysId, 'Editors', allowMissingTargets);
        return {
            adminGroup: adminGroup,
            editorGroup: editorGroup,
        };
    },

    _loadGeneratedWorkspaceGroup: function (groupSysId, suffix, allowMissingTarget) {
        var group = new GlideRecord('sys_user_group');
        if (!group.get(groupSysId)) {
            if (allowMissingTarget) {
                return null;
            }
            throw new Error('Workspace group deletion target could not be found.');
        }
        var actualName = this._cleanText(group.getValue('name'));
        var pattern = new RegExp('^Docsera_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_' + suffix + '$');
        if (!pattern.test(actualName)) {
            throw new Error('Workspace group deletion target was not a Docsera-owned workspace group.');
        }
        return group;
    },

    _logError: function (event, error) {
        var message = error && error.message ? error.message : String(error);
        gs.error('[Docsera global workspace membership bridge] ' + event + ': ' + message);
    },

    type: 'DocseraGlobalWorkspaceMembershipBridge',
};
