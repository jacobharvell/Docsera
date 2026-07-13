# Editor Host Flush Boundary and Header Root Cleanup

## Status

Implemented.

## Summary

`PageEditorHost` now exposes only the runtime overlay boundary that the editor needs. The obsolete `headerControlsRoot` contract has been removed from the host, runtime props, workspace pane wiring, and related fixtures.

The editor status/flush boundary remains parent-owned through `onStatusChange`, and the App-level route guard continues to use the returned `flush()` callback to decide whether dirty transitions may commit.

## Notes

* `overlayRoot` remains part of the runtime contract and is still used for slash, bubble, and link surfaces.
* Save-status rendering is owned by `DocseraHeader`, not by an editor-host portal.
* Tests cover the host-session flush boundary, route transition generation, and stale-session invalidation behavior.
