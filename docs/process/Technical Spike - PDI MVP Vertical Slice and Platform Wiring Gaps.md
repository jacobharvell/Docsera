# Technical Spike - PDI MVP Vertical Slice and Platform Wiring Gaps

Status: completed spike note

## Purpose

Assess the current Docsera MVP vertical slice on `main` and identify the concrete gaps between the current local/demo shell and a live ServiceNow-backed MVP.

This note summarizes repo-side and platform findings only. Accepted product behavior remains in the Obsidian requirements notes.

## Explicit Non-Goals

- No live ServiceNow persistence was implemented here.
- No new tables, ACLs, roles, routes, or server-side scripts were added here.
- No broad shell refactor or feature expansion was performed here.
- No claim is made that live ServiceNow routing, persistence, or security enforcement is complete.

## Current Repo Baseline

- Baseline branch inspected: `main`
- Baseline commit inspected: `9861c06ee0a3c30d7fff870e56e8dd31c60a154d` (`Task 13: Search and MVP shell polish`)
- Product shell package: `app/docsera-shell`
- Registered UI Builder component: `x-82900-docsera-shell` (historical component host)
- Scope name: `x_82900_odoc2`
- Current repo-side shell surface is entirely client-side. Under `app/docsera-shell`, there are no server-side ServiceNow artifacts, table definitions, ACL records, Script Includes, or app-route/module records.
- The shell currently seeds itself from demo data and demo access state in [app/docsera-shell/src/docsera-shell/index.js](/C:/Dev/Docsera/app/docsera-shell/src/docsera-shell/index.js:64), [app/docsera-shell/src/workspaces/workspace-launcher.js](/C:/Dev/Docsera/app/docsera-shell/src/workspaces/workspace-launcher.js:186), and [app/docsera-shell/src/pages/page-reader.js](/C:/Dev/Docsera/app/docsera-shell/src/pages/page-reader.js:413).

## Requirement Sources Used

- `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\MVP Implementation Plan.md`
- `...\Requirements\10 Roles, Workspace Membership, and Access Workflows.md`
- `...\Requirements\20 My Workspaces.md`
- `...\Requirements\21 Workspace Model.md`
- `...\Requirements\22 Workspace Shell.md`
- `...\Requirements\30 Page Model.md`
- `...\Requirements\31 Page Settings.md`
- `...\Requirements\41 Publishing Model.md`
- `...\Requirements\40 Editor.md` is currently empty, so editor expectations were taken from `docs/process/Implementation Notes - Editor Shell and Autosave.md` and `docs/decisions/ADR-0001-editor-architecture.md`.

## Validation Performed

### Local Checks Run

From `C:\Dev\Docsera`:

```powershell
npm --prefix app/docsera-shell run verify
npm run validate:docs
npm run validate
```

Results:

- All three commands passed.
- These checks validate repo structure and domain/view-model behavior.
- They do not build the ServiceNow component bundle and do not prove PDI deployability.

### PDI / Runtime Checks Run

From `C:\Dev\Docsera\app\docsera-shell`:

```powershell
snc version
snc configure profile list
snc ui-component deploy --profile dev295482 --fetch-assets-from-instance
snc ui-component deploy --profile dev376586 --fetch-assets-from-instance
```

Observed results:

- `snc` is installed: `snc 1.1.3`, `ui-component 29.0.2`.
- Configured profiles were present for `dev295482` and `dev376586`.
- Both deploy attempts were blocked before runtime validation.
- `dev295482` failed with a local build error:

```text
SassError: Can't find stylesheet to import.
@import '@servicenow/sass-kit/host';
```

- `npm ls --depth=0` in `app/docsera-shell` reported all package dependencies as `UNMET DEPENDENCY`, including `@servicenow/sass-kit`, `@servicenow/ui-core`, and ProseMirror packages.
- Because the component did not build, no PDI runtime page could be opened and no mount/runtime smoke test could be completed.

