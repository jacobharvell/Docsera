# Implementation Notes - E2-T5 Core Slash Bubble and Link Controls

Date: 2026-07-12

Status: implementation note

## Purpose

This note records the repository-side behavior added for E2-T5: the production editor's slash menu, formatting bubble, and link surface.

It describes implementation behavior only. Accepted product requirements remain defined by the Obsidian notes and the E2 implementation brief.

## Slash Command Inventory

The editor-local slash menu now supports the current E2 block inventory:

- Paragraph
- Heading 2
- Heading 3
- Bulleted list
- Numbered list
- Task list
- Blockquote
- Horizontal rule
- Code block

Trigger behavior is intentionally narrow:

- the menu opens only from an ordinary editable text-block query whose text from block start to caret begins with `/`
- slash input in prose, URLs, or mid-word text does not open the menu
- typing additional characters filters the fixed inventory by label or simple keyword
- Escape dismisses the menu without changing document content
- Enter executes the active option
- pointer selection executes the clicked option
- horizontal rule insertion leaves a following paragraph position available for continued typing

## Formatting Bubble

The compact formatting bubble now appears only for non-empty editable text selections.

Supported marks:

- Bold
- Italic
- Strike
- Inline code
- Link

Behavior notes:

- mark buttons expose pressed state with `aria-pressed`
- clicking a mark button restores the saved selection before applying the command
- the bubble stays hidden for collapsed selections, node selections, read-only state, and inactive authoring sessions
- keyboard shortcuts remain TipTap-authoritative:
  - `Mod+B`
  - `Mod+I`
  - `Mod+Shift+S`
  - `Mod+E`
  - `Mod+K` opens link controls when text is selected or the caret is inside an existing link

## Link Surface

The editor-local link surface now supports:

- create
- edit
- remove
- explicit follow

Behavior notes:

- opening the surface preserves the selected range or the linked range
- existing-link editing pre-populates the current safe URL
- clicking elsewhere in the editor dismisses the open surface without restoring the old link range into the active selection
- blank, cancelled, invalid, and unsafe input do not create malformed link marks
- unsafe or invalid values show inline validation state and are not applied
- the apply path uses the shared safe-link policy directly before calling `setLink`
- apply remains disabled when the trimmed URL is blank or invalid, and Enter only applies a valid URL
- remove preserves the text content
- follow opens a safe URL in a new tab/window with opener protection
- clicking linked text while editing does not navigate away because editor clicks remain local to the child host

## Overlay Boundary And Ownership

Floating controls are rendered through the editor-local overlay root inside the child host shadow root.

- the implementation does not portal to `document.body`
- floating coordinates are resolved from the overlay root's owner document and owner window
- nested scrolling inside the owner document triggers floating-position recalculation
- the React runtime owns only transient UI state
- TipTap remains authoritative for document content, marks, selection, and command execution
- the control surfaces are mutually exclusive in the E2 runtime

## Authoring Shell Reflow

The E2 authoring experience now renders the TipTap body as the direct page editing surface inside the workspace content well.

- the temporary diagnostic editor card chrome was removed from the normal shadow-root runtime so the editable body now begins directly beneath the page header row
- the temporary Save/status controls now live in the page header row beside the page title and are projected there from the child editor runtime
- the editor body itself keeps the isolated child host, slash menu, formatting bubble, and link surface behavior from E2-T1 through E2-T5
- this reflow is a required authoring-surface integration correction; it does not by itself confirm the original PDI pointer-focus or physical keyboard-typing failure mode

## Edit-Mode Bootstrap Stability

Commit `0d39bbb...` addressed the visible Edit-mode hard-refresh loading presentation, but it was a mitigation rather than the root-cause fix.

The shell change retained the same-workspace loading contract and limited pending treatment to the editor body:

- same-workspace Edit bootstrap reused the shell-wide `loading` path while edit pages and the child editor session were still initializing
- during that state, the app intentionally cleared the selected page view, page tree, breadcrumbs, and outline because `WorkspaceShell` only rendered those regions when `shellStatus === "ready"`
- the main pane still had no editor-body-only bootstrap state, so the authoring surface could only move between full-shell loading and full editor-ready states

