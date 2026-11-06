# Page state and hierarchy

This reference describes the implemented Docsera page contract: the page record, the workspace-level projections that make pages visible in Live and Edit, and the operations that change page state. For workspace identity, membership, capabilities, and lifecycle, see the [workspace domain reference](workspace-domain.md).

## Record identity and fields

Each `x_2300756_docsera_page` record has a ServiceNow `sys_id` and belongs to one required workspace. A page's durable row holds its current draft data and compatibility-oriented published fields, but it is not by itself the authority for the reader-facing published workspace. The selected workspace snapshot set is that authority; see [Live and Edit projections](#live-and-edit-projections).

The page table is audited and therefore also has ServiceNow's standard audit metadata, including creation and update information. Its Docsera fields are:

| Area | Fields and meaning |
| --- | --- |
| Identity and placement | `workspace`, `parent_page`, and `sibling_order`. A missing parent denotes a root page. |
| Draft metadata | `draft_title`, `draft_slug`, and `draft_slug_normalized`. The title and slug are required, up to 160 characters. |
| Draft content | `draft_content_json` is the canonical structured document (up to 262144 characters). `draft_body_text` is the derived plain-text compatibility/search field (up to 4000 characters). `draft_revision` is the non-negative draft-save revision. |
| Published metadata | `published_title`, `published_slug`, `published_slug_normalized`, `published_content_json`, and `published_body_text`. These fields can be empty for a never-published page. |
| Publication and activity | `published_at`, `published_by`, `publication_state` (`draft`, `published`, or `published_with_unpublished_changes`), and `active`. |
| Draft-placement compatibility fields | The schema also contains `draft_parent_page`, `draft_sibling_order`, `draft_removed`, `last_draft_changed_on`, and `last_draft_changed_by`. The active workspace projection persists placement and removal state through change-set records and snapshot sets; these fields are not the reader's selected-publication authority. |

The canonical document is parsed and validated as a supported server document envelope. On a structured-content save, the server derives `draft_body_text` from that document. A text-only compatibility save builds an equivalent paragraph document. The published plain-text field is likewise derived from the published structured document.

### Slugs and routing

New-page slug allocation derives a lowercase URL fragment from the title (or an explicit requested slug in the reusable page-domain helper). It removes diacritics, converts non-alphanumeric runs to `-`, trims boundary dashes, and falls back to `page`. Within a workspace, an occupied base receives the first available numeric suffix: `guide`, `guide-1`, `guide-2`, and so on. New pages are placed after existing siblings under the same parent.

The settings operation accepts a deliberately narrower input form: after trimming, a slug must contain only letters, numbers, dashes, periods, or underscores, must be at most 160 characters, and must be unique case-insensitively within the workspace. The current page may retain its own existing slug. The stored settings slug and normalized slug are lowercase. Reservations consider both draft and published slug values, so a pending draft rename cannot make a published route ambiguous.

Page saves can address a page by `sys_id`, optionally paired with its current draft normalized slug, or by draft normalized slug alone. Page listing selects a workspace by workspace slug and returns the requested projection; it does not expose a separate page-slug routing endpoint in this module.

## Hierarchy and ordering

Pages form one workspace-scoped tree. `parent_page` points to a page in the same workspace; no parent means a root page. Sibling placement is represented by `sibling_order`, with tree output sorted depth-first by sibling order and then by title, slug, and page identity as deterministic tie-breakers.

Creating a page with no parent creates a root page. Supplying a parent creates a child only when that page is visible in the Edit projection and belongs to the workspace. The current active creation path validates that parent but does not independently reject a child solely because it would exceed the movement depth limit.

Moves accept a target parent (or root) and a sibling rank. The client drag-and-drop resolver produces ranks between neighboring siblings, appends a child after its current siblings, rejects self/descendant targets and no-op drops, and preflights the full dragged subtree. This is an interaction aid, not authority. The server recomputes the resulting Edit projection and rejects a missing or removed target page, a missing or removed parent, circular ancestry, and a hierarchy deeper than six page levels. Current focused tests explicitly accept level six and reject level seven in both the server domain and the client resolver. The older `PAGE_TREE_MAX_DEPTH = 5` export in the page-domain module is not the active move limit; the active change-set move path enforces six levels.

Moving a page changes its own parent and sibling rank. Its descendants retain their parent references and move with that branch in the resulting tree. A move may be between siblings, into another parent, or to the root.

## Live and Edit projections

Page rows are inputs to workspace state, but visibility is calculated at workspace scope.

- **Live** uses the workspace's selected, ready published snapshot set. It returns that snapshot's page identities, titles, normalized slugs, structured content, text, activity, parents, and sibling ranks.
- **Edit** starts with the same selected snapshot, overlays draft state for published identities, includes draft-only pages created in the active change set, and excludes all members of active removal batches.