## Local Validation Findings

- The current shell demonstrates a coherent MVP-shaped client flow: My Workspaces, workspace selection, page creation, page settings, drag/drop, editor autosave states, publishing states, search, and empty/not-found states.
- That flow is still demo-backed:
  - demo workspaces and pages are created in-memory
  - access is derived from hard-coded demo roles/groups
  - autosave mutates component state only
  - publish promotes draft fields in component state only
  - route strings are computed and displayed, not bound to a real browser or ServiceNow router
- The current local validation harness proves domain logic and shell-state behavior, but it does not prove buildability, deployability, server integration, or runtime ACL enforcement.

## PDI / Runtime Findings

- A deploy workflow exists in principle for the historical UI Builder component, but the preferred runtime host is now the standalone Direct UI Page documented in ADR-0002.
- The current checkout is not PDI-build-ready because required package dependencies are not installed locally.
- Because build fails before upload, the current PDI/runtime questions remain blocked:
  - whether the current shell mounts successfully in runtime
  - whether the shell can be discovered from an actual Docsera navigation/module entry
  - whether any live route resolves to the shell
  - whether runtime-only ServiceNow issues exist after mount

## Behavior-by-Behavior Wiring Matrix

| Behavior | Current state | Evidence | Remaining gap |
|---|---|---|---|
| Workspace list | Local/demo-backed | Demo rows from `createMyWorkspacesDemoWorkspaces()` | Replace seeded list with ServiceNow workspace query + capability filtering |
| Workspace creation | Local/demo-backed | `createWorkspace()` uses `createLocalWorkspaceProvisioningDependencies()` and `provisionWorkspace()` | Bind to real workspace record create, group create, group-role assignment, and creator membership |
| Generated workspace admin/editor groups | Local/demo-backed | Local provisioning dependency fabricates `sys_id` values | Create and store real `sys_user_group` records and role assignments |
| Workspace capability checks | Partially wired | Capability contract exists in `workspace-capabilities.js` | Bind to live role/group adapters and enforce server-side |
| Page list / page tree | Local/demo-backed | Demo pages from `createDocseraShellDemoPages()` | Read page records from ServiceNow, scoped by workspace and visibility |
| Page creation | Local/demo-backed | `createPageDraft()` output is appended to local state only | Persist new page records and return stable record ids/order |
| Page settings title/slug updates | Local/demo-backed | `updatePageDraftSettings()` mutates local page array | Persist draft metadata server-side with uniqueness validation |
| Page delete | Local/demo-backed | `removePageSubtree()` removes pages from local array | Persist delete/soft-delete and exclude deleted records from queries |
| Page drag/drop ordering | Local/demo-backed | `applyPageMove()` updates local array only | Persist parent/order updates atomically server-side |
| Editor autosave | Local/demo-backed | `createPageEditorSaveHandler()` rewrites local page state | Save draft content to ServiceNow record(s) with failure/retry behavior |
| Publish action | Local/demo-backed | `buildPagePublishRecord()` promotes draft to published in memory | Persist publish transition, timestamps, publisher, and publish-time validation |
| Reader vs authoring visibility | Partially wired | `buildWorkspaceShellViewModel()` hides drafts for reader mode | Enforce same rules on record/API reads and route resolution |
| Workspace/page search and shell states | Local/demo-backed | Search filters local tree/list state | Back with live queried data and route/runtime states |

## Access / Security Gap Matrix

