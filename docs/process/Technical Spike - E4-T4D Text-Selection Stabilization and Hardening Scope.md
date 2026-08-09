# Technical Spike - E4-T4D Text-Selection Stabilization and Hardening Scope

Date: 2026-08-09

Status: spike / evidence note

## Purpose

This note answers what concrete work, if any, remains for E4-T4D after the completed E4-T4C compact text-selection toolbar and the passed E4-T3 integrated browser checkpoint.

Accepted product behavior remains in `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\Requirements\40 Editor.md`. This note is repo-side evidence only and does not create new product requirements.

## Sources Reviewed

- `AGENTS.md`
- `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\Requirements\40 Editor.md`
- `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\MVP Implementation Plan.md`
- `docs/process/Editor Runtime Interaction Contract.md`
- `docs/process/Technical Checkpoint - E4 Integrated Block Controls and Maintainability.md`
- `docs/process/Implementation Notes - Legacy Text Toolbar Evidence and Reconstruction Plan.md`
- `app/docsera-ui/src/client/editor/CompactTextToolbar.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.commands.test.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.selection.test.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.drag.test.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.core.test.tsx`
- `app/docsera-ui/src/client/editor/shadowRootContract.test.tsx`
- `app/docsera-ui/test/editorDocumentContractParity.test.ts`
- `app/docsera-ui/src/shared/editor/schema.ts`
- `app/docsera-ui/src/shared/editor/schema.test.ts`
- `app/docsera-ui/src/shared/editor/document.test.ts`
- Legacy Docsera sources under `C:\Dev\docsera-editor-reference\studio`:
  - `src/components/Editor.tsx`
  - `src/components/editor/useBubbleLinkMenuController.ts`
  - `src/components/editor/useBlockContextDragHandleController.ts`
  - `src/app/globals.css`
  - `tests/e2e/table-content-block-v1.spec.ts`
  - `tests/e2e/gutter-selection-regressions.spec.ts`
  - `tests/e2e/slash-lifecycle-regressions.spec.ts`
  - `tests/e2e/accordion-content-block-v1.spec.ts`

## Current Behavior And Ownership Inventory

| Area | Current owner | Finding |
| --- | --- | --- |
| Toolbar visibility and selection snapshots | `CompactTextToolbar.tsx` | The toolbar now owns eligible text-selection snapshots, dismissed-selection suppression, pointer-created selection hiding, and frozen interaction selection while nested surfaces are open. |
| Pointer-created selection stabilization | `CompactTextToolbar.tsx` | Pointer sessions track origin, drag intent, idle timers, and reveal timers. Movement above the drag threshold hides the toolbar, idle/release reveals only after a settled selection exists, and cleanup clears timers. |
| Keyboard-created selection | `CompactTextToolbar.tsx` plus TipTap selection transactions | Keyboard/programmatic text selections use the immediate eligible-selection path and do not depend on pointer idle timing. Code-block, empty, node, non-editable, and access-lost selections remain ineligible. |
| Toolbar commands | `CompactTextToolbar.tsx` | Inline mark, block-type, More-menu, and link commands restore the saved selection with `focus(..., { scrollIntoView: false })` and `setTextSelection(...)` before mutation. |
| Text dropdown and More menu | `CompactTextToolbar.tsx` | Menus are separate portaled fixed-position surfaces anchored to toolbar trigger geometry. Opening a menu does not resize the toolbar shell. |
| Link create/edit/remove/follow | `CompactTextToolbar.tsx` | Toolbar-source link surfaces preserve the originating range, direct link-click surfaces suppress the main toolbar, unsafe hrefs are rejected, and follow uses a new no-opener window. Clipboard write failure is explicitly non-fatal and belongs outside E4-T4D clipboard scope. |
| Outside dismissal and Escape | `CompactTextToolbar.tsx` and `PageEditorHostRuntime.tsx` | Toolbar dismissal uses the overlay owner document, composed path, owned-surface checks, and deepest-active-surface ordering for tooltip/link/menu/toolbar. Block selectors and block menus use their own host-level deepest-surface rules. |
| Scroll, resize, and reflow repositioning | `CompactTextToolbar.tsx` and `PageEditorHostRuntime.tsx` | Toolbar, menus, link surface, command selector, block menus, and hover overlays listen on their owner document/window for scroll/resize and recompute measured fixed placement. |
| Owner document, shadow root, and portal boundaries | `CompactTextToolbar.tsx`, `PageEditorHostRuntime.tsx`, `shadowRootContract.test.tsx` | The runtime passes the overlay root owner document/window into the toolbar. Event ownership uses owner-document listeners and composed-path aware checks. Portaled overlays carry runtime classes/token contracts. |
| Autosave acknowledgement | `PageEditorHostRuntime.tsx` with toolbar tests | Same-session save acknowledgement preserves editor instance, caret/text selection, block/range selection, and valid overlay state. Temporary selection UI remains outside dirty/autosave history. |
| Page/session/Edit/access teardown | `PageEditorHostRuntime.tsx`, `CompactTextToolbar.tsx` | Loss of editability, access, page/session changes, unmount, and listener disposal clear toolbar/link/menu and transient block/range state rather than restoring stale UI. |
| Transient block/range selection arbitration | `PageEditorHostRuntime.tsx` | Text toolbar is treated as an overlay, document content as ordinary text-selection intent, and blank panel/gutter selection as a separate transient state. Range selection does not arm from toolbar, slash menu, document content, quick add, handle, or shell space. |

