# Editor Markdown and source

This reference describes the implemented Markdown conversion and Markdown Source authoring boundary. It is a developer contract, not a general-purpose Markdown import guide. The canonical content contract, node vocabulary, and structural rules remain authoritative in [editor document model and blocks](document-model-and-blocks.md).

## Canonical contract

Docsera persists version-1 canonical document JSON, not Markdown. Markdown Source is an editable projection of a page title and a canonical envelope:

1. `serializeDocseraMarkdownDocument` validates and canonicalizes the supplied title and envelope, then produces frontmatter plus a Markdown body.
2. `parseDocseraMarkdownDocument` requires that frontmatter, parses the body, validates the resulting canonical document at the existing document boundary, and returns the normalized title, envelope, and normalized Markdown.

The title is serialized as JSON-style double-quoted YAML:

```md
---
title: "Getting started"
---
```

Frontmatter must be the first content, use `---` opening and closing delimiter lines, and contain exactly one `title` field. The title must be a double-quoted YAML scalar. It is passed through the ordinary page-title validation and normalization (including trimming); an empty or otherwise invalid title is rejected. No additional YAML fields are accepted.

The body uses the implemented Markdown/GFM parser with Docsera directives. Line endings are normalized for conversion. A successful parse produces canonical content; it does not retain the user's raw whitespace, delimiter spelling, fence length, or equivalent Markdown syntax. Re-serialization therefore yields the converter's normalized Markdown.

A supported canonical document can be serialized and parsed back with its supported meaning and attributes intact. This is a semantic round trip, not a byte-for-byte source round trip. Conversely, arbitrary Markdown is accepted only where it maps to a valid, supported canonical document. Markdown is never a second independently persisted page-content format; valid source is handed off as canonical JSON to the ordinary editor/save boundary.

## Ordinary Markdown and constrained inline HTML

The parser supports the following ordinary Markdown/GFM forms where they satisfy the canonical model:

- paragraphs and headings;
- bold, emphasis, strikethrough, inline code, hard breaks, and ordinary links;
- bullet lists, ordered lists, nested lists, and GFM task lists;
- blockquotes, horizontal rules, and fenced code blocks (including a language when supplied);
- GFM tables; and
- escaped literal prose, including directive-looking text.

Ordinary links are used when their metadata is the Docsera default (`target="_blank"`, `rel="noopener noreferrer nofollow"`, and no class). Relative and anchor links are supported, subject to the same safe-link policy as canonical documents. Unsafe or unrecognized schemes are rejected.

Some canonical inline marks need a constrained HTML representation because ordinary Markdown cannot preserve them. The accepted inline tags are only `u`, `mark`, `sup`, `sub`, `a`, and `span`, with exact supported attributes and correctly nested closing tags:

- `<u>`, `<mark>`, `<sup>`, and `<sub>` represent underline, ordinary highlight, superscript, and subscript respectively, without attributes.
- `<span data-docsera-text-color="palette-key">` represents text color.
- `<mark data-docsera-highlight-color="palette-key">` represents palette highlight color.
- `<a>` represents non-default link metadata. Its `href` is encoded by the serializer and it carries the canonical `target`, `rel`, `class`, and `title` values, including explicit `null` where applicable.

Palette keys are `gray`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, and `pink`. The parser rejects style attributes, extra attributes, unsupported color values, malformed nesting, block HTML, and all other HTML. It does not offer unrestricted HTML import.

## Docsera directives

Directives encode canonical information that ordinary Markdown would lose. Their names, exact attributes, and legal nesting are validated; after conversion, the canonical document validator applies the complete structural rules described in [editor document model and blocks](document-model-and-blocks.md).

