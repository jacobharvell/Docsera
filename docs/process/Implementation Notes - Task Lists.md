# Implementation Notes - Task Lists

Task Lists use the existing TipTap `taskList` and `taskItem` nodes. The canonical document shape is a `taskList` containing `taskItem` children, each with a required boolean `checked` attribute and a leading paragraph. The attribute remains schema-required but is always interpreted as unchecked canonical structure; user progress is not canonical content.

The shared block-command registry exposes Task List to Slash and Quick Add. The editor’s block-action and compact text-toolbar conversion menus use that same canonical shape, with conversions creating unchecked task items and preserving the selected inline content.

Markdown Source serializes this shape as unchecked GFM task-list syntax, and parsing does not import GFM checked flags into canonical state. Visual Edit and the TipTap-free published reader both use a browser-local progress map keyed by page identity plus a hash of the checklist structure. Task-item ordinal state is deliberately discarded when the checklist structure changes, preventing progress from moving to changed checklists. Storage read/write failures leave the current interaction usable without persistence.

The editor replaces the installed TipTap TaskItem node-view checkbox mutation with a local callback. Consequently checkbox changes do not dispatch a ProseMirror transaction, enter undo history, change dirty/autosave state, or create a draft/publish operation. The reader makes no persistence request for the same interaction.
