# Implementation Notes - E4-T1B2 Direct Block Actions Menu

Date: 2026-08-04

Status: implementation note

## Purpose

This note records the repository-side implementation for the direct block actions surface added after the single-block handle and selection gesture work.

It describes repo behavior only. Accepted product behavior remains defined by the Obsidian requirements and the E4 editor plan.

## Direct Block Actions Surface

Clicking the block handle without crossing the drag threshold now opens a compact block actions menu for the selected top-level block.

- the menu is anchored to the block gutter lane rather than to the document text flow
- the menu is hidden while the slash/quick-add selector is open
- the selected block remains transient editor state while the menu is open
- outside clicks, Escape, and menu navigation close the active block-action surface and clear the transient selection

## Menu Structure

The block actions menu exposes the accepted direct actions in a fixed order.

- `Turn into` appears first when the current block type supports conversions
- a divider separates the conversion entry from the direct actions
- `Duplicate` copies the full selected top-level block
- `Delete` removes the selected top-level block
- multi-block actions are not surfaced

The `Turn into` entry opens a nested submenu that lists only valid destination block types for the current source block. The current block type is omitted from the submenu.

## Conversion Behavior

Block conversion operates on the full top-level block and preserves content and marks where the schema allows it.

- conversions are executed as a single undoable transaction
- text content is preserved when converting between compatible block types
- the current block type is excluded from the destination list
- valid conversion sources follow the accepted requirement set for text, headings, and blockquote

## Duplicate and Delete Behavior

Duplicate and delete actions operate on the selected top-level block only.

- duplicate inserts a full copy adjacent to the selected block
- delete removes the selected top-level block without confirmation
- after delete, the runtime restores the caret with the surviving block's node-aware offset so paragraphs, headings, blockquotes, lists, and code blocks remain valid
- horizontal-rule continuation keeps the existing post-delete continuation placement
- if the final body block is deleted, the runtime restores one empty paragraph

## Keyboard Access

The block actions menu can be opened from the keyboard.

- `Shift+F10` and the Context Menu key open the menu from the current block selection or text selection
- arrow keys move through the menu entries
- `Enter` and `Space` activate the focused entry
- right arrow opens the `Turn into` submenu
- left arrow returns from the submenu to the parent menu

## Validation

The repo-side implementation was validated with:

- `npm --prefix app/docsera-ui run test -- src/client/editor/PageEditorHostRuntime.commands.test.tsx`
- `npm --prefix app/docsera-ui run build`
- `npm --prefix app/docsera-ui run deploy:sdk`
- `npm --prefix app/docsera-ui run verify:sdk-runtime`

The regression coverage exercises menu opening and dismissal, duplicate, turn-into conversion, and delete behavior including the final-paragraph fallback and the blockquote/list caret regression.