| Directive | Purpose and key validation |
| --- | --- |
| `docsera-empty-document` | Leaf directive with no attributes. It must be the sole body node and preserves an explicit zero-child document. |
| `docsera-empty-paragraph` | Leaf directive with no attributes. It preserves empty paragraphs between or alongside other blocks. The normal empty page is instead frontmatter with an empty body and parses to one empty paragraph. |
| `docsera-text-align` | Container with exactly `align`; accepts `left`, `center`, or `right` and wraps exactly one paragraph or heading. `left` normalizes to ordinary Markdown because it is canonical default alignment. |
| `docsera-ordered-list` | Container with exactly positive integer `start` and `type` (`1`, `a`, `A`, `i`, or `I`). It wraps exactly one ordered list whose Markdown start matches `start`; it preserves list types ordinary Markdown does not. |
| `docsera-image` | Leaf representation of a workspace-media reference. Required attributes are `media-id`, `alt`, `caption`, `frame`, `align`, and `width-pct`; optional `dark-media-id` is permitted. Values are validated using the canonical image contract, including boolean `frame`, valid alignment, and integer width. It is not a URL image syntax. |
| `docsera-accordion` and `docsera-accordion-item` | Containers carrying exactly `accordion-id` and `item-id` respectively. An item has one required directive label for its title and a non-empty body for its content. IDs are preserved; document-wide identity and structural constraints are validated canonically. |
| `docsera-callout` | Container with required `type` (`info`, `warning`, `success`, or `error`) and optional single-line `title`. Its body must ultimately satisfy callout nesting rules. |
| `docsera-columns` and `docsera-column` | Attribute-free containers. They encode column structure; the canonical validator requires two through four non-empty columns and enforces the allowed nesting rules. |
| `docsera-table`, `docsera-table-row`, `docsera-table-header`, and `docsera-table-cell` | Containers for rich canonical tables. Table and row have no attributes. Header/cell require `colspan`, `rowspan`, `colwidth`, and `align`; spans are positive integers, `colwidth` is `null` or a positive-integer array matching `colspan`, and alignment is `left`, `center`, `right`, or `null`. |

The serializer uses ordinary GFM table syntax only for a rectangular table with a header row, simple one-paragraph cells, no spans or column widths, consistent column alignment, and only bold/italic/strikethrough text marks. GFM tables otherwise cannot preserve canonical structure or attributes, so the serializer emits rich-table directives. In particular, spans, nested blocks, cell/paragraph alignment that cannot be represented safely, or other non-default cell attributes require the rich form.

Directive fences are lengthened when nested content contains directive-looking colon fences. Text that merely resembles a directive is escaped during serialization and remains text when parsed. Unknown non-Docsera directive-looking container text is treated as literal prose where it can be safely recognized as such; unknown `docsera-*` directives are rejected.

## Fidelity and limits

The converter preserves supported canonical block structure, inline marks, permitted mark order, and the attributes encoded by ordinary Markdown, constrained HTML, or directives. Important examples include:

- non-default link metadata, palette colors, and text/highlight distinction;
- image media IDs, dark-media ID, alt/caption, frame, alignment, and width;
- accordion/item identities and content, columns, and callouts;
- GFM-compatible tables and rich tables with spans, nested blocks, headers, cell attributes, and alignment;
- explicit empty documents and empty paragraphs;
- code-block language (`null` remains unlabeled) and code text/whitespace; and
- directive-like literal text and code content.

The canonical validator remains the final authority. It rejects otherwise parsed content that violates supported block, mark, attribute, uniqueness, or nesting constraints. For example, converter parsing does not turn arbitrary HTML, unsafe links, a mixed task/plain list, malformed table/directive attributes, or unsupported Markdown nodes into a best-effort document. There is no fallback conversion that silently preserves unsupported syntax as canonical content.

## Markdown Source session

`MarkdownSourceSession` creates a CodeMirror session from the current canonical title and envelope. The source is editable when the workspace allows it, uses Markdown syntax highlighting plus Docsera directive/frontmatter decoration, and exposes a snapshot after edits.

