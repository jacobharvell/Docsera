# RR-022 G2 Core Keyboard and Semantic Accessibility Audit

**Date:** 2026-10-31
**Scope:** source and existing-regression-test inspection of My Workspaces, the Live reader, and the Visual editor.
**Method:** no browser, PDI, screen-reader, test-suite, build, lint, deployment, or automated accessibility-tool run was performed.

## Outcome

No source-established **Blocking** issue was found in the audited core paths. Native buttons, links, inputs, lists, headings, several landmarks, disclosure state, focus restoration for the image viewer, and many editor menu semantics are already present.

Three **Should-fix** findings materially affect keyboard or screen-reader use:

1. My Workspaces search has no programmatic label.
2. Live-reader task checkboxes do not expose the task they control.
3. Page-tree reorder and Visual-editor block reorder are pointer-only, with no keyboard alternative.

Image resizing is also explicitly removed from the tab order and pointer-only; it is recorded as **Deferred** because it is a formatting refinement rather than a required core authoring path. Source inspection cannot establish actual focus order, focus visibility, browser DOM behavior, assistive-technology announcements, or WCAG conformance.

## Confirmed findings

### MW-01 — Search field has no accessible name

| Item | Finding |
| --- | --- |
| Severity | **Should-fix** |
| Affected workflow | Find a workspace from My Workspaces using a screen reader or voice input. |
| Evidence | `app/docsera-ui/src/client/features/workspaces/MyWorkspacesScreenSections.tsx:71-90` wraps the input in a `<label>`, but the only sibling preceding it is a `SearchIcon`. `DocseraIcon` deliberately makes unlabeled icons `aria-hidden` (`src/client/shared/icons/DocseraIcon.tsx:16-27`). The input has a placeholder but no visible label, `aria-label`, or `aria-labelledby`. |
| Impact | The textbox has no reliable accessible name. A user may encounter an unnamed edit field; a placeholder is not a durable label or sufficient instruction. |
| Smallest correction direction | Add an explicit accessible name, preferably visible label text styled as visually hidden if the design must remain icon-led (for example, `aria-label="Search workspaces"` or a properly associated text label). Add a focused regression assertion by accessible role and name. |

### LR-01 — Task checkboxes do not identify their task

| Item | Finding |
| --- | --- |
| Severity | **Should-fix** |
| Affected workflow | Read and complete published task-list items with a screen reader. |
| Evidence | `app/docsera-ui/src/client/features/workspaces/PublishedDocumentReader.tsx:588-608` renders a native checkbox followed by the task content, but assigns only `aria-label="Checked task"` or `"Unchecked task"` at line 605. The checkbox has no `<label>`, `aria-labelledby`, or other association with the content rendered at line 607. |
| Impact | Every task is announced generically rather than by its task text. In a multi-item checklist, the user cannot determine what completion state they are changing without separately navigating the adjacent content. |
| Smallest correction direction | Give each checkbox an accessible name derived from its rendered task text—prefer a real `<label>` wrapping/associated with the content where document structure permits, otherwise an ID plus `aria-labelledby`. Preserve the native checkbox and existing persisted-progress behavior. Add a regression test that queries the checkbox by a representative task name. |

### VE-01 — Reordering has no keyboard alternative

| Item | Finding |
| --- | --- |
| Affected workflow | Reorder pages in Edit mode; reorder top-level document blocks in Visual editor using only a keyboard. |
| Severity | **Should-fix** |
| Evidence | `app/docsera-ui/src/client/features/workspaces/PageTree.tsx:717-739` makes a tree row HTML-drag-enabled and supplies only `onDragStart`/`onDragEnd`; its visible page-selection button has no move command or keyboard move handler (`:764-784`). `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx:8560-8598` implements the block handle through pointer-down/drag logic and deliberately gives it `tabIndex={-1}` at line 8568. The editor interaction contract describes these as pointer sessions, not a keyboard path (`docs/process/Editor Runtime Interaction Contract.md`, “Pointer-Session Ownership”). Existing targeted tests exercise pointer paths, e.g. `PageEditorHostRuntime.selection.test.tsx:1655-1691`; no inspected test establishes a keyboard move path. |
| Impact | Keyboard-only authors with page-management rights cannot perform supported hierarchy reordering, and keyboard-only Visual-editor authors cannot access the direct block select/drag/reorder control. This removes structural editing operations available to pointer users. |
| Smallest correction direction | Design one compact, discoverable keyboard move model per surface rather than attempting to keyboard-drive HTML drag events. For example: expose a focused page/block action menu with “move up/down” and valid nesting actions, announce the result, and restore focus to the moved item. Keep server authority and existing pointer behavior. Add targeted keyboard tests for invocation, invalid boundary states, moved position, announcement, and focus restoration. |

### VE-02 — Image resize handles are intentionally keyboard-inaccessible

| Item | Finding |
| --- | --- |
| Severity | **Deferred** |
| Affected workflow | Precisely resize an image in Visual editor. |
| Evidence | `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx:8821-8851` renders left/right resize buttons with `tabIndex={-1}` and only `onPointerDown` resize-session handlers. No keyboard handler or alternate width control appears in that control path. |
| Impact | Keyboard-only authors cannot make the same precision width adjustment. Image insertion and other image actions remain separately exposed through keyboard-reachable buttons and menus. |
| Smallest correction direction | When image editing is expanded, offer a keyboard-reachable width control or discrete increment/decrement actions with value/state feedback; do not merely put a drag handle into the tab sequence without a meaningful keyboard interaction model. |

