# Technical Spike - Editor Runtime Responsibility and Decomposition

Date: 2026-08-06

Status: technical spike note

## Purpose

This note answers the spike question for `PageEditorHostRuntime.tsx` before E4-T2B:

- does the runtime host currently concentrate independently evolving editor responsibilities;
- which parts are appropriate host orchestration versus feature implementation;
- whether any extraction is required before E4-T2B; and
- what the smallest behavior-preserving extraction sequence looks like if follow-up cleanup is still useful.

The conclusion from repository evidence is:

- `PageEditorHostRuntime.tsx` is broad, but most of the hard mechanics are already split into narrow modules and focused tests.
- the remaining breadth is mainly runtime orchestration: lifecycle, overlay arbitration, event ownership, autosave, and feature wiring.
- no prerequisite extraction is required before E4-T2B.
- useful later cleanup exists, but it is not a blocker for the next production behavior task.

## Responsibility Inventory

| Responsibility | Current owner and collaborators | State/lifecycle boundary | Existing tests | Finding |
| --- | --- | --- | --- | --- |
| Child host mount, update, and destroy contract | `PageEditorHost.tsx` owns lazy import, shadow-root setup, runtime root creation, update forwarding, and teardown; it collaborates with `PageEditorHostRuntime.tsx`, `contracts.ts`, and `session/editorSessionGeneration.ts`. | `PageEditorHost.tsx` scopes the runtime to a single `sessionKey`; `PageEditorHostRuntime.tsx` owns the mounted editor session once created. | `PageEditorHost.test.tsx` and the runtime initialization/core coverage. | Keep in runtime host. This boundary is already healthy and should not be split before E4-T2B. |
| Editor creation, identity, and teardown cleanup | `PageEditorHostRuntime.tsx` owns `useEditor(...)`, editor refs, initialization flags, and dispose cleanup. It collaborates with `onEditorReady`, outline updates, and the editor extensions. | Session-local runtime state. The mounted editor instance is the authority until session replacement or teardown. | `PageEditorHostRuntime.initialization.test.tsx` and `PageEditorHostRuntime.core.test.tsx`. | Keep in runtime host. This is the correct place for editor lifecycle control. |
| Autosave, revision tracking, recovery, and status reporting | `PageEditorHostRuntime.tsx` owns dirty/saving/failed/conflict state, retry scheduling, revision acceptance, and save callbacks. It collaborates with `contracts.ts`, the save adapter, and `session/editorSessionGeneration.ts`. | Session-local persistence authority. It tracks the canonical draft key, accepted revision, and retry state for the active editor session. | `PageEditorHostRuntime.core.test.tsx` and `PageEditorHostRuntime.initialization.test.tsx`. | Keep in runtime host. This is session authority, not a separate feature layer. |
| Transient single-block selection and remapping | `PageEditorHostRuntime.tsx` owns the block-selection plugin, transient selection state, selection clearing, and mapping through document changes. It collaborates with block actions and drag session logic. | Transient runtime state, not durable document data. The selection survives mapping but clears on lifecycle or owner loss. | `PageEditorHostRuntime.commands.test.tsx`, `PageEditorHostRuntime.drag.test.tsx`, and the commands selection regression cases. | Keep in runtime host for now. The existing state is small, shared, and already covered; it does not justify a prerequisite extraction on its own. |
| Hover targeting and gutter geometry | `PageEditorHostRuntime.tsx` owns pointer ownership policy, gutter visibility policy, and style/anchor calculation. It collaborates with `editorBlockHover.ts` and the runtime geometry helpers. | Per-pointer UI state and geometry recomputation tied to the active editor surface. | `PageEditorHostRuntime.commands.test.tsx` and `PageEditorHostRuntime.core.test.tsx`. | Keep in runtime host. The pure geometry math is already split out, which is the healthy seam. |
| Quick Add and slash selector orchestration | `PageEditorHostRuntime.tsx` owns `openSlashSelector`, `openQuickAddSelector`, command query presentation, command execution, and selector dismissal. It collaborates with `editorBlockCommands.ts`, `BlockSelectorStyles.ts`, and `CompactMenuStyles.ts`. | Transient command-surface state for the active session, including hover, focus, placement, and query presentation. | `PageEditorHostRuntime.commands.test.tsx`. | Extract later. This is a cohesive feature surface, but it is not a prerequisite for E4-T2B. |
| Block actions menu and Turn Into submenu | `PageEditorHostRuntime.tsx` owns block-action menu state, submenu state, keyboard navigation, execution, focus recovery, and dismissal. It collaborates with `editorBlockCommands.ts`, `BlockSelectorStyles.ts`, and `CompactMenuStyles.ts`. | Transient block-surface state tied to the selected top-level block and the active overlay roots. | `PageEditorHostRuntime.commands.test.tsx`. | Extract later. The menu surface is cohesive, but the current runtime ownership is still serviceable and not blocking E4-T2B. |
| Drag session integration | `PageEditorHostRuntime.tsx` wires drag state into `useTopLevelBlockDragSession.ts`. The session hook collaborates with `blockDragReorder.ts` for geometry and move execution. | Short-lived pointer-session state, cleared on pointer cancel, blur, access loss, teardown, or release. | `PageEditorHostRuntime.drag.test.tsx`. | No action recommended. Drag mechanics are already separated into dedicated modules, so the runtime host only coordinates them. |
| Overlay positioning, dismissal, and resize arbitration | `PageEditorHostRuntime.tsx` owns overlay measurement scheduling, scroll and resize listeners, surface placement, and outside-pointer dismissal. It collaborates with the runtime overlay root and placement helpers. | Ephemeral overlay state tied to the active editor session and viewport changes. | `PageEditorHostRuntime.commands.test.tsx` and `PageEditorHostRuntime.core.test.tsx`. | Keep in runtime host. This is cross-surface orchestration, not a separate behavior family that needs a new layer before E4-T2B. |
| Runtime-owned style primitives | `PageEditorHostRuntime.tsx` injects the runtime-local style block and composes styles from `BlockSelectorStyles.ts` and `CompactMenuStyles.ts`. | Presentation-only. These styles do not own durable state. | `PageEditorHostRuntime.core.test.tsx` and `PageEditorHostRuntime.commands.test.tsx`. | No action recommended. The shared style primitives are already extracted; the inline runtime style block is host plumbing. |
| Keyboard and pointer event ownership | `PageEditorHostRuntime.tsx` owns editor key handling, overlay-root pointer handling, pointer ownership, and dismissal behavior. It collaborates with the editor plugins, command surfaces, and drag session hook. | Event ownership is session-local and must remain centralized to avoid competing input machines. | `PageEditorHostRuntime.commands.test.tsx`, `PageEditorHostRuntime.core.test.tsx`, `PageEditorHostRuntime.drag.test.tsx`, and `PageEditorHostRuntime.initialization.test.tsx`. | Keep in runtime host. This is the right orchestration layer for shared event policy. |

