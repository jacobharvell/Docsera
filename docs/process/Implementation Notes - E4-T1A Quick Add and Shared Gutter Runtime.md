# Implementation Notes - E4-T1A Quick Add and Shared Gutter Runtime

Date: 2026-08-04

Status: implementation note

## Purpose

This note records the repository-side correction for E4-T1A after the first installed-runtime pass missed Legacy Docsera parity on density, Quick Add presentation, selector behavior, resize stability, and the second feedback pass still exposed shared-selector and final-block Quick Add defects.

It describes repo behavior only. Accepted product behavior remains defined by the Obsidian requirements and the E4 implementation brief.

## Final Vertical Spacing Ownership

Vertical density now belongs to the document flow instead of minimum-height scaffolding.

- `PageEditorHostRuntime` no longer widens the editor surface with negative margins or left padding to make room for the gutter
- the runtime no longer applies a `340px` minimum height to both the surface and `.ProseMirror`
- the document now relies on normal first-child and last-child margin trimming plus block-specific spacing inside `.ProseMirror`
- empty-page usability still comes from the canonical single empty paragraph and its placeholder, not from a large empty canvas block

The earlier regression came from stacking layout scaffolding on top of normal document spacing. That produced a large title-to-body gap, a large final empty band, and resize-sensitive recentering. The correction removes the extra layout layer instead of trying to cancel it with more offsets.

## Gutter Lane Ownership

The gutter remains editor-owned, but the visible document column is no longer moved to create that lane.

- the editor surface stays `width: 100%`
- hover hit testing resolves one editor-owned lane from the real ProseMirror content rect through `resolveEditorLaneGeometry(...)`
- the lane includes the block content, the content-to-control gap, the empty gutter lane, and the visible Quick Add button as one continuous pointer-owned row
- direct pointer entry into the empty gutter can resolve a block even when the exposed event target is a light-DOM shell element or the shadow host
- the visible Quick Add button is still rendered through the editor-owned floating layer
- no drag handle, grip placeholder, or block-menu surface is rendered in E4-T1A

This keeps the layout compatible with a later adjacent 24 x 24 drag handle without reserving a visible empty slot today.

## Stable Selector Owner Model

Quick Add is now paragraph-owner based, not hover-owner based.

- clicking `+` inserts exactly one empty paragraph after the hovered top-level block
- the selector stores the inserted block index, the insertion history timestamp, a fallback anchor rect, and the target label
- once open, selector positioning remeasures the inserted paragraph and only falls back to the stored rect if that paragraph cannot be resolved
- hover target changes no longer reposition or recreate an open Quick Add selector
- selector dismissal can recompute hover once from the last pointer snapshot, but the open selector never depends on live gutter hover

The earlier regression came from mixing two anchor systems: live hover target geometry and a fallback rect. That let the menu jump while the pointer moved and made it possible to reinsert paragraphs while the user was only moving across menu rows.

## Quick Add Mutation and Undo Contract

Quick Add still uses one shared mutation identity for insertion and conversion.

- `openQuickAddSelector(...)` inserts one visible temporary paragraph and captures one `historyTime`
- that temporary paragraph owns the same transient slash/query/helper presentation used by ordinary slash
- `executeCommand(...)` reuses that same history timestamp when it replaces the inserted paragraph with the selected command's declared `quickAdd.content`
- non-continuation conversions still mark the transaction with TipTap's `skipTrailingNode` metadata
- cancel preserves the inserted placeholder paragraph
- if the stored replacement target can no longer be resolved, command execution leaves the temporary paragraph unchanged instead of mutating a different location
- option hover remains presentation-only and does not change JSON, dirty state, autosave, or undo depth

The earlier browser correction left focus restoration deferred past selector teardown. The final correction restores the exact editor selection immediately after teardown so the browser caret stays attached to the quote paragraph instead of briefly yielding to surrounding shell focus.

## Visual Token and Alignment Contract

The Quick Add control now matches the compact Legacy Docsera treatment using current Docsera tokens.

- default chrome is transparent, shadowless, borderless, and muted
- hover and focus use token-based background and foreground shifts only
- the button remains 24 x 24 with a 14px plus icon and an 8px radius
- paragraph, list, and horizontal-rule alignment all use the same small top offset contract
- the title-to-first-block spacing is owned by the shell/editor layout boundary and now remains `40px` in Edit mode without reintroducing a stretched final canvas region

Installed-browser measurements on the populated smoke page showed a consistent `delta: 1` pixel from the block top to the button top for paragraph, list, and horizontal-rule targets.

## Compact Menu Reuse

Quick Add and the text toolbar now share one compact menu style primitive.

- `CompactMenuStyles.ts` owns the compact panel, row, icon, title, description, and status-row styling
- `CompactTextToolbar.tsx` consumes that shared primitive rather than maintaining a separate inline menu style block
- `PageEditorHostRuntime.tsx` renders the Quick Add/slash selector with the same compact menu classes