## Requirement-To-Test Evidence Map

| Accepted requirement area | Current regression evidence | Classification |
| --- | --- | --- |
| Pointer-drag text selection hides during active movement, appears after idle, and hides again on resumed movement | `PageEditorHostRuntime.commands.test.tsx` includes `keeps the toolbar mounted at the last settled position during resumed dragging and repositions only after idle and release` and `preserves a cross-block text selection after mouse release and only reveals the toolbar after the final selection commits`. | Already covered |
| Keyboard-created selection is independent of pointer idle timing | `PageEditorHostRuntime.commands.test.tsx` includes `shows keyboard selections immediately, hides unsupported selections, and respects the content-sized toolbar contract`. | Already covered |
| Toolbar control order, accessibility names, shortcut labels, and compact shell | `PageEditorHostRuntime.commands.test.tsx` includes `renders the compact toolbar in the accepted order with platform-aware tooltip labels`, dark-theme contract, content-sized shell, and cursor/spacing checks. | Already covered |
| Text dropdown order, selected state, chevron, and block conversion | `PageEditorHostRuntime.commands.test.tsx` covers the accepted menu order, `Change to` heading, selected/checkmark state, chevron flip, paragraph/heading/list conversion matrix, and same-type no-op cleanliness. | Already covered |
| More menu order, selected state, Blockquote, Superscript, Subscript, Highlight | `PageEditorHostRuntime.commands.test.tsx` covers More order, selected treatment, blockquote conversion, mark toggles, and Superscript/Subscript mutual exclusion without losing unrelated marks. | Already covered |
| Link create/edit/remove/follow and direct link click behavior | `PageEditorHostRuntime.commands.test.tsx` covers Mod+K, create/edit/remove/follow, partial-link range extension, direct-click link popup suppression, invalid/unsafe/blank input, Escape cancellation, and outside dismissal. | Already covered |
| Selection preservation while entering toolbar/menu/link surfaces | `PageEditorHostRuntime.commands.test.tsx` covers toolbar action selection restoration, link popup frozen placement, editor-pointer replacement selection, and preserved selection after Escape from toolbar-source link popup. | Already covered |
| Nested-surface exclusivity and Escape ordering | `PageEditorHostRuntime.commands.test.tsx` covers one toolbar-owned nested surface at a time and distinct Escape behavior for toolbar-source versus direct-click link popups. E4-T3 checkpoint records block selector/menu deepest-first coverage. | Already covered |
| Outside-pointer dismissal across owned and unowned surfaces | `PageEditorHostRuntime.commands.test.tsx` covers keeping the toolbar open for owned-surface pointerdown and dismissing on outside pointerdown, plus link-surface outside-shell dismissal without content mutation. | Already covered |
| Owner-document, shadow-root, and portaled overlay ownership | `PageEditorHostRuntime.commands.test.tsx` covers owner-document listener registration, repositioning, and cleanup; `shadowRootContract.test.tsx` covers runtime/overlay shadow-root mounting; E4-T3 checkpoint covers portaled overlay token ownership. E4-T4C already received Jacob installed-browser/manual PDI acceptance, and E4-T3 later received integrated installed-browser acceptance for cross-feature E4 interaction behavior. | Already covered |
| Scrolling, viewport resize, and shell reflow | `PageEditorHostRuntime.commands.test.tsx` covers toolbar/link repositioning from overlay owner scroll/resize. `PageEditorHostRuntime.selection.test.tsx` covers main-pane geometry recomputation after shell width/article offset changes. E4-T3 covers block overlay and long-document auto-scroll evidence, including installed-browser acceptance. | Already covered |
| Autosave acknowledgement while valid text selection or toolbar surface exists | `PageEditorHostRuntime.core.test.tsx` covers same-session acknowledgement without remount/focus/caret movement. `PageEditorHostRuntime.selection.test.tsx` covers valid range preservation through autosave acknowledgement. Toolbar tests cover temporary UI not autosaving until completed document transactions. | Already covered |
| Page/session/Edit/access teardown | `PageEditorHostRuntime.commands.test.tsx` covers teardown when edit access is lost and listener cleanup on unmount. E4-T3 covers page/session/mode/access cancellation for block controls, range selection, and drag. | Already covered |
| Ordinary text selection versus transient block/range selection | `PageEditorHostRuntime.selection.test.tsx` covers document content and text toolbar as non-range-selection surfaces, near-block caret strip as text intent, and no autosave/undo for transient range state. `PageEditorHostRuntime.drag.test.tsx` covers range-drag arbitration. | Already covered |
| Document-boundary formatting and paste/schema/reader preservation for toolbar-driven commands | `PageEditorHostRuntime.core.test.tsx`, `app/docsera-ui/test/editorDocumentContractParity.test.ts`, `schema.test.ts`, and `document.test.ts` cover H1, underline, highlight, superscript, subscript, blockquote, link policy, paste sanitization, canonical validation/canonicalization, and reader/outline parity where applicable. | Already covered |