| Area | Current repo behavior | Risk | Required next wiring |
|---|---|---|---|
| Workspace visibility and capability labels | UI/domain only via injected adapters and demo access state | UI may imply safe gating without server denial | Add server-side capability service backed by real roles + group membership |
| Workspace creation | Client can "create" any workspace in local state | No real authorization boundary | Enforce authorized creator rule server-side |
| Workspace settings access | Settings link is UI-only and currently a placeholder | Admin-only affordance is not backed by real action/security | Add real workspace settings action + server authorization |
| Page creation/edit/delete/move | UI/domain only | Any future API without enforcement would be unsafe | Add record/API enforcement for Editor/Admin/Docsera Admin writes |
| Draft visibility | Reader mode hides drafts in local view-model only | Unpublished content could leak through record/API access | Enforce unpublished-content denial server-side |
| Publish | Client-side only | No authoritative publish permission or state transition | Add publish API/transaction with permission checks and final validation |
| Missing/broken group refs | Safe-fail in local capability service | No repair path exists | Add admin diagnostics/recovery or explicit failure path in live shell |

Key conclusion:

- The shell already models the right capability boundaries.
- None of the protected operations are yet enforced by the platform.

## Routing / Navigation Gap Matrix

| Surface | Current state | Gap |
|---|---|---|
| Live shell entry point | The preferred runtime host is the standalone Direct UI Page; the historical UI Builder component `x-82900-docsera-shell` is still present | No repo-visible Docsera app route/module/page record was found |
| My Workspaces | Implemented as `surfaceMode: 'launcher'` inside the component | Not bound to a durable ServiceNow route or navigator module in this repo |
| Workspace shell | Implemented as component state using `selectedWorkspaceSlug` | No live route resolution verified |
| Workspace slug routes | Logical only via `routeTargetPath` strings such as `/docsera/:workspaceSlug` | Not connected to browser history or ServiceNow router |
| Page slug routes | Logical only via `routeTargetPath` strings such as `/docsera/:workspaceSlug/:pageSlug` | Not connected to browser history or ServiceNow router |
| Workspace not found | Implemented as local shell state | Not verified through live route resolution |
| Page not found | Implemented as local shell state | Not verified through live route resolution |
| Access denied | Not implemented as a distinct shell state | Needed for live workspace-level denial cases |

Important route finding:

- The current shell computes and displays route targets, but there is no evidence in the repo that those paths are registered as actual ServiceNow/Now Experience routes yet.

## Additional Gaps Against Accepted MVP Requirements

- My Workspaces pagination is not implemented.
- My Workspaces search currently indexes more than workspace name.
- The workspace settings experience is not implemented; the current "Settings" action only updates status text.
- The workspace switcher does not implement a recent-workspace dropdown; the current shell provides a launcher return button instead.
- Page tree expand/collapse UI is not implemented.
- The page-row right-click context menu described in requirements is not implemented.
- Discard unpublished changes is not implemented.
- Workspace-level layout settings such as default table-of-contents visibility and page-width behavior are not implemented.
- A distinct in-app `Access denied` state is not implemented.

These are not all required to prove the next live MVP slice, but they should not be mistaken as already complete.

## Repeatable MVP Smoke Checklist

Use this checklist after the shell is buildable and deployable in the PDI.

1. Open the Docsera entry point and confirm My Workspaces loads; expected result: page title, search field, and New Workspace action render without runtime errors.
2. Search My Workspaces with a matching term and a non-matching term; expected result: matching rows filter immediately and the no-results state is distinct from the empty state.
3. Create a workspace with required name and optional description; expected result: workspace is created, creator is placed in the workspace Admin group, and the shell opens that workspace.
4. Open an existing workspace; expected result: workspace identity, page tree, breadcrumbs, and route/state target resolve for that workspace.
5. Create a root page; expected result: the page appears at the root, becomes selected, and draft visibility matches authoring role.
6. Create a child page from an existing parent; expected result: parent linkage and sibling order are correct and the child becomes navigable.
7. Edit page title and slug from Page Settings; expected result: valid values commit, invalid values keep the panel open, and duplicate slug validation is workspace-scoped.
8. Delete a leaf page; expected result: the page is removed and selection moves to the next visible page or previous page.
9. Delete a page with descendants; expected result: the confirmation warns about descendants and the full subtree is removed.
10. Drag and drop a page before, after, and inside another page; expected result: same-workspace rules apply, invalid depth/self/descendant moves are blocked, and valid moves persist.
11. Edit page body; expected result: editor mounts for authorized users only and reader-only users never see draft editor controls.
12. Observe autosave through success and failure; expected result: status transitions through unsaved/saving/saved or save failed, and failed saves keep local content intact.
13. Publish a draft page and publish changes to an existing published page; expected result: publish waits for the latest draft save, updates published fields, and clears unpublished-change state.
14. Verify reader-only behavior on published and draft pages; expected result: reader users see only published content and direct draft URL attempts resolve to page-not-found.
15. Verify search/filter/no-results states in the page tree; expected result: authoring users can find draft pages, reader users cannot discover draft-only pages.
16. Perform a responsive sanity check; expected result: header, launcher, nav, and page content remain usable at narrower widths.

