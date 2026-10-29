# Implementation Notes - Shared Tooltip Lifecycle

`DocseraCompactTooltip` in `app/docsera-ui/src/client/shared/tooltip/DocseraTooltip.tsx` is the shared tooltip lifecycle owner for compact and header controls.

- Pointer entry retains the existing 180 ms delay; intentional keyboard focus remains immediate.
- A blur of the tooltip's owning window, or a hidden owning document, cancels the pending hover timer and dismisses any visible tooltip.
- After inactivity, restored focus alone cannot reopen a tooltip. Owner-document keyboard activity re-enables immediate focus presentation, while intentional pointer entry re-enables the existing delayed hover presentation; arbitrary document-wide pointer movement does not count as either interaction.
- The component uses its supplied `ownerDocument` and that document's `defaultView`; all lifecycle listeners and timers are removed on unmount.
- The one-shot `data-docsera-suppress-focus-tooltip` marker suppresses known programmatic focus, including navigation-drawer focus restoration and initial image-viewer close-button autofocus, and is consumed before ordinary focus handling.

Focused regression coverage lives in `src/client/shared/tooltip/DocseraTooltip.test.tsx` and is assigned to the `shared-runtime` managed suite.
