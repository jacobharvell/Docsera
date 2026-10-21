# Implementation Notes - Task 136 Post-E8 Editor Maintainability Checkpoint

Date: 2026-10-21

Status: documentation checkpoint against `7648c623cb082a3db254c95caddb9e80c5cc8be8`

## Recommendation

Close this checkpoint without a prerequisite editor refactor. The review found no demonstrated ownership conflict or testability failure that warrants extracting production code before MVP hardening. The E4 responsibility spike and E6-T2D checkpoint remain the earlier assessments; this note records the post-E8 changes to that assessment rather than repeating their inventories.

## Current boundaries and evidence

- **Mount and session:** `PageEditorHost.tsx` lazily mounts and tears down the runtime by session identity; `PageEditorHostRuntime.tsx` owns the mounted editor and session-local state. `PageEditorHost.test.tsx`, runtime initialization tests, and `App.editorHostBoundary.test.tsx` cover mounting, identity, and stale-session/transition boundaries.
- **Autosave and workspace:** The runtime tracks the body document, revision, save and flush lifecycle; `App.tsx` coordinates workspace mutations, transition guards and the registered flush. Source title persistence is coordinated separately in App. The host boundary tests cover flush ordering, failed saves and obsolete sessions. E8-T4 records a concrete existing retry test failure (five expected save calls versus six observed); it is a behavior/validation debt, not evidence that ownership extraction fixes it. Diagnose and correct it separately under normal defect work; this inspection did not reproduce or resolve it.
- **Interaction and overlays:** The runtime still coordinates selection, pointer ownership, menu exclusivity, focus and overlay placement, while drag mechanics and command definitions have dedicated collaborators. This shared ownership is intentional: splitting independent controllers that mutate the same interaction lifecycle could introduce competing authorities. `PageEditorHostRuntime.interactionOwnership.test.tsx`, commands, selection and drag tests cover the boundaries.
- **Visual and Source:** The visual host remains mounted as the canonical body and persistence owner, inactive for interaction while Source is active. `WorkspaceMarkdownSourcePanel.tsx` manages projection and recoverable invalid/unavailable source; lazy `MarkdownSourceSession.ts` owns the source editor session. Valid body changes use the host canonical-envelope handoff; App owns readiness and transition coordination. Source panel tests cover retained invalid text, unavailable handoff and recovery, and deferred loading; interaction-ownership coverage checks handoff while Source owns input. This coupling serves a single canonical body rather than establishing another persisted authority.
- **Live:** `PublishedDocumentReader.tsx` renders published envelopes separately from the authoring runtime. Reader tests explicitly check that it is TipTap-free; `App.editorHostBoundary.test.tsx` covers waiting for the appropriate projection and keeping draft content out of Live.

## Deferred candidates and compatibility

The E4 command-surface and block-actions candidates remain cohesive optional cleanup. Both still share selection, placement, dismissal and focus policy with the runtime and each other; existing command integration tests exercise those relationships. No concrete failure or independent evolution demonstrated here makes either extraction a prerequisite. If future changes demonstrate one, extract only that surface with a narrow contract and retain cross-surface integration coverage.

The Live projection's published values in draft-named compatibility slots, documented in `Implementation Notes - Live Edit Editor Host Boundary.md`, remain an explicit compatibility mechanism. The published projection and reader boundary tests protect its present use; this review found no evidence that removing it is required for editor maintainability. Revisit it with any independently scoped projection-contract change, preserving the published-only boundary. No other permanent temporary editor wrapper requiring correction was identified in the reviewed boundaries.

## Validation

Repository source and existing targeted regression coverage were inspected; tests were not executed. No production behavior changed. Full suites, SDK build, deployment and PDI/browser acceptance were intentionally skipped as specified for this documentation-only checkpoint. The known E8-T4 retry failure remains unverified in this review.
