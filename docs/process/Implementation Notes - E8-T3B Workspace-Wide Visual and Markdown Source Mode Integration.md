Date: 2026-08-31

Status: implementation note

## Purpose

This note records the repository-side behavior added for E8-T3B: workspace-scoped Visual/Markdown authoring-surface state, lazy markdown source rendering, the shared current-page authoring-readiness gate, and the invalid-source guard path that reuses the existing persistence pipeline.

Accepted product behavior remains authoritative in `Requirements/40 Editor.md`.

## Workspace-Level Surface State

- The active authoring surface is tracked per workspace in the app shell instead of per page.
- The header now exposes the Visual/Markdown switch only in workspace edit mode when authoring is available, and the switch is disabled whenever the current-page readiness gate blocks a surface transition.
- The workspace mode control now uses a flatter segmented treatment, and the Visual/Markdown surface toggle uses icon-only buttons with accessible names instead of visible text labels.
- The Live/Edit segmented control keeps the same horizontal slot because the Visual/Markdown toggle, divider, and publish/save region remain mounted as hidden reserved geometry in Live instead of collapsing out of the right-side cluster.
- Switching surfaces does not replace the canonical visual editor session. The visual `PageEditorHost` remains the canonical body/persistence boundary.
- In Markdown mode the visual host stays mounted for canonical and persistence ownership, but the runtime is marked inactive so Markdown owns pointer/focus interaction.
- Interaction-ownership changes update the mounted TipTap editor's transient browser participation and listener ownership without recreating the editor instance, so history and canonical handoff survive Visual/Markdown toggles.
- Markdown mode does not render the inline visual page-title chrome; the page title remains a source frontmatter value and is still reflected in the main landmark label.
- Live mode does not expose the markdown source runtime or source toggle.
- The App now tracks canonical-handoff readiness as explicit React state derived from the mounted editor session capabilities instead of reading the current capability ref directly during readiness resolution. The surface toggle still requires both TipTap ready state and canonical handoff availability.

## Content-Only Mode Reveals

- Successful Live/Edit and Visual/Markdown switches reveal only the destination page-content region inside `WorkspaceMainPane`; header chrome, navigation, ToC, and the workspace shell do not participate in the reveal.
- The reveal is a destination-only opacity animation with no retained obsolete editable surface and no crossfade between authoring surfaces.
- Reveal keys are scoped to the current page and rendered destination surface, so ordinary page navigation, pending body loads, blocked switches, and stale rapid switches do not replay old animations.
- Markdown Source reports lazy-session readiness to the main pane. Markdown reveal starts only after the source session has either initialized or reached a source-session error state, rather than animating an empty lazy mount.
- Reduced-motion users receive the destination content immediately; the reveal animation is disabled under `prefers-reduced-motion: reduce`.

## Markdown Source Runtime Boundary

- `WorkspaceMarkdownSourcePanel` now ships with the normal Docsera React bundle so its hooks execute in the main renderer runtime.
- The CodeMirror-backed `MarkdownSourceSession` stays lazy-loaded and only initializes after Markdown Source is actually needed.
- Visual Edit can keep the source panel mounted without loading the Markdown session runtime, and Live still does not load any Markdown Source runtime.
- The first markdown projection uses the current canonical visual envelope and the active page title as the source-session baseline.
- Source panel visibility follows the workspace authoring-surface selection, while the source-session identity stays tied to the current page sysId.
- The source session stays mounted across ordinary same-page toggles. Current callbacks and editable state are read from refs so the session can keep using the latest App handlers without being recreated.
- When a hidden source session becomes visible again, it resynchronizes from the canonical envelope unless the draft is currently invalid.
- The App interaction regression uses a PageEditorHost mock that models the mounted-session contract, including `initialEnvelope`, `sessionKey`, `onError`, `onReadyStateChange`, `onStatusChange`, canonical-envelope getters/appliers, and flush behavior.

## Canonical Sync And Persistence

- Valid markdown body edits still flow through the existing canonical body replacement path and reuse the visual editor save/status/recovery pipeline.
- The source body handoff now respects the canonical result contract: `applied`, `unchanged`, or `unavailable`.
- Valid markdown title edits reuse the existing page-title persistence path and persist through the normal title boundary rather than the page-settings close handler.
- Canonical body or title changes made elsewhere resynchronize the visible source projection without replacing the source-session history unless the session is explicitly discarded or recreated for a different page.
- Visible clean markdown source sessions immediately reprojection external canonical title/body changes, but dirty, invalid, or unavailable source sessions remain untouched until they become safe to replay.
- Valid projected source snapshots now compare their parsed canonical key against the last accepted projection key before reprojecting, so a source edit that has already been handed off is not treated as unsafe merely because its raw text is no longer clean.
- A standalone markdown marker such as `*` now normalizes to editable prose instead of a malformed empty list item, which keeps the source session valid and preserves the literal marker in the canonical paragraph content.
- Direct page-heading editing is visual-only; Markdown mode keeps the heading read-only.
- Retained but still-valid source snapshots stay in the unavailable state until the App/session boundary reports the editor handoff ready again. The retry signal is explicit App state, not a mutable ref inside the source panel, so the panel can retry the retained canonical snapshot even while user editing remains temporarily disabled.

## Invalid Source Guard

- Invalid markdown keeps the exact source text in the source editor.
- Invalid markdown and valid-but-unapplied source are distinct states. Invalid markdown uses the invalid recovery surface; unavailable-but-valid source uses the unavailable recovery surface while preserving the retained source.
- Invalid markdown blocks the normal workspace navigation, surface switching, and publish paths until the draft is corrected or explicitly discarded.
- Discarding an invalid markdown draft returns the workspace to the visual surface and advances the source-session discard nonce so the source editor can rebuild from the canonical envelope.
- When invalid markdown is discarded during same-workspace navigation, the workspace keeps the markdown source session selected for that workspace instead of resetting it immediately.
- If body handoff is temporarily unavailable, the source editor preserves the exact source and shows an unavailable state until the visual editor can accept the canonical envelope again.

## Validation Notes

The local regression coverage for this change focuses on:

- the header surface toggle contract
- the stable authoring-control footprint in Live and Edit
- workspace-shell rendering of the markdown source panel for the active page
- markdown source panel mount gating and deferred session loading
- source autosave and unavailable-state handling
- read-only page-heading behavior in Markdown mode
- hidden visual host interaction ownership while Markdown is active
- preserved TipTap identity while Visual/Markdown interaction ownership changes
- canonical source reprojection based on the accepted projection key rather than raw source cleanliness
- standalone marker normalization in markdown source parsing and session projection
- canonical handoff readiness and the edit/surface handshake contract in the App interaction regression
