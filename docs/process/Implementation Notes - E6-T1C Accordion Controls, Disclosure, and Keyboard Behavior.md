# Implementation Notes - E6-T1C Accordion Controls, Disclosure, and Keyboard Behavior

## Scope

- Align accordion clipboard regression coverage with ProseMirror's real clipboard serialization path instead of synthetic NodeView-only HTML.
- Keep accordion disclosure presentation transient while ensuring rendered open/closed state follows explicit disclosure and authoring actions only.
- Preserve the existing one-item minimum, zero-open disclosure behavior, title Enter behavior, and duplicate identity regeneration.

## Durable Behavior

- Accordion paste coverage now constructs canonical ProseMirror slices from the editor schema and serializes them with `editor.view.serializeForClipboard(...)` before exercising the existing paste path.
- Accordion identity regeneration is bounded to copy semantics. Normal paste, external dropped copied content, and in-editor copy-drag content regenerate Accordion and Accordion-item identities, while in-editor move drags preserve the existing canonical identities by honoring ProseMirror `view.dragging.move`.
- `accordionItem.parseHTML()` no longer depends on the NodeView-only `data-docsera-accordion-item-content` wrapper. Clipboard parsing follows the schema-backed DOM that ProseMirror actually emits.
- Accordion disclosure is action-driven presentation-only state. Disclosure button activation, inserting a new Accordion, adding a new item, and pressing Enter from an Accordion title may update the rendered `data-docsera-accordion-open` state without mutating document JSON, adding undo entries, or triggering autosave; moving selection or focus into an Accordion title or body does not itself change disclosure state.
- The lightweight Live Accordion owns the normal semantic presentation baseline for Accordion border, background, separators, row rhythm, title typography, disclosure/title alignment, expanded-body spacing, and collapsed-panel zero-height behavior. Edit-mode author-only controls are separate chrome and must not change that normal Accordion geometry.
- Editor `onUpdate` no longer suppresses invalid document validation errors for accordion paste. Normal accordion paste behavior is expected to produce canonical document state directly.
- The final accordion item now owns a persistent invisible add interaction lane that spans the full hidden add-button footprint and keeps the add affordance reachable from any approach direction without changing layout.
- The accordion item menu now uses the shared destructive block-menu presentation for `Delete item`, including the standard trash icon, icon/label structure, and disabled-state styling when only one accordion item remains.

## Validation Coverage

- `src/client/editor/PageEditorHostRuntime.accordion.test.tsx` covers serializer-based accordion paste identity regeneration, surrounding-content and multi-accordion paste preservation, explicit disclosure toggle behavior, selection/focus preserving rendered disclosure state, one-item floor, nested body keyboard behavior, title Enter, initial Accordion insertion, duplicate fresh identities, the final-item add interaction lane, and destructive delete menu presentation.
