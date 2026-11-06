# Editor interactions

This reference describes the implemented interaction contract for Docsera's Visual Edit surface. It covers transient editor controls and the document transactions they can produce. It does not redefine the persisted document schema, Markdown Source conversion, media lifecycle, workspace publishing, or permission and lease behavior.

The canonical document model is documented in [editor document model and blocks](editor/document-model-and-blocks.md). [Editor Markdown and source](editor/markdown-and-source.md) documents the separate CodeMirror surface, and [editor media](editor/media.md) documents workspace-media ownership and lifecycle.

## Interaction architecture

The active TipTap/ProseMirror editor owns Visual Edit document transactions: text changes, block insertion or conversion, formatting, structural edits, and history. React owns the host lifecycle and renders the runtime's transient controls, menus, overlays, and status bindings around that editor. The editor is not a durable client-side authority: actual content changes are handed to the workspace's ordinary draft-save boundary.

`PageEditorHost` lazily loads the runtime into an open ShadowRoot. It creates separate runtime and overlay roots, mounts `PageEditorHostRuntime` after the module is available, and destroys both when the editor session changes or the host unmounts. A same-session prop update is delivered to the mounted runtime rather than replacing its editor; changing the session key replaces the runtime and command target.

An editor session is identified by its page identity and generation, with a saved revision associated with the active token. Replacing or invalidating the session suppresses stale work rather than applying it to a new page. The editor is usable only while the workspace grants editability and the editor interaction surface is active. Loss of either condition tears down or dismisses transient controls and active pointer sessions. The visual editor is distinct from Markdown Source: Source has its own CodeMirror session and history, and canonical handoff between surfaces uses the existing workspace authority.

Editor geometry and event ownership are deliberately local to their real surfaces. The editable document lives in the editor ShadowRoot; the runtime's overlay root is a sibling there, while app-shell controls may live outside it. Overlays derive their owner document/window from the owning surface, use measured editor/block geometry, and use composed event paths where Shadow DOM retargeting matters. A portaled or floating surface is still an editor-owned surface only when its ownership and token/theme boundary are explicitly maintained; it is not part of the ProseMirror document merely because it is visually adjacent.

## Command surfaces: Slash and Quick Add

The shared block-command inventory has two entry points:

- Typing `/` in an eligible editable textblock opens Slash. The query is derived from the text after the slash and filters the shared inventory.
- The hover gutter's Quick Add control inserts a temporary local paragraph after its owning top-level block, then opens the same selector anchored to that inserted block.

The current inventory includes Text; Heading 1, 2, and 3; Blockquote; Bulleted, Numbered, and Task lists; Accordion; Callout; 2-, 3-, and 4-column layouts; Code Block; Horizontal Rule; Image; and Table. Commands filter by label, description, and keywords. Availability is contextual: for example, tables are excluded in table cells, callouts exclude unsupported descendants, and columns/accordions are limited by their permitted containers. Nested containers therefore do not imply that every root-level command is available.

The selector supports keyboard movement, Enter execution, pointer activation, and dismissal with Escape or outside ownership changes. Its query, highlighted item, hover state, anchor placement, and inline query presentation are transient. Pointer selection is protected from an outside-dismissal handler through the real owner document and composed path; execution occurs on its command action, not merely on hover or menu press.

Successful Slash commands convert or insert at the live selection. Successful Quick Add commands replace or convert the temporary paragraph in place, restore a live editable selection, and return focus to the editor. Some commands create a continuation paragraph where that is required (for example, after a horizontal rule); Image opens the media picker before a canonical image block is inserted. Accordion insertion creates fresh identities. Cancelling Quick Add preserves its inserted paragraph as ordinary content; canceling or navigating a selector without executing a command does not by itself create a document transaction. Empty-block placeholder and selector-query presentation are likewise noncanonical.

## Gutter, handles, and block actions

Hover ownership is block-relative. The gutter is editor chrome beside the readable document lane, not ProseMirror padding or a broad page hit area. A hovered top-level block exposes Quick Add and a handle; its bounded row does not absorb title whitespace or blank panel background. The full workspace main-pane background is separately used for range selection.

Pressing a handle selects its top-level block and provides the block action menu. Its contextual actions are Move up, Move down, Duplicate, Delete, and Turn into. Actions are keyboard reachable as well as pointer operable. Move actions are unavailable at the first/last legal boundary; conversion choices depend on the selected block's current type and supported conversion. Successful structural operations update the document in one operation, close the relevant menu, and place focus/selection in the resulting content as appropriate. A duplicate of an accordion gets fresh accordion/item identities.