That retained-shell behavior improved shell stability, but it did not eliminate the destructive reconstruction seen during the first Edit bootstrap.

The later deployed runtime diagnostic confirmed the actual root cause was the cross-boundary React ownership mismatch documented in the following section:

- the app retains the last committed same-workspace shell snapshot during mode-specific page reloads instead of dropping back to the full-shell loading presentation
- once the workspace shell has first rendered for the current workspace, the header breadcrumbs, workspace navigation, page tree, selected-page identity, page title, and TOC rail stay mounted while the next edit session initializes
- pending treatment is limited to the page-body region during edit bootstrap
- the child editor host reports ready-state transitions upward so the page body can stay in a contained loading state until the runtime is actually ready

This keeps the shell stable for:

- hard refresh directly into `?mode=edit` after the first committed shell render
- Live -> Edit transitions within the same workspace
- page/session swaps that create a new editor generation inside the same workspace

It does not broaden the loading-retention contract to unresolved workspace switches; those still use the existing contained shell-loading treatment.

This retained-shell behavior remains useful for contained editor-body loading, but it is not the root-cause correction.

## React Runtime Boundary Correction

The final E2-T5 runtime failure was confirmed as a cross-boundary React ownership mismatch during the first direct Edit bootstrap in the deployed SDK build.

The deployed temporary identity diagnostic compared these public React exports across the host/runtime module boundary:

- `React.useState`
- `React.createElement`
- `React.version`

The confirmed first-failure result in the PDI was:

- `version` matched at `18.3.1`
- `useState` identity did not match
- `createElement` identity did not match
- React then raised production error `#321` before the shell remounted and a second same-identity attempt appeared

The practical cause was the runtime module boundary, not Hook misuse inside the editor code:

- the parent `PageEditorHost` created the child React root in the main bundle graph
- the lazy `PageEditorHostRuntime.jsdbx` chunk resolved its own React exports before the first failing render completed
- matching versions were not sufficient because the renderer and Hook exports for that first render did not come from the same public React instance

The deployed diagnostic was temporary only. It was removed from the final source and final deployment.

## Final Runtime Ownership Boundary

The durable correction is a self-contained lazy editor runtime.

- `PageEditorHost` now creates only plain DOM mount targets inside the shadow root
- the parent dynamically imports the lazy runtime module and passes plain props plus mount targets
- the lazy runtime module now owns `createRoot`, render, update, error-boundary handling, and destroy
- the top-level client bootstrap now guards `#docsera-root` against a second same-page `mountDocseraApp()` invocation
- the parent no longer imports or calls `createRoot` for the child editor runtime
- the parent no longer renders a React component exported by the lazy runtime through a parent-owned renderer

The imperative lazy-runtime contract is:

- `mountPageEditorHostRuntime(...)`
- returned handle `update(...)`
- returned handle `destroy()`

This keeps routing, page identity, permissions, session invalidation, save callbacks, and teardown in the parent while ensuring the child runtime's renderer and Hooks come from the same lazy module graph.

## SDK Build Evidence And Regression Guard

The actual `now-sdk build` output now emits:

- `main.jsdbx`
- `PageEditorHostRuntime.jsdbx`

The generated-artifact verifier confirms:

- `PageEditorHost.tsx` remains owned by `main.jsdbx`
- `PageEditorHostRuntime.tsx` remains owned by `PageEditorHostRuntime.jsdbx`
- the host source in the generated map no longer creates the child root or renders the lazy component directly
- the lazy runtime source in the generated map owns root creation and unmount lifecycle
- the lazy runtime chunk exports the imperative mount API

This verifier is repo-side protection against future SDK output changes silently restoring the mixed root/component ownership boundary.

## Workspace Detail Request Correction

The duplicate workspace-detail request was independent of the React crash.

- the workspace bootstrap effect depended on `workspaceState.status`
- that effect also set `workspaceState` to `loading` and then `success`
- the `loading` transition retriggered the same effect before the first request completed

The correction is narrow:

