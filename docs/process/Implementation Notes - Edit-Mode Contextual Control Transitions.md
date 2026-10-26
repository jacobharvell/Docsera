# Edit-Mode Contextual Control Transitions

## Current behavior

The Edit-only header controls use retained layout containers: the Visual/Markdown toggle, autosave/Publish panel, and Workspace Settings gear fade their opacity over 180ms when Edit visibility changes. Their dimensions remain reserved, and hidden controls are immediately `inert`, `aria-hidden`, and disabled where applicable; the transition never delays a valid command or leaves an Edit command usable in Live mode.

The editor-pane Undo, Redo, and emoji controls use the existing Visual/Edit mount boundary. For a workspace-scoped Live-to-Visual/Edit reveal, the persistent mount gets an explicit presentation attribute: `pending` holds the same control group at opacity zero until editor readiness; `enter` runs its accepted 260ms opacity entrance; and no attribute means idle, fully visible presentation. The controls are removed immediately on Edit-to-Live because retaining the editor command mount solely for exit presence would complicate the established editor session and overlay lifecycle.

## Boundaries

- Visual/Markdown surface changes, ordinary page navigation, and autosave-status updates do not create a transition marker.
- Mode controls, account/theme controls, breadcrumbs, navigation, and ToC are excluded.
- `prefers-reduced-motion: reduce` disables these contextual-control transitions.
- The existing command-control mount remains stable for same-workspace page navigation.
- The external mount is committed before the editor runtime's asynchronous import builds its initial props, so normal workspace initialization does not render the runtime's standalone fallback controls.