Menus, handle hover, menu highlighting, and disabled boundary presentation are transient. Their actions are not. The block model's structural actions address top-level blocks; a nested textblock may receive an eligible Slash command, but it does not acquire an independent top-level gutter or become a destination for top-level block actions.

## Block selection and reordering

The runtime supports a selected top-level block or contiguous selected top-level range. The gutter and the main-pane/panel background provide separate range-selection gestures. Pointer intent thresholds distinguish a click from a drag or range gesture; selection highlights and marquee/preview state remain transient until an action changes the document.

Delete or Backspace on an active structural selection removes the selected top-level blocks. A selected range can be dragged from its handle as a single top-level structural move. The runtime calculates the insertion index from current top-level block rectangles, shows a drop indicator and drag preview, and accepts only destinations within the editor's top-level drop zone that are outside the moved range's invalid no-op positions. It does not drop into nested content or arbitrary shell space. Near viewport edges, the active drag auto-scrolls and remeasures the candidate destination.

The pointer session follows the document/window that owns the gesture and has deterministic cleanup on pointer cancel/loss, blur, page visibility loss, page/session replacement, editability loss, and teardown. A press becomes a drag only after the established intent threshold; otherwise it resolves as the handle selection/action path. Invalid destinations, cancellation, and cleanup leave canonical content unchanged. Selection-only gestures, previews, and canceled drags do not dirty the page, autosave, or enter history. A successful move is a single undoable structural transaction.

## Text selection and formatting

The compact formatting toolbar is eligible for a nonempty editable ProseMirror text selection. It is measured and positioned from the current selection while preserving that selection through owned toolbar interactions. It dismisses when its selection/context is no longer eligible, on the relevant Escape/outside interaction path, or when another editor interaction gains ownership.

The primary toolbar converts among Text, Heading 1–3, Blockquote, unordered list, ordered list, and task list. It supplies bold, italic, underline, strike-through, inline code, and link controls. Link creation accepts an existing selection; the link surface can create, edit, or remove a link while returning to the editor selection. Established shortcuts are Ctrl/Command+B, I, U, Shift+S, E, and K for bold, italic, underline, strike-through, code, and link respectively.

Text and highlight color menus apply the supported palette. The secondary toolbar supplies superscript, subscript, and left/center/right alignment; superscript and subscript remain mutually exclusive, and alignment is offered only where the selected blocks support it. The primary and secondary toolbar, their menus, placement, and active-control appearance are visual state. The successful command writes persisted marks or supported block attributes; it does not persist the toolbar itself, its open menu, or an active selection.

## Tables and other structured blocks

Within a table, normal pointer text selection inside one cell remains ordinary editor selection. A drag across cells can become a ProseMirror structural `CellSelection`; the runtime presents row/column pills only for the relevant structural edges and can return a structural selection to a stable in-cell caret. Table menus are editor-owned overlays: their internal press/click sequence is protected from outside dismissal, and switching/closing a menu preserves the appropriate selection ownership.

Row controls support insertion before/after, move up/down, copy, and delete. Column controls support insertion before/after, move left/right, copy, delete, and left/center/right cell alignment. Boundary commands are disabled where a move is not legal. The overlay measures the table, rows, columns, wrapper scrolling, and live selection so the controls remain aligned through content and layout changes. Table sizing remains a structural editor capability; the table's canonical dimensions, spans, and cell attributes are described in [editor document model and blocks](editor/document-model-and-blocks.md).

Structured row/column copying carries a short-lived Docsera provenance token alongside plain text. Restoration is guarded: it only runs for a fresh matching Docsera payload, a compatible whole-row or whole-column destination, and a matching kind. Other clipboard data follows normal paste rather than being treated as a structured table payload.

Other implemented structured-block interaction boundaries are:

- Accordion disclosure is action-driven, transient, and may have zero or one open item; it neither mutates JSON nor creates autosave/history. Item controls allow creation only at the final item and deletion except when it would remove the protected last item. Explicit inserted accordions start their initial item open. Pasted accordion copies receive new identities, while an in-editor move preserves identities.
- Callout title and type controls make undoable document changes. An untitled title remains keyboard reachable. Keyboard navigation only crosses between the title, body, and neighboring content at the appropriate visual/caret boundaries; title paste is flattened/sanitized to its single-line contract.
- Columns retain their top-level structural ownership; nested columns do not receive their own gutter. Slash and Quick Add availability follows the allowed container rules rather than implying arbitrary nesting.
- Selecting an image exposes editor-owned options such as frame, alignment, sizing, preview theme, and fullscreen/option surfaces. Image selection and preview/menu state are transient; successful option changes alter supported image attributes. Media access, upload, and retrieval remain in [editor media](editor/media.md).