- the workspace bootstrap effect no longer depends on `workspaceState.status`
- the effect still reacts to route workspace slug changes, mode changes, settings-intent handling, and client changes
- initial workspace bootstrap now issues a single workspace-detail request per navigation

## Retained Shell And Save Scope

The retained same-workspace shell logic remains, but only as contained editor-body loading.

- same-workspace shell retention is still used to keep the workspace chrome stable during editor bootstrap
- the final fix removes the need for that logic to mask destructive shell reconstruction
- no second readiness system was added beyond the existing editor ready-state signal

The temporary explicit Save/status controls remain E2 scaffolding.

- the correction preserved the existing projected Save/status surface
- no autosave behavior was added here
- revision-safe autosave remains explicitly deferred to the next editor phase after E2-T5 stabilization

## Focus And Teardown

The implementation keeps control focus and teardown predictable:

- selection is restored before mark and link transactions execute
- dismissing link controls returns focus to the editor
- session replacement tears down the previous runtime and removes its overlay content, including stale overlay nodes and controls
- switching from Edit to Live mode closes open authoring controls
- access loss disables authoring controls and clears open surfaces
- the page-header Save/status controls disappear when authoring access is lost

## Page-List Runtime Repair

The E2-T5 validation pass surfaced an upstream workspace page-list failure before editor interaction could begin.

- the failing scoped REST route was `GET /api/x_82900_docsera/docsera_runtime/pages`
- the immediate PDI blocker was not a TipTap interaction defect; the deployed server module for `src/server/pages/serverEditorDocument.ts` still imported `../../shared/editor/document.ts`
- the SDK update set emitted the server page-list modules but did not emit a matching `sys_module` record for `src/shared/editor/document.ts`, so page-list requests failed at runtime with `ModuleResolutionException` before any workspace page selection or editor mount
- accepted `main` carried the same server import path, so this specific failure mode was a baseline server-packaging defect rather than an E2-T5-only regression

The repository-side correction is narrow:

- the single authoritative document contract now lives in `app/docsera-ui/src/server/pages/serverEditorDocument.ts`, which is already part of the deployable scoped REST server module graph
- `src/shared/editor/document.ts` and `src/shared/editor/schema.ts` now re-export or consume that same server-pages contract so the client, shared helpers, and server parser stay in lockstep without creating a second server validator
- the server module-boundary regression test now rejects server imports from `src/shared` at runtime so the missing-module deployment shape cannot recur silently
- parity coverage now asserts the shared wrapper, schema helpers, and server parser all accept and reject the same canonical E2 document fixtures

The repaired workspace shell behavior is now explicit:

- an authorized empty workspace returns a valid empty page-list response in both Live and Edit modes instead of HTTP 500
- an empty Edit workspace keeps `New page` enabled and now opens the existing inline create-page flow immediately
- a fatal page-list load keeps the visible `New page` affordance disabled with a user-facing reason instead of leaving an enabled-looking no-op control
- the editor host does not mount while page loading has failed fatally
- malformed or unsupported stored page documents still fail closed at the page-list boundary instead of being normalized into editable empty content

PDI validation for this repair confirmed:

- the legacy disposable workspace slug `task-32-jacob-smoke` was deleted and replaced with two explicit smoke fixtures:
  - `task-32-jacob-smoke-populated`
  - `task-32-jacob-smoke-empty`
- `task-32-jacob-smoke-populated` returns HTTP 200 in Live and Edit with one representative published page:
  - slug: `editor-controls-smoke`
  - title: `Editor Controls Smoke`
  - first heading: `Overview`
- `task-32-jacob-smoke-empty` returns HTTP 200 in Live and Edit with zero pages, and the create-first-page flow succeeds and restores the workspace to zero pages after cleanup
- malformed or unsupported stored page documents still return the fatal page-list state, which now presents the disabled `New page` control and does not mount the editor host

## Disposable PDI Smoke Reset

The repo now includes a repeatable PDI reset for the disposable E2-T5 verification data.

