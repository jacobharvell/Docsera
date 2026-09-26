# Live/Edit Content Lane Geometry

Docsera's Live and Edit page surfaces share one semantic document lane. The lane begins after the normal page horizontal padding and has the same usable content width in both modes so page titles and top-level document blocks do not shift or rewrap when toggling Live/Edit.

Edit mode reserves the authoring gutter outside that semantic lane. The current gutter is `69px`, matching the shared block-control geometry documented in the editor runtime interaction contract. The Edit surface therefore extends `69px` left of the Live surface and grows `69px` wider than the equivalent Live surface. Its left padding includes normal page padding plus the gutter, so:

- Live content left edge = live surface start + page padding.
- Edit content left edge = edit surface start + gutter + page padding.
- Edit surface start = live surface start - gutter.
- Edit outer width = live outer width + gutter.

The shared surface anchor is constrained only enough to keep the effective gutter from crossing the main-pane boundary. Since the effective gutter left edge is `shared anchor + page padding - gutter`, the shared minimum anchor is `max(page padding, gutter - page padding)`, expressed with the same CSS tokens that own the current padding and gutter sizes. When the centered surface calculation already exceeds that minimum, Live and Edit keep the centered anchor. When it would leave less clearance, the shared Live/Edit anchor moves right together and the semantic document lane narrows before the authoring gutter is reduced. This keeps the gutter interaction area inside the workspace main/editor-owned region at the supported `180px` minimum workspace navigation width without over-reserving horizontal space.

Below the `920px` breakpoint the generic surface rule uses the same minimum shared anchor instead of resetting the Live surface to `0`. Edit still applies the same gutter subtraction from that shared anchor. Below `680px`, normal page padding becomes `16px`; the shared anchor minimum remains token-derived as `max(16px, gutter - 16px)`, and Edit uses `16px + gutter` left padding so the gutter remains outside the semantic lane while Live/Edit content alignment is preserved.