## Concentration Findings

- `PageEditorHost.tsx` is already a healthy split boundary. It does the lazy import, host mounting, session-key change handling, and cleanup, then gets out of the way.
- `PageEditorHostRuntime.tsx` is broad, but the broadness is mostly orchestration. The expensive mechanics are already in focused modules:
  - `useTopLevelBlockDragSession.ts` owns drag-session lifecycle.
  - `blockDragReorder.ts` owns drag geometry and block move execution.
  - `editorBlockCommands.ts` owns the command registry and generated block JSON.
  - `editorBlockHover.ts` owns hover-target math.
  - `BlockSelectorStyles.ts` and `CompactMenuStyles.ts` own shared style primitives.
  - `session/editorSessionGeneration.ts` owns session-token normalization.
- This is important because it means the runtime host is not still carrying the most failure-prone mechanics alone. It is coordinating them.
- The remaining runtime-local work is mostly correct host responsibility: autosave, overlay arbitration, event ownership, and session cleanup. Those are the things that should stay centralized.
- I did not find evidence that E4-T2B requires a prerequisite extraction just to keep the codebase understandable or safe.
- The only parts that look like later cleanup candidates are the command surface and the block-actions surface. Both are cohesive, but neither is a blocker for starting E4-T2B.

## Candidate Boundaries

