# Implementation Notes - E5-T2.5 Image Frame, Alignment, and Responsive Resize

Date: 2026-08-21

Status: implementation note

## Scope

- The editor image hover controls now expose a frame toggle, a compact alignment menu, and left/right percentage resize handles.
- Frame, alignment, and width changes are applied inside the editor host boundary and remain canonical image-node attributes.
- Resize uses live pointer preview while the gesture is active and commits the final percentage as one undoable mutation.
- Published reader rendering projects the same canonical image attributes into responsive width, frame, and alignment presentation.

## Confirmed Implementation

- The image hover controls keep the accepted two-pill layout and now include `Zoom`, `Frame`, `Alignment`, and `Image options` actions.
- Toggling frame updates the image node immediately and participates in normal undo/redo history.
- The alignment button opens a compact menu with left, center, and right choices, keeps the current choice selected, and closes on Escape or outside dismissal.
- The resize handles preview width changes continuously during pointer drag, clamp to the supported range, and restore the previous committed width when a gesture is canceled.
- The resize commit path records a single final mutation so undo returns to the prior committed width rather than replaying intermediate drag states.
- The control overlay stays anchored to the active image block and remeasures on editor layout changes so the menu and handles remain attached to the correct image.
- Published reader output preserves `frame`, `align`, and `widthPct` on the rendered image wrapper and uses percentage width for responsive display.

## Boundary Notes

- The image frame is a presentation toggle, not a separate document shape or a new media persistence model.
- Alignment is limited to the accepted left, center, and right contract already represented by the image schema.
- The resize gesture does not introduce shared client state beyond the transient editor overlay and live drag preview.

## Validation

- Managed frontend validation was run for the affected editor and reader suites.
- Regression coverage was added for:
  - immediate frame toggle with undo/redo
  - compact alignment menu selection
  - live percentage resize preview, cancel restore, and committed undo/redo
  - published reader rendering of framed, aligned, responsive images
