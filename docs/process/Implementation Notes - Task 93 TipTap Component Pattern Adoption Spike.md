# Implementation Notes - Task 93 TipTap Component Pattern Adoption Spike

## Scope

Task 93 is an investigation-only adoption spike for the editor capabilities staged behind Tasks 94-96. It does not change production code, dependencies, schema, UI, accepted requirements, or the MVP plan.

The planning source is `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\To-Do Staging Area - 4.md`, which proposes text/highlight color, text alignment, indentation, moving Blockquote into Change to, reorganizing More, and right-aligned undo/redo. `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\MVP Implementation Plan.md` records Task 93 as a selective TipTap Notion-like component/pattern adoption spike and explicitly says not to replace the established Docsera React/TipTap editor architecture.

## Official TipTap Evidence

Current official TipTap documentation says the Notion-like template is a Start-plan template with Pro License / Terms of Service implications, and it includes collaboration, AI, drag/drop, advanced formatting, and setup that depends on TipTap Cloud configuration. That makes it reference material only for Docsera, whose current guardrails reject paid-AI-dependent features, real-time collaboration, and broad editor replacement.

The separate TipTap UI Components documentation says UI components are copied into a project by the CLI as editable source rather than consumed as an npm package. It also says components follow the license of the editor extension they are built on: open-source extensions produce MIT components, while paid/cloud-connected features are not open source and usually depend on TipTap backend services. The Simple Editor template and its included components are MIT licensed, and its current component list includes color/highlight, text-align, blockquote, and undo-redo components.

The specific TipTap `Turn Into Dropdown` is currently marked `Available in Start plan`. It must not be described as part of the free/MIT Simple Editor component set. It can still be used as interaction and organization evidence, but not adopted or treated as a license-neutral source component.

Relevant official extension/API evidence:

- Color uses `TextStyle` and renders inline font color as a `span` style.
- Highlight supports `multicolor: false` by default and color attributes only when multicolor is enabled.
- TextAlign adds a `textAlign` attribute to configured node types, usually `paragraph` and `heading`, and renders inline `text-align` style.
- StarterKit includes Undo/Redo unless explicitly disabled.
- Undo/Redo is appropriate only for non-collaborative editors; collaboration owns a different history model.
- List indentation is represented by list commands such as `sinkListItem` and `liftListItem`.
- TipTap UI changelog notes `indent` and `outdent` commands as currently available only for the Notion-like template, not as a general open-source indentation extension for Docsera to adopt.

Sources checked on September 26, 2026:

- https://tiptap.dev/docs/ui-components/templates/notion-like-editor
- https://tiptap.dev/templates/notion-like-template
- https://tiptap.dev/docs/ui-components/getting-started/overview
- https://tiptap.dev/docs/ui-components/templates/simple-editor
- https://tiptap.dev/docs/editor/extensions/functionality/color
- https://tiptap.dev/docs/editor/extensions/marks/highlight
- https://tiptap.dev/docs/editor/extensions/functionality/textalign
- https://tiptap.dev/docs/editor/extensions/functionality/starterkit
- https://tiptap.dev/docs/editor/extensions/functionality/undo-redo
- https://tiptap.dev/docs/editor/api/commands/lists
- https://tiptap.dev/docs/ui-components/getting-started/changelog

## Repository Evidence

Docsera already has a custom TipTap schema and host runtime rather than a stock template.

