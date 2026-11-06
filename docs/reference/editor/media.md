# Editor media

This reference describes the implemented workspace-owned page-image media contract: storage, authorization, canonical references, rendering, and lifecycle. It does not define editor gestures, workspace-icon administration, or a general asset-management system. The general canonical document contract is in [editor document model and blocks](document-model-and-blocks.md); the Markdown representation of an image reference is in [editor Markdown and source](markdown-and-source.md).

## Ownership and storage

Page images are native ServiceNow `sys_attachment` records attached directly to the owning Docsera workspace record. An attachment's `sys_id` is the canonical `mediaId`. A page image block stores that reference; it does not embed file bytes, a Blob URL, or an arbitrary source URL.

The workspace media library is derived from qualifying attachments whose `table_name` is the Docsera workspace table and whose `table_sys_id` is the requested workspace. It is therefore workspace-scoped rather than page-owned: one attachment can be referenced by page content anywhere in that workspace, and an attachment can remain in the workspace even when no page references it.

Workspace icon assets are separate. They have their own asset records and provisioning/deletion path and are not page-image-library entries, even though workspace deletion also accounts for their attachment records.

## Service operations and authorization

The scoped media service supports three operations.

| Operation | Authorization and result |
| --- | --- |
| List workspace media | Requires effective workspace authoring capability (`canEditWorkspace` or `canAdminWorkspace`). It returns supported image descriptors for direct attachments of the requested workspace, newest first with deterministic ties, and filters attachments whose filename/content-type pair is unsupported. |
| Upload media | Requires the same authoring capability and a currently held workspace Edit lease. The API passes the raw request body stream to the service, which creates the native attachment on the workspace. |
| Retrieve media | Requires effective workspace viewing capability. The service verifies both the requested attachment identity and that it belongs directly to the requested workspace, then streams its supported image content through the scoped API. |

These are server-side authorization boundaries, not UI affordances. In particular, a reader can retrieve an image referenced by published content because retrieval requires viewing capability, while listing the authoring library and uploading require authoring capability. Reader access does not grant access to the authoring media library.

The routes return bounded safe errors for expected validation, authorization, missing-resource, size, and unsupported-type failures. Unexpected route failures are logged with bounded request metadata and return a safe error rather than attachment content or raw request values.

## Upload validation and persistence

The supported content types are JPEG (`image/jpeg` for `.jpg` or `.jpeg`), PNG, WebP, and GIF. The declared MIME type is normalized and must agree with the filename extension. The current maximum is `10 * 1024 * 1024` bytes (10 MiB), and an empty upload is rejected.

The filename is required and must not contain `/`, `\\`, or `..`; it must have a supported extension. Before writing, a reliable `Content-Length`, when present, is checked for zero length and the size limit. It is an early request hint, not the authoritative persisted-size check.

Within a workspace, an existing filename is preserved only when it is unique. A collision receives the first available `-1`, `-2`, and so on suffix before the original extension. This is filename collision handling, not content deduplication; duplicate bytes under a different collision-safe filename are accepted.

After `GlideSysAttachment.writeContentStream` creates an attachment, the service rereads it and verifies all of the following before returning a descriptor:

- the returned attachment identity;
- direct association with the intended workspace;
- a supported, matching filename/content-type pair; and
- a present, nonzero persisted `size_bytes` within the limit.

Any failed post-write check deletes the newly created attachment and returns an appropriate safe failure. The implementation validates metadata and persisted attachment state; it does not establish image-byte decoding, antivirus scanning, or content-signature verification.

## Canonical image document contract

An `image` is a canonical version-1 document block with these attributes:

| Attribute | Contract |
| --- | --- |
| `mediaId` | Required nonempty, trimmed workspace attachment reference. |
| `darkMediaId` | Optional nonempty, trimmed workspace attachment reference; canonical absence is `null`. |
| `alt` | String; default `""`. |
| `caption` | String; default `""`. |
| `frame` | Boolean; default `true`. |
| `align` | `left`, `center`, or `right`; default `left`. |
| `widthPct` | Finite number, canonicalized to the inclusive 20–100 range; default `100`. |