## Recommended Next Implementation Sequence

### 1. Task: Stand up the standalone Direct UI Page host as the runtime entry point

Why next:

- The host decision is now settled, but the durable packaging and on-instance wiring still need to be made explicit.
- The runtime path should be documented and repeatable before any cleanup of the legacy UI Builder baggage starts.

Scope boundary:

- Keep the Direct UI Page as the runtime host.
- Load JS from scoped UI Script(s) and CSS from same-origin instance-hosted assets.
- Verify same-origin backend access from the page.
- Keep the UI Builder component path paused as historical scaffolding.

Main risks:

- on-instance asset packaging choices
- Direct UI Page record setup and permissions
- backend auth / ACL wiring

Suggested model / effort:

- GPT-5 Codex, medium-high effort

### 2. Task: Live Workspace Persistence and Capability Wiring

Why next:

- The MVP slice starts with create workspace.
- Workspace list and creation are currently entirely demo-backed.

Scope boundary:

- Wire workspace list and workspace creation to real ServiceNow records and generated groups.
- Bind capability evaluation to live role/group membership adapters.
- Keep page/editor/publish work out of scope.

Main risks:

- group creation and role assignment behavior in scoped app context
- creator-as-admin wiring
- keeping read visibility broad while write/admin capability remains scoped

Suggested model / effort:

- GPT-5 Codex, medium-high effort

### 3. Task: Live Page Persistence, Workspace/Page Resolution, and Route Binding

Why next:

- After workspaces are live, the next slice step is create/open pages inside a real workspace.
- The current route model is only a displayed string.

Scope boundary:

- Persist page records, parent/order fields, and slug rules.
- Resolve workspace/page selection from live route state.
- Support root/child page creation and reader-vs-authoring visibility from real records.

Main risks:

- slug uniqueness and published/draft route behavior
- same-workspace parent integrity
- mapping Now Experience routing constraints to the logical `/docsera/:workspaceSlug/:pageSlug` model

Suggested model / effort:

- GPT-5 Codex, high effort

### 4. Task: Server-Enforced Draft Autosave and Publish Transaction

Why next:

- This completes the intended thin vertical slice after live workspaces and pages exist.
- Current autosave and publish are the most obviously local-only behaviors.

Scope boundary:

- Persist draft body edits server-side.
- Add authoritative publish transition with permission checks, publish metadata, and publish-time validation.
- Enforce draft visibility denial for reader-only users.

Main risks:

- save/publish race conditions
- preserving local unsaved content on failure
- keeping reader-facing content isolated from draft changes

Suggested model / effort:

- GPT-5 Codex, high effort

## Risks and Blockers

- Immediate blocker: the legacy UI Builder host should no longer be treated as the preferred runtime target.
- PDI runtime validation for the preferred host now depends on on-instance Direct UI Page wiring and asset packaging.
- No live ServiceNow route/module/page definition was found in this repo, so a durable Docsera entry route is still unverified.
- No server-side artifacts exist yet for workspace/page persistence, ACL enforcement, or publish enforcement.
- The current local validation suite can pass while the actual PDI deploy still fails, so it is not a sufficient live-readiness signal by itself.
