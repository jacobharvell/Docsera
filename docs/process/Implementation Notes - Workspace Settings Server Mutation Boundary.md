# Implementation Notes - Workspace Settings Server Mutation Boundary

Task 55A establishes the MVP Workspace Settings server mutation boundary for existing workspaces.

The authoritative settings save path is `PUT /api/x_82900_docsera/docsera_runtime/workspaces/settings`, implemented by `src/server/api/docsera-runtime-workspace-settings-save.ts` and `src/server/workspaces/serviceNowWorkspaceSettings.ts`.

The mutation requires effective Workspace Admin or Docsera Admin capability through the existing group-first capability evaluator. Workspace Editor and read-only users are rejected server-side. The save path does not read, require, acquire, renew, or release the Workspace Edit lease.

Allowed persisted fields are limited to workspace name, short description, ToC default visibility, and built-in workspace icon metadata. The workspace slug, Admin group, Editor group, lifecycle status, pending change-set reference, published snapshot reference, workspace state revision, and physical `page_width` value are preserved from the current row.

Workspace icon settings accept only controlled built-in icon keys and persist canonical server-owned icon metadata. If the icon input is omitted, the existing icon is preserved, including uploaded icons. Supplying uploaded-icon replacement metadata to this boundary fails validation; uploaded icon replacement remains out of scope for MVP Workspace Settings.

Client-facing workspace projections include `layout.tocVisibleByDefault` for later shell/settings use. The field is treated as backward-compatible on the client so older payloads normalize to the existing visible-by-default behavior.