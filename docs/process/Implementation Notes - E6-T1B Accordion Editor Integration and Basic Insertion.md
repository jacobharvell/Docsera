# Implementation Notes - E6-T1B Accordion Editor Integration and Basic Insertion

Date: 2026-08-23

Status: implementation note

## Purpose

This note records the repository-side behavior added for E6-T1B: the active TipTap editor schema now owns the canonical accordion node family, and the shared block-command runtime can insert a single-item accordion from Quick Add and Slash without leaving behind a ghost paragraph.

It describes repo behavior only. Accepted product requirements remain defined by the Obsidian notes and the E6 implementation brief.

## Editor Schema Contract

- The active editor schema now includes the canonical `accordion`, `accordionItem`, `accordionTitle`, and `accordionContent` node family.
- `accordion` is a top-level block node.
- `accordionItem` owns exactly one `accordionTitle` followed by one `accordionContent`.
- `accordionTitle` is inline-only and uses the presentation placeholder `New accordion` when empty.
- `accordionContent` accepts the existing nested block set used by the editor, including tables and media.
- Accordion ids are preserved through `accordionId` and `accordionItemId`.
- Accordion nodes are rejected from nested containers such as blockquotes, list items, task items, and table cells/headers.

## Command Runtime Contract

- The shared block command registry now exposes an `Accordion` command.
- The accordion command is available only for top-level block contexts outside table cells and headers.
- Quick Add and Slash both insert a canonical single-item accordion with fresh non-empty ids on each insertion.
- Slash insertion for accordion replaces the owning empty paragraph instead of leaving a trailing ghost paragraph.
- Slash is suppressed inside `accordionTitle` so the command menu does not open there.
- Slash remains available inside `accordionContent`, including genuinely empty nested body paragraphs that keep the normal presentation-only `Start typing or press '/' for commands` helper.
- Accordion body Slash continues to hide the Accordion command itself because the nested body paragraph is not a top-level insertion context.
- The helper/Slash presentation remains decoration-only and does not create document content, undo history, autosave dirtiness, or publish state changes.
- Whole-block Accordion handle selection uses the existing top-level selected-block contract on the container block only; descendants do not get their own selected-block treatment.
- The Accordion block-actions menu now includes the standard top-level `Duplicate` and `Delete` actions.
- Duplicating an Accordion preserves supported content and ordering while regenerating a fresh `accordionId` for the duplicated group and a fresh `accordionItemId` for each duplicated item.
- The shared block-actions menu anchor is derived from the compact gutter controls rather than the full block height, so tall structural blocks open the menu beneath the gutter row and over the block content.

## Styling And Presentation

- The runtime now includes minimal accordion editor chrome for the block, item, title, and content wrappers.
- The empty accordion title placeholder is a decoration-only presentation detail and is not serialized into document JSON.
- The lightweight reader now renders the accordion disclosure chevron as the project Lucide icon on the left immediately beside the title while preserving the existing single-open/zero-open behavior and button semantics.

## Regression Coverage

- `src/shared/editor/schema.test.ts` covers the canonical accordion node family and the nested-container rejection boundary.
- `src/client/editor/PageEditorHostRuntime.accordion.test.tsx` covers empty accordion-body helper/Slash behavior, title Slash suppression, whole-block Accordion selected-block treatment, standard block-menu anchoring for a tall Accordion block, and Accordion duplication with fresh identities.
- `src/client/features/workspaces/PublishedDocumentReader.test.tsx` covers the lightweight reader disclosure icon placement alongside the existing disclosure semantics.

## Notes

- This note does not change the reader-side accordion contract established in E6-T1A.
