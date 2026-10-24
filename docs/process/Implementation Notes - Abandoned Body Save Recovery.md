# Abandoned Body-Save Recovery

`POST /api/x_82900_docsera/docsera_runtime/workspaces/recover-body-save` is an explicit, lease-authenticated administrative recovery boundary for the active workspace change-set generation. It accepts only the workspace reference and held Edit lease token.

The persistence boundary reloads the workspace authority, selects the active generation's claim, and supports only an expired `body` claim. It reconstructs the body-save arguments from the persisted claim payload and re-enters the existing `savePageBody()` phase/replay path. No client generation, claim owner, page identifier, or document payload is used for recovery.

Responses distinguish already-resolved, active original executor, unsupported claim kind, successful recovery, and recovery failure. They expose only the authoritative generation on non-error success; claim payloads and document contents are never returned. Recovery is idempotent and preserves the existing claim ownership compare-and-set behavior, so concurrent recovery requests cannot double-apply page, pending-entry, or generation state.
