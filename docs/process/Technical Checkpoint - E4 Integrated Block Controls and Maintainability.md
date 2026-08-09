# Technical Checkpoint - E4 Integrated Block Controls and Maintainability

Date: 2026-08-09

Status: checkpoint evidence note

## Purpose

This note records the E4-T3A checkpoint for the integrated block-control interaction system after E4-T2C2. It answers whether the current repository baseline demonstrates any required production correction or responsibility extraction before E4 can be considered complete.

Accepted product behavior remains in `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\Requirements\40 Editor.md`. This note is repo-side evidence only.

## Sources Reviewed

- `AGENTS.md`
- `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\Requirements\40 Editor.md`
- `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\MVP Implementation Plan.md`
- `docs/process/Editor Runtime Interaction Contract.md`
- `docs/process/Technical Spike - Editor Runtime Responsibility and Decomposition.md`
- `docs/process/Implementation Notes - E4-T0 Shared Block-Control Gutter Boundary.md`
- `docs/process/Implementation Notes - E4-T1A Quick Add and Shared Gutter Runtime.md`
- `docs/process/Implementation Notes - E4-T1B1 Single-Block Handle and Selection Gesture.md`
- `docs/process/Implementation Notes - E4-T1B2 Direct Block Actions Menu.md`
- `docs/process/Implementation Notes - E4-T2A Single-Block Drag and Canonical Drop Boundaries.md`
- `docs/process/Implementation Notes - E4-T2B Gutter Multi-Block Selection and Range Delete.md`
- `docs/process/Implementation Notes - E4-T2C1 Multi-Block Drag.md`
- `docs/process/Implementation Notes - E4-T2C2 Long-Document Auto-Scroll.md`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx`
- `app/docsera-ui/src/client/editor/editorBlockHover.ts`
- `app/docsera-ui/src/client/editor/editorAutoScroll.ts`
- `app/docsera-ui/src/client/editor/blockDragReorder.ts`
- `app/docsera-ui/src/client/editor/useTopLevelBlockDragSession.ts`
- focused editor runtime tests and `app/docsera-ui/scripts/test-suite-manifest.mjs`

## Checkpoint Conclusion

Current repository evidence does not demonstrate a confirmed E4 integration defect requiring correction on this branch.

Current repository evidence also does not justify a required production extraction before E4 can be considered complete. `PageEditorHostRuntime.tsx` remains broad, but its breadth is still primarily session and interaction orchestration: editor lifecycle, autosave, overlay arbitration, shared event ownership, focus restoration, transient selection ownership, and wiring between feature modules. File length alone is explicitly not a maintainability failure under the accepted requirements, and no post-T2C2 evidence shows competing state owners or independently mutating interaction machines.

E4-T3A is sufficient repo-side evidence for the E4 maintainability checkpoint, pending Jacob's integrated installed-browser acceptance.

## Current Responsibility Inventory

| Area | Current owner | Checkpoint finding |
| --- | --- | --- |
| Editor mount, session identity, teardown | `PageEditorHost.tsx` and `PageEditorHostRuntime.tsx` | Healthy boundary. The lazy host owns shadow/runtime mounting; the runtime owns the active TipTap session. |
| Autosave, accepted-envelope refresh, revision/status state | `PageEditorHostRuntime.tsx` | Correctly centralized with the active editor session. Same-session save acknowledgement is covered without remount, focus loss, or caret movement. |
| Quick Add, slash selector, query presentation | `PageEditorHostRuntime.tsx` with `editorBlockCommands.ts`, `BlockSelectorStyles.ts`, `CompactMenuStyles.ts` | Cohesive optional cleanup candidate, but no current correctness or ownership risk requires extraction. |
| Block actions and Turn Into | `PageEditorHostRuntime.tsx` with `editorBlockCommands.ts`, shared compact styles | Cohesive optional cleanup candidate, but current ownership remains serviceable and covered. |
| Hover targeting and gutter geometry | `editorBlockHover.ts` plus runtime DOM measurement and placement | Pure bounded-row hover math is already split. Runtime-owned DOM measurement is appropriate because it spans shadow, shell, article, and ProseMirror geometry. |
| Panel-background range selection | `PageEditorHostRuntime.tsx` | Keep centralized. It uses the full `main.docsera-main` panel contract and must arbitrate with content clicks, caret strip, overlays, gutter controls, and lifecycle cleanup. |
| Transient single/range block selection | `PageEditorHostRuntime.tsx` plugin metadata | Keep centralized for now. One transient selection owner supports handle selection, menu state, range delete, and range drag without creating durable state. |
| Single/range block drag lifecycle | `useTopLevelBlockDragSession.ts` with runtime wiring | Healthy split. The hook owns pointer lifecycle and cleanup; the runtime supplies session policy and render wiring. |
| Drag geometry and document moves | `blockDragReorder.ts` | Healthy split. It owns top-level block geometry, drop resolution, inert previews, destination validity, and single-transaction moves. |
| Long-document auto-scroll | `editorAutoScroll.ts` with drag and range-selection callbacks | Healthy split. One shared controller owns frame lifecycle and vertical scroll requests; owning gestures refresh their own targets. |
| Overlay positioning, dismissal, focus restoration | `PageEditorHostRuntime.tsx` | Correctly centralized because selector, block menu, toolbar, link popup, drag feedback, and range marquee share event and focus arbitration. |
| Runtime styling primitives | `BlockSelectorStyles.ts`, `CompactMenuStyles.ts`, runtime-local style block | Acceptable. Shared compact primitives are separated; host styles remain presentation plumbing. |

## Accepted-Hardening Coverage

| Requirement area | Assessment | Repository evidence |
| --- | --- | --- |
| Availability and editor boundary | Adequately covered | Runtime tests cover editability/session/access cleanup, Live/Edit reader separation is protected by editor host boundary tests, and E4 notes record that controls are editor-host owned. |
| Top-level block targeting | Adequately covered | `editorBlockHover.ts` targets bounded top-level block rows; command and selection tests cover nested blockquote/list targeting and direct gutter retargeting. |
| Fixed gutter, density, alignment | Adequately covered | E4-T1A/T1B1 notes record the `69px` gutter and compact `24px` controls; core/command tests cover natural width, 40px title spacing, control order, and block-relative positions. |
| Hover visibility and continuous ownership | Adequately covered | Hover math tests cover content-to-gutter ownership, midpoint boundaries, blank top/bottom exclusion, nested resolution, and leaving the row. Runtime command tests cover shadow host and portaled-control retargeting. |
| Empty paragraph, heading, and blockquote helpers | Adequately covered | Command tests cover accepted helper text, slash-query precedence, nondurable content, and no autosave from helper presentation. |
| Quick Add and shared selector | Adequately covered | Command tests cover shared registry, query filtering, grouped inventory, placement, focus restoration, Quick Add undo, autosave boundary, final-block conversion, blockquote caret placement, and stale-hover suppression. |
| Block actions and Turn Into | Adequately covered | Command tests cover menu open/dismissal, keyboard access, duplicate, delete, Turn Into conversion, final-block fallback, caret fallback for blockquote/list/code paths, undo, and autosave behavior. |
| Single block selection | Adequately covered | Command and drag tests cover handle threshold behavior, selected-block presentation, transient mapping, cleanup when owner disappears, and menu opening. |
| Panel-background range selection and range delete | Adequately covered | Selection tests cover full main-pane activation, side bands, title-text exclusion, caret strip, marquee/highlights, reversal/contraction, non-arming surfaces, lifecycle cleanup, Delete/Backspace, undo restoration, and autosave acknowledgement stability. |
| Single and multi-block drag | Adequately covered | Drag tests cover single drag, range drag, source preservation, ghost preview, invalid/no-op destinations, one transaction, one undo step, post-drop selection, and cleanup. |
| Canonical insertion feedback | Adequately covered | Drag geometry and runtime tests cover one shared boundary line, before/after destinations, inside-range/no-op rejection, insertion-line presentation, and gutter-excluding width. |
| Long-document auto-scroll | Adequately covered | Auto-scroll helper and runtime drag/selection tests cover measured scroll owner, top clearance, acceleration, stationary pointer progression, stop on leaving edge, and cleanup. |
| Overlay arbitration and keyboard/focus | Adequately covered | Command, selection, and toolbar tests cover one active surface at a time, deepest Escape behavior, outside dismissal, keyboard selector/menu paths, owned nested toolbar surfaces, link popup behavior, and focus/caret restoration. |
| Lifecycle, access, mode, and page cancellation | Adequately covered | Command, drag, and selection tests cover session key/page changes, editability/access loss, pointer cancel, visibility/page hide, blur, and teardown cleanup. |
| Autosave acknowledgement and temporary-state boundary | Adequately covered | Core tests cover same-session save acknowledgement without remount/focus/caret movement; selection tests cover valid range preservation through autosave acknowledgement; command/drag/selection tests cover temporary UI state not dirtying or autosaving until completed document transactions. |
| Browser-sensitive ownership | Adequately covered for repo-side regression; still Jacob-owned for installed acceptance | Tests model shadow retargeting, owner document/window, portaled surfaces, main-pane ownership, and non-Node composed-path targets. The runtime contract still classifies jsdom as limited for installed-browser acceptance. |

## Maintainability Checkpoint Assessment

| Checkpoint item from accepted requirements | Assessment |
| --- | --- |
| Each permanent module has a clear responsibility. | Satisfied. Drag session, drag geometry/move execution, hover math, auto-scroll, command registry, and style primitives have narrow owners. The runtime host owns cross-cutting session orchestration. |
| State ownership and subsystem contracts are understandable. | Satisfied. Durable document state remains TipTap/ProseMirror plus autosave; transient block/range/menu/drag UI state remains runtime-owned; drag and auto-scroll modules receive callbacks rather than owning editor session state. |
| Unrelated interaction state machines are not unnecessarily entangled. | Satisfied. Quick Add, block actions, range selection, drag, toolbar, and autosave interact through explicit cleanup/arbitration paths. No evidence shows two modules mutating the same pointer or selection lifecycle independently. |
| Public interfaces are narrower and clearer than broad Studio interfaces where practical. | Satisfied. Current modules use focused TypeScript functions/hooks instead of broad legacy global-DOM controllers or native drag assumptions. |
| Temporary compatibility wrappers have not become permanent without review. | Satisfied. The E4-T2B temporary trace gate was removed before merge. Legacy behavior was reviewed in E4 notes and incompatible global-DOM/native-drag patterns were not carried forward. |
| Refactoring remains protected by migrated regression tests. | Satisfied. The `editor-interactions` managed suite includes hover, initialization, commands, drag, and selection runtime tests; `editor-contract` includes core runtime contract coverage. |
| No arbitrary line-count limit drove restructuring. | Satisfied. `PageEditorHostRuntime.tsx` is large, but the accepted requirements reject line length alone as a reason to split. The current decision is based on state ownership and concrete module boundaries. |

## Test And Evidence Map

The managed suite manifest assigns:

- `editor-contract`: runtime core contract tests.
- `editor-interactions`: shadow/root contract tests, hover tests, initialization tests, command/menu/toolbar tests, drag tests, and selection tests.

Focused coverage includes:

- `PageEditorHostRuntime.commands.test.tsx`: slash, Quick Add, helper decorations, block menu, Turn Into, duplicate/delete, focus, autosave boundary, toolbar/link overlay behavior, owner-document/composed-path behavior, access/session cleanup.
- `PageEditorHostRuntime.selection.test.tsx`: full-pane range selection, side-band activation, title/content/caret-strip exclusions, marquee/highlights, range delete, lifecycle cleanup, autosave acknowledgement stability, range auto-scroll.
- `PageEditorHostRuntime.drag.test.tsx`: auto-scroll helpers, drag geometry, single and multi-block move transactions, ghost/insertion feedback, no-op rejection, undo, cleanup, stationary pointer progression.
- `editorBlockHover.test.ts`: bounded per-block hover ownership and stable midpoint boundaries.
- `PageEditorHostRuntime.core.test.tsx`: runtime contract, layout/gutter density, same-session save acknowledgement, focus/caret stability, autosave serialization/retry/conflict behavior.

Validation run for this checkpoint:

- `npm ci` in `app/docsera-ui` because the fresh task worktree did not yet have `node_modules`; npm reported existing vulnerability metadata, but dependencies were not changed.
- `npm --prefix app/docsera-ui run test:suite -- editor-interactions editor-contract`: passed, 17 files and 463 tests.
- `npm --prefix app/docsera-ui run build`: passed. Known lucide sourcemap and ignored `"use client"` bundling warnings remained non-fatal.
- `npm --prefix app/docsera-ui run verify:editor-runtime-boundary`: passed.

Validation note:

- The first managed suite attempt failed immediately before executing tests because `app/docsera-ui/node_modules/vitest/vitest.mjs` was absent in the fresh worktree. After `npm ci`, the managed suite passed.
- The managed suite emitted existing React `act(...)` warnings in `App.editorHostBoundary.test.tsx`; they did not fail the managed run.

Validation intentionally skipped:

- Interactive PDI/browser testing, per task instruction and project policy.
- SDK deployment, because this spike changes repo documentation only and did not uncover a concrete installed-runtime reason.

## Confirmed Gaps

No confirmed production defect was found.

No maintainability issue requiring extraction was found.

No specific missing automated scenario was found that blocks E4 completion. The remaining evidence gap is installed-browser integration acceptance for cross-feature E4 combinations, because jsdom cannot fully prove shadow retargeting, native selection synchronization, portal styling, pointer capture, and real shell scrolling in the PDI runtime.

## Optional Cleanup

These are optional cleanup tasks only. They have no current correctness or ownership benefit strong enough to block E4 completion.

| Order | Optional task | Coherent outcome | Completion criteria |
| --- | --- | --- | --- |
| 1 | Extract command-surface controller | Slash and Quick Add selector state, query presentation, filtering, command execution, and selector dismissal move behind one narrow hook/controller while runtime keeps host-level overlay wiring. | Existing command tests remain green; controller-level tests cover pure selector/query behavior; runtime integration tests still cover focus, overlay, undo, and autosave boundaries. |
| 2 | Extract block-actions controller | Block actions menu, Turn Into submenu, keyboard navigation, conversion, duplicate/delete execution, and focus recovery move behind one narrow hook/controller while runtime keeps session selection and overlay ownership. | Existing block-action tests remain green; controller-level tests cover menu/submenu state; runtime integration tests still cover selected-block state, dismissal, focus, undo, and autosave boundaries. |

No selection-controller or auto-scroll extraction is recommended now. Selection is intentionally the shared transient state used by handle selection, menus, range delete, and range drag. Auto-scroll is already extracted into a focused shared controller.

## Integrated Manual Acceptance Checklist

Jacob-owned installed-browser acceptance should focus only on cross-feature combinations not already fully proven by individual T1/T2 passes:

1. In Edit mode on a long document, open Quick Add, dismiss it with Escape, then immediately use slash in the preserved empty paragraph. Expected: one selector surface at a time, no stale gutter hover, focus remains in the editor, and undo removes only the accepted Quick Add paragraph transaction.
2. Select a contiguous range from the left and right main-pane side bands, release, then open a block menu from a handle inside the range without dragging. Expected: the range collapses to the clicked block, the menu opens once, and no drag ghost or insertion line remains.
3. Select a contiguous range, drag a handle inside it near the top and bottom scroll edges, then release at a valid destination. Expected: auto-scroll advances destinations, the whole range moves once, the moved range remains selected, and one Undo restores the original order.
4. During an active range selection and an active drag, press Escape near a scroll edge. Expected: auto-scroll stops immediately, marquee/ghost/insertion feedback clears, and no document mutation occurs.
5. Open the block actions menu, open Turn Into, then use Escape repeatedly. Expected: Turn Into closes first, then the parent menu, then any remaining block selection according to the accepted deepest-surface order.
6. With a block menu or Quick Add selector open, trigger an autosave acknowledgement through an ordinary completed edit. Expected: valid overlay/focus/selection state is not cleared solely because persisted state advanced.
7. Switch out of Edit mode, switch pages, or lose authoring access while a selector, menu, range selection, or drag is active. Expected: all temporary state clears without applying pending actions, and returning to Edit does not restore stale hover, menus, range selection, drag state, or insertion indicators.
8. Repeat the above in a narrow/responsive shell with navigation and ToC states changed. Expected: gutter controls remain clickable and unclipped, menus stay within the usable viewport or close cleanly, and document content does not shift when controls appear.

## Final Recommendation

No E4-T3 production correction or required extraction should be created from the current repo evidence. Treat E4-T3A as the repository-side maintainability checkpoint for E4, then rely on Jacob's integrated installed-browser acceptance for the remaining browser-sensitive confidence gate.