## Legacy Parity Review

| Legacy behavior or difference | Current Docsera status | Classification |
| --- | --- | --- |
| Legacy `useBubbleLinkMenuController` hides the bubble during active mouse movement and re-shows after idle or release. | Current toolbar owns pointer session suppression, idle/reveal timers, threshold alignment, and tests for resumed drag hiding/reveal. | Already covered |
| Legacy keyboard-created selections bypass mouse idle delay. | Current toolbar shows eligible keyboard/programmatic text selection immediately and tests unsupported selection hiding separately. | Already covered |
| Legacy freezes a bubble anchor/selection while using inline controls and link popup. | Current toolbar keeps `interactionSelection`, restores selection before commands, freezes link-surface anchor rect, and verifies partial-link edit/remove behavior. | Already covered |
| Legacy link popup distinguishes toolbar-source opens from direct link clicks to suppress stale main-bubble revival. | Current link surfaces distinguish `toolbar` and `link-click`; tests cover direct-click popup staying independent from the toolbar and toolbar-source Escape restoration. | Already covered |
| Legacy click-away has special suppression for editor content clicks and outside-shell clicks. | Current toolbar uses owner-document pointerdown with owned-surface checks; tests cover editor replacement selection and outside-shell dismissal without mutation. | Already covered |
| Legacy overlay exclusion avoids block drag/gutter selection stealing toolbar or link popup interactions. | Current runtime classifies toolbar as overlay and range selection does not arm from toolbar, slash menu, content, quick add, handle, or shell space. | Already covered |
| Legacy had table-cell bubble toolbar coverage. | Current Docsera has not implemented table cells in MVP yet; E5/E7 table work owns table-cell toolbar parity after table support exists. | Parity gap requiring product review only if table-cell toolbar behavior is pulled forward before E5/E7 |
| Legacy excluded accordion-summary selections from bubble toolbar display. | Current Docsera has not implemented accordions yet; E6 accordion work owns summary/body toolbar rules. | Parity gap requiring product review only if accordion text-selection rules are pulled forward before E6 |
| Legacy toolbar used native `title` labels while current toolbar adds styled tooltip surfaces. | Accepted current requirement explicitly asks for styled tooltips with names/shortcuts, so this is a current improvement over Legacy. | Intentional/current improvement |
| Legacy visual styling used Studio/Tailwind editor tokens and different radii. | E4-T4C intentionally rebuilt the shell with current Docsera tokens and compact geometry. | Intentional/current improvement |
| Legacy relied on Tiptap BubbleMenu/Floating UI and global window/document assumptions. | Current implementation uses React portal surfaces, owner-document/window contracts, composed-path ownership, and shadow-root-aware placement. | Intentional/current improvement |

