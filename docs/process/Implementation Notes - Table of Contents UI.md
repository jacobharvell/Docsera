# Implementation Notes - Table of Contents UI

## Summary

This note documents the current Workspace Table of Contents shell behavior in the SDK runtime.

## Current Behavior

- The right-side Table of Contents now renders as a single bordered rail instead of a plain aside plus a separate developer-status block.
- Visible placeholder and development artifacts were removed from the rail:
  - `No headings yet.`
  - `Developer Status`
  - `SUCCESS`
- The rail keeps the `On this page` heading visible in the expanded state, but empty heading data now renders as a visually clean shell with no placeholder copy.
- At widths above 1180px the ToC remains the right-side rail. At 1180px and below the entire aside, body, and toggle are hidden; it never relocates beneath the document and leaves no grid row or empty strip. Widening restores the mounted rail and its application-controlled collapsed state without a reload. Live and Edit use the same rule.
- Editor save state is separate from the ToC and appears subtly beside the stable header's Live/Edit toggle.
- TOC links now preserve the active workspace/page route and scroll the current document in place instead of letting a bare fragment hash re-enter Docsera route parsing.
- Pointer and keyboard activation both target the canonical heading id generated for duplicate headings; the browser URL stays on the existing workspace route.
- The visible active TOC item is transient component state. It starts on the first available heading, follows pointer and keyboard TOC activation, resets to the first heading when the page context changes, and falls back to the first heading if the active heading leaves the same page outline.
- Manual document scrolling does not change the active TOC item in this runtime slice; scroll-position-driven active tracking remains a future consideration.
- Heading navigation now uses one clearance rule for canonical body H1, H2, and H3 targets. The live reader and editor runtime both apply the same header-aware scroll margin so headings land fully below the fixed application header.
- The ToC resolver checks the live document first and then the workspace editor shadow root, so the same in-page navigation path works in Live and Edit without adding route state.
- The editor shadow-root fallback now filters out empty headings before applying the outline ordinal, so empty headings do not consume a ToC target and duplicate populated headings still resolve in canonical order.
- The ToC column stretches to the workspace track height, the full-height divider is carried by the stretched aside boundary, and the sticky rail uses the usable viewport height instead of inheriting the long document track.
- The sticky ToC rail reserves the workspace ToC gap at both the top and bottom of the viewport. This keeps the rail clear of the sticky containing block's bottom edge so fractional end-of-document layout coordinates cannot nudge the whole rail upward during final-heading navigation.

## Expanded State Convention

- The expanded rail uses the existing workspace right border as the primary frame edge.
- TOC items use compact prototype-aligned spacing and typography.
- Active TOC items use the Docsera primary color for both the text treatment and the vertical left indicator.
- Inactive items keep the neutral border line and switch to the primary color on hover.
- The neutral vertical rail is drawn continuously at the list level through the existing 4px inter-row spacing, while each row keeps its own active or hover rail segment layered over that baseline.
- TOC item typography and text position are geometry-stable across inactive, hover, and active states: active state does not change font weight, padding, border width, line height, row height, or heading-level indentation.
- Active and hover states use the same paint-only 2px Docsera-primary row rail overlay.
- State-specific row rail presentation is layered over the continuous neutral list-level baseline without changing row dimensions.

## Collapsed State Convention

- The TOC can be collapsed browser-side per workspace using local storage.
- Desktop collapse/expand motion is owned by the outer right rail width, not by nested TOC body/content transitions.
- The outer aside allows visible overflow so the attached tab stays visible outside the rail edge in both states.
- A dedicated inner clip wrapper hides only the fixed-width panel body during collapse.
- The collapsed state reduces the rail width to the right-edge affordance while leaving the toggle tab attached to the border line.
- The collapsed affordance is not a floating button. The chevron tab remains visually connected to the TOC frame.

## Chevron / Tab Treatment

- The TOC toggle is a local prototype-parity exception and does not use the shared Lucide-backed `DocseraIcon`.
- The TOC chevron uses a local custom SVG with wider prototype-style geometry at `14x14` and `stroke-width="1.5"`.
- The open state shows the prototype-style right-pointing collapse chevron.
- The collapsed state shows the opposite expand chevron.
- Hover treatment uses the Docsera primary color, matching the app's other icon hover patterns.
- Focus-visible treatment remains explicit for keyboard access.

## Dark Mode

- The TOC rail uses `#0B0E14` as its dark-mode background surface.
- The rail border and item text continue to use the existing shell tokens so the attached tab and active state remain legible in dark mode.

## Current Limitation

- Live workspace pages built from current ServiceNow page records still do not provide real TipTap heading extraction to the TOC.
- Demo-backed pages that already include section data still render TOC items, but live pages without section data intentionally render a clean empty shell until heading wiring is implemented in a later task.
- In this runtime slice, TOC navigation is intentionally in-page only. It does not add history entries or rewrite the Docsera hash route.

## Follow-ups

- Replace placeholder/demo TOC items with real TipTap or ProseMirror heading extraction once editor heading data is available.
- Revisit whether active TOC items should update from reader scroll position once the richer editor/reader surface is live.
