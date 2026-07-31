# Implementation Notes - E2-T7 Text Formatting Document Contract Expansion

Date: 2026-07-31

Status: implementation note

## Purpose

This note records the repository-side document-contract expansion completed for E2-T7.

It describes implementation behavior only. Accepted product requirements remain defined by the Obsidian requirements notes and the task brief.

## Expanded Canonical Contract

- Canonical document schema version remains `1`.
- Supported body heading levels are now `H1`, `H2`, and `H3`.
- Supported inline marks now include:
  - underline
  - superscript
  - subscript
  - highlight
- Previously valid version-1 documents that use only the earlier H2/H3 and mark set remain valid without migration.

## Schema-Version Compatibility Decision

- This task did not increment the canonical schema version.
- The repo-grounded decision is that E2-T7 adds optional accepted values within the existing version-1 contract rather than changing the envelope shape or introducing a second document representation.
- Version `1` therefore continues to describe the canonical Docsera document envelope and the accepted node/mark registry.

## Highlight Persistence And Rendering

- Canonical JSON persists highlight as the semantic `highlight` mark only.
- Theme-specific highlight colors are rendering-only and do not persist into canonical JSON.
- Canonical validation rejects highlight attributes such as color payloads.
- Editor and lightweight reader rendering both apply the semantic highlight through local theme-aware CSS.

## Superscript / Subscript Exclusivity

- Canonical validation rejects any text node that carries both `superscript` and `subscript`.
- Editor bubble commands actively replace one with the other by unsetting the opposite mark before toggling the requested mark.
- Unrelated supported marks such as bold or italic remain intact while superscript/subscript changes.

## Paste And Canonicalization

- Rich HTML paste now preserves representative semantic `<h1>`, `<u>`, `<sup>`, `<sub>`, and `<mark>` content.
- Sanitization still strips unsafe markup and inline styles before parsing.
- Arbitrary highlight colors or other theme-specific styling therefore fail closed into semantic highlight or plain text according to the existing sanitizer policy.
- Canonicalization strips empty non-link mark attributes so persisted underline, superscript, subscript, and highlight marks do not accumulate empty attrs objects.

## Lightweight Reader And Outline

- The lightweight reader renders body H1, underline, superscript, subscript, and highlight without importing TipTap or ProseMirror.
- The page title remains the primary page heading.
- Body H1, H2, and H3 render as semantic `h2`, `h3`, and `h4` respectively, while preserving the existing body heading classes and visual hierarchy.
- Empty body headings use the same semantic mapping as non-empty headings.
- Outline extraction and workspace TOC generation now accept levels 1 through 3 from the canonical document only.
- The workspace page title remains outside the document outline because TOC extraction still reads only canonical document headings.
- TOC rendering now preserves hierarchy visually through heading-level indentation.

## Validation Coverage Added

- Canonical acceptance for H1, underline, superscript, subscript, and highlight.
- Canonical rejection for unsupported heading levels, highlight attrs, and superscript/subscript overlap.
- Round-trip and client/server parity coverage for the expanded contract while preserving prior H2/H3 compatibility.
- Editor slash-command coverage for body H1 creation.
- Bubble-command coverage for underline, highlight, superscript, subscript, and superscript/subscript replacement behavior.
- Rich HTML paste coverage for `<h1>`, `<u>`, `<sup>`, `<sub>`, and `<mark>`, plus sanitization of arbitrary highlight styling.
- Lightweight reader and TOC/outline coverage for H1/H2/H3 hierarchy and the new marks.
