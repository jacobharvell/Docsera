# Implementation Notes - Live Edit Editor Host Boundary

Date: 2026-07-10

Status: implementation note

## Purpose

This note records the current repository-side implementation for the workspace-wide Live/Edit boundary and the production child editor host.

It describes durable repo behavior only. Accepted product behavior remains defined by the Obsidian requirements and implementation brief.

## Route And Workspace Mode Behavior

- Workspace routes use `?workspace=<slug>` and `?page=<slug>`.
- Live is the default workspace mode and omits a mode query parameter.
- Edit uses `?mode=edit`.
- Refresh and browser history restore the current workspace mode from the URL.
- Same-workspace page navigation preserves the current mode.
- Explicit workspace switches, including the launcher and workspace-switcher menu, always reopen the destination workspace in Live.
- Unauthorized edit entry is canonicalized back to Live and uses the published route representation so draft-only slugs are not retained in the URL.

## Live And Edit Tree Projection

- Live page listing is server-projected from published state only.
- Live projection is explicitly allowlisted and carries only the page, workspace, parent, ordering, active/tree, published title/slug/content/body, and published publication-state fields needed by the current client contract.
- Live responses do not include `draftRevision` or draft-only metadata, and published values are explicitly copied into the draft-named compatibility slots the current client still reads.
- Draft-only pages, draft titles, draft slugs, and unpublished canonical content are excluded from Live responses.
- Edit page listing requires authoring capability and exposes the shared draft representation.
- Edit tree rows can show compact `Draft` and `Unpublished` indicators.
- Search is mode-specific: Live matches published titles and slugs, Edit matches draft titles and slugs.
- Selection, expansion, and search query state are stored separately per workspace mode.
- Selected-page continuity remains transient client and route state only; no ServiceNow persistence is added for mode-specific page memory.
- Switching modes clears the current tree search query.
- During an explicit same-workspace Live/Edit switch, the currently selected page `sys_id` is authoritative over any one-shot destination-mode transition target.
- Same-workspace Live/Edit switching resolves the destination page by stable page identity, consumes that transition target, and then uses the destination projection's canonical route slug.
- If the current page is unavailable in the destination projection, selection falls back to the nearest visible ancestor from the source hierarchy.
- If no visible ancestor exists in the destination projection, selection falls back to the first visible top-level page in destination order.
- Exact, ancestor, top-level, and empty outcomes do not retain stale transition targets or contaminate later same-workspace navigation.
- Explicit workspace switches still reopen the destination workspace in Live on its first visible published page.
- When a workspace has no published pages, Live renders an empty state. When Edit has no pages, Edit renders an authoring empty state with create action.

## Parent And Child Editor Ownership

The workspace shell owns:

- route parsing and canonical URL replacement
- workspace mode, page identity, capability gating, and workspace switching
- page tree projection, breadcrumbs, mode-specific selection state, and table-of-contents UI
- page creation, page settings, publish/discard command surfaces, and recovery routing

The production editor host owns:

- TipTap and ProseMirror runtime creation
- document transactions, selection, undo history, and save requests
- heading-outline extraction from the current draft document
- editor-local shadow-root rendering and overlay portal containment

The parent does not receive editor transactions, selection state, extension internals, menus, or editor DOM references.

## Canonical Hydration And Invalid Documents

- Edit mode hydrates from `draftContentJson`.
- Live mode renders from `publishedContentJson`.
- New pages are initialized with a valid empty canonical document envelope.
- Canonical documents are parsed lazily in the workspace view-model layer.
- Malformed, unsupported, inaccessible, or truncated canonical JSON is treated as invalid content state.
- Invalid canonical data does not fall back to legacy text and does not mount editable empty content.
- Invalid draft canonical data renders recovery UI with `Try again` and `Return to Live`.
- Invalid published canonical data renders a non-editor published-content unavailable state.
- The editor host does not overwrite stored canonical JSON during failed hydration.

## Session Lifecycle And Stale Operation Protection

