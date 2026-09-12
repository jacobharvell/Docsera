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

    _cleanText: function (value) {
        return typeof value === 'string' ? value.trim() : '';
    },

    _cleanSysId: function (value) {
        var text = this._cleanText(value);
        return /^[0-9a-fA-F]{32}$/.test(text) ? text : '';
    },

    _validateInputs: function (adminGroupSysId, editorGroupSysId, userSysId) {
        if (!adminGroupSysId || !editorGroupSysId || !userSysId) {
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

    _logError: function (event, error) {
        var message = error && error.message ? error.message : String(error);
        gs.error('[Docsera global workspace membership bridge] ' + event + ': ' + message);
    },

    type: 'DocseraGlobalWorkspaceMembershipBridge',
};
