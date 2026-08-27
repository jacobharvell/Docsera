# Implementation Notes - E6-T2B Columns Editor Integration and Direct Insertion

Date: 2026-08-26

Status: implementation note

## Purpose

This note records the repository-side behavior added for E6-T2B: the editor command surface can now create canonical 2-, 3-, and 4-column layouts directly from Slash and Quick Add, and the runtime understands where those commands are valid in the accordion/column nesting graph.

It describes repo behavior only. Accepted product requirements remain defined by the Obsidian notes and the E6 implementation brief.

## Command Surface Contract

- The shared block-command registry now exposes `2 columns`, `3 columns`, and `4 columns`.
- Slash and Quick Add both insert a canonical `columns` block with the requested column count.
- Each inserted `columns` block contains only `column` children, and each `column` starts with an empty paragraph so the caret lands in the first column after insertion.
- Slash insertion for Columns replaces the owning empty paragraph instead of leaving a trailing ghost paragraph.
- The empty paragraph at the insertion point acts as a structural sentinel for required-content containers; it is replaced atomically rather than deleted first.
- The image picker uses the same atomic replacement primitive when it inserts into an empty column.
- Quick Add uses the same registry output and the same selection placement contract as Slash for Columns.
- Ordinary undo removes the accepted Columns insertion cleanly, and autosave stays on the normal editor transaction path.

## Nesting And Availability Contract

- Columns are available at the top level and inside `accordionContent` when the selection is not already inside a column ancestor.
- Columns are suppressed anywhere beneath a `column` ancestor, including indirect nesting through other supported blocks.
- Accordion remains available inside top-level columns when the selection is directly in a column and not already inside another Accordion.
- Accordion is suppressed inside Accordion ancestry, including cases where the selection is inside a column that itself lives inside an Accordion body.
- The runtime derives command availability from the active selection container instead of inferring it from quick-add placement alone.

## Presentation Contract

- The block-command icon set now includes distinct icon artwork for the Columns commands.
- The top-level gutter label for Columns resolves to `Columns`, so Quick Add and other block-action affordances describe the inserted structure consistently.
- The editor-owned `columns` presentation derives its track count from the rendered node structure, keeps the equal-width layout contract at normal widths, and stacks to one track at the current `920px` narrow boundary.
- Empty paragraphs directly inside a `column` show the presentation-only helper text `Type here...` only when the column contains that single canonical empty paragraph, without changing the ProseMirror document JSON.
- Long unbroken inline content stays visually contained within each column in both Edit mode and the lightweight live reader through column-level wrap containment.

## Regression Coverage

- `src/client/editor/PageEditorHostRuntime.commands.test.tsx` covers:
  - canonical `columns2`, `columns3`, and `columns4` quick-add content structure at the command-content boundary;
  - canonical 2-, 3-, and 4-column creation from Slash and Quick Add;
  - first-column focus after insertion;
  - the top-level gutter label contract for Columns;
  - Slash availability inside `accordionContent`;
  - suppression of Columns beneath column ancestry;
  - suppression of Accordion inside Accordion ancestry through nested Columns.
- `src/client/editor/PageEditorHostRuntime.columns.test.tsx` covers:
  - focused Slash and Quick Add column insertion paths;
  - canonical empty paragraph sentinels and first-column focus;
  - empty direct column paragraphs showing `Type here...`, clearing on input, and restoring after the column paragraph becomes empty again;
  - column helper suppression when a column also contains an image and still has an empty paragraph sentinel;
  - slash-driven structural insertion for Image, Accordion, Table, and Horizontal Rule consuming the sentinel paragraph without leaving a sibling filler paragraph;
  - nested Accordion-body Columns insertion consuming the local slash owner paragraph;
  - editor column wrap containment for long unbroken content;
  - local Slash-owner replacement inside Accordion content;
  - top-level Columns hover labeling;
  - nested Columns not receiving their own top-level gutter;
  - editor-owned Columns presentation and the 920px stacked presentation contract.
- `src/client/features/workspaces/PublishedDocumentReader.columns.test.tsx` covers:
  - live reader column wrap containment for long unbroken content;
  - live reader columns layout contract and recovery.

## Validation

Validation performed for this change:

- `npm --prefix app/docsera-ui run test:suite -- editor-columns`;
- `npm --prefix app/docsera-ui run build`;

Runtime-compatibility finding:

- local/source validation did not expose the deployed failure;
- the installed Columns Slash path produced `undefined` column children from the previous construction strategy;
- the Columns builder now uses explicit child construction with a deterministic loop;
- the resulting `now-sdk build` artifact was inspected and emits that explicit loop in the compiled bundle.

Validation intentionally skipped:

- full managed frontend suite;
- deployment;
- interactive PDI/browser testing;