- The production editor host lazy-loads only in Edit mode.
- Live mode does not mount the editor host or TipTap runtime.
- Each page selection gets an isolated editor session keyed by page identity and an explicit session generation, not by the current persisted draft revision.
- Session initialization keeps a bounded mount-time window for TipTap bootstrap work before autosave eligibility begins.
- Mount-time editor updates can refresh the current draft document and clean baseline, but they do not schedule autosave or execute persistence before the session becomes interactive.
- Session creation and invalidation occur in commit-safe lifecycle paths instead of during React render.
- Ordinary successful saves update persistence without creating a new editor generation or remounting TipTap.
- Cursor position, focus, selection, and undo/redo history are preserved across an ordinary successful save because the child host is not recreated for a revision-only change.
- If newer edits are made while a save is pending, the accepted saved snapshot advances but the newer in-memory content remains active and dirty.
- Page changes, retry, mode changes, workspace changes, and access-loss invalidation all terminate the prior session generation.
- The host uses a generation guard so stale async save completions and child callbacks cannot mutate a newer session or a torn-down session.
- Parent-level editor failure state is cleared on page and mode changes.

## Save And Parent Update Flow

- Explicit Save remains the E2 persistence scaffold.
- A clean Live -> Edit or direct Edit entry establishes the loaded draft as the authoritative clean session baseline after TipTap finishes its mount burst.
- Restored local recovery content remains dirty against the authoritative saved baseline and does not autosave on mount.
- Successful child saves update parent page state through one session-scoped path after the save result is confirmed to belong to the active editor session.
- Late save completions from an obsolete page or obsolete session are ignored by the parent shell.
- A successful save leaves the editor clean only when the saved snapshot still matches the current in-memory document.
- Task 42 did not alter save/autosave ownership; selected-page continuity stayed on the routing and view-model boundary rather than shifting into page-body persistence logic.

## Dirty Transition Guard

- The parent shell owns a narrow transition contract from the child host: whether the active editor session is dirty and whether a save is pending.
- The parent does not receive the canonical document, TipTap editor instance, transactions, selection, or undo history.
- Dirty or still-saving transitions that would destroy the current editor session are blocked behind a confirmation dialog with `Stay and continue editing` and `Discard changes`.
- The guard applies to same-workspace page changes, breadcrumb navigation, Edit-to-Live, workspace switching, returning to `My Workspaces`, and browser history transitions where the current routing implementation can intercept them.
- Clean transitions continue immediately without a confirmation.

## Access-Loss Containment

- If a draft save reports lost authoring access, the current session is invalidated immediately.
- Page creation, page settings, deletion, tree-management affordances, and further draft saves are disabled for the remainder of that edit session.
- The visible editor is replaced by the access-loss recovery state with `Return to Live`.
- The child runtime may remain mounted only as an inaccessible hidden subtree until the user leaves the session; it is not visible or exposed to assistive technology.
- Draft-derived outline overrides are cleared on access loss so unpublished headings are not retained in the parent shell.

## Live Projection Safety

- Live page listing now fails closed for inconsistent published records.
- Pages in Live mode use only published title, published slug, published normalized slug, published canonical content, and the published compatibility body field.
- Draft-only pages remain excluded from Live.
- If a published record is missing required published metadata or has malformed published canonical JSON, it is omitted from the Live listing rather than falling back to draft values.

## Runtime Error Containment And Retry

- The child host uses a real runtime error boundary around the lazy runtime tree instead of relying on a `try/catch` around root rendering.
- Runtime render failures are contained inside the child host and surfaced to the parent as the fixed safe message `The editor host could not be mounted.`
- Runtime import failures are surfaced to the parent as the fixed safe message `The editor runtime could not be loaded.`
- `Try again` starts a fresh editor session generation and remounts a fresh child runtime instead of reusing the failed child tree.
- `Return to Live` exits Edit and reloads the published workspace representation.

## Outline Contract

- The child host emits only a normalized draft heading outline.
- Parent ToC rendering is based on that narrow outline contract.
- Reader-side outline generation currently relies on lightweight canonical block rendering and remains intentionally limited pending richer reader work.

## Known Gaps And Deferred Work

- Reader parity for richer canonical blocks remains incomplete and is tracked for E2-T6.
- Atomic compare-and-save, autosave, and conflict recovery remain deferred to E3.
- Publish/discard persistence hardening remains outside this slice.
- Fresh-install portability of the larger canonical field capacity is still unproven and requires instance validation.
