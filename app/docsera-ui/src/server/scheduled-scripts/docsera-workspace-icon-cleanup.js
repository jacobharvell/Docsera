(function () {
    var TABLE = 'x_82900_docsera_workspace_icon_asset';
    var RETENTION_SECONDS = 7 * 24 * 60 * 60;
    var BATCH_SIZE = 50;
    var cutoff = new GlideDateTime();
    cutoff.addSeconds(-RETENTION_SECONDS);

    var processed = 0;

    function cleanCandidates(candidates) {
        while (processed < BATCH_SIZE && candidates.next()) {
            processed++;
            try {
                var id = String(candidates.getUniqueValue() || '');
                var attachmentId = String(candidates.getValue('attachment') || '');
                var state = String(candidates.getValue('state') || '');
                if (!id || !attachmentId) continue;
                if (state === 'staged') {
                    var claim = new GlideRecord(TABLE);
                    claim.addQuery('sys_id', id);
                    claim.addQuery('state', 'staged');
                    claim.addQuery('provision_request', '');
                    claim.addQuery('sys_updated_on', '<', cutoff.getValue());
                    claim.setValue('state', 'cleaning');
                    claim.updateMultiple();
                }
                var asset = new GlideRecord(TABLE);
                if (!asset.get('sys_id', id) || String(asset.getValue('state') || '') !== 'cleaning' || String(asset.getValue('provision_request') || '')) continue;
                var attachment = new GlideRecord('sys_attachment');
                if (attachment.get('sys_id', attachmentId)) {
                    if (String(attachment.getValue('table_name') || '') !== TABLE || String(attachment.getValue('table_sys_id') || '') !== id) continue;
                    new GlideSysAttachment().deleteAttachment(attachmentId);
                }
                var absent = new GlideRecord('sys_attachment');
                if (absent.get('sys_id', attachmentId)) continue;
                var remove = new GlideRecord(TABLE);
                remove.addQuery('sys_id', id);
                remove.addQuery('state', 'cleaning');
                remove.addQuery('attachment', attachmentId);
                remove.deleteMultiple();
            } catch (error) {
                gs.warn('Docsera workspace icon cleanup deferred one asset: ' + error);
            }
        }
    }

    // Retry interrupted durable claims first; their age does not affect eligibility.
    var cleaningCandidates = new GlideRecord(TABLE);
    cleaningCandidates.addQuery('state', 'cleaning');
    cleaningCandidates.addQuery('provision_request', '');
    cleaningCandidates.orderBy('sys_updated_on');
    cleaningCandidates.setLimit(BATCH_SIZE);
    cleaningCandidates.query();
    cleanCandidates(cleaningCandidates);

    // Apply staged-upload retention before limiting the remaining batch capacity.
    if (processed < BATCH_SIZE) {
        var stagedCandidates = new GlideRecord(TABLE);
        stagedCandidates.addQuery('state', 'staged');
        stagedCandidates.addQuery('provision_request', '');
        stagedCandidates.addQuery('sys_updated_on', '<', cutoff.getValue());
        stagedCandidates.orderBy('sys_updated_on');
        stagedCandidates.setLimit(BATCH_SIZE - processed);
        stagedCandidates.query();
        cleanCandidates(stagedCandidates);
    }
})();