## Source evidence of working or partially covered behavior

These observations are not claims of live-browser conformance; they explain why they are not findings from source alone.

### My Workspaces

- Workspace entries and Settings are native links; creation, clear-search, retry, and pagination are native buttons (`MyWorkspacesScreen.tsx`, `MyWorkspacesScreenSections.tsx:113-151, 184-202`). The list is an actual `<ul>` with `<li>` rows (`:152-177`), and the page begins with an `h1` (`:37-49`).
- Pagination buttons have text names and native disabled state (`:184-202`). Error and empty/loading states use `role="status"` (`:204-225`). Existing `MyWorkspacesScreenSections.test.tsx:184-202` checks addressable pagination controls and disabled previous state.
- Source does not prove focus-ring contrast/visibility, filter-result announcement timing, or whether focus should stay in search after results refresh. Those require manual browser and screen-reader verification.

### Live reader

- The page tree uses native buttons with `aria-current="page"` and `aria-expanded` for hierarchy state (`PageTree.tsx:764-784`). The TOC is an `<aside>` with an ordered list, named links, and an expanded/collapsed toggle (`WorkspaceToc.tsx:120-173`).
- Accordion controls are native buttons with `aria-controls`, `aria-expanded`, and a `hidden` panel (`PublishedDocumentReader.tsx:768-789`). Images retain authored `alt` and are opened through a named native button (`:288-312`); the fullscreen dialog focuses its close button and restores the launch focus on dismissal (`ImageFullscreenViewer.tsx:151-174, 221-254`). Tables, lists, headings, and images have substantial existing rendering tests, including image alt coverage (`PublishedDocumentReader.test.tsx:1007-1009`) and heading hierarchy/anchor checks (`:1258-1303`).
- No source-level code in the inspected page-selection/rendering components expressly moves focus to the new page heading after a tree selection. That absence alone does not establish a defect: retaining focus on the activated tree control can be appropriate SPA behavior. Verify the intended reading continuation, location announcement, and focus retention in a real browser/screen reader before classifying or changing it.
- The reader content wrapper at `PublishedDocumentReader.tsx:960-962` is a generic `div` with an ARIA label, not a landmark. It is already inside the named `main` supplied by `WorkspaceMainPane.tsx`; this is not classified as material without live landmark-navigation evidence.

### Visual editor

- The editable runtime relies on Tiptap/ProseMirror rather than a custom text-input replacement. The selection toolbar is a named toolbar (`CompactTextToolbar.tsx:2384-2394`); mark buttons provide names and `aria-pressed` (`:1067-1118`); block/color triggers expose menu state (`:2396-2404, 2522-2530`); and command menus expose labelled listbox/menu state (`PageEditorHostRuntime.tsx:9105-9165`).
- Accordion authoring controls also set disclosure relationships and expanded state in the schema node view (`src/shared/editor/schema.ts:812-816`).
- Source does not prove Shadow DOM tab order, focus transfer after every overlay close, focus-ring visibility, or screen-reader behavior of ProseMirror’s contenteditable surface and `aria-activedescendant` command presentation. The project’s own interaction contract explicitly records browser-vs-jsdom limits (`Editor Runtime Interaction Contract.md`, “Browser Versus Jsdom Validation”).

## Prioritized correction recommendation

1. Correct **MW-01** and **LR-01** first. Both are small semantic corrections to common workflows and should have focused role/name regression tests.
2. Design and implement a keyboard alternative for page and block reordering (**VE-01**) before describing the authoring workflow as keyboard-complete. Treat it as a small interaction design task, not a generic ARIA/HTML-drag patch.
3. Track **VE-02** as an explicitly documented limitation until image resize receives a value-based keyboard interaction.

## Manual PDI checklist for Jacob

1. **My Workspaces:** Tab from the browser chrome through New Workspace, search, clear search, workspace links, Settings, and pagination. Confirm every stop has a visible indicator; activate all buttons/links with Enter/Space as applicable; test loading, no-result, and retry states with a screen reader’s announcements pane enabled.
2. **Live reader:** Use only Tab/Shift+Tab and Enter/Space to change pages, collapse/expand TOC and accordions, toggle task items, follow links, and open/close image viewer with Escape. With NVDA + Chrome (or equivalent), confirm the selected page/context, accordion state, task text and checked state, heading hierarchy, table navigation, image alternatives, and dialog focus restoration.
3. **Visual editor:** Enter editor from page title/content, type and exit with Tab/Shift+Tab, use slash commands and text toolbar menus by keyboard, inspect pressed/expanded/selected announcements, and close menus/dialogs with Escape. Explicitly record that block/page reordering and image resizing have no keyboard path until remediated.
4. Use browser Accessibility Tree/DevTools on the named controls above to verify computed names, roles, and states. This is especially necessary for Shadow DOM editor surfaces and portal-based overlays.

## Evidence limitations

This audit is intentionally source-based. It does not establish installed-PDI DOM behavior, CSS focus visibility or contrast, actual tab sequence, browser-native drag behavior, zoom/reflow, screen-reader announcements, keyboard traps, or WCAG 2.2 AA conformance. No test execution occurred; existing tests were inspected only.
