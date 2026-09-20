# Live/Edit Content Lane Geometry

Docsera's Live and Edit page surfaces share one semantic document lane. The lane begins after the normal page horizontal padding and has the same usable content width in both modes so page titles and top-level document blocks do not shift or rewrap when toggling Live/Edit.

Edit mode reserves the authoring gutter outside that semantic lane. The current gutter is `69px`, matching the shared block-control geometry documented in the editor runtime interaction contract. The Edit surface therefore extends `69px` left of the Live surface and grows `69px` wider than the equivalent Live surface. Its left padding includes normal page padding plus the gutter, so:

- Live content left edge = live surface start + page padding.
- Edit content left edge = edit surface start + gutter + page padding.
- Edit surface start = live surface start - gutter.
- Edit outer width = live outer width + gutter.

This relationship intentionally remains true when the normal main-surface anchor is smaller than the gutter width. In that case the Edit surface may have a negative inline-start margin, but the semantic content lane still aligns with Live and retains the same width.

Below the `920px` breakpoint the generic surface rule resets the Live surface margin to `0`. Edit still applies the same gutter subtraction from that reset anchor. Below `680px`, normal page padding becomes `16px`; Edit uses `16px + gutter` left padding so the gutter remains outside the semantic lane while Live/Edit content alignment is preserved.
