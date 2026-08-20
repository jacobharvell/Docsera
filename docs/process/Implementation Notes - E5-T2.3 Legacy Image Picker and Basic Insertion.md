# Implementation Notes - E5-T2.3 Legacy Image Picker and Basic Insertion

Date: 2026-08-19

Status: implementation note

## Scope

- The editor routes the `image` block command through an in-editor image picker instead of inserting an image immediately from the slash menu.
- The ServiceNow client exposes the workspace media list, upload, and authenticated binary media loader used by the picker, editor image nodes, and published reader.
- Runtime image rendering uses temporary object URLs created from loaded blobs; canonical document JSON remains media-ID based and URL-free.

## Confirmed Implementation

- The editor command registry now includes `image` as a first-class block command.
- Triggering the image command opens an editor-local overlay dialog mounted in the page editor overlay root.
- The picker loads the current workspace media library on open and supports selecting an existing asset or uploading a new one.
- Workspace media thumbnails and runtime image rendering load protected bytes through the authenticated ServiceNow client boundary, then project them into temporary `URL.createObjectURL(...)` values for presentation.
- The client does not persist blob URLs or protected REST URLs in canonical image JSON.
- Uploads are validated in the client before they are sent to the workspace media service.
- Slash-triggered image insertion preserves the exact empty paragraph range owned by the slash selector so nested empty table-cell paragraphs can be replaced in place.
- Quick Add image insertion keeps the placeholder replacement in the originating history transaction so one undo removes the generated paragraph and inserted image together.
- Edit-mode image presentation is owned inside the editor shadow runtime, including neutralized native figure margins and the basic width/alignment/frame/caption projection for canonical attrs.
- Published reader rendering uses the authenticated binary loader and temporary object URLs, with lifecycle cleanup on change, destroy, close, or unmount.
- The picker presentation was simplified to a compact centered dialog with a simple title, search field, thumbnail grid, upload tile, and compact upload view.
- The picker stays within the existing workspace-authoring and media-service boundary established by E5-T2.2.

## Boundary Notes

- The media picker does not introduce client-owned media state beyond transient dialog, node-view, and reader rendering state.
- In-flight media loads are treated as session-owned and are invalidated or aborted when the owner changes or becomes stale.
- The implementation remains inside the existing workspace-authoring and media-service boundary established by E5-T2.2.

## Validation

- Managed frontend validation was run for the affected editor, reader, and client media boundaries.
- Regression coverage was added for:
  - authenticated workspace media binary loading
  - picker thumbnail and upload preview object-URL lifecycle
  - editor image node-view object-URL lifecycle
  - published reader object-URL lifecycle
  - editor ShadowRoot image presentation
  - compact picker shell contract