This keeps slash and Quick Add on the same command registry while also keeping their visual density aligned.

## Inline Slash Query Ownership

Slash and Quick Add now share one editor-owned transient query presentation path.

- `PageEditorHostRuntime.tsx` registers one ProseMirror plugin keyed by `docseraCommandQueryPresentation`
- opening either selector dispatches transaction metadata that records the owner textblock position, current query, and selector source
- the plugin renders one owner textblock marker plus inline widget decorations at the real caret position instead of relying on paragraph pseudo-elements
- the empty-query state renders `/` before the caret and `Type to search` after the caret
- the typed-query state renders one transient `/<query>` inline widget so the real typed query remains visible in the installed runtime
- query changes replace the same decoration state; they do not append additional decorations, mutate editor JSON, add undo depth, dirty the session, or trigger autosave
- document transactions map the stored owner position through ProseMirror transaction mapping and drop the presentation if the mapped owner textblock no longer resolves

The installed-runtime failure traced back to the previous correction using a paragraph pseudo-element path that could not reliably surface the helper text and typed query inside the deployed shadow runtime. The correction moves the full visible slash/query/helper presentation into the shared ProseMirror plugin instead of repairing the DOM from React or depending on global CSS behavior.

## Empty-Block Helper Text

Empty helper text is now fully decoration-owned rather than paragraph-only.

- the shared schema extension decorates empty top-level paragraphs with `Start typing or press '/' for commands`
- empty Heading 1, Heading 2, and Heading 3 nodes now receive their own presentation-only helper text
- empty blockquote paragraphs now receive `Enter a quote`
- slash query presentation still takes precedence over the ordinary empty-block helper state
- helper text remains nondurable: it does not alter canonical JSON, undo history, dirty state, autosave, copied text, or published output

The second feedback pass specifically confirmed that empty blockquotes must suppress the generic paragraph helper. The current correction preserves only `Enter a quote` for an empty blockquote paragraph and keeps the subdued italic placeholder treatment in both light and dark themes.

## Selector Surface Cleanup

The shared selector now measures its own overflow state instead of reserving scrollbar space unconditionally.

- `BlockSelectorStyles.ts` no longer uses `scrollbar-gutter: stable`
- the selector surface receives `--docsera-block-selector-scrollbar-gap` from runtime measurement
- non-overflowing lists render full-width symmetric rows with no empty scrollbar strip
- overflowing lists still keep normal internal scrolling without covering row content
- row hover and active backgrounds extend through the measured scrollbar-side gap so the visual inset matches the opposite edge
- enabled selector rows use `cursor: pointer` inside the shadow runtime

The stray pixel reported in the second feedback pass came from the previous slash/query presentation fragment rather than from the selector container itself. Removing the pseudo-element slash path eliminated that artifact without adding a cover patch.

## Placement Contract

Slash and Quick Add now share one stable above-or-below placement contract.

- selector state stores the chosen `placement` as `above` or `below`
- initial placement prefers the side that fits the full surface and otherwise picks the side with more usable room
- constrained height is calculated from the chosen side instead of always using the full default selector height
- the same vertical gap token now applies above and below the owner paragraph instead of using a separate above-placement offset
- overlay remeasurement can update both anchor geometry and placement after resize or inserted-paragraph reflow
- filtering and pointer movement keep the current selector anchored to its owner paragraph instead of oscillating across sides

The remaining placement regression came from remeasuring the Quick Add anchor rect without re-evaluating the placement decision. The final correction updates both together, which removes the `1px` constrained-height failure and keeps the side choice stable under remeasurement.

## Final-Block Quick Add Conversion

The second feedback pass also exposed a generic trailing-paragraph regression when Quick Add converted its temporary final-block paragraph.

- Quick Add still inserts exactly one temporary paragraph and records one shared history timestamp
- conversion now always replaces that exact paragraph with the selected command's declared `quickAdd.content`
- single-block commands leave only that block in place of the temporary paragraph
- continuation output is allowed only when the command declares it as part of `quickAdd.content`; the current concrete example is `Horizontal Rule`, which intentionally leaves `horizontalRule + empty paragraph`
- pointer-picked commands still restore browser focus with `view.focus()` after a successful replacement
- final-block undo still collapses to one step because insertion and conversion share the same history timestamp

The regression was not fixed by deleting a trailing paragraph after the fact. The root cause was the old Quick Add replacement path mixing in-place textblock mutation with structural replacement, which let the temporary paragraph survive when a command inserted separate content.

## Trailing Paragraph Ownership

The remaining duplicate-paragraph regressions came from overlapping paragraph ownership rather than from one more Quick Add edge case.

