# Settings Panel Transition Presence

Task 110 adds a shared visual-presence boundary for Page Settings, Workspace Settings, and Manage Access.

The app's logical open/dismiss state remains authoritative for validation, autosave, access checks, keyboard handling, outside-click handling, nested dialogs, and membership operations. A closed panel may remain mounted for the 200ms visual exit interval only. During that interval the panel receives `aria-hidden` and `inert`, pointer events are disabled by CSS, and event listeners remain keyed to the existing logical `open` state.

Page Settings exits from its anchored position beside the workspace navigation. Workspace Settings and Manage Access exit from the viewport right edge. Entry and exit timing use the same 200ms `cubic-bezier(0.4, 0, 0.2, 1)` motion used by the accepted navigation and ToC transitions.

Closing Page Settings must not keep interactive field state active while the visual shell exits. The exiting panel therefore suppresses its active field presentation so inline page-tree rename can own focus and editing state after a valid Page Settings save.

Reduced-motion preferences disable the panel transition rules while preserving the same logical mount/dismiss contract.
