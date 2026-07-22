# Implementation Notes - Standalone TOC Overflow Fix

This note records the standalone runtime layout correction for the false horizontal overflow reported in the Direct UI Page shell.

## Root Cause

The collapsed Table of Contents rail kept its toggle button anchored with `left: -23px`.
Because the toggle is 24px wide, the collapsed rail could extend one pixel past the document viewport and raise `document.documentElement.scrollWidth` by 1px at normal desktop widths.

## Fix

- Move the collapsed TOC toggle anchor to `left: -24px`.
- Keep the toggle visible and clickable.
- Leave the workspace grid, navigation resizer, and Changes Center behavior unchanged.

## Verification

- Browser verification reproduces the standalone page at 1280px, 1440px, 1600px, and 1920px.
- The measured root width now stays within the viewport tolerance in both expanded and collapsed TOC states.
- The browser regression helper lives in `app/docsera-ui/scripts/verify-standalone-layout.mjs`.
