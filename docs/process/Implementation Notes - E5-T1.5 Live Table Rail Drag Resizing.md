# Implementation Notes - E5-T1.5 Live Table Rail Drag Resizing

Status: implemented on `feature/e5-t1-5-table-rail-resize`

## Scope

E5-T1.5 adds live pointer-drag resizing to the existing table add-row and add-column rails from E5-T1.2. The rails keep their click-to-add behavior, but a primary-button drag now resizes the table continuously as the pointer moves.

The new contract stays inside the current Docsera table overlay. It does not introduce separate resize handles, a global drag mode, or any new table persistence shape.

## Live Resize Contract

- The session captures the originating table size and trailing edge boundary at pointerdown.
- Pointer movement is compared only against that origin geometry, so live resizing stays stable even while the table DOM re-renders.
- The resize step is derived from the trailing row height or trailing column width at drag start.
- Moving farther across the origin step adds rows or columns one at a time.
- Moving back across the origin step removes rows or columns one at a time, but never below the 1x1 minimum.
- The final pointerup position is applied before the session closes, so the release point can still resize the table.
- The table wrapper remains the only horizontal overflow owner.
- The rails render in a fixed overlay layer that is separate from the scrolling table content.
- Column rail placement follows the live visible table edge.
- Row rail placement follows the live visible table width, and the bottom rail stays attached to the wrapper bottom edge that already carries the table's reserved scrollbar lane.
- When horizontal overflow is present, the right rail remains fixed at the visible viewport edge while the table content scrolls underneath it.
- Table content may auto-scroll during an active right-rail expansion to expose newly added columns, but that content movement does not reposition the rail or alter resize-count math.
- The resize delta never includes `scrollLeft`, `originScrollLeft`, or `scrollDelta`.
- The drag session still activates only after the pointer crosses a small axis-aligned threshold.
- The cursor lock now starts on rail pointerdown so the production runtime can show the accepted resize cursor immediately, even before the pointer crosses the activation threshold.
- The row and column rail `+` icons keep the muted default treatment and switch to the accepted primary hover color only on hover: `#4648D4` in light mode and `#7C83FA` in dark mode.

## Click, History, And Cleanup

When the drag activates, the overlay closes the current history boundary once and then runs the resize mutations with a shared transaction time so the drag settles as one undoable change instead of a long stack of tiny steps.

The trailing click after a completed drag is suppressed. That keeps the rail from both resizing on drag release and then immediately appending another row or column on the synthetic click that follows.

Cancellation and teardown follow the simplest recoverable contract:

- `pointercancel`, `lostpointercapture`, window blur, document visibility loss, and component teardown clear the active session.
- cancel and teardown do not leave a stale drag session behind.
- click suppression is only applied when a real drag completed, not when the session is cleared for cancel/blur/teardown.

The implementation also tolerates editor instances that do not expose TipTap `on/off` event methods, which keeps initialization-only test doubles from failing when the overlay mounts.

## Table Selection And Validity

Live resize keeps the trailing table selection valid while the table changes shape. The overlay refreshes the visible selection state after each mutation so the active table controls remain tied to the current live table geometry.

The 1x1 minimum is preserved for both row and column rails.

## Scroll And Cursor Ownership

The runtime and shell keep the table wrapper as the horizontal-overflow owner while leaving the vertical axis unclipped, matching the legacy table wrapper contract.

- `PageEditorHostRuntime.tsx` keeps the runtime wrapper `overflow-y: visible`.
- `runtime-shell.css` keeps the shell wrapper `overflow-y: visible`.
- Horizontal scrolling remains allowed and is preserved outside a resize session.
- The active resize cursor is locked at the page root for the duration of the session.
- Pointer capture loss, pointer cancel, blur, visibility loss, and teardown clear the lock and end the gesture.

## Deferred Indicator

The rail-resize dimension indicator is deferred pending a future product decision. This task removes the temporary rendering, state, and test coverage that previously surfaced it.

## Regression Coverage

The behavior is covered by `src/client/editor/PageEditorHostRuntime.commands.test.tsx`:

- bottom-rail drags resize live, reverse direction, suppress the trailing click, and stay on one undo step;
- right-rail drags keep the trailing cell selection valid and complete outside the rail;
- horizontal scrolling keeps the right rail aligned to the visible viewport edge and the row rail aligned to the visible table width while the bottom rail remains anchored to the wrapper's lower edge;
- active column drags can auto-scroll the wrapper content under the fixed rail while the cursor stays locked;
- manual horizontal scrolling outside a resize session preserves the rail alignment and does not change column count;
- 1x1 tables remain at the minimum, cancelled rail drags do not leave a stuck session, and teardown does not leave the rail interaction blocked;
- the resize badge is absent.

The initialization baseline is also covered by `src/client/editor/PageEditorHostRuntime.initialization.test.tsx`, which confirms the overlay does not require editor event APIs during the mock initialization path.
