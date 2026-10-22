# Implementation Notes - E8-T2 Markdown Conversion Contract Foundation

This note records the repository-side Markdown conversion boundary added for E8-T2.

## Boundary Summary

- The shared conversion contract lives in `app/docsera-ui/src/shared/editor/markdown.ts`.
- The contract accepts two pure inputs for serialization: the draft page title and a canonical Docsera document envelope.
- The contract accepts one pure input for parsing: a complete Markdown document with YAML frontmatter.
- The converter does not depend on a mounted TipTap editor, ProseMirror state, or runtime editor extensions.
- Successful Markdown parses are passed through the existing canonical Docsera document boundary in `app/docsera-ui/src/server/pages/serverEditorDocument.ts` before they are returned.

## Parsing and Serialization Stack

- CommonMark/GFM parsing uses `mdast-util-from-markdown` with `micromark-extension-gfm` and `mdast-util-gfm`.
- Docsera structural directives use `micromark-extension-directive` and `mdast-util-directive`.
- YAML frontmatter validation uses `yaml`. Exactly one `title` field is supported, and its value must be a double-quoted YAML string that also passes authoritative page-title validation. Strict validation retains its individual failure details; Source diagnostics aggregate invalid frontmatter over its identifiable block.
- Directive leaf serialization for escaping-sensitive image attributes uses `mdast-util-directive`'s Markdown serializer rather than a repo-local string escaper.
- Directive attribute serialization now uses the `mdast-util-directive` serializer for string values across the shared converter so Accordion and ordered-list/container directive ids keep quote, ampersand, and escaped control-character content parseable without broadening the canonical document boundary.
- Deterministic Docsera block serialization remains repo-owned so the contract can choose the exact lossless form for empty structures, ordered-list wrappers, Accordions, Columns, and rich tables.
- Canonical inline mark arrays preserve their stored order through Markdown round-trips instead of being re-sorted by the converter.
- Canonical `<a>` serialization uses a strict HTML wire form: href values are percent-encoded before HTML escaping, and the parser decodes the canonical entity-escaped attributes back to the exact stored strings.
- Code blocks preserve the exact terminal newline count in their fenced Markdown form instead of collapsing zero-, one-, and multi-newline content into a single shape.

## Atomic Failure Contract

- The Markdown parser returns structured failures instead of partial document output.
- Failure reasons are:
  - `invalid-frontmatter`
  - `invalid-title`
  - `invalid-markdown`
  - `unsupported-html`
  - `unknown-directive`
  - `invalid-directive`
  - `invalid-canonical-document`
- Title validation reuses the existing page-title validator from `app/docsera-ui/src/shared/pages/domain.ts`.
- Link URI validation reuses the existing Docsera link policy from `serverEditorDocument.ts`.
- Empty Markdown bodies normalize to the ordinary one-empty-paragraph Docsera page, while only explicit `::docsera-empty-document` input may produce the zero-child canonical document.
- Allowed inline HTML is strict: `<a>` must carry the full canonical `href/target/rel/class/title` attribute set, and `<u>`, `<mark>`, `<sup>`, and `<sub>` reject attributes instead of silently dropping them.
- Malformed closing inline HTML tags with unsupported attributes or trailing material are rejected as `unsupported-html` instead of being normalized.
- Literal prose that begins with directive-looking `::docsera-*` text is escaped back to ordinary paragraph text during serialization, while malformed or unexpected directive labels, empty directive bodies where canonical empty content must be explicit, unsupported block HTML, malformed rich-table attributes, and canonical-schema violations fail closed and return structured conversion failures rather than uncaught parser exceptions.

## Preservation Corpus

- The E8 regression coverage reuses the existing document fixtures in `app/docsera-ui/src/shared/editor/documentFixtures.ts`.
- `app/docsera-ui/src/shared/editor/markdown.test.ts` extends that corpus with Markdown-specific preservation edges:
  - explicit zero-child documents versus normal empty pages
  - interstitial and consecutive empty paragraphs
  - escaping-sensitive Docsera image attributes
  - escaping-sensitive non-image directive attributes such as Accordion ids
  - exact code-block terminal newline preservation, including empty code blocks
  - directive-looking prose at paragraph starts that must remain ordinary text
  - strict directive label/body rejection for unexpected labels and non-canonical empty child shapes
  - non-default and explicit-`null` link metadata through accepted `<a>` HTML
  - mixed ordinary Markdown marks and HTML-backed marks in both nesting directions
  - canonical inline mark arrays preserving stored order through Markdown round-trips
  - preservation of canonical ordered-list `type` values, including explicit `"1"`
  - ordinary GFM-table round-trips versus explicit Docsera rich-table fallbacks when per-column alignment disagrees
  - literal pipe characters in ordinary GFM tables
  - unlabeled code blocks preserving canonical `language: null`
  - directive-fence growth when nested code contains directive-looking colon fences
- `app/docsera-ui/src/shared/editor/columns.test.ts` now covers the accepted nested column/accordion shapes, including columns inside accordion content and accordion content inside columns.
- The managed `editor-contract` suite now includes the Markdown contract test file so Source/import/export preservation stays inside the same document-boundary regression surface.
