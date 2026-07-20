# Implementation Notes - Workspace Mutation Coordination

Docsera edit mode has one client-side server-facing mutation boundary for persisted workspace draft changes. Page body save, page creation, Page Settings save, page movement, and page removal enter the workspace mutation queue before calling ServiceNow.

The queue dispatches one persisted mutation at a time. Each operation reads the current ServiceNow-issued workspace authority immediately before dispatch. A successful response carrying mutation authority advances the accepted `{changeSetId, changeSetRevision}` before the next queued operation dispatches. The client does not predict, increment, repair, or reconstruct generation values.

Mutation ownership is specific to the operation. Workspace-level create, settings, move, and delete operations are owned by the originating workspace edit/lease context, so selected-page changes do not cancel them. Body saves are additionally owned by the originating page and editor session. Replacing the workspace, edit mode context, or lease generation prevents obsolete accepted mutation responses from installing authority or applying local UI changes.

Completion is ordered. Enqueuing operation B does not invalidate operation A. Every accepted result completes through its own handler in queue order, and later operations see authority returned by earlier accepted operations.

Authority installation is context-safe. The queue verifies that an accepted authoritative response still belongs to the originating active context before installing it. Older same-change-set revisions remain ignored, and responses from obsolete or different lineages cannot replace current authority.

Stale-generation responses are also owned by the exact originating workspace Edit lease context that dispatched the mutation. The queue verifies that this context is still current before starting projection recovery, and the App carries that same context through the recovery state. A stale response from an obsolete or replaced lease is a local no-op: it does not reload the projection, install authority, apply stale-recovery state, refresh pending changes, or replay the rejected operation.

While stale recovery is pending, a lease replacement makes the pending recovery obsolete even when the workspace slug is unchanged. Late recovery success or failure from the old lease must not replace the replacement lease's page projection, mutation authority, stale-recovery state, or pending-changes state. Failed recovery for the still-current lease continues to block writes from that lease and cancels later queued writes in that same context only; it does not cancel otherwise valid queued work for a replacement lease.

Stale-generation responses block the queue while the app reloads the authoritative edit projection and installs the returned server generation for the current originating context. If recovery succeeds, only queued operations that have not dispatched and still match the current context continue. If recovery fails for that current context, later queued writes from the affected context are canceled locally and new writes remain blocked by the existing reload/recovery state. The failed operation is not automatically replayed.

Non-idempotent create, move, delete, Publish, discard, and Undo commands must not be automatically replayed after stale-generation recovery. User input that can be recovered, such as Page Settings fields and inline create text, remains owned by the existing recovery store.

Body autosave keeps the existing latest-document contract: an active save can run while typing continues, and any follow-up save reads the latest editor document at dispatch time through the editor-provided reader. There is no second autosave state machine or generic coalescing framework in the queue.