## Demonstrated Current Gaps

No confirmed production defect was found.

No confirmed hardening gap was found in repository evidence.

No Legacy difference reviewed here demonstrates an E4-T4D production correction before E4 can be considered complete. The only meaningful Legacy parity areas not represented in current production requirements/tests are table-cell toolbar behavior and accordion-summary/body toolbar behavior, and those belong to later accepted table and accordion phases unless Jacob explicitly pulls them forward.

No additional E4-T4D installed-browser acceptance pass is required. E4-T4C already received Jacob installed-browser/manual PDI acceptance, and E4-T3 subsequently received integrated installed-browser acceptance covering cross-feature E4 interaction behavior. Because E4-T4D1 changed documentation only and found no confirmed production defect, no confirmed hardening gap, no missing E4 Legacy parity behavior requiring implementation, and no production runtime change requiring new browser validation, re-running already accepted toolbar behavior would duplicate existing acceptance evidence rather than close a new risk.

## Required Questions

| Question | Answer |
| --- | --- |
| Does pointer-drag text selection reliably stabilize the toolbar according to the accepted moving/idle behavior? | Repository evidence says yes. The toolbar remains hidden during active movement, reappears after idle/release once the final selection commits, and hides again if movement resumes. Prior Jacob installed-browser/manual PDI acceptance for E4-T4C and integrated E4-T3 acceptance already cover the relevant accepted interaction behavior. |
| Does keyboard selection behave independently of pointer-idle timing? | Yes. Keyboard/programmatic text selection uses the immediate eligible-selection path and is covered by focused toolbar tests. |
| Can toolbar/menu/link interactions preserve the original text selection without accidental editor selection changes? | Yes. Current commands restore the saved range before mutation, link surfaces preserve command and display ranges, and tests cover mark commands, block conversion, link edit/remove, partial-link expansion, Escape cancellation, and replacement selections. |
| Are nested toolbar surfaces mutually exclusive and dismissed in the accepted deepest-first order? | Yes for current toolbar surfaces. Tests cover only one toolbar-owned nested surface at a time and distinct Escape behavior for link popup versus toolbar. E4-T3 covers block selector/menu deepest-first ordering. |
| Are owner-document, shadow-root, and portal event boundaries handled consistently? | Yes for repo-side evidence. Current code uses overlay owner document/window, composed-path checks, and portaled overlay roots. Prior installed-browser acceptance covers the accepted E4 interaction behavior; future browser testing is required only if a later change or observed defect affects these interactions. |
| Can scrolling, viewport resize, or shell reflow leave toolbar/menu/link surfaces stale or incorrectly positioned? | Repository evidence does not show that. Current surfaces recompute on owner scroll/resize, and tests cover owner-document repositioning plus shell geometry recomputation. Prior E4 acceptance evidence covers the accepted runtime behavior; no new browser pass is required without a demonstrated regression or runtime change. |
| Does same-session autosave acknowledgement preserve a valid toolbar selection/surface without remount or unnecessary dismissal? | Evidence supports the underlying session and selection guarantee. Core autosave tests cover no remount/focus/caret movement; toolbar/link tests cover selection preservation around active surfaces; range-selection tests cover autosave acknowledgement stability. |
| Do page/session/Edit/access transitions reliably clear stale toolbar state? | Yes in repo-side tests. Access loss and unmount clear toolbar/link/menu state, and E4-T3 covers broader session/mode/page cleanup for block controls, range selection, and drag. |
| Does transient block/range selection correctly arbitrate with ordinary text selection and the text toolbar? | Yes. Range selection does not arm from toolbar or document content, ordinary text selection remains eligible for the toolbar, and handle/range drag arbitration is covered separately. |
| Do current regression tests cover the important browser-sensitive transitions? | They cover the repo-modeled transitions with owner-document, composed-path, portal, geometry, pointer, keyboard, autosave, and lifecycle tests. Prior E4-T4C and E4-T3 installed-browser/manual PDI acceptance covers the accepted browser behavior, so no additional E4-T4D acceptance pass is required. |
| Which Legacy text-selection behaviors remain valuable and not yet represented in current requirements/tests? | Table-cell bubble behavior and accordion-summary/body suppression remain valuable but map to later table/accordion phases. No E4 text-selection toolbar parity behavior remains unrepresented. |
| Does any actual production correction remain necessary before E4 can be considered complete? | No production correction is demonstrated by current requirements, Legacy evidence, implementation, or regression coverage. |

