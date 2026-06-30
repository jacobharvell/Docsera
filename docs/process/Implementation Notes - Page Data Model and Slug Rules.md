# Implementation Notes - Page Data Model and Slug Rules

Status: implementation note

## Purpose

This note records the Docsera page contract that now exists in the app shell package.

It summarizes repo-side implementation behavior only. Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Page Model

Docsera pages are workspace-owned documentation records.

The current canonical page model is represented in `app/docsera-shell/src/pages/page-domain.js`.

Required page ownership and identity fields:

- `sysId`
- `workspaceSysId`
- `parentPageSysId`
- `siblingOrder`
- `draftTitle`
- `draftSlug`
- `draftSlugNormalized`
- `draftContentJson`
- `draftBodyText`
- `publishedTitle`
- `publishedSlug`
- `publishedSlugNormalized`
- `publishedContentJson`
- `publishedBodyText`
- `publicationState`

Model notes:

- each page belongs to exactly one workspace
- `workspaceSysId` is the ownership boundary
- `parentPageSysId` is optional and may be empty for root-level pages
- `siblingOrder` is scoped to the workspace plus the immediate parent page
- `sysId` remains the stable record identifier or placeholder for the eventual ServiceNow record id
- page titles are editable and do not need to be unique

## Ownership and Hierarchy

Page hierarchy rules:

- a page may be root-level with no parent
- if a parent is present, it must belong to the same workspace as the child
- child pages may only point to a direct parent in the same workspace
- nested page URLs are not part of the MVP route model

Ordering rules:

- root-level pages are ordered against other root-level pages in the same workspace
- child pages are ordered against siblings with the same parent
- moving or re-parenting a page does not change its URL unless the page slug itself changes

Page tree move helpers now live in the same domain module:

- `collectPageAncestorSysIds`
- `resolvePageDepth`
- `resolvePageSubtreeDepth`
- `isPageDescendantOf`
- `validatePageMoveTarget`
- `applyPageMove`

These helpers enforce the same-workspace parent constraint, reject circular moves, and block drops that would exceed the five-level MVP nesting limit.

## Slug Behavior

Page slug rules:

- page slugs are generated from page titles by default
- slugs are case-insensitive for uniqueness and routing
- slug uniqueness is scoped to the workspace
- the same page slug may exist in different workspaces
- generated slugs reserve every slug in the workspace, regardless of draft or published state
- duplicate generated slugs are silently suffixed with `-1`, `-2`, and so on

Examples:

- `Benefits` -> `benefits`
- `Benefits` with `benefits` already reserved -> `benefits-1`
- `Benefits` with `benefits`, `benefits-1`, and `benefits-2` already reserved -> `benefits-3`
- `Benefits` in another workspace may still use `benefits`

The slug allocator treats draft slugs and published slugs as part of the same workspace reservation set.

## Draft and Published Contract

The page model preserves distinct draft and published fields.

Draft-side fields:

- `draftTitle`
- `draftSlug`
- `draftSlugNormalized`
- `draftContentJson`
- `draftBodyText`

Published-side placeholders:

- `publishedTitle`
- `publishedSlug`
- `publishedSlugNormalized`
- `publishedContentJson`
- `publishedBodyText`

Publication state:

- `draft`
- `published`
- `published_with_unpublished_changes`

Content contract notes:

- `draftContentJson` is the canonical editable representation placeholder
- TipTap / ProseMirror JSON is the intended shape for editable content
- `draftBodyText` and `publishedBodyText` remain lightweight placeholders for later source/Markdown support
- published fields remain logically separate from draft fields even when the page is not yet published

## Persistence Model

The current code establishes the domain contract in `app/docsera-shell/src/pages/page-domain.js`.

The module currently treats page persistence as a platform-backed record with:

- workspace ownership
- optional parent reference
- sibling-scoped ordering
- draft and published field separation
- workspace-scoped slug uniqueness
- case-insensitive slug normalization

The exact ServiceNow table and field implementation still needs to be wired in the PDI if it is not already present.

## Route Model

MVP page routes are flat:

- `/docsera/:workspaceSlug`
- `/docsera/:workspaceSlug/:pageSlug`

Routing notes:

- nested pages do not contribute parent slugs to the URL
- the page slug alone identifies the page within its workspace
- draft pages are authoring-only in the MVP
- reader-only users must not be able to view draft pages through navigation, filtering, or direct URL access
- the reader shell now uses the flat route model for workspace/page selection and content lookup
- future shell tasks can extend routing, editor access, and authoring behavior without changing the flat URL shape

## Shell Creation Foundation

The workspace shell now consumes this contract to support MVP page creation in the authoring surface.

Implemented shell-side behaviors:

- root page creation inside the active workspace
- child page creation under an existing same-workspace parent
- required title validation before page construction
- generated draft slug allocation with silent duplicate suffixing
- sibling-scoped order allocation for root and child pages
- authoring-tree visibility for draft pages
- flat route target updates using `/docsera/:workspaceSlug/:pageSlug`
- Page Settings overlay edits draft title and slug values in the same workspace shell model

## Local Validation

From `C:\Dev\Docsera`:

```powershell
npm run validate:shell
npm run validate
```

Validation currently covers:

- page draft construction with a required workspace reference
- root-level page construction
- same-workspace parent assignment
- rejection of cross-workspace parent assignment
- page depth calculation
- subtree depth calculation
- descendant detection
- page move target validation
- page move application for before, after, and inside placements
- sibling-scoped ordering behavior
- duplicate title tolerance
- slug generation from titles
- silent suffixing of duplicate generated slugs
- case-insensitive slug reservation
- workspace-scoped slug reservation
- reserved slug coverage across draft and published states
- draft and published field separation
- shell-side page tree visibility for authoring users
- shell-side root and child page creation helpers
- page settings title/slug validation helpers
- authoring-vs-reader page slug resolution
- repository-level docs validation

## Manual PDI Verification

Use these steps after the page table and on-instance script wiring are in place:

1. Create a page record through the intended ServiceNow creation path.
2. Enter a workspace-owned page title such as `Benefits`.
3. Save the record and confirm the page slug is generated from the title.
4. Create a second page with the same title in the same workspace.
5. Confirm the second record receives the next available slug suffix.
6. Confirm a page can be saved without a parent page.
7. Confirm a page can reference a parent page in the same workspace.
8. Confirm a page cannot reference a parent page from another workspace.
9. Confirm sibling ordering is independent for root pages and each parent branch.

Expected result:

- the first page gets `benefits`
- the second page gets `benefits-1`
- the same slug may be reused in a different workspace
- parent pages must stay within the same workspace
- sibling order is isolated by workspace plus parent page

See `docs/process/Test Strategy and Validation Areas.md` for the reusable validation-area reference that includes page model, slug, navigation, and publishing coverage.

## Remaining Platform Setup

The repository now has the page domain contract, but the following PDI work may still be needed:

- create or map the actual page table
- wire page create and save flows to the domain contract
- connect on-instance validation to workspace ownership and parent-page integrity
- decide where ACL and authoring-only draft enforcement will live in the ServiceNow shell
- map editable and published fields to the eventual ServiceNow schema

## Non-Goals

This task does not add:

- editor/autosave behavior
- publishing action
- full route resolution
- page search
- image upload or media insertion
- version history
- rollback
- archive/restore behavior
- custom media library
- custom workspace membership table