### Command-surface controller

- Cohesive responsibility: slash and Quick Add selector state, query presentation, command filtering, and command execution.
- Intended owner: a dedicated hook or controller component, such as a `useEditorCommandSurface` style boundary.
- Contract retained by `PageEditorHostRuntime`: the runtime still opens and closes the surface, passes editor and overlay roots, and renders the portal. It should not need to own the whole command-surface state machine.
- Dependencies and callers: `PageEditorHostRuntime.tsx`, `editorBlockCommands.ts`, `BlockSelectorStyles.ts`, `CompactMenuStyles.ts`, and the command regression tests in `PageEditorHostRuntime.commands.test.tsx`.
- Behavior that must remain unchanged: query filtering, pointer and keyboard navigation, placement, focus restoration, transient query presentation, undo behavior, and autosave boundaries.
- Primary regression risks: stale hover resurrection, focus loss, menu dismissal drift, and accidental editor remounts.
- Tests that protect the boundary: the existing command-focused runtime tests, plus a future controller-level test file if the surface is extracted.
- Why the extraction helps: it isolates one interaction family from unrelated block-menu and drag-session policy, making the runtime host less of a catch-all without changing behavior.
- Recommendation timing: later cleanup only, not before E4-T2B.

### Block-actions controller

- Cohesive responsibility: block actions menu state, Turn Into submenu state, keyboard navigation, conversion, duplicate, delete, and focus recovery.
- Intended owner: a dedicated hook or controller component, such as a `useBlockActionSurface` style boundary.
- Contract retained by `PageEditorHostRuntime`: the runtime still owns transient block selection and portal rendering, but the menu state machine itself can be narrower.
- Dependencies and callers: `PageEditorHostRuntime.tsx`, `editorBlockCommands.ts`, `BlockSelectorStyles.ts`, `CompactMenuStyles.ts`, and the block-action regression tests in `PageEditorHostRuntime.commands.test.tsx`.
- Behavior that must remain unchanged: command order, submenu exclusivity, Escape behavior, delete and duplicate focus results, conversion semantics, undo behavior, and autosave boundaries.
- Primary regression risks: lost focus after dismissal, stale selected-block state, incorrect submenu reopening, and selection corruption while the active block changes.
- Tests that protect the boundary: the existing block-action runtime tests, plus a future controller-level test file if the surface is extracted.
- Why the extraction helps: it separates a second command-family surface from the selector surface and keeps future block-control growth from compounding inside the runtime host.
- Recommendation timing: later cleanup only, not before E4-T2B.

## Options and Recommendation

### Option 1

Proceed directly to E4-T2B with no prerequisite extraction.

### Option 2

Perform one minimal prerequisite extraction, then E4-T2B.

### Option 3

Perform a broader sequence of extractions before E4-T2B.

### Recommendation

Option 1 is the smallest behavior-preserving choice supported by the repository evidence.

Why:

- the runtime host is broad, but the complex mechanics are already split into focused modules;
- the remaining runtime-local responsibilities are the ones that should stay centralized for the current editor session;
- no current responsibility has a confirmed ownership defect that would make E4-T2B unsafe to start; and
- extracting command or block-action surfaces now would be useful cleanup, but it would not remove a real blocker.

## Ordered Task Map