- dry-run: `npm run reset:editor-smoke-data`
- apply: `npm run reset:editor-smoke-data:apply`
- direct app-scope equivalents:
  - `npm --prefix app/docsera-ui run reset:editor-smoke-data`
  - `npm --prefix app/docsera-ui run reset:editor-smoke-data:apply`

Behavior notes:

- the reset deletes only the owned disposable records for `task-32-jacob-smoke`, `task-32-jacob-smoke-populated`, and `task-32-jacob-smoke-empty`
- apply recreates the two current smoke workspaces, their scoped groups, their role grants, and one representative published page in the populated workspace
- apply verifies the page-list route in Live and Edit for both workspaces and exercises the empty-workspace create-first-page flow before deleting that temporary page
- the representative document payload is the same canonical envelope shape expected by the E2 editor contract, so the reset doubles as a reusable page-list and parser smoke fixture
- the script now declares `@napi-rs/keyring` as an exact direct dev dependency at `1.2.0` instead of relying on the SDK's transitive install shape

## Validation Completed

Automated validation completed:

- full `app/docsera-ui` Vitest suite
- `PageEditorHostRuntime.test.tsx`
- `PageEditorHost.test.tsx`
- `WorkspaceMainPane.test.tsx`
- `App.test.tsx`
- `App.editorHostBoundary.test.tsx`
- production `app/docsera-ui` build
- inline runtime CSS build verification

The test coverage exercises:

- slash opening, filtering, dismissal, pointer execution, and keyboard execution
- canonical JSON output for each current E2 slash command
- bubble visibility and mark toggles
- core formatting shortcuts
- link create, edit, remove, follow, and invalid input rejection
- direct safe-link apply-path rejection for blank, unsafe, and malformed URLs
- undo/redo after slash, formatting, and link commands
- save behavior after control-driven transactions
- editor focus, contenteditable state, and TipTap transaction updates
- page-header placement of the temporary Save/status controls
- actual shadow-root host structure, including the live `contenteditable` surface
- absence of the old diagnostic labels and explanatory copy
- removal of the old shadow-root card chrome from the normal edit surface
- retained same-workspace shell content while edit pages reload
- body-only pending treatment during direct Edit bootstrap and same-workspace Live -> Edit transitions
- access-loss teardown, session replacement cleanup, and stale overlay node removal
- floating-position recalculation on owner-document scroll and owner-window resize
- shadow-root overlay placement
- empty page-list success in the server listing service
- server runtime module-boundary protection for page-list dependencies
- shared/server/client document-contract parity across canonical accept/reject fixtures
- fatal page-list client error presentation with disabled create-page controls
- successful empty-workspace create-flow entry from Edit mode

Pending manual verification:

- deployed PDI visual confirmation for `task-32-jacob-smoke-populated`:
  - hard refresh in Live
  - hard refresh with `?mode=edit`
  - Live -> Edit
  - Edit -> Live
  - confirmation that only the editor body shows temporary bootstrap loading
- real pointer focus inside the ServiceNow runtime
- visible caret placement after clicking the page body
- physical keyboard typing through the shadow-root boundary in the PDI

Repo-side validation completed for this bootstrap fix:

- `npm --prefix app/docsera-ui run test`
- `npm --prefix app/docsera-ui run build`
- `npm --prefix app/docsera-ui run verify:inline-runtime-css-build`
- `npm --prefix app/docsera-ui run verify:editor-runtime-boundary`
- `npm --prefix app/docsera-ui run reset:editor-smoke-data` (dry-run)

The final correction also requires deployed PDI validation for:

- direct hard refresh into Edit
- direct hard refresh into Live
- Live -> Edit
- Edit -> Live
- same-workspace page navigation in Edit
- typing, dirty state, explicit Save, refresh persistence, slash controls, bubble controls, link controls, undo, and redo

## Deferred To E4

The following interaction work remains intentionally out of scope for E2-T5:

- generalized overlay arbitration
- advanced timing or flicker parity
- block targeting and multi-block selection
- block drag/drop and context menus
- richer slash search and context-aware filtering
- persistent top toolbar
- collaboration, comments, reactions, publishing, autosave, and reader-mode work
