(function () {
    var LOCK_TABLE = 'x_82900_docsera_page_edit_lock';
    var STALE_AFTER_MS = 180000;
    var cutoff = new GlideDateTime();
    cutoff.addSeconds(-Math.floor(STALE_AFTER_MS / 1000));
    var cutoffValue = cutoff.getValue();

    var candidates = new GlideRecord(LOCK_TABLE);
    candidates.addQuery('last_seen_on', '<', cutoffValue);
    candidates.query();

    while (candidates.next()) {
        var sysId = String(candidates.getUniqueValue() || '').trim();
        if (!sysId) {
            continue;
        }

        var exactDelete = new GlideRecord(LOCK_TABLE);
        exactDelete.addQuery('sys_id', sysId);
        exactDelete.addQuery('last_seen_on', '<', cutoffValue);
        exactDelete.setLimit(1);
        exactDelete.query();

        if (exactDelete.next()) {
            exactDelete.deleteRecord();
        }
    }
})();
