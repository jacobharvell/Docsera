# Task 87 Editor Paste Paragraph Normalization

Docsera normal editor paste remains owned by `PageEditorHostRuntime` through TipTap's paste pipeline. The runtime still delegates HTML and text transforms to `pasteSanitizer`; structured table clipboard handling remains a separate provenance-gated path and is not changed by this task.

Task 87 rechecked the confirmed Windows `.txt` source shape as a plain-text-only clipboard payload:

- raw clipboard text: `Alpha\r\n\r\nBeta`;
- Docsera `transformPastedText`: `Alpha\n\nBeta`;
- ProseMirror plain-text clipboard parser: splits consecutive CRLF/LF runs with `/(?:\r\n?|\n)+/`, producing only substantive paragraph DOM nodes;
- parsed Slice and inserted document JSON: two paragraph nodes, `Alpha` and `Beta`, with no canonical empty paragraph between them.

The preserved Legacy Docsera reference uses `Markdown.configure({ transformPastedText: true })`, but `tiptap-markdown` returns `null` from its `clipboardTextParser` when ProseMirror marks the paste as plain text. For a same-payload `.txt` paste with no `text/html`, legacy therefore falls through to the same ProseMirror plain-text parser behavior rather than Markdown-transforming the text.

The speculative HTML empty-paragraph normalization from the first Task 87 candidate was removed because the confirmed source path is plain text, not HTML, and no accepted behavior independently requires that HTML transform.

The confirmed native-paste failure had two stages, and the editable-state mismatch alone was not the complete root cause:

1. The active ProseMirror DOM could mount in a stale non-editable state even while the React/TipTap session intended `canEdit=true`. In that state ProseMirror did not take normal paste ownership.
2. After correcting editable-state reconciliation, installed-PDI diagnostics showed native `Ctrl+V` and mounted-editor `view.pasteText(...)` both reached ProseMirror's paste pipeline but threw synchronously in `transformPasted -> transformAccordionPastedSliceIdentities -> regenerateAccordionPastedSliceIdentities` while rebuilding the pasted `Fragment`.
3. That transform exception prevented ProseMirror from completing and preventing the native browser paste. Chromium then continued with `beforeinput insertFromPaste` on the contenteditable surface, which produced the unwanted generated empty paragraph nodes.

`PageEditorHostRuntime` now reconciles editable authority as soon as TipTap creates the editor: `onCreate` calls `editor.setEditable(...)`, restores the ProseMirror view editable flag through TipTap, sets the DOM tab index, and exposes an opt-in `__docseraEditableState()` diagnostic when editor diagnostics are enabled. The diagnostic reports the intended edit authority plus TipTap option state, `editor.isEditable`, ProseMirror `view.editable`, and DOM `contenteditable`; the native-paste verifier treats that diagnostic as the authoritative editable-state source instead of requiring private ProseMirror view internals for success.

Accordion paste identity regeneration now rebuilds ProseMirror fragments by iterating actual child nodes from the source `Fragment` and passing only regenerated `PMNode` children into `Fragment.fromArray`. This keeps ordinary non-accordion pasted content structurally unchanged, recursively preserves descendants and marks, regenerates `accordionId` and `accordionItemId` values for copy/paste, and leaves active in-editor move drags on their existing identity-preserving path.

The durable native-paste verifier creates disposable runtime data through the normal workspace/page APIs and cleans it up through the scoped workspace deletion lifecycle. It does not directly delete workspace or group records through the Table API.

Regression coverage:

- `src/client/editor/pasteSanitizer.test.ts` covers hard-break preservation, line-ending normalization, and unsafe markup filtering.
- `src/client/editor/PageEditorHostRuntime.core.test.tsx` covers plain-text-only `Alpha\r\n\r\nBeta`, `Alpha\n\nBeta`, three CRLF-separated paragraphs, accepted single-newline plain-text paste behavior, URL autolinking, hard-break preservation, supported rich HTML structure and marks, and unsafe markup filtering through the runtime paste path.
- `src/client/editor/PageEditorHostRuntime.initialization.test.tsx` covers stale non-editable creation state and proves `onCreate` itself restores TipTap option state, `editor.isEditable`, ProseMirror `view.editable`, and DOM `contenteditable` before the normal hook-level editable effect can mask the regression.
- `src/client/editor/PageEditorHostRuntime.accordion.test.tsx` covers direct pasted-Slice accordion identity regeneration, non-accordion multi-paragraph Slice preservation, nested ordinary content and mark preservation, serialized accordion HTML paste, and active move-drag identity preservation.
