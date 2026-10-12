# Task 108A Callout Canonical Foundation

Task 108A adds Callouts as a first-class Docsera structural document node without exposing authoring insertion or editing controls.

## Canonical Contract

- Canonical Callouts use node type `callout`.
- Required attrs are `type` and `title`.
- `type` is strictly one of `info`, `warning`, `success`, or `error`.
- `title` is a nullable single-line plain-text string; absent titles canonicalize to `null`.
- Callout body content must contain one or more supported blocks: paragraphs, headings, bullet lists, ordered lists, task lists, blockquotes, code blocks, and horizontal rules.
- Images, tables, Accordions, Columns, and nested Callouts are rejected under a Callout, including through nested lists or blockquotes.
- Callouts are valid at page-body level, inside Columns, and inside Accordion bodies.

## Runtime Surfaces

- The TipTap schema registers a structural `callout` node so existing canonical Callout documents can load and serialize through the editor runtime.
- Task 108A intentionally does not add slash commands, Quick Add entries, type-changing controls, title editing controls, gutter behavior, drag/drop integration, or Callout-specific node views.
- The lightweight published reader renders validated Callouts without importing TipTap or ProseMirror.

## Markdown Source

- Markdown Source preserves Callouts with a `docsera-callout` container directive.
- The directive requires `type` and may include `title`.
- Omitting `title` represents canonical `title: null`.
- Unknown types, unknown attributes, missing type, malformed titles, empty bodies, and disallowed nested structures fail conversion instead of being defaulted or repaired.
