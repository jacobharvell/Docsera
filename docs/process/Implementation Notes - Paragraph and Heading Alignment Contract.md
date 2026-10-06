# Implementation Notes - Paragraph and Heading Alignment Contract

## Contract

Paragraph and heading alignment is canonical only as the `textAlign` node attribute on `paragraph` and `heading`.

Supported values are `left`, `center`, and `right`. `justify` is not supported.

`left` is the default/unset state. Canonicalization accepts explicit `textAlign: "left"` for compatibility, then removes it so ordinary left-aligned documents do not acquire persistent formatting state.

## Separation From Tables

Paragraph/heading alignment uses `textAlign`.

Table cell and table header column alignment continue to use their existing `align` attribute. The two contracts are intentionally separate in validation, canonicalization, reader rendering, Markdown Source conversion, and tests.

## Editor And Reader

The editor uses the official TipTap TextAlign extension configured only for `paragraph` and `heading`, with allowed values limited to `left`, `center`, and `right`.

The lightweight reader renders non-default paragraph and heading alignment directly from canonical `textAlign` without loading TipTap. Heading text extraction, generated anchors, outline extraction, and Table of Contents semantics ignore alignment attributes.

## Markdown Source

Non-default paragraph and heading alignment round-trips through a strict Docsera container directive:

```markdown
:::docsera-text-align{align="center"}
Aligned paragraph
:::
```

The directive must wrap exactly one paragraph or heading. Unsupported `align` values, unexpected attributes, unsupported wrapped block types, empty bodies, and multi-block bodies fail conversion. Ordinary/default-left paragraphs and headings serialize as ordinary Markdown without a wrapper.

## Paste Boundary

Paste sanitization preserves `text-align: left`, `center`, or `right` only on pasted paragraph and heading elements. Other style declarations are stripped, `justify` is not preserved, and alignment on unsupported pasted elements is removed before the content reaches the canonical document boundary.