## History and transaction boundaries

TipTap history is the Visual Edit undo/redo authority. External history buttons bind to the currently published active editor instance, observe its availability, and are disabled when the editor is unavailable, destroyed, noneditable, or the relevant command cannot run. A replacement editor receives a new binding.

Document mutations—typing, formatting, supported block operations, row/column commands, and successful structural moves—are undoable according to their editor transaction boundary. The runtime deliberately groups the relevant block operation into one undo step where it creates/replaces temporary command content. A new edit invalidates redo as usual. Undo/redo themselves propagate through the ordinary document-change path, so a resulting content change is eligible for autosave.

Hover, range highlight, selectors, menu focus, temporary query display, drag previews, active table controls, accordion disclosure, image preview state, and canceled gestures do not enter Visual Edit history. Editor-local history is also separate from published snapshot history, workspace Discard, publishing recovery, and CodeMirror's separate Source history documented in [editor Markdown and source](editor/markdown-and-source.md).

## Clipboard and paste

Plain-text paste normalizes line endings. Rich HTML paste is sanitized before the editor parses it: unsafe embedded/content tags, event attributes, `srcdoc`, unsafe link destinations, arbitrary styling, and unsupported color semantics are removed. Supported paragraph/heading text alignment and supported Docsera semantic color attributes can survive; this is controlled rich paste, not unrestricted HTML import.

Pasting accordion content regenerates accordion and item identities so a copied structure remains document-unique. That differs from moving an existing accordion within the editor, which preserves its identities. Pasted content is still subject to the document's structural boundaries: unsupported callout descendants are dropped at the callout boundary, and callout titles are constrained to their supported plain, single-line form. Structured table row/column restoration has the separate provenance guard described above; arbitrary external clipboard data is not assumed compatible.

## Lifecycle, dirty state, and recovery

The host reports readiness only after the lazy runtime/editor mounts. Same-session changes retain editor identity and update its inputs; session replacement invalidates stale callbacks and destroys the former runtime. Editability or interaction deactivation clears interaction sessions and prevents mutable commands without turning transient teardown into content changes.

Selection-only editor transactions and transient UI changes remain clean. Actual editor document changes update the canonical envelope/outline and enter the host's dirty/autosave path. The host keeps a recovery snapshot for unsaved work and exposes bounded draft reconciliation/flush controls; save failures preserve local recoverable input and report the existing unsaved state rather than replaying non-idempotent workspace commands. Server-issued workspace generations, leases, mutation recovery, and publishing remain documented in [publishing and change sets](publishing-and-change-sets.md).

## Implementation and test evidence

The principal runtime modules are:

| Interaction family | Primary implementation | Focused coverage |
| --- | --- | --- |
| Host/session/ownership | `PageEditorHost.tsx`, `PageEditorHostRuntime.tsx`, `session/editorSessionGeneration.ts` | `PageEditorHost.test.tsx`, `PageEditorHostRuntime.initialization.test.tsx`, `PageEditorHostRuntime.interactionOwnership.test.tsx` |
| Slash, Quick Add, gutter, and actions | `editorBlockCommands.ts`, `PageEditorHostRuntime.tsx` | `PageEditorHostRuntime.commands.test.tsx`, `PageEditorHostRuntime.selection.test.tsx` |
| Top-level selection and drag | `blockDragReorder.ts`, `useTopLevelBlockDragSession.ts` | `PageEditorHostRuntime.drag.test.tsx`, `PageEditorHostRuntime.selection.test.tsx` |
| Text toolbar and history | `CompactTextToolbar.tsx`, `EditorHistoryControls.tsx` | `CompactTextToolbar.alignment.test.tsx`, `EditorHistoryControls.test.tsx`, `PageEditorHostRuntime.historyControls.test.tsx` |
| Tables | `TableControlsOverlay.tsx`, `tableStructuredClipboard.ts` | `PageEditorHostRuntime.tableSelection.test.tsx`, `tableStructuredClipboard.test.ts` |
| Paste and structured blocks | `pasteSanitizer.ts`, `PageEditorHostRuntime.tsx` | `pasteSanitizer.test.ts`, `PageEditorHostRuntime.accordion.test.tsx`, `PageEditorHostRuntime.callout.test.tsx`, `PageEditorHostRuntime.columns.test.tsx` |
| Images | `PageEditorHostRuntime.tsx` | `PageEditorHostRuntime.imageControls.test.tsx`, `PageEditorHostRuntime.imageMedia.test.tsx` |

This reference is the current repository contract for Shadow DOM, pointer ownership, geometry, overlays, and validation rules.
