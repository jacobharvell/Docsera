(function () {
    var LEASE_TABLE = 'x_2300756_docsera_workspace_edit_lease';
    var STALE_AFTER_MS = 300000;
    var cutoff = new GlideDateTime();
    cutoff.addSeconds(-Math.floor(STALE_AFTER_MS / 1000));
    var cutoffValue = cutoff.getValue();

    var candidates = new GlideRecord(LEASE_TABLE);
    candidates.addQuery('last_seen_on', '<', cutoffValue);
    candidates.query();

    while (candidates.next()) {
        var sysId = String(candidates.getUniqueValue() || '').trim();
        var workspaceKey = String(candidates.getValue('workspace_key') || '').trim();
        var lastSeenOn = String(candidates.getValue('last_seen_on') || '').trim();
        if (!sysId || !workspaceKey || !lastSeenOn) {
            continue;
        }

        var exactDelete = new GlideRecord(LEASE_TABLE);
        exactDelete.addQuery('sys_id', sysId);
        exactDelete.addQuery('workspace_key', workspaceKey);
        exactDelete.addQuery('last_seen_on', lastSeenOn);
        exactDelete.addQuery('last_seen_on', '<', cutoffValue);
        exactDelete.query();
        exactDelete.deleteMultiple();
    }
})();