Valid snapshots contain the editable `text`, normalized Markdown, parsed normalized `title`, and canonical `envelope`, together with clean/dirty status. Invalid snapshots retain the exact editable source `text`, a structured converter failure, and its diagnostics; they contain no candidate canonical envelope. Clean means the raw source text equals the session's current clean serialized text, not merely that it parses to equivalent canonical content.

CodeMirror keeps source-local undo/redo for user typing. A programmatic `replaceFromCanonical` serializes the next title/envelope, makes that result clean, and replaces the editor state, resetting source history. This keeps canonical synchronization out of source undo history; visual-editor history is separate. Session destruction clears listeners and state, and a replacement page/session starts from its own canonical input so stale source text, history, and callbacks are not reused.

## Canonical handoff and workspace behavior

Visual and Markdown are alternate authoring surfaces for the same current page in Edit mode. The visual editor remains mounted while Markdown is active, but is inactive/hidden; it provides the canonical handoff boundary.

For a valid dirty source snapshot, the panel sends the parsed envelope to that boundary and sends a changed parsed title through the existing page-settings title path. Once the handoff accepts the envelope, the visual session owns the normal draft save/flush behavior. Source mode does not write raw Markdown to page persistence.

The panel tracks both the last projected source canonical key and the canonical props from the visual/editor boundary. It avoids replacing a source snapshot while its own accepted projection is converging. Later authoritative canonical updates replace a valid, synchronized source session and reset its source history. Invalid source is specifically not overwritten by such updates, so it remains available to correct or explicitly discard.

If the visual handoff is not available, the valid dirty source is retained and the source surface reports that it is waiting for the visual editor. The application makes the source non-editable, prevents a silent route/mode transition, and re-attempts the retained snapshot only after the editor readiness and authoring-write guards allow it. This is a bounded readiness retry, not an unconditional replay of arbitrary mutations.

Invalid source blocks ordinary switching/navigation/save or publish progression until it is corrected or deliberately discarded. Switching from invalid Markdown to Visual asks for confirmation; discard resets the source session from the last canonical title and document and returns to Visual. A pending valid source title save is flushed before leaving the page. Source-local undo/redo remains separate from visual-editor history throughout.

## Diagnostics and recovery

Conversion failures are structured with one of these reasons:

- `invalid-frontmatter` for missing, malformed, ambiguous, or extra-field frontmatter;
- `invalid-title` for quotation or page-title validation failures;
- `invalid-markdown` for source that cannot map to the supported Markdown structure, including unsafe links;
- `unsupported-html` for disallowed HTML or malformed allowed-tag nesting;
- `unknown-directive` for an unrecognized `docsera-*` directive;
- `invalid-directive` for directive shape, attributes, body, or local constraints; and
- `invalid-canonical-document` when conversion produces content rejected by the canonical document boundary.

Failures can include source offsets. Diagnostic collection can report multiple independent, deduplicated failures, including nested failures, and preserves original offsets for CRLF source. CodeMirror marks ranged failures and presents the most specific diagnostic under the pointer. A missing frontmatter boundary is not assigned an invented location.

Invalid source is a transient source-session state only. It remains visible for correction and can be discarded, but is never accepted as canonical page content or implicitly persisted as a separate raw format.

## Implementation and test evidence

Primary implementation files:

- `app/docsera-ui/src/shared/editor/markdown.ts`
- `app/docsera-ui/src/client/editor/MarkdownSourceSession.ts`
- `app/docsera-ui/src/client/features/workspaces/WorkspaceMarkdownSourcePanel.tsx`
- `app/docsera-ui/src/client/features/workspaces/WorkspaceMainPane.tsx`
- `app/docsera-ui/src/client/app/App.tsx`

Focused coverage is in `app/docsera-ui/src/shared/editor/markdown.test.ts`, `app/docsera-ui/src/client/editor/MarkdownSourceSession.test.ts`, `app/docsera-ui/src/client/features/workspaces/WorkspaceMarkdownSourcePanel.test.tsx`, and the Markdown-source integration cases in `app/docsera-ui/src/client/app/App.editorInteractions.test.tsx`.
