# Scrollbar ownership

Docsera-owned vertical scroll regions use theme-aware native scrollbars. The workspace navigation tree reveals its thumb from the sidebar hover or focus boundary; the ToC keeps its text anchor while reserving a separate gap beside the 4px scrollbar. Direct thumb hover and active interaction use a stronger color. Touch and Firefox receive native fallback styling.

The Recent Workspaces dropdown constrains only its list to the available viewport height, leaving the heading, divider, and footer outside the scroll region. Editor scroll styles are injected into their own runtime scopes; block-selector scrollbar measurement and row compensation remain authoritative for selector geometry. CodeMirror and document table scrollbars retain their own interaction contracts.

Native thumb rendering, pointer dragging, and visual clearance require browser acceptance; DOM/CSS tests cannot establish those platform behaviors.

Panel scrollbars reveal from their visible panel or menu hover and focus boundary. Add Members retains separate list ownership by column; page settings, image options, and table-control menus own their own scrollports. The overall page scrollport retains its native browser appearance.
