## Workspace Body Scroll Owner

Docsera keeps vertical content scrolling below the workspace header. The browser document is not the normal scroll owner for Docsera content.

`.docsera-app` occupies the viewport as a fixed-height flex shell and hides document-level overflow. `.docsera-header` is the first, non-scrolling flex child. `.docsera-app__body` is the second flex child and owns vertical scrolling with native `overflow-y: auto` and `scrollbar-gutter: stable`.

Because the scrollbar gutter belongs to `.docsera-app__body`, the header remains outside the scrollport and spans the full physical viewport width. The workspace body, sidebar, main pane, and Table of Contents keep the same horizontal geometry whether a page is short or long, and Live/Edit transitions do not move shell content merely because vertical overflow changes.

The app does not measure scrollbar width in React, does not maintain a CSS reserve variable, and does not compensate the header with negative margins or extra inline padding. Native scrollbar appearance is preserved.

Heading and Table of Contents navigation use the app body scrollport. The accepted heading top gap is represented by `.docsera-app__body` scroll padding and matching heading scroll margins, without adding the workspace header height as an offset.

The header divider between the leading cluster and right-side actions remains owned by `.docsera-header__actions::before`. Edit mode paints it normally; Live mode applies `.docsera-header--live` and makes only that pseudo-element background transparent so its layout footprint is preserved.
