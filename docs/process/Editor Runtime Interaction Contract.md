# Editor Runtime Interaction Contract

Status: durable repository process and technical contract

## Purpose

This note consolidates the editor-runtime interaction rules learned through E4-T0 through E4-T2B and earlier editor fixes. It is a repo-side contract, not an incident diary.

It records reusable rules for pointer ownership, geometry ownership, overlay behavior, focus behavior, and validation boundaries so future editor tasks do not rediscover the same failure modes.

## Evidence Classification

Use these labels when reading this note:

- current durable contract
- current implementation detail
- known validation limitation
- historical root-cause evidence
- unresolved/deferred area

Do not promote temporary diagnostics, failed hypotheses, or one-off test scaffolding into durable rules.

## Reviewed Sources

The contract below was consolidated from:

- `AGENTS.md`
- `docs/decisions/ADR-0001-editor-architecture.md`
- `docs/process/Technical Spike - Editor Runtime Responsibility and Decomposition.md`
- `docs/process/Implementation Notes - Editor Host Contract.md`
- `docs/process/Implementation Notes - Editor Shell and Autosave.md`
- `docs/process/Implementation Notes - E4-T0 Shared Block-Control Gutter Boundary.md`
- `docs/process/Implementation Notes - E4-T1A Quick Add and Shared Gutter Runtime.md`
- `docs/process/Implementation Notes - E4-T1B1 Single-Block Handle and Selection Gesture.md`
- `docs/process/Implementation Notes - E4-T1B2 Direct Block Actions Menu.md`
- `docs/process/Implementation Notes - E4-T2A Single-Block Drag and Canonical Drop Boundaries.md`
- `docs/process/Implementation Notes - E4-T2B Gutter Multi-Block Selection and Range Delete.md`
- `docs/process/Implementation Notes - E5-T1.6A Legacy Row and Column Move Actions.md`
- current editor runtime code and focused tests in `app/docsera-ui/src/client/editor`

## Event Ownership And Shadow Boundaries

| Classification | Contract |
| --- | --- |
| current durable contract | Derive the owning `Document` and `Window` from the actual surface or element that owns the interaction rather than assuming global `document` or `window`. The current runtime may derive that realm from the editor surface, overlay root, event-owned element, or another validated owner. |
| current durable contract | Browser events are retargeted across shadow and light DOM boundaries. A visible event target or composed path does not need to expose the shadow runtime itself when shell-owned geometry already proves which surface owns the interaction. |
| current durable contract | Use `composedPath()` only where explicit ownership needs to be checked, especially for controls, overlays, and dismissal surfaces. Do not require the composed path to contain the runtime for every gesture. |
| current durable contract | When owned surfaces live inside an open ShadowRoot, document-level dismissal and ownership checks must not rely on `event.target` containment alone. Use the real composed path for cross-boundary checks so internal menu, overlay, and editor surfaces remain recognizable after retargeting. |
| current durable contract | Do not suppress global events outside the gesture or surface that actually owns the interaction. Ownership should be narrow and local. |
| historical root-cause evidence | Earlier failures involved shadow-boundary retargeting and light-DOM shell ownership obscuring the real interaction surface. The fix was to use the correct owner realm plus measured geometry, not to invent broader suppression. |
| historical root-cause evidence | E5-T1.6A confirmed that a document-level outside-dismiss handler can misclassify an internal menu-item `pointerdown` when an open ShadowRoot retargets `event.target` at the document boundary. The durable correction is to read ownership from the real composed path before dismissing. |

## Interaction Surfaces Are Separate Contracts

| Surface | Contract |
| --- | --- |
| current durable contract | Full workspace main-pane background is the accepted range-selection surface. It is not the same thing as the constrained article or the gutter. |
| current durable contract | The constrained document article/layout surface owns document layout and child geometry, but not every workspace hit-test decision. |
| current durable contract | Rendered body-block geometry owns block-relative hover, selection, and placement decisions. |
| current durable contract | The block-relative control gutter and hover row are a separate contract from the full-pane range-selection surface. |
| current durable contract | The near-block caret-intent strip is its own surface and must not be folded into the block-control gutter or the range-selection background. |
| current durable contract | Rendered title text owns its own interaction geometry and must not be treated as the full-width title-row rectangle when blank space behaves differently. |
| current durable contract | Overlays and shell controls are separate ownership surfaces and must not be collapsed into the editor body model. |
| historical root-cause evidence | E4-T2B showed why a generic "gutter" or "editor lane" label is too broad. Different surfaces needed different hit-test and ownership rules even when they were adjacent on screen. |

