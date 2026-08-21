# Implementation Notes - E5-T2.4 Image Metadata, Variants, and Staged Options

Date: 2026-08-20

Status: implementation note

## Scope

- The editor image-options surface stages light/default media, optional dark-mode media, shared alt text, caption, and frame changes until explicit Save.
- The Image Options panel is anchored to the top-right image-options trigger control, not to the full image block rectangle.
- Escape and outside-dismissal close the panel and discard staged edits without mutating canonical document content.
- Delete removes only the image block/reference and does not delete workspace media.

## Confirmed Implementation

- The image-options trigger retains its compact top-right hover position on the image block.
- The image hover UI now renders the full reference-like two-pill control set: a top-left light/dark preview pill and a top-right zoom/frame/alignment/Image Options pill.
- The Image Options panel now opens immediately beneath that trigger and remains right-aligned to the trigger geometry.
- The panel chrome was restructured into a compact header, divider, body, and footer, with a single-line caption field and a `Save Changes` footer action to match the accepted visual parity correction.
- Panel positioning is remeasured from the live trigger element so scroll, resize, and image geometry changes keep the panel attached to the same control.
- The panel UI was compacted to remove extra eyebrow/subtitle chrome and card-like subsections while preserving the same staged-edit fields and actions.
- The light and dark media metadata rows now render as compact read-only text inputs with muted styling, truncation, no edit affordance, and a fixed 34px field height.
- The read-only light and dark media fields now use the muted surface token for an immediately recognizable non-editable visual state while keeping the compact geometry unchanged.
- Loading media surfaces now use quiet accessible status placeholders instead of the earlier recovery-card or loading-row copy, and the loading child no longer introduces its own border or frame styling.
- The Select image dialog marks its library region busy with `aria-busy` during loading instead of rendering a visible loading row.
- Save still applies one canonical image-node mutation and preserves `align` and `widthPct`.
- Clearing dark media continues to save `darkMediaId: null`.
- Frame remains the accepted simple border-only treatment.

## Validation

- Focused runtime regressions cover trigger-relative anchoring, Escape dismissal without document mutation, the compact read-only media field contract, the quiet loading placeholder, and the busy-while-loading image picker library region.
