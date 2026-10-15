# Unicode Emoji Picker

Task 127 adds an Edit/Visual-only Unicode emoji picker as editor-owned command chrome. It is portaled into the existing presentation-only editor-controls mount beside, but separately grouped from, Undo and Redo. The workspace shell does not own selection, command execution, or picker state.

The picker captures the active TipTap text selection when opened. Choosing an emoji restores that captured range in the active editor and inserts the Unicode string through one TipTap command chain, so a caret insertion or replacement is one ordinary undoable document edit. Emoji remain text in the canonical document; no node, asset, service, or persistence path is introduced.

The lightweight built-in catalog includes accessible labels and search terms, supports arrow-key movement, Enter selection from search, Escape dismissal, and owner-document outside-pointer dismissal. Picker interactions prevent trigger pointer-down selection loss and restore editor focus after insertion or ordinary dismissal. A replacement editor session, inactive Visual surface, or loss of editability closes/invalidates the picker without a document change.

The bundled local catalog covers common faces, people and gestures, hearts and symbols, documents and work/technology, travel, nature, food, and everyday status markers. Its results are a labeled native-button group, rather than an incomplete ARIA grid. Left and Right remain native search-input editing keys; Down enters the first result, and result buttons provide bounded visual-row arrow navigation (with Up returning from the first row to search).

Focused coverage is in `EmojiPickerControls.test.tsx`, including caret insertion, selected-text replacement, multi-codepoint preservation, undo/redo, category searches, accessible result semantics, keyboard and outside dismissal, focus restoration, and replacement-session invalidation. The suite manifest assigns it to `editor-interactions`.