## Block-Relative Control Geometry

| Classification | Contract |
| --- | --- |
| current durable contract | Quick Add and the handle are positioned relative to the owning block, not relative to a shared lane rectangle. |
| current implementation detail | Current accepted dimensions are `24px / 6px / 24px / 15px`, producing a `69px` reserved gutter. That is the present implementation contract, not a permanent architecture claim. |
| current durable contract | Hover ownership uses bounded per-block rows. It does not let the first or final row absorb unrelated title space, panel background, or blank trailing canvas. |
| current durable contract | The title-to-body boundary and the blank panel background below the final block must not accidentally become first-block or final-block hover ownership. |
| current durable contract | Adjacent block rows share one deterministic boundary. The ownership seam should not wobble between nearby blocks. |
| unresolved/deferred area | If the production dimensions change later, update the concrete geometry here and in the feature note that introduced the change. Do not treat the current pixel values as immutable architecture. |

## Pointer-Session Ownership

| Classification | Contract |
| --- | --- |
| current durable contract | Pointer sessions are short-lived and must survive ordinary React rerenders. Session identity belongs to the runtime gesture state, not to a particular render pass. |
| current durable contract | Move, up, and cancel handling must run on the correct owner document for the gesture that started the session. Derive that owner from the event-owned element or validated runtime surface instead of assuming the global document. |
| current durable contract | Pointer identity and cleanup paths must remain deterministic. A lost pointer, pointer cancel, blur, page hide, access loss, or teardown ends the gesture. |
| current durable contract | Do not introduce competing native HTML5 drag machinery and pointer-session machinery for the same behavior. |
| current durable contract | Do not add retry loops, timing delays, or duplicate fallback gesture paths without demonstrated need. |
| current durable contract | A handle press on an already-selected contiguous range may keep that transient range alive until the handle resolves click-versus-drag. Other block-control presses keep their own established behavior and must not be coupled to the handle's drag-disambiguation path. |
| current durable contract | Do not generalize a single pointer-capture rule across all editor gestures. Single-block drag, handle selection, and range selection are related but not the same proof. |
| historical root-cause evidence | The handle drag path is already proven with owner-document listeners and deterministic cleanup on pointer cancel, lost pointer, blur, page hide, and visibility loss. Range selection was proven through a different panel-background contract and should not be forced into the same lifecycle model without evidence. An E4-T2C1 browser trace disproved the temporary owning-window/`dragend` release hypothesis: trusted `pointerup` reached the release handler, and the stuck drag was caused by a ProseMirror move exception before transaction completion and cleanup. |

## ProseMirror Focus And Transient State

| Classification | Contract |
| --- | --- |
| current durable contract | Transient block and range selection are runtime UI state, not durable document content. |
| current durable contract | Selection-only interaction must not create dirty state, autosave, or undo history. |
| current durable contract | Focus and native DOM-selection synchronization can dispatch ProseMirror transactions in the installed browser even when jsdom does not fully reproduce the same sequence. |
| current durable contract | Evaluate transaction-clearing rules carefully before calling `view.focus()` around transient selection updates. Focus can be part of the acceptance path, but it is not automatically safe to treat as a no-op. |
| current durable contract | Harmless document mapping may preserve transient selection, while invalidated endpoints or lifecycle loss clear it. |
| historical root-cause evidence | The E4-T2B installed-browser investigation did not confirm the suspected `view.focus()` race as the primary failure. The trace showed the failure occurred earlier at pointer classification. |

## Overlay And Portal Contracts

