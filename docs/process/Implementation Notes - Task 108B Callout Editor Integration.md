# Task 108B Callout Editor Integration

Task 108B exposes the Task 108A canonical Callout node in the visual editor authoring runtime.

## Authoring Surface

- Slash and Quick Add include `Callout`.
- New Callouts insert as `type: "info"` with `title: null` and one empty editable paragraph body.
- The editor Callout node view renders the semantic border/background, icon, optional title control, type selector, and editable body.
- Edit-mode Callout presentation follows the lightweight Live reader visual contract for the semantic content frame: 20px icon lane, 16px/18px container padding, 6px corner radius, semantic border/tint, body text color, title/body alignment, and 8px title-to-body spacing. The title input and compact 14px type selector remain editor-only controls and must not add title indentation or shift untitled body content away from the reader anchor.
- Type changes and title edits update the Callout node attrs through ProseMirror transactions, so they participate in normal undo/redo, dirty state, autosave, source synchronization, publish, and discard.
- The title control is an author-only single-line plain-text input; Enter does not insert title content, and Slash command activation remains owned by editor textblocks rather than the title input.

## Nesting and Command Restrictions

- Callouts remain valid at page-body level and inside Columns or Accordion bodies.
- Slash availability allows Callout insertion in those supported containers and suppresses Callout insertion inside existing Callouts and table cells.
- While the selection is inside a Callout body, Slash command inventory excludes Images, Tables, Accordions, Columns, and nested Callouts.
- Paste into a Callout body strips unsupported structural descendants before insertion so editor-created Callout content does not later fail canonical validation.

## Block Ownership

- A top-level Callout remains one top-level ProseMirror block and uses the existing gutter targeting, block selection, Duplicate/Delete, multi-block selection, and drag/drop runtime paths.
- Nested Callouts inherit the parent top-level block ownership and do not receive independent top-level gutter controls.
