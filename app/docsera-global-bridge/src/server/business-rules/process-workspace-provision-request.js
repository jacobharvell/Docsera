(function executeRule(current) {
    if (!current) {
        return;
    }

    if (current.getValue('state') !== 'requested') {
        return;
    }

    var worker = new DocseraGlobalWorkspaceProvisioningBridge();
    worker.processRequest(current.getUniqueValue());
})(current, previous);
