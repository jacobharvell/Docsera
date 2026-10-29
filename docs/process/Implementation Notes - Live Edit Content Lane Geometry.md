# Live/Edit Content Lane Geometry

Docsera's Live and Edit page surfaces share one semantic document lane. The lane begins after the normal page horizontal padding and has the same usable content width in both modes so page titles and top-level document blocks do not shift or rewrap when toggling Live/Edit.

Edit mode reserves the authoring gutter outside that semantic lane. The current gutter is `69px`, matching the shared block-control geometry documented in the editor runtime interaction contract. The Edit surface therefore extends `69px` left of the Live surface and grows `69px` wider than the equivalent Live surface. Its left padding includes normal page padding plus the gutter, so:

- Live content left edge = live surface start + page padding.
- Edit content left edge = edit surface start + gutter + page padding.
- Edit surface start = live surface start - gutter.
- Edit outer width = live outer width + gutter.

The shared surface anchor is constrained only enough to keep the effective gutter from crossing the main-pane boundary. Since the effective gutter left edge is `shared anchor + page padding - gutter`, the shared minimum anchor is `max(page padding, gutter - page padding)`, expressed with the same CSS tokens that own the current padding and gutter sizes. When the centered surface calculation already exceeds that minimum, Live and Edit keep the centered anchor. When it would leave less clearance, the shared Live/Edit anchor moves right together and the semantic document lane narrows before the authoring gutter is reduced. This keeps the gutter interaction area inside the workspace main/editor-owned region at the supported `180px` minimum workspace navigation width without over-reserving horizontal space.

At the compact `920px` breakpoint, Live reading intentionally stops sharing the editor-derived anchor. The Live surface is centered within the available main pane with balanced `24px` outer spacing and retains the normal `768px` maximum reading width. At `680px` and below, that balanced outer spacing tightens to `16px`. This removes the authoring-gutter reservation from compact Live without changing page padding, title/body rhythm, or the expanded desktop lane.

Compact Edit remains best effort and preserves the established authoring-gutter geometry: its surface continues to use the token-derived minimum anchor, gutter subtraction, and gutter-inclusive left padding (`24px + gutter`, tightening to `16px + gutter` below `680px`). Compact Live and Edit therefore no longer promise identical horizontal content alignment; the difference is deliberate because only Edit owns block controls.

The lightweight reader is a shrinkable containment boundary (`min-width: 0`, `max-width: 100%`) with wrapping for ordinary content. Images, callouts, accordions, columns, and nested content inherit that boundary. Columns keep equal-width desktop tracks and stack to one column at `920px`; wide tables and code blocks remain locally horizontally scrollable rather than widening or clipping the application.