Consequently, a page can have different title, slug, content, parent, or sibling placement in Edit while Live continues to render the selected snapshot. A newly created page exists only in Edit until publication. A removed published page remains in Live but is omitted from Edit; removing a draft-only page removes that draft subtree from Edit without changing Live. A page's row-level published fields are reconciled around publishing, but they do not replace the selected snapshot as the source of the complete Live hierarchy.

The projection loader rejects invalid state rather than inventing hierarchy: every projected parent must exist, snapshot page identities must be unique, draft overlays for published identities must reference the selected snapshot, and a ready selected snapshot is required. Projection loading failure is reported as a failed request; clients should reload the authoritative projection rather than synthesizing page or generation state.

## Operations and access boundaries

All page mutations are workspace-scoped. The active REST routes first require the workspace Edit lease and the current server-issued mutation authority; capability checks occur in the server service boundary. Readers need workspace-view capability for Live listing. Edit listing requires workspace edit or admin capability. Creating, editing body/settings, moving, and deleting require the mutation path's held Edit lease plus edit authority; server services return forbidden or invalid/not-found results when those conditions are not met.

### Create

Create requires a non-empty title of at most 160 characters and an optional valid visible parent. It allocates a workspace-unique slug and sibling placement, creates an active draft page, and records it as an Added pending change. The page is visible in Edit, not Live, until publication.

### Save content and settings

Content saving validates the structured document and compares the supplied `expectedRevision` with `draft_revision`. A successful save increments that revision, derives the plain-text field, and records the pending change. A stale revision returns a conflict asking the caller to reload before saving again.

Settings saving validates title and slug, preserves the page's placement and published fields, updates only draft title/slug values, and records the pending change. A title, slug, or page/workspace reference failure is rejected without a settings update.

### Move

Move updates the draft placement used by the active Edit projection and records a Moved pending change (or a combined Modified · Moved change where applicable). A request that returns a stale authority, invalid hierarchy, or obsolete context must be resolved by reloading; the client must not manufacture a successor authority or replay the move automatically.

### Delete

Delete operates on the target's entire visible Edit subtree and returns the next visible page selection when one exists. For published identities, it creates an active removal batch: the subtree disappears from Edit but remains in Live until publication. For a draft-only subtree, the corresponding draft records and Added pending entries are removed, leaving Live unchanged. The current implementation rejects deleting a published subtree that contains Added draft-only descendants as unsupported rather than silently applying a partial result.

The legacy page-settings service still contains physical child-first deletion helpers, but the active delete action route uses the workspace change-set persistence service described above. The `DELETE /pages/{pageSysId}` route responds with 405 and directs callers to the POST delete action route.

### Listing and recovery boundary

The page listing route selects `live` unless `mode=edit` is supplied, resolves the workspace by slug, performs the mode-specific capability check, and returns the ordered projection. Mutations can fail for stale authority, unfinished recovery, invalid input, not-found resources, or authorization. Their detailed change-set generations, claim handling, publish transaction, discard behavior, and recovery protocol are intentionally outside this reference.

## Implementation references

The contract above is implemented and protected primarily by:

- `app/docsera-ui/src/fluent/tables/docsera-page.now.ts`
- `app/docsera-ui/src/server/pages/serverPageDomain.ts`
- `app/docsera-ui/src/server/pages/serviceNowPageRecords.ts`
- `app/docsera-ui/src/server/pages/serviceNowPagePersistence.ts`
- `app/docsera-ui/src/server/pages/serviceNowPageCreation.ts`
- `app/docsera-ui/src/server/pages/serviceNowPageSettings.ts`
- `app/docsera-ui/src/server/pages/serviceNowPageListing.ts`
- `app/docsera-ui/src/server/pages/serviceNowPageQueries.ts`
- `app/docsera-ui/src/server/workspaces/workspaceChangeSetDomain.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-pages.ts`, `docsera-runtime-create-page.ts`, `docsera-runtime-page-save.ts`, `docsera-runtime-page-settings-save.ts`, `docsera-runtime-page-move.ts`, and `docsera-runtime-page-delete-action.ts`
- `app/docsera-ui/src/client/features/workspaces/pageTreeDropResolver.ts`

Focused coverage includes `docsera-page-schema.test.ts`, `serverPageDomain.test.ts`, `serviceNowPageCreation.page-model.test.ts`, `serviceNowPageSettings.test.ts`, `serviceNowPagePersistenceAndQueries.test.ts`, `serviceNowPageListing.test.ts`, `workspaceChangeSetDomain.test.ts`, `serviceNowWorkspaceChangeSetPersistence.test.ts`, and `pageTreeDropResolver.test.ts`.