| Classification | Contract |
| --- | --- |
| current durable contract | Floating surfaces may be portaled outside the runtime theme subtree. Portal placement alone does not guarantee runtime token inheritance. |
| current durable contract | Runtime-scoped CSS variables do not automatically cross a portal boundary. Portaled surfaces that need runtime tokens require an explicit theme/token contract. |
| current durable contract | Outside-dismissal listeners must use the correct owner document and must recognize nested owned toolbar, menu, and overlay surfaces before dismissing. |
| current durable contract | Portaled menu actions must be validated through the real overlay root, the real owner-document dismissal listener, and the browser event order the installed runtime emits. Tests should exercise the protected `pointerdown` that may suppress compatibility mouse events, then the real `click` that owns the action boundary. Do not depend on a fabricated compatibility `mousedown` path that production may suppress. |
| current durable contract | Overlay event ownership must not preempt the underlying editor interaction incorrectly. |
| historical root-cause evidence | E4-T2B exposed an invisible marquee token issue caused by a portaled floating layer missing the runtime theme class. The compact toolbar outside-dismissal work also showed why owned nested surfaces must be checked before dismissal. |

## Geometry Measurement

| Classification | Contract |
| --- | --- |
| current durable contract | Live DOM geometry is authoritative for interaction hit testing. Do not reconstruct ownership from hardcoded offsets when the DOM can be measured directly. |
| current durable contract | Similarly named layout regions must remain distinct. Do not infer that a shared label implies a shared ownership contract. |
| current durable contract | Responsive nav, ToC, and article offsets should be measured rather than rebuilt from viewport subtraction formulas. |
| current durable contract | Title text interaction requires rendered text geometry when empty row space behaves differently from the full title row. |
| current durable contract | Block controls remain block-relative even though range-selection ownership extends to the full main pane. |

## Browser Versus Jsdom Validation

| Classification | Contract |
| --- | --- |
| known validation limitation | Jsdom is useful for deterministic state, transaction, geometry-helper, and interaction-regression tests. |
| known validation limitation | Jsdom does not faithfully reproduce every installed-browser behavior, especially shadow retargeting, native selection synchronization, portal styling, pointer capture, and geometry derived from the real shell hierarchy. |
| current durable contract | When those behaviors caused prior failures, tests should model the real shell hierarchy and the exposed target/composed-path conditions that the browser actually produced. |
| current durable contract | Jsdom has browser-fidelity limits in general, but the current environment can reproduce this specific Shadow DOM retargeting behavior when tests use an actual ShadowRoot and composed events. Prefer that real boundary over fabricated targets or paths when it is supported. |
| current durable contract | A passing jsdom test suite is not installed-browser acceptance. |
| current durable contract | Jacob remains the live browser and PDI verifier under the existing project policy. |

## Diagnostic Escalation

Use this path for future editor interaction failures:

1. Review this contract and the relevant feature implementation note first.
2. Compare the failing path with an already working editor interaction.
3. Identify the first transition that is not yet proven.
4. Instrument only that transition when evidence is insufficient.
5. Record the confirmed root cause in the relevant implementation note.
6. Remove temporary instrumentation after acceptance.
7. Update this contract only when a genuinely reusable rule has been learned.

Do not build another large generic tracing framework when a narrow transition check will answer the question.

## Current Evidence Map

This contract should be read together with:

- `docs/process/Implementation Notes - Editor Host Contract.md`
- `docs/process/Implementation Notes - Editor Shell and Autosave.md`
- `docs/process/Implementation Notes - E4-T0 Shared Block-Control Gutter Boundary.md`
- `docs/process/Implementation Notes - E4-T1A Quick Add and Shared Gutter Runtime.md`
- `docs/process/Implementation Notes - E4-T1B1 Single-Block Handle and Selection Gesture.md`
- `docs/process/Implementation Notes - E4-T1B2 Direct Block Actions Menu.md`
- `docs/process/Implementation Notes - E4-T2A Single-Block Drag and Canonical Drop Boundaries.md`
- `docs/process/Implementation Notes - E4-T2B Gutter Multi-Block Selection and Range Delete.md`
- `docs/decisions/ADR-0001-editor-architecture.md`

The technical spike remains historical context. This contract is the durable repo-side summary future editor interaction work should consult first.