The version-1 document validator rejects undeclared image attributes and invalid values, then normalizes accepted values and completes defaults. Document data includes only these media references and presentation attributes: it excludes arbitrary `src` URLs, pixel dimensions, and separate light/dark URLs or alt text. See [editor document model and blocks](document-model-and-blocks.md) for the surrounding document model and [editor Markdown and source](markdown-and-source.md) for the `docsera-image` directive.

## Insertion and image options

The image picker reads the authorized workspace library. An author can select an existing descriptor or upload an eligible file; inserting creates a canonical image block with the selected attachment `mediaId`, rather than storing a source URL.

The Image Options surface maintains temporary panel-local draft values for the base/light media, optional dark media, alt text, and caption. Saving writes those values to the selected block's canonical attributes. The panel-local draft, current picker session, library labels, and loading state are transient UI state, not persisted document data.

Removing an image block removes only the document reference. It does not delete the underlying workspace attachment. No individual-media deletion action is implemented by this contract.

## Variant selection and presentation

The base `mediaId` is the light reference. In dark theme, the renderer selects `darkMediaId` when it is configured; when no dark reference is configured, it uses the base reference. Image-specific preview state can select the displayed theme in the editor, while the reader uses its active theme. That state is transient and does not alter the canonical attributes.

Both editor and reader present loading, ready, and unavailable states. A loading reference shows a quiet loading surface; an unavailable reference shows an accessible unavailable surface using authored alt text when present. A configured dark variant that fails to resolve remains unavailable in dark mode: it does **not** automatically fall back to the light image. The base image is used as the dark-theme fallback only when `darkMediaId` is absent.

When ready, the image uses the authored alt text and an optional caption. `frame`, `align`, and `widthPct` control the visible frame treatment, left/center/right placement, and responsive percentage width. The editor and published reader can open a ready image in the fullscreen viewer; fullscreen session geometry, current image source, focus restoration, animation phase, and viewer theme are transient display state.

## Browser media resources

The client retrieves authorized media through the scoped retrieval endpoint as a `Blob`, then creates a browser object URL for rendering. Blob URLs are local, temporary browser resources; they are neither persistent document data nor public image addresses.

Media loaders are asynchronous. They surface missing files, failed fetches, unavailable object-URL support, and absent loaders as unavailable state. On a changed reference, a new load, or teardown, the client aborts obsolete requests and ignores stale completions. Object URLs are revoked before replacement and on component/node-view cleanup. The editor node view applies the same model independently for its base and distinct dark references.

## Lifecycle and cleanup

Media remains attached to its workspace independently of page image blocks. Removing the final document reference does not trigger automatic orphan-media garbage collection, reference counting, deduplication, or an individual attachment-deletion API.

The upload path deletes only a newly created attachment that fails its post-write validation. Workspace deletion separately enumerates all direct workspace attachments and deletes them, then separately enumerates icon-asset attachments and deletes those as part of the icon lifecycle. It verifies the attachment records are gone with the rest of the deletion cleanup.

If workspace deletion has committed the workspace tombstone but cleanup or group deletion cannot complete, the service reports a committed-but-incomplete deletion and instructs the caller to retry cleanup. This is workspace-deletion recovery, not per-image garbage collection.

## Implementation and test evidence

Principal implementation files:

- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceMedia.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-media.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-media-upload.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-media-file.ts`
- `app/docsera-ui/src/server/pages/serverImageContract.ts`
- `app/docsera-ui/src/shared/editor/imageContract.ts` and `schema.ts`
- `app/docsera-ui/src/client/editor/ImagePickerDialog.tsx` and `ImageOptionsPanel.tsx`
- `app/docsera-ui/src/client/shared/media/useWorkspaceMediaObjectUrl.ts` and `ImageFullscreenViewer.tsx`
- `app/docsera-ui/src/client/features/workspaces/PublishedDocumentReader.tsx`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceDeletion.ts`

Focused coverage includes `serviceNowWorkspaceMedia.test.ts`, `docsera-runtime-workspace-media.test.ts`, `schema.test.ts`, `PageEditorHostRuntime.imageMedia.test.tsx`, `PublishedDocumentReader.test.tsx`, and `ImageFullscreenViewer.test.tsx` under the corresponding source areas.
