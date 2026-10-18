# Implementation Notes - SDK Generated Module Identity Completion

## Invariant

Every production TypeScript or TSX module below `app/docsera-ui/src/server` has exactly one valid ServiceNow `sys_module` identity in `src/fluent/generated/keys.ts`. The identity key is the source path relative to `app/docsera-ui`, with path separators and filename dots replaced by underscores (for example, `src/server/workspaces/example.ts` becomes `src_server_workspaces_example_ts`; hyphens are preserved). Historical registry entries whose source files no longer exist are tolerated.

## Verification and recovery

Run `npm --prefix app/docsera-ui run verify:sdk-module-keys` to validate the working tree without changing files. `npm --prefix app/docsera-ui run build` runs `now-sdk build` and then this verifier, so SDK build success alone is not sufficient.

If the verifier reports a missing or malformed identity, use the established SDK generation workflow to obtain the real generated metadata, inspect it, and commit it with the owning server module. Do not invent sys_ids, edit the registry to silence the verifier, or bypass the task-worktree guard.

For any task that adds or modifies ServiceNow server modules or generated SDK metadata, complete this checkpoint sequence: finish implementation and SDK generation; review and commit the generated metadata with its owning changes; run `npm --prefix app/docsera-ui run verify:sdk-module-keys:checkpoint`; confirm the worktree is clean; and then push the verified checkpoint. The checkpoint verifier reads both the server-module tree and `keys.ts` from Git `HEAD`, applies the ordinary shared identity validation, and rejects any staged or unstaged change to the tracked generated registry. If another build or generation runs afterward, repeat the checkpoint verification before reporting completion.
