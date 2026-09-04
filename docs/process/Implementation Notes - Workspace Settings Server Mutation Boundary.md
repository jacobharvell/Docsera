# Implementation Notes - Workspace Settings Server Mutation Boundary

Task 55A establishes the MVP Workspace Settings server mutation boundary for existing workspaces.

The authoritative settings save path is `PUT /api/x_82900_docsera/docsera_runtime/workspaces/settings`, implemented by `src/server/api/docsera-runtime-workspace-settings-save.ts` and `src/server/workspaces/serviceNowWorkspaceSettings.ts`.

The mutation requires effective Workspace Admin or Docsera Admin capability through the existing group-first capability evaluator. Workspace Editor and read-only users are rejected server-side. The save path does not read, require, acquire, renew, or release the Workspace Edit lease.

Allowed persisted fields are limited to workspace name, short description, ToC default visibility, and workspace icon metadata. The workspace slug, Admin group, Editor group, lifecycle status, pending change-set reference, published snapshot reference, workspace state revision, and physical `page_width` value are preserved from the current row.

Workspace icon settings accept controlled built-in icon keys and settings-staged uploaded icon replacements. If the icon input is omitted, the existing icon is preserved, including uploaded icons. Uploaded replacements must already be staged for the exact target workspace and current user; the settings save claims them only after Workspace Admin or Docsera Admin authorization succeeds. If the workspace row update fails after a claim, the claim is restored to the same settings-staged workspace so the dismissed recovery draft can retry. A previously authoritative uploaded icon is retired only after a successful authoritative replacement.

The client treats dismissed Workspace Settings saves as per-workspace background mutations. Reopening Settings for the same workspace is blocked while that save is unresolved, so a new draft cannot be based on canonical data older than a submitted in-flight draft. A successful result reconciles the canonical workspace identity once for the same workspace; a failed result keeps the submitted draft and error for recovery.

Client-facing workspace projections include `layout.tocVisible` for later shell/settings use. The field is treated as backward-compatible on the client so older payloads normalize to the existing visible-by-default behavior.
