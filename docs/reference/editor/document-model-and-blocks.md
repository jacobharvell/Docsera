# Editor document model and blocks

This reference defines the implemented, persisted Docsera editor document contract. It describes structured content, not editor interaction, Markdown/source conversion, media lifecycle, publishing, or workspace authority.

## Canonical representation

Docsera stores supported rich content as canonical JSON. The current envelope is:

```json
{
  "schemaVersion": 1,
  "document": {
    "type": "doc",
    "content": [{ "type": "paragraph" }]
  }
}
```

`document` is a validated TipTap/ProseMirror JSON document. `schemaVersion` is currently the literal value `1`; an envelope with another version is rejected. The server parses, validates, canonicalizes, and serializes this representation before it is persisted. The shared client API exposes the same contract, but the runtime TipTap schema is not a replacement for server validation of persisted content.

For compatibility, a supported legacy raw TipTap object whose root is `{ "type": "doc" }` is accepted and returned as a version-1 envelope, marked as a legacy migration. This is targeted compatibility, not unrestricted import or migration of arbitrary TipTap JSON.

Invalid JSON, an unsupported envelope, an unsupported schema version, or an invalid document are distinct parse failures. The throwing parse helper rejects those failures rather than repairing malformed content. Persisted JSON is serialized only after it passes the same boundary.

The normal empty envelope contains one empty paragraph. A valid document with no `content` property is normalized to that normal empty document. An explicit `content: []` is valid and remains an explicit zero-child document. Empty content arrays on non-root nodes are omitted during canonicalization where the node permits them.

Canonicalization also removes default presentation values and normalizes supported attributes: left paragraph or heading alignment is omitted, ordered-list defaults are made explicit, table-cell defaults are made explicit, identities are trimmed, and image defaults are completed. Canonical JSON is the durable rich-content representation. The separately stored plain-text body is derived from it for compatibility/search-oriented use; it is not a second editable document format.

## Blocks

The document root accepts these block families: `paragraph`, `heading`, `image`, `bulletList`, `orderedList`, `taskList`, `blockquote`, `horizontalRule`, `codeBlock`, `table`, `accordion`, `columns`, and `callout`.

| Family | Persisted nodes and canonical attributes |
| --- | --- |
| Text blocks | `paragraph` may have `textAlign` only when `center` or `right`; left is the omitted default. `heading` requires `level` 1, 2, or 3, and may use the same non-default alignment. |
| Lists | `bulletList` contains `listItem`; `orderedList` contains `listItem` and has `start` (default `1`) and `type` (`null`, `1`, `a`, `A`, `i`, or `I`); `taskList` contains `taskItem`, whose required `checked` attribute is boolean. |
| Basic structural blocks | `blockquote`, `horizontalRule`, and `codeBlock`; a code block has optional nullable `language` and text-only content. |
| Tables | `table` contains `tableRow`, which contains `tableCell` or `tableHeader`. Cells use `colspan` and `rowspan` (positive integers, default `1`), `colwidth` (`null` or a positive-integer array matching `colspan`), and optional `align` (`left`, `center`, or `right`). |
| Accordions | `accordion` has a nonempty, document-unique `accordionId`. It contains `accordionItem` nodes with document-unique nonempty `accordionItemId`; each item is exactly an `accordionTitle` followed by an `accordionContent`. |
| Columns | A structural `columns` node has no canonical attributes and contains two through four `column` nodes. A `column` has no canonical attributes and contains one or more allowed child blocks. |
| Callouts | `callout` has `type` of `info`, `warning`, `success`, or `error`, and `title`, a single-line string or `null`. An absent title canonicalizes to `null`. |
| Images | `image` is a block media-reference node. Its canonical attributes are `mediaId`, `darkMediaId`, `alt`, `caption`, `frame`, `align`, and `widthPct`. |

Image `mediaId` is a required nonempty reference; `darkMediaId` is a nullable optional reference. Canonical defaults are empty `alt` and `caption`, `frame: true`, `align: "left"`, and `widthPct: 100`; a finite supplied `widthPct` is clamped to the canonical 20–100 range. Image JSON does not store arbitrary `src` URLs, pixel dimensions, or light/dark URL/alt variants. Media ownership, upload, resolution, and rendering lifecycle are intentionally outside this reference.

## Inline content and marks

Text-bearing paragraphs and headings allow `text` and `hardBreak`; code blocks allow text only. A text node has nonempty `text` and may carry these marks:

