# Editor History Controls

Task 96 adds page-local Undo and Redo controls outside `EditorContent`.

The controls do not introduce a shell bridge, shared history service, persisted history, or alternate command owner. `EditorHistoryControls` receives the active TipTap editor from the runtime and calls the editor's existing `undo` and `redo` commands. Availability is derived with `useEditorState`, so disabled state follows TipTap transactions and editor replacement instead of cached page or shell state.

The controls render in a presentation-only mount on the workspace main pane, immediately left of the Table of Contents toggle in Visual Edit. They do not alter the `EditorContent` subtree, the semantic content lane, the block gutter, document padding, article width, or anchor calculations. Workspace layout changes such as ToC expansion or collapse move the controls with the main/editor area.

Task 174 makes that presentation mount persistent for ordinary Visual Edit page switches. The page runtime still owns each TipTap instance and reports a narrow, session-keyed command target only after its destination editor is ready. The workspace rejects a target whose session key does not match the selected destination and presents disabled Undo, Redo, and emoji controls until a matching target arrives. Runtime teardown revokes its target. Consequently, an outgoing page's history, selection, emoji picker state, and command authority cannot cross into the destination; the emoji picker also closes synchronously when its editor identity changes. Live mode, Markdown Source, recovery/unavailable states, and lost Edit entitlement do not render the presentation mount.

Task 179 aligns that already-persistent mount with the workspace content-reveal lifecycle: it stays visually hidden during a requested workspace Live-to-Visual/Edit reveal while the body is loading, then receives the existing 260ms entrance only after readiness. This is presentation-only; it does not create another timer or transition lifecycle. The runtime fallback remains for standalone use, but cannot briefly own ordinary workspace initialization because `PageEditorHost` resolves the latest external mount before its asynchronous runtime import mounts.

Pointer down is prevented on the buttons to preserve the editor selection. Activation is owned by the click event so pointer clicks and keyboard-generated clicks run the command exactly once. Hover and focus only show the shared Docsera tooltip treatment and do not mutate the document.

Focused coverage lives in:

- `src/client/editor/EditorHistoryControls.test.tsx` for the standalone control contract with a real minimal TipTap editor/history.
- `src/client/editor/PageEditorHostRuntime.historyControls.test.tsx` for runtime command-target handoff, dirty/autosave integration, inactive/read-only gating, and teardown/session isolation.
- `src/client/features/workspaces/WorkspaceMainPane.test.tsx` for continuous, disabled command presentation across a destination page switch.
