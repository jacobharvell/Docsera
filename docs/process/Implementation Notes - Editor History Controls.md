# Editor History Controls

Task 96 adds page-local Undo and Redo controls inside `PageEditorHostRuntime`, mounted as editor-owned chrome outside `EditorContent`.

The controls do not introduce a shell bridge, shared history service, persisted history, or alternate command owner. `EditorHistoryControls` receives the active TipTap editor from the runtime and calls the editor's existing `undo` and `redo` commands. Availability is derived with `useEditorState`, so disabled state follows TipTap transactions and editor replacement instead of cached page or shell state.

The controls portal into a presentation-only mount on the workspace main pane, immediately left of the Table of Contents toggle in Visual Edit. They do not alter the `EditorContent` subtree, the semantic content lane, the block gutter, document padding, article width, or anchor calculations. The mount is workspace layout chrome only; command ownership, availability, and editor binding remain inside `PageEditorHostRuntime`, and workspace layout changes such as ToC expansion or collapse move the controls with the main/editor area.

Pointer down is prevented on the buttons to preserve the editor selection. Activation is owned by the click event so pointer clicks and keyboard-generated clicks run the command exactly once. Hover and focus only show the shared Docsera tooltip treatment and do not mutate the document.

Focused coverage lives in:

- `src/client/editor/EditorHistoryControls.test.tsx` for the standalone control contract with a real minimal TipTap editor/history.
- `src/client/editor/PageEditorHostRuntime.historyControls.test.tsx` for runtime mounting, dirty/autosave integration, inactive/read-only gating, and teardown/session isolation.
