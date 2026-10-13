# Task 108B Callout Editor Integration

Task 108B exposes the Task 108A canonical Callout node in the visual editor authoring runtime.

## Authoring Surface

- Slash and Quick Add include `Callout`.
- New Callouts insert as `type: "info"` with `title: null` and one empty editable paragraph body.
- The editor Callout node view renders a block wrapper, a compact above-frame type selector row, and a semantic Callout frame containing the border/background, icon, optional title control, and editable body.
- Edit-mode Callout presentation follows the lightweight Live reader visual contract for the semantic content frame: 20px icon lane, 16px/18px border-box container padding, 6px corner radius, semantic border/tint, body text color, title/body alignment, and 8px title-to-body spacing. The compact 14px type selector remains editor-only chrome above the frame and must not add title indentation or shift untitled body content away from the reader anchor.
- Type changes and title edits update the Callout node attrs through ProseMirror transactions, so they participate in normal undo/redo, dirty state, autosave, source synchronization, publish, and discard.
- The title control is an author-only borderless transparent textarea that can wrap long titles without internal scrolling. Enter does not insert title content, and Slash command activation remains owned by editor textblocks rather than the title control.
- The textarea value is the only editable title DOM state. Input and paste sanitize newline content to single-line plain text and commit genuine changes back to the canonical Callout `title` attr; an empty value commits `title: null`. The node view synchronizes the textarea from canonical attrs only when the attr value changes, so unrelated Callout transactions do not overwrite active native editing inside the editor ShadowRoot.
- Enter from the title commits the current value and places the ProseMirror selection inside the existing first editable Callout body block without creating a new paragraph or changing Callout structure.
- The optional title participates in normal vertical keyboard navigation. Arrow Up from the first visual line of the Callout body focuses the title textarea. Arrow Down from the title focuses the existing first editable body block when the native textarea caret is already at the title end, preserving native movement through visually wrapped title lines. Arrow Down from an immediately preceding editor textblock focuses the title before the body.
- Arrow Up/Down inside the Callout body remains ProseMirror-owned for ordinary movement across existing body lines and blocks, including movement out to neighboring document content. The editor no longer attempts to trap body-boundary Arrow Up/Down or prevent Gapcursor-style navigation outside the Callout.
- Undo and redo keyboard shortcuts are handled while the textarea is focused so canonical title attr edits continue to participate in the editor history.
- Empty Callout titles remain optional, but the title control stays visible in Edit/Visual with a subdued `Optional title` placeholder so authors can discover the field without hovering.

## Nesting and Command Restrictions

- Callouts remain valid at page-body level and inside Columns or Accordion bodies.
- Slash availability allows Callout insertion in those supported containers and suppresses Callout insertion inside existing Callouts and table cells.
- While the selection is inside a Callout body, Slash command inventory excludes Images, Tables, Accordions, Columns, and nested Callouts.
- Paste into a Callout body strips unsupported structural descendants before insertion so editor-created Callout content does not later fail canonical validation.

## Block Ownership

- A top-level Callout remains one top-level ProseMirror block and uses the existing gutter targeting, block selection, Duplicate/Delete, multi-block selection, and drag/drop runtime paths.
- Nested Callouts inherit the parent top-level block ownership and do not receive independent top-level gutter controls.