- `app/docsera-ui/src/shared/editor/schema.ts` creates `Document.extend({ content: "(block | columns)*" })`, configures `StarterKit` with custom disables, extends blockquote/list/table/accordion/columns/image behavior, and registers `Highlight.configure({ multicolor: false })`, `Superscript`, and `Subscript`.
- `app/docsera-ui/src/server/pages/serverEditorDocument.ts` validates the canonical document contract. It allows known nodes and marks only, rejects arbitrary attributes on non-link marks, and enforces Superscript/Subscript mutual exclusion.
- `app/docsera-ui/src/client/features/workspaces/PublishedDocumentReader.tsx` renders the lightweight reader itself. It renders highlight as a semantic `mark` with `docsera-main__highlight`, has no text-color/textStyle rendering, and only applies block text alignment for table cell `align` attributes.
- `app/docsera-ui/src/shared/editor/markdown.ts` owns the Markdown Source contract. It serializes/parses known block and inline marks, including highlight/superscript/subscript, and has no arbitrary text color, colored highlight, paragraph alignment, or paragraph indentation contract.
- `app/docsera-ui/src/client/editor/pasteSanitizer.ts` and `PageEditorHostRuntime.tsx` own paste normalization and TipTap paste hooks.
- `app/docsera-ui/src/client/editor/CompactTextToolbar.tsx` owns the selected-text toolbar, Change to menu, More menu, link surface, tooltip behavior, and current formatting commands. Blockquote currently appears in More; Superscript/Subscript commands explicitly unset each other.
- `app/docsera-ui/src/client/editor/editorBlockCommands.ts` already has a canonical `blockquote` block command used by slash/quick-add and block transformation surfaces.
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx` owns block controls, block action menu, Turn Into submenu, selector placement, focus recovery, selection ownership, overlay rendering, undo/autosave transaction boundaries, and geometry against the editor shell.
- `docs/process/Technical Checkpoint - E4 Integrated Block Controls and Maintainability.md` records Docsera's block actions and Turn Into surface as already covered by tests for menu state, conversion, focus, undo, and autosave boundaries.
- `docs/process/Technical Spike - E4-T4D Text-Selection Stabilization and Hardening Scope.md` records current coverage for More order, Blockquote, Superscript/Subscript mutual exclusion, Highlight, paste/schema/reader preservation, and text-selection ownership.

## Overall Template Decision

Decision: **Do not adopt / defer** for the Notion-like template as a whole.

The template is not an architecture replacement, not a codebase import, and not a license-neutral shortcut for Docsera. It carries Start-plan / Pro-license implications and bundles features that are explicitly outside current Docsera scope, including collaboration and AI. It can still inform interaction feel, menu grouping, command affordances, and visual density where those patterns fit Docsera's existing runtime.

Open-source TipTap extensions and MIT UI components remain available as separate references. For Docsera, the safe boundary is: adopt extension APIs where they define underlying editor capability, adapt UI component patterns where they improve command presentation, and keep Docsera-owned overlays, geometry, persistence, validation, reader, and Markdown contracts.

## Requirements Reconciliation Gate

The staging-area ideas behind Tasks 94-96 are candidate product changes, not accepted replacements for current requirements. Task 93 does not decide whether Docsera wants those capabilities.

Current accepted requirements conflict with parts of the staged ideas:

- Highlight is one fixed semantic Docsera highlight style with theme-specific rendering; persisted Highlight currently has no user-selected color.
- The accepted text-selection toolbar behavior places Blockquote in the More menu.

Therefore:

- Colored Highlight requires an accepted requirement change before implementation.
- Moving Blockquote from More into Change to requires an accepted requirement change before implementation.
- Text color, paragraph/heading alignment, general indentation, and right-aligned Undo/Redo controls require their product behavior to be accepted before implementation.

The next step after Task 93 should be requirements/product-decision reconciliation owned by Jacob/ChatGPT. Codex implementation tasks should decompose only the capabilities that are accepted through that reconciliation.

## Markdown Source Contract

Accepted Docsera requirements require every supported canonical node, mark, and relevant attribute to have explicit JSON-to-Markdown and Markdown-to-JSON behavior. When ordinary Markdown is not lossless, Docsera-specific syntax must preserve the state.

That source contract is mandatory for future canonical formatting capabilities:

- Text color, if accepted as canonical state, must round-trip losslessly through Markdown Source.
- Colored Highlight, if accepted as canonical state, must round-trip losslessly through Markdown Source.
- Paragraph/heading text alignment, if accepted as canonical state, must round-trip losslessly through Markdown Source.

The exact Markdown representation can remain a later implementation decision. Intentionally dropping, omitting, or warning away canonical state is not an accepted implementation option.

## Text Color / Highlight Color

Decision: **Adapt pattern/API**.

Docsera already has single semantic highlight through `Highlight.configure({ multicolor: false })`. The canonical server validator permits a `highlight` mark but rejects arbitrary attributes on non-link marks. The reader renders highlight as a plain semantic `mark`, and Markdown Source does not encode highlight color. TextStyle/Color is not currently in the canonical model at all.

The TipTap foundation is appropriate only after Docsera accepts the product behavior and defines the document contract:

- Colored highlight would require an accepted requirement change, changing `Highlight` to `multicolor: true`, allowing a constrained `color` attr on `highlight`, sanitizing/normalizing accepted values, rendering colored highlight in the reader, preserving color losslessly in Markdown Source, and adding paste/serialization tests.
- Text color would require accepted product behavior, adding `TextStyle` and `Color`, allowing a `textStyle` mark with a constrained `color` attr, updating server validation/canonicalization, reader rendering, paste sanitization, lossless Markdown Source behavior, and persistence round-trip coverage.

Task 94 must not be toolbar-only. It requires canonical document-contract work before or together with its UI. If color is accepted, keep the palette constrained and semantic enough for documentation readability; do not introduce arbitrary CSS style persistence without server normalization.

Recommended follow-on shape after requirements reconciliation: if color capabilities are accepted, split into `94A Canonical Text Color/Colored Highlight Contract Foundation` and `94B Toolbar Color/Highlight UI`. If they are not accepted, keep the current uncolored semantic highlight and do not implement color UI.

## Change To / More

Decision: **Keep Docsera implementation** with **Adapt pattern/API** for menu organization only.

Docsera already owns mature block transformation, selection, focus, overlay, keyboard, and menu behavior. The TipTap Turn Into Dropdown is useful reference evidence for grouping and state presentation, but it is currently a Start-plan component and should not be adopted as source. It also should not replace `CompactTextToolbar`, `PageEditorHostRuntime`, or Docsera's block action ownership.

Smallest future change, only if accepted through requirements reconciliation:

- Move Blockquote from `MORE_MENU_ITEMS` in `CompactTextToolbar.tsx` into the existing Change to surface.
- Reuse the existing `blockquote` command semantics already present in `editorBlockCommands.ts` and the toolbar block-type command path rather than importing a new Turn Into component.
- Keep Superscript/Subscript in More and preserve their mutual exclusion behavior by retaining the current command contract that unsets the opposing mark.
- Reorganize More around existing Docsera menu primitives and tooltip styling instead of replacing overlays.

This would be a UI/command-surface refactor over proven command behavior, not a schema change for Blockquote, Superscript, or Subscript. It still requires an accepted requirement change because current accepted toolbar behavior places Blockquote in More.

## Text Alignment

Decision: **Adapt pattern/API**.

The official TextAlign extension is the right underlying editor capability if paragraph/heading alignment is accepted. It adds a `textAlign` attr to configured nodes, normally `paragraph` and `heading`. That is exactly why this cannot be treated as only a toolbar button.

Docsera implications, only if paragraph/heading alignment is accepted:

- Schema: add TextAlign configured for `paragraph` and `heading`; decide allowed values, likely `left`, `center`, and `right` first. Justify should be separately accepted because it has rendering and readability consequences.
- Server validation: allow a constrained `textAlign` attr on paragraph/heading and reject unrecognized values.
- Reader: render paragraph/heading alignment in `PublishedDocumentReader.tsx` without changing table-cell `align`.
- Markdown Source: define a lossless Docsera-specific representation if ordinary Markdown cannot preserve paragraph/heading alignment. Current Markdown conversion has no paragraph/heading alignment representation.
- Paste: decide whether pasted inline `text-align` is preserved only for allowed nodes/values or stripped.
- Persistence/tests: add canonical save/load, reader, Markdown, paste, and editor command tests.

Recommended sequencing after requirements reconciliation: Text alignment should be its own contract-plus-UI task before any menu exposes it.

## Indentation

Decision: **Do not adopt / defer**.

Current official TipTap support does not provide a general, open-source paragraph/heading indentation extension comparable to TextAlign. List nesting is supported through list commands such as `sinkListItem` and `liftListItem`. TipTap UI changelog notes `indent`/`outdent` commands as currently available only for the Notion-like template, so Docsera should not assume it can copy that behavior safely or license-neutrally.

Docsera must first define intended semantics:

- Is indentation document structure, visual offset, or list nesting?
- Does it apply to paragraphs/headings, lists, or both?
- How does it interact with blockquote, columns, tables, accordions, Markdown Source, reader rendering, paste, keyboard Tab/Shift+Tab, and accessibility?
- Is list indentation merely list nesting via existing list commands, or a separate paragraph attribute?

Recommendation: keep general indentation deferred to a dedicated semantics decision/spike unless explicitly accepted. A narrow list-only indent/outdent task may be acceptable later if it only exposes existing `sinkListItem`/`liftListItem` behavior and does not imply paragraph/headline visual indentation.

## Undo / Redo

Decision: **Keep Docsera implementation** with **Adapt pattern/API** for button state ideas.

Docsera's editor already uses `StarterKit`, and `schema.ts` does not disable `undoRedo`, so StarterKit owns history. `PageEditorHostRuntime.tsx` and existing implementation notes/tests already treat undo behavior as part of editor transaction/autosave boundaries. Task 96 does not need a new editor extension.

The TipTap UndoRedo UI component is a useful reference for accessible labels, disabled state, and `editor.can().undo()` / `editor.can().redo()` style availability checks, but Docsera should implement native controls in its own header/editor shell geometry. The controls must be right-aligned, move coherently with ToC width changes, and must not alter the established editor content lane.

Recommended Task 96 shape, only if visible right-aligned controls are accepted: UI-only controls against existing `editor.commands.undo()` / `editor.commands.redo()` and existing history owner, plus geometry/regression coverage for ToC expanded/collapsed states.

## Adoption Matrix

| Area | TipTap candidate | Decision | Docsera impact | Recommended follow-on task |
| --- | --- | --- | --- | --- |
| Overall template | Notion-like editor template | Do not adopt / defer | Reference only; paid/pro-license and cloud feature implications; no architecture replacement | None before Tasks 94-96; use as visual/interaction reference only |
| Text color | TextStyle + Color extension and color UI components | Candidate product change; adapt only if accepted | Would require new canonical `textStyle`/color contract, server validation, reader, paste, lossless Markdown, persistence tests | Requirements reconciliation first; then split into contract/foundation and UI tasks if accepted |
| Highlight color | Highlight `multicolor: true` and color-highlight UI | Candidate product change; adapt only if accepted | Current highlight is semantic/no attrs; colored highlight needs an accepted requirement change, constrained attrs, reader/paste behavior, and lossless Markdown | Requirements reconciliation first; then include in color contract/UI tasks only if accepted |
| Change to / Blockquote | Turn Into Dropdown reference / blockquote component | Keep Docsera implementation; candidate menu change | Moving Blockquote from More into Change to conflicts with current accepted toolbar behavior; no schema change if accepted | Requirements reconciliation first; then menu reorganization task if accepted |
| More menu | TipTap menu primitives / mark buttons | Keep Docsera implementation | Retain Superscript/Subscript mutual exclusion and current semantic highlight behavior unless requirements change | Requirements reconciliation first; then menu reorganization task if accepted |
| Text alignment | TextAlign extension + text-align UI | Candidate product change; adapt only if accepted | Would add paragraph/heading attrs; requires schema, validation, reader, lossless Markdown, paste, persistence work | Requirements reconciliation first; then alignment contract/foundation and UI tasks if accepted |
| Indentation | Notion-like indent/outdent, list lift/sink commands | Do not adopt / defer | General indentation semantics unresolved; list nesting is separate from paragraph/headline indentation | Dedicated semantics decision/spike unless explicitly accepted; optional later list-only command task |
| Undo / Redo | UndoRedoButton component; StarterKit Undo/Redo extension | Technically UI-only if accepted | Existing StarterKit history owner is enough; visible right-aligned controls need accepted product behavior and Docsera-native state/geometry | Requirements reconciliation first; then UI-only controls with geometry tests if accepted |

## Recommended Follow-On Sequence

1. Task 93 spike conclusion: do not adopt the Notion-like template or replace Docsera editor ownership; use open-source TipTap extensions and MIT Simple Editor components as evidence where they fit accepted Docsera behavior. Treat the Start-plan Turn Into Dropdown as reference evidence only.
2. Requirements/product-decision reconciliation owned by Jacob/ChatGPT. Decide whether to accept text color, colored Highlight, moving Blockquote into Change to, paragraph/heading alignment, general indentation, and right-aligned Undo/Redo controls. Do not assign Codex responsibility for deciding whether Docsera wants these product capabilities.
3. Decompose only accepted capabilities into contract/foundation and UI tasks. Any accepted canonical formatting state must include schema/server validation, reader rendering, paste behavior, lossless Markdown Source round-tripping, persistence tests, and then command/UI work.
4. Keep general indentation deferred to a dedicated semantics decision/spike unless explicitly accepted. Later list-only indentation can be considered separately if it only exposes existing list nesting commands.
5. If visible Undo/Redo controls are accepted, implement them as technically UI-only controls over the existing StarterKit history owner using Docsera-native state and geometry.

This sequence keeps each task reviewable and prevents a toolbar-first change from silently expanding the canonical document model.