- the shared editor schema now disables TipTap StarterKit's built-in `TrailingNode` extension
- Docsera still allows explicit paragraph creation from accepted user actions such as canvas click below content, `Enter` transitions that TipTap handles natively, and Quick Add commands that declare continuation output
- Docsera no longer relies on a generic end-of-document auto-append path for headings, blockquotes, code blocks, or structural toolbar conversions

The root cause was TipTap's trailing-node insertion reappearing after final-block heading, blockquote, and code-block edits while Docsera was also treating paragraph availability as an editor-owned concern. Removing that shared trailing-node ownership lets native block transitions produce exactly one next paragraph when appropriate and prevents duplicate final paragraphs after typing, `Enter`, or empty-block Backspace cleanup.

## Shared Blockquote Completion Ownership

Blockquote completion now uses one deterministic editor-owned replacement path for both slash and Quick Add instead of relying on `setBlockquote()` side effects.

- slash and Quick Add both replace the resolved empty owner paragraph with one `blockquote > paragraph` structure
- the replacement transaction sets the final ProseMirror selection inside the inner paragraph before selector teardown
- successful blockquote completion closes the selector, clears transient slash/query presentation, and immediately restores browser focus to that exact editor selection
- empty blockquote click handling now resolves a live text selection back into the inner paragraph after blur without adding another retry or timeout
- immediate follow-up typing now targets the inserted quote paragraph without an extra click, and later pointer re-entry targets the same paragraph without creating an extra block

The remaining defect was not another missing selection transaction. Repo evidence showed the state selection already landed in the inner paragraph, but the browser-visible caret and later empty-quote click path still failed. The root cause was split between deferred focus restoration after selector teardown and the lack of an explicit empty-blockquote click-to-caret mapping. The final correction fixes those two editor/DOM boundaries directly rather than adding another focus retry.

## Legacy Selector Inventory Evidence

Legacy selector wording, ordering, and icon treatment were rechecked against `C:\Dev\docsera-editor-reference\studio\src\components\editor\SlashCommand.ts` and `C:\Dev\docsera-editor-reference\studio\src\components\editor\CommandList.tsx` on August 4, 2026.

- the current accepted grouped selector heading is one category: `Basic Blocks`
- the supported legacy command order is `Text`, `Heading 1`, `Heading 2`, `Heading 3`, `Blockquote`, `Bulleted List`, `Numbered List`, `Code Block`, `Horizontal Rule`
- Text uses Lucide's `Pilcrow` icon, matching the accepted paragraph treatment
- each command icon is centered inside a `21px x 21px` visual box
- unsupported legacy categories such as `Media` and `Components` are omitted from the current grouped selector rather than rendered as empty headings

This means the grouped selector preserves the accepted supported command set and legacy wording baseline while using the single accepted current-Docsera category heading.

## Resize Stability

Resize handling is now measurement-batched and flow-neutral.

- overlay remeasurement uses a request-animation-frame batch instead of resize-driven remount state
- overlay measurement does not remount the editor surface or the ProseMirror root
- overlay position updates do not participate in normal document flow

Installed-browser geometry checks on the populated page confirmed the same ProseMirror DOM node survived width changes across `1440`, `1280`, `1100`, `900`, and back to `1440`.

## Validation Boundary

Automated coverage now proves the repository-side behavior change directly.

- runtime contract tests prove the surface is no longer widened and no `340px` editor minimum-height contract remains
- command tests prove Quick Add hover does not mutate content, `+` opens with a real temporary paragraph plus shared slash/query/helper rendering, direct gutter entry resolves the owning row, the Quick Add control and selector rows use pointer cursors, blockquote helper precedence is preserved, selector scrollbar padding only appears when needed, selector placement is stable above/below with one gap contract, Quick Add cancel preserves the inserted paragraph while clearing transient presentation, final-block and in-flow Quick Add conversion replaces the temporary paragraph with exactly the registry-declared output, duplicate final paragraphs are not appended after typing or exiting supported Quick Add blocks, slash and Quick Add blockquote selection each produce one undo-restorable quote insertion, browser-path text input immediately types into the quote, and blur followed by a real pointer click restores a caret inside the empty quote for further typing
- initialization/core tests still prove editor identity and remount stability
- the `editor-interactions` and `editor-contract` managed suites were rerun after the second correction pass

Installed-browser validation proved:

- live SDK bundle/hash parity and inline runtime CSS presence

Installed-PDI behavior verification for the second correction pass remains Jacob-owned. As of August 4, 2026, repo-side deployment and non-interactive installed-runtime verification can prepare the build for review, but live pointer/focus/browser acceptance still requires Jacob's manual completion before merge. The branch therefore remains in correction/manual-acceptance status.

## Remaining Limits

- real pointer and focus behavior across all ServiceNow browser/runtime permutations still requires manual PDI confirmation before merge
- the gutter still targets top-level blocks only
- drag/drop, grip rendering, and richer block-menu behavior remain out of scope for E4-T1A
