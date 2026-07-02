# Implementation Notes - Editor Host Contract

Date: 2026-07-02

Status: implementation note

## Purpose

This note records the durable repo-side contract for Docsera's editor-host boundary.

It preserves the verified runtime finding from the Task 21.10 mount spike without carrying forward spike-only diagnostic implementation. It summarizes repository architecture only and does not replace accepted product requirements in the Obsidian vault.

## Source Runtime Evidence

The contract below is grounded in the successful runtime checkpoint from `spike/ui-builder-runtime-mount-verification`:

- successful checkpoint: `21.10h`
- successful commit: `a02950169cdea9bab02603c4c3608a464f46cdaa`
- verified pattern: a dedicated child custom element mounted ProseMirror `EditorView` successfully inside the ServiceNow-hosted Docsera shell

The following spike patterns failed and are rejected for the product path:

- parent-owned `EditorView` mounting from the ServiceNow shell blanked the shell
- same-component unmanaged `EditorView` mounting also blanked the shell

## Contract Summary

Docsera uses a ServiceNow-hosted shell with a dedicated child editor-host boundary for editor runtime code.

- the parent Docsera shell owns application chrome, page/workspace state, routing, mode switches, and shell-level error visibility
- the child editor host owns the editor runtime, its shadow-root-scoped DOM, ProseMirror or TipTap lifecycle, and editor-local error containment
- reader mode remains lightweight and must not depend on ProseMirror or TipTap being loaded
- iframe isolation is not the default architecture and remains fallback-only if the child-host model later proves insufficient under real editor complexity

## Parent Shell Responsibilities

The parent ServiceNow-hosted shell is responsible for:

- deciding whether the page is in reader mode or editor mode
- rendering a stable child host element only when editor mode is active
- owning workspace/page selection, shell navigation, and surrounding authoring UI
- preparing editor input data such as page identity, draft content payload, editor mode flags, and capability metadata
- reacting to child-host output events such as content changes, readiness, focus state, or error reports
- removing the child host cleanly when leaving editor mode, changing pages, or unmounting the shell

The parent shell must not directly create or own a ProseMirror `EditorView` or future TipTap editor instance.

## Child Editor Host Responsibilities

The child editor host is responsible for:

- attaching and owning its own shadow root
- creating the editor runtime inside that shadow root
- passing `root: this.shadowRoot` or the equivalent runtime root into ProseMirror/TipTap initialization
- owning editor lifecycle creation, update coordination, teardown, and DOM cleanup
- containing editor-local failures so the parent shell remains visible and debuggable
- exposing a narrow contract back to the parent rather than leaking editor internals into the shell

The child host is the only supported place for ProseMirror `EditorView` ownership in the product architecture.

## Parent-To-Child Handoff

The exact API shape may evolve, but the parent-to-child boundary should stay narrow and data-oriented.

Expected handoff categories:

- document identity: workspace/page identifiers needed to associate the editor session with the selected page
- content payload: the current draft or structured editor document seed
- mode and capability flags: editable/read-only, feature gating, or deferred editor options
- shell context: any minimal metadata the editor surface needs for rendering or telemetry-free local diagnostics

The parent should pass editor inputs through explicit properties, attributes, or a dedicated setup method. It should not reach into child-owned DOM or runtime objects after initialization.

## Child-To-Parent Events

The child host should communicate upward through explicit events or callbacks owned by the shell.

Expected child-to-parent outputs:

- ready/mounted state so the shell can reveal editor-dependent UI
- draft content changes or structured document updates
- dirty-state or pending-work signals when relevant
- focus/selection presence signals when shell UI needs to react
- editor-local error notifications with enough detail for shell-visible fallback messaging

The child should not require the parent to manage ProseMirror transactions, DOM nodes, plugin instances, or other editor internals.

## Lifecycle And Cleanup Expectations

Editor lifecycle must stay fully inside the child-host boundary.

- create the editor only after the child host is connected and its shadow root is available
- update the editor through explicit input changes rather than recreating the parent shell
- destroy the editor instance when the child host disconnects or the selected page/session changes materially
- remove child-owned listeners, observers, timers, and DOM references during teardown
- ensure a child-host failure does not leave the parent shell in a blank or unrecoverable state

## Lazy Loading Expectations

Reader mode and non-editor shell flows should avoid loading editor runtime code by default.

- load ProseMirror, TipTap, and editor-only modules lazily when editor mode is entered
- keep reader rendering on a separate runtime path from editor initialization
- preserve a fast shell render even when editor dependencies fail to load

## Error Containment Expectations

The editor boundary exists partly to contain runtime failures.

- child-host initialization failures should render an editor-local fallback state and emit an error signal upward
- the shell should stay mounted and continue rendering surrounding navigation and page context
- future editor work should treat shell blanking as a regression against this contract

## Reader And Editor Separation

Reader mode and editor mode serve different runtime needs.

- reader mode should render published or display content without requiring ProseMirror or TipTap
- editor mode may load heavier authoring dependencies behind the child-host boundary
- future implementation work must preserve this separation rather than turning the reader path into a thin wrapper around the editor runtime

## Future TipTap Integration Path

TipTap should be introduced by adapting the verified child-host pattern, not by reintroducing parent-owned runtime control.

- TipTap editor creation should occur inside the child host
- TipTap extensions, ProseMirror plugins, and editor commands should remain child-host-owned
- shell features such as toolbar state, publish actions, or autosave should integrate through the contract boundary rather than direct editor ownership by the parent

This note does not claim that full TipTap integration, autosave, persistence, ACL enforcement, or production toolbar behavior is complete.

## ServiceNow Versus Docsera Ownership

ServiceNow is responsible for the scoped-app host environment, authentication, instance runtime, platform tables/APIs, and eventual platform security enforcement.

Docsera is responsible for:

- internal shell UI and navigation
- reader and authoring mode orchestration
- the editor-host boundary and editor lifecycle
- Docsera-owned page/workspace interaction patterns

This contract does not claim that live ServiceNow persistence, routing integration, or ACL behavior is already complete.

## Prohibited Patterns

Future implementation tasks must not:

- mount ProseMirror `EditorView` directly from the parent ServiceNow custom component
- recreate the same-component unmanaged editor-container pattern that blanked the shell
- make reader mode depend on editor runtime initialization
- introduce iframe isolation as the default path without an explicit architectural decision

## Follow-Up Use

Future editor implementation tasks should treat this note as the repo-side architecture baseline for:

- child-host productization
- TipTap integration
- editor shell wiring
- editor runtime regression checks

The Task 21.10 spike summary remains useful as historical evidence, but this note is the durable contract future implementation should follow.
