# Implementation Notes - E5-T2.6 Image Preview, Fullscreen Viewer, and Compact Controls

Date: 2026-08-21

Status: implementation note

## Scope

- The editor now supports transient light/dark image preview state in edit mode without mutating canonical document JSON.
- The shared fullscreen image viewer is used by both edit and live reader surfaces and animates between the source image rect and a centered viewport target.
- Editor image controls keep the accepted standard top-level presentation with Light and Dark directly visible at the top-left and Zoom, Frame, Alignment, and Image Options directly visible at the top-right.
- A compact overflow presentation exists as a separate reusable variant for future narrow or nested contexts, but it is not enabled for normal top-level images in E5-T2.6.
- Live reader images remain keyboard accessible and open the same fullscreen viewer without exposing author-only controls.

## Confirmed Implementation

- Light and Dark preview changes live in a shared client-only image display store, are scoped by image block index, and do not trigger autosave or undo history changes.
- Dark preview uses the configured `darkMediaId` when available and falls back to the light image when no dark asset exists.
- The fullscreen viewer preserves aspect ratio, caps the expanded image at natural size, and omits the caption and frame chrome in fullscreen mode.
- The viewer closes from the backdrop, image surface, close button, or Escape key, and focus is restored to the originating control after dismissal.
- While fullscreen is open, the obscured document scroll state is locked and restored exactly on close or unmount.
- Document-level scroll suppression ignores interactive controls, so the focused close button still honors native Enter and Space activation semantics.
- Reduced-motion preference bypasses the grow/shrink animation while keeping the dismissal behavior intact.
- Published reader images open the fullscreen viewer from a button surface with a centered caption beneath the image.
- Published reader envelope transitions and page-identity changes clear any active fullscreen viewer so stale page state cannot retain a previous image viewer, even when the underlying JSON is byte-for-byte identical.

## Boundary Notes

- The image preview state is transient UI state only and is intentionally separate from canonical document persistence.
- Fullscreen viewer mounting is controlled by the host surfaces so the close animation can complete before the viewer is removed.
- The compact control grouping keeps the existing image node contract unchanged; it only rearranges editor chrome.

## Validation

- Managed frontend validation was run for the affected editor and reader suites.
- Regression coverage was added for:
  - transient dark preview with and without a dark asset
  - fullscreen viewer open and close focus restoration
  - fullscreen viewport scroll locking and exact restore on dismissal
  - live reader fullscreen activation and Escape dismissal
  - standard direct editor image control grouping and the reusable compact action presentation contract