| Order | Task | Coherent outcome | Depends on | Required before E4-T2B? |
| --- | --- | --- | --- | --- |
| 1 | Extract a command-surface controller for slash and Quick Add | One owner for selector state, query presentation, and command execution, while the runtime keeps host-level overlay wiring | `PageEditorHostRuntime.tsx`, `editorBlockCommands.ts`, `BlockSelectorStyles.ts`, `CompactMenuStyles.ts`, and the existing command tests | No |
| 2 | Extract a block-actions controller for the block menu and Turn Into submenu | One owner for block-action state and submenu navigation, while the runtime keeps session and overlay orchestration | `PageEditorHostRuntime.tsx`, `editorBlockCommands.ts`, `BlockSelectorStyles.ts`, `CompactMenuStyles.ts`, and the existing block-action tests | No |

E4-T2B remains the next production behavior task after this spike.

## Test Organization After Any Later Extraction

- Keep `PageEditorHostRuntime.core.test.tsx` as the host-contract and lifecycle suite. It already covers lifecycle, autosave, geometry, schema, and other cross-cutting runtime behavior.
- Keep `PageEditorHostRuntime.initialization.test.tsx` as the initialization and mount-burst suite. That is the right place for mount-time update bursts, initial baseline behavior, and session-setup regressions.
- Keep `PageEditorHostRuntime.drag.test.tsx` as the drag-session suite. Drag already has its own hook and geometry module, so the tests should stay attached to that owner boundary.
- Keep `PageEditorHostRuntime.commands.test.tsx` as the end-to-end runtime integration suite for command surfaces until a later extraction actually moves logic out.
- If the command-surface controller is extracted later, move the pure selector-state and query-presentation cases into a new controller-level test file, but keep the runtime integration tests for focus, overlay, and editor wiring.
- If the block-actions controller is extracted later, move the pure menu-ordering and submenu cases into a new controller-level test file, but keep the runtime integration tests for dismissal, focus recovery, and host-level overlay behavior.
- Do not split tests by helper file or by implementation detail. Split them only when the behavior owner changes.

## Deferred Areas

- A dedicated selection controller around `createBlockSelectionExtension`, `setTransientBlockSelection`, and the mapping helpers may become useful if multi-block selection continues to grow after E4-T2B.
- Overlay placement helpers could be split further if later floating surfaces introduce more placement policy, but the current host-level placement logic is still justified.
- The runtime style block could be reduced further only if a broader theme contract or shared overlay framework emerges.
- None of these are blockers for E4-T2B.

## Evidence Used

The spike conclusion is grounded in these repo-side sources and tests:

- `docs/decisions/ADR-0001-editor-architecture.md`
- `docs/process/Implementation Notes - Editor Host Contract.md`
- `docs/process/Implementation Notes - Editor Shell and Autosave.md`
- `docs/process/Implementation Notes - Revision-Safe Page Body Autosave.md`
- `docs/process/Implementation Notes - E4-T0 Shared Block-Control Gutter Boundary.md`
- `docs/process/Implementation Notes - E4-T1A Quick Add and Shared Gutter Runtime.md`
- `docs/process/Implementation Notes - E4-T1B1 Single-Block Handle and Selection Gesture.md`
- `docs/process/Implementation Notes - E4-T1B2 Direct Block Actions Menu.md`
- `docs/process/Implementation Notes - E4-T2A Single-Block Drag and Canonical Drop Boundaries.md`
- `docs/process/Test Strategy and Validation Areas.md`
- `app/docsera-ui/src/client/editor/PageEditorHost.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.initialization.test.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.core.test.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.commands.test.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.drag.test.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.testUtils.tsx`
- `app/docsera-ui/src/client/editor/editorBlockCommands.ts`
- `app/docsera-ui/src/client/editor/editorBlockHover.ts`
- `app/docsera-ui/src/client/editor/blockDragReorder.ts`
- `app/docsera-ui/src/client/editor/useTopLevelBlockDragSession.ts`
- `app/docsera-ui/src/client/editor/BlockSelectorStyles.ts`
- `app/docsera-ui/src/client/editor/CompactMenuStyles.ts`
- `app/docsera-ui/src/client/editor/session/editorSessionGeneration.ts`