## Follow-Up Task Map

No production implementation task is recommended for E4-T4D from current evidence.

If future browser testing or a later observed defect finds an actual problem, create one narrowly scoped follow-up for the first confirmed failing transition. Candidate shape:

| Order | Trigger | Follow-up scope |
| --- | --- | --- |
| 1 | A future installed-browser scenario reproduces a toolbar positioning, dismissal, or selection-preservation failure not covered by current tests. | Add a failing regression test that models the first failing transition, then correct only that transition. |
| 2 | Jacob decides table-cell toolbar behavior must ship before E5/E7. | Product decision first; then a table-specific implementation task after table support exists or is intentionally pulled forward. |
| 3 | Jacob decides accordion summary/body toolbar behavior must ship before E6. | Product decision first; then an accordion-specific implementation task after accordion support exists or is intentionally pulled forward. |

## Validation

Validation run:

- `npm --prefix app/docsera-ui run test:suite -- editor-interactions editor-contract`: first attempt failed before executing tests because the fresh task worktree lacked `app/docsera-ui/node_modules/vitest/vitest.mjs`.
- `npm ci` in `app/docsera-ui`: completed from the checked-in lockfile. npm reported existing vulnerability metadata and deprecation warnings; dependencies were not changed.
- `npm --prefix app/docsera-ui run test:suite -- editor-interactions editor-contract`: passed, 17 files and 463 tests.
- `npm run validate:docs`: passed.

Validation notes:

- The passing managed suite emitted existing React `act(...)` warnings from `App.editorHostBoundary.test.tsx`; they did not fail the managed run.

Validation intentionally skipped:

- Interactive PDI/browser testing, per task instruction and project policy.
- SDK deployment and installed-runtime verification, because this is a documentation spike and no concrete installed-runtime question emerged from repository evidence.
- Full `npm --prefix app/docsera-ui run validate`, because the targeted managed suites cover the relevant toolbar, interaction, document-contract, schema, paste, and reader-boundary evidence.

## Future Regression Reference Checklist

This checklist is non-blocking reference material for future regression testing. It is not a prerequisite to closing E4-T4D. Use it only if a later change or observed defect affects these interactions:

1. Pointer-drag select text across one line and across block boundaries, pause mid-drag, resume movement, then release. Expected: toolbar hides while moving, appears only after idle/release on the settled range, and does not drift or flash stale positions.
2. Create a keyboard text selection and immediately use Bold, Text dropdown, More, and Link. Expected: toolbar appears without pointer delay, actions apply to the original selection, and focus returns predictably.
3. With Text dropdown, More, or Link open, press Escape repeatedly. Expected: the active nested surface closes first, then the toolbar dismisses without changing document content.
4. Open Link from selected text, interact with the input, then click back in editor text and outside the shell. Expected: original selection is preserved while editing the link, replacement editor selection is honored when clicking editor text, and outside click dismisses without mutation.
5. With the toolbar or a nested surface open, scroll the editor panel and resize or reflow the shell by changing nav/ToC state. Expected: surfaces stay anchored to the valid selection or close cleanly; they do not remain detached.
6. While a valid toolbar selection/surface exists, allow an autosave acknowledgement from a completed edit in the same session. Expected: no editor remount, no unnecessary toolbar dismissal, and no caret/selection jump solely because persisted state advanced.
7. With text toolbar open, start panel-background range selection, handle selection, and range drag scenarios nearby. Expected: toolbar-owned surfaces are treated as overlays, ordinary text selection does not become block/range selection, and transient block/range state does not create a text-toolbar artifact.

## Final Recommendation

E4-T4D is complete from current requirements, repository evidence, prior installed-browser acceptance, and the E4-T3 integrated acceptance. No production implementation task is required. Do not manufacture a production hardening branch for E4-T4D unless future browser testing, an observed defect, or a later requirement review demonstrates a specific defect, hardening gap, or approved parity decision.