- `bold`, `italic`, `underline`, `strike`, and inline `code`;
- `link`, with exactly `href`, `target`, `rel`, `class`, and `title` attributes (the last four nullable strings);
- `highlight` (the ordinary uncolored highlight);
- `textColor` and `highlightColor`, each with a palette `color` of `gray`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, or `pink`;
- `superscript` and `subscript`.

Links allow relative and anchor references and the protocols `http`, `https`, `ftp`, `ftps`, `mailto`, `tel`, `callto`, `sms`, `cid`, and `xmpp`. Unsafe or unrecognized schemes, including whitespace-obfuscated unsafe schemes, are rejected. Unsupported mark names and undeclared mark attributes are rejected.

Supported marks can generally combine on text. Two combinations are explicitly excluded: superscript with subscript, and ordinary `highlight` with palette `highlightColor`. Accordion-title text is more constrained: it permits text only (no hard break or embedded line ending), may use the non-link supported marks, and cannot carry a link.

Stored mark attributes are document data. Active formatting, selection-driven toolbar state, hover appearance, menus, and similar editor presentation state are not.

## Structural rules and nesting

The validator uses explicit child sets; a block accepted at the root is not automatically legal in every container.

- A `blockquote`, list item, task item, table cell, or table header may contain nested standard blocks: paragraphs, headings, images, lists, blockquotes, horizontal rules, code blocks, and tables. Lists and task lists must be nonempty; every item must be nonempty and start with a paragraph. Nested lists remain supported through those item rules.
- A table is nonempty, rows are nonempty, and cells are nonempty. Tables can therefore appear in supported nested standard-block contexts, including supported table-cell content.
- An accordion is nonempty and consists only of items. Each item has the exact title/content pair described above. Accordion content is nonempty and may contain standard nested blocks plus `columns` or `callout`; it cannot contain another accordion.
- A columns node has exactly two, three, or four columns. Each column is nonempty and may contain standard nested blocks plus an accordion or callout. Accordions are allowed inside columns, but a Columns node cannot occur below another column, including indirectly through an accordion. Accordions cannot nest inside other accordions.
- A callout is nonempty and may contain only paragraphs, headings, lists, blockquotes, horizontal rules, and code blocks. It cannot contain images, tables, columns, accordions, or another callout; callouts cannot nest.

These restrictions are enforced by the canonical validator even where a runtime node schema or DOM view has additional presentation behavior.

## Canonical content versus transient editor state

The JSON retains document identity, block structure, text, accepted marks, and accepted node attributes. It does not retain interaction or rendering state. In particular:

- Accordion and accordion-item identities are canonical; which accordion item is currently disclosed/open is transient.
- Table structure, spans, widths, and cell alignment are canonical; active-cell and multi-cell selection are transient decorations.
- Image media references and their documented display attributes are canonical; resolved object URLs and runtime media-loading state are not.
- Selection, focus, hover controls, placeholders, toolbar visibility, node-view DOM attributes, and overlay/menu state are not part of the persisted model.

## Validation, persistence, and reading

The parse boundary accepts an object or a JSON string, classifies failures, validates the controlled node/mark vocabulary and structure, canonicalizes accepted data, and returns an envelope. Serialization reparses its supplied envelope before producing JSON. This makes canonical server content the input to persistence rather than trusting arbitrary client/editor JSON.

On structured saves, the server derives plain text by traversing supported content in document order. Paragraphs, headings, code blocks, and accordion titles contribute their inline text; hard breaks contribute a newline; horizontal rules contribute a blank line; structural containers traverse their children. Images and presentation-only properties do not create arbitrary text. The result is trimmed.

The server persists accepted canonical content for the draft or published projection and derives the corresponding body-text field. The Edit surface receives the accepted document through the workspace/page projection and loads it into the editor; the Live surface reads the accepted published projection. Workspace publishing, revisions, server-issued generations, and edit leases are separate authority concerns; see [page state and hierarchy](../page-state-and-hierarchy.md) and [publishing and change sets](../publishing-and-change-sets.md).

## Implementation references

The primary implementation is `app/docsera-ui/src/server/pages/serverEditorDocument.ts`; `app/docsera-ui/src/shared/editor/document.ts` exposes the shared API, and `app/docsera-ui/src/shared/editor/schema.ts` defines the active TipTap/ProseMirror extensions. Image and color validation live in `app/docsera-ui/src/server/pages/serverImageContract.ts` and `app/docsera-ui/src/server/editor/colorContract.ts`.

Focused coverage includes `app/docsera-ui/src/shared/editor/document.test.ts`, `schema.test.ts`, `columns.test.ts`, `app/docsera-ui/test/editorDocumentContractParity.test.ts`, and the editor runtime compatibility and block integration tests under `app/docsera-ui/src/client/editor/`.
