# Implementation Notes - E5-T2A ServiceNow Media Boundary and TipTap Ownership Spike

## Status

Spike note for E5-T2A. This records the repository and platform contract for Docsera workspace media before E5-T2 implementation starts.

## Evidence Reviewed

- Accepted requirements in `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\Requirements\40 Editor.md`
- Accepted implementation map in `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\MVP Implementation Plan.md`
- Current repo at `main` / `91f8c006f74305588d85079c490b5f86e8233d5f`
- Current Docsera editor schema and reader code in `app/docsera-ui`
- Legacy shell image normalization in `app/docsera-shell/src/pages/page-editor.js`
- TipTap `@tiptap/extension-image@3.27.3` source from the npm tarball
- Official ServiceNow docs:
  - [Attachment API](https://www.servicenow.com/docs/r/api-reference/rest-apis/c_AttachmentAPI.html)
  - [Scoped GlideSysAttachment](https://www.servicenow.com/docs/r/api-reference/server-api-reference/c_GlideSysAttachmentScopedAPI.html)
  - [Global GlideSysAttachment](https://www.servicenow.com/docs/r/api-reference/server-api-reference/GlideSysAttachmentGlobalAPI.html)
  - [Disable attachments on a table](https://www.servicenow.com/docs/r/platform-administration/disable-attachments-on-table.html)
  - [Controlling maximum request size](https://www.servicenow.com/docs/r/api-reference/rest-api-explorer/r_ControllingMaxRequestSize.html)

## Confirmed Contract

### 1. Simplest viable ownership model

Docsera does not need a separate durable media entity to satisfy the accepted E5-T2 requirements.

The simplest viable model is:

- upload media as attachments owned by the workspace record
- treat the attachment sys_id as the stable media reference
- keep media bytes on ServiceNow, not in page JSON
- keep the document node and the media bytes separate

Why this is the right starting point:

- ServiceNow attachments are record-scoped
- `getAttachments(tableName, sys_id)` lists attachments for a parent record
- `writeContentStream` and `writeBase64` insert attachments onto a record
- `copy()` copies attachment bytes, which E5-T2 does not want on publish

Conclusion:

- Attach assets directly to the workspace record for E5-T2.
- Do not add a separate media table unless later work proves the workspace-attachment model is too coarse for library metadata, search, or admin tooling.

### 2. Correct TipTap ownership split

TipTap Image 3.27.3 is URL-centric. Its normal `src` attribute, URL-oriented parse/render/insertion behavior, Markdown/input-rule behavior, and native pixel width/height resize contract are not Docsera's canonical media contract.

Docsera may extend or reuse TipTap Image for neutral behavior that remains compatible, such as image node/block semantics and draggability.

URL-centric upstream behavior must be overridden, disabled, or bypassed where necessary rather than inherited unchecked.

The E5-T2.1 canonical image attrs are:

- `mediaId`: required stable workspace media/attachment id
- `darkMediaId`: optional/null stable workspace media id
- `alt`: string, default `""`
- `caption`: string, default `""`
- `frame`: boolean, default `true`
- `align`: `"left" | "center" | "right"`, default `"left"`
- `widthPct`: number, default `100`, normalized and clamped to `20` through `100`

Canonical JSON must not persist:

- raw or resolved `src`
- raw ServiceNow URLs
- `title`
- TipTap native numeric `width`
- TipTap native numeric `height`

Picker-driven Docsera insertion creates an image node using `mediaId`, not a resolved `src`.

Media URLs are runtime resolution only.

TipTap native resize remains disabled or not authoritative because it commits pixel width and height rather than Docsera's responsive percentage contract.

Do not require a particular implementation technique, such as `Image.extend` versus a narrowly custom node, if repository implementation evidence later shows one is safer. The required outcome is one canonical Docsera image contract with no competing URL-backed image path.

Alt-text behavior:

- `alt` is the single author-provided alt-text value for the image block
- the same `alt` value is used whether the light/default or dark media variant is rendered
- `darkMediaId` still falls back to `mediaId` when no dark variant is configured
- no separate light or dark alt fields exist in canonical JSON or the E5-T2 image options UI
- absent author-provided alt text is represented as `alt: ""`
- Docsera does not generate alt text from the filename or another source
- legacy `lightAlt` and `darkAlt` behavior is intentionally not carried forward

### 3. Correct the authorization model

Docsera server media routes explicitly enforce the existing workspace capability model before any media operation.

Do not rely on Attachment REST API role or ACL behavior as Docsera's primary authorization boundary.

Native ServiceNow attachment and table policy remains defense in depth and a possible platform rejection source.

Operation authorization:

- binary media resolve or retrieval requires current workspace view access
- media-library enumeration requires workspace authoring access
- upload requires workspace authoring access

Required checks:

- verify that the requested attachment has the requested `mediaId`
- verify that it is attached to `x_82900_docsera_workspace`
- verify that `table_sys_id` equals the authorized workspace
- verify that it has a supported image filename extension, a supported image MIME type, and a compatible extension and MIME pair

Knowing an attachment sys_id alone never grants Docsera media access.

Because upload is a durable mutation initiated from Edit, E5-T2.2 should reuse or validate the repository's existing Edit-session or lease mutation boundary where the current architecture requires it. Do not invent a separate media lease model in this spike.

### 4. Resolve the media-library discriminator question

Do not introduce a media table, attachment attribute, or custom tag for hypothetical future collisions.

Initial E5-T2 library definition:

> All supported image attachments directly owned by the Docsera workspace record.

List only workspace-owned JPEG, JPG, PNG, WebP, and GIF attachments.

A Docsera media attachment qualifies only when:

- its filename extension is supported
- its MIME type is supported
- the extension and MIME type are compatible

Supported mappings:

- `.jpg`, `.jpeg` -> `image/jpeg`
- `.png` -> `image/png`
- `.webp` -> `image/webp`
- `.gif` -> `image/gif`

Add a discriminator later only if concrete repository or platform evidence establishes another first-party class of supported-image attachments on workspace records.

Remove this from unresolved wiring.

### 5. Reader-source architecture

`PublishedDocumentReader` remains TipTap-free, synchronous, and platform-neutral.

Reader rendering receives or uses a narrow runtime media-source resolver equivalent to:

`resolveMediaSource(mediaId: string): string | null`

Workspace and application context supply the current workspace identity needed to construct the authorized Docsera media source.

The resolved source is runtime-only and is never written back to canonical document JSON.

Dark-mode media selection resolves `darkMediaId` when present and otherwise `mediaId`.

The exact TypeScript name may be chosen during implementation; this architecture is fixed.

Remove the general exact reader-side resolved-source shape question from unresolved wiring.

### 6. Recommended server transport contract

Following the current Docsera runtime API conventions, the recommended E5-T2.2 route shape is:

- `GET /workspaces/media`
  - query: `workspaceSysId`
  - JSON workspace media descriptors

- `POST /workspaces/media`
  - query or context includes `workspaceSysId` and chosen `fileName`
  - request body is raw image data
  - request content type is the actual supported image MIME type
  - response is the created media descriptor

- `GET /workspaces/media/file`
  - query: `workspaceSysId`, `mediaId`
  - authorized binary image response

Exact DTO and function identifiers remain implementation details.

Upload transport:

- consume the Scripted REST request input stream
- `request.body.dataStream` is intentionally used for streaming uploads and is not protected by the normal Scripted REST body-size limit
- use `GlideSysAttachment.writeContentStream(...)`
- do not base64-encode the normal 10 MB upload path
- do not call the native ServiceNow Attachment REST API directly from the browser

Server-side 10 MB enforcement:

1. If a reliable `Content-Length` is present and exceeds 10 MB, reject before creating the attachment.
2. Otherwise stream the request into the workspace attachment using `writeContentStream`.
3. Read the created attachment's authoritative persisted size.
4. If it exceeds 10 MB, immediately delete that newly-created attachment and return an upload-too-large failure.
5. Return the media descriptor only after the attachment passes the authoritative size check.

Retrieval transport:

- authorize workspace access
- verify workspace attachment ownership and type
- use `GlideSysAttachment.getContentStream(mediaId)`
- stream it through the Scripted REST response stream writer
- return the attachment's validated image content type

This avoids the scoped 5 MB `getContent()` and `getContentBase64()` ceiling.

### 7. Size validation

Keep the accepted authoritative 10 MB server-side limit.

Client validation may improve UX, but it is never authoritative.

The server-side upload path must enforce the limit using the transport contract above rather than trusting the client or a preflight alone.

### 8. Publishing

Make explicit that no media-specific publish copy operation is required:

- canonical draft and published JSON carries stable media ids
- existing document publication promotes those references and metadata
- media bytes remain one workspace-owned attachment
- no attachment copy occurs during publish

### 9. What current repo code already implies

The current repo confirms that E5-T2 starts from a schema that does not yet own images:

- `createDocseraEditorExtensions()` does not install TipTap image support
- current structured document validation rejects `image`
- current reader rendering rejects `image`
- the historical shell normalizes `image` as a URL-based node, which is useful as behavior evidence but not as the implementation model

That means E5-T2 is adding a new media contract, not polishing an existing one.

## Impact On E5-T2.1 Through E5-T2.7

- E5-T2.1 should define the canonical image node around stable media ids and reader-safe rendering, not around URLs
- E5-T2.2 should implement workspace-owned attachment persistence, list/upload/lookup/retrieval, supported-type validation, and newest-first library ordering
- E5-T2.3 should wire the picker and insertion flow to the media adapter, not to direct attachment APIs
- E5-T2.4 should keep metadata on the image node, not in the raw attachment record
- E5-T2.5 should own percentage-width resize behavior because TipTap native resize is pixel-based
- E5-T2.6 should resolve previews and zoom through the media boundary and keep nested controls compact
- E5-T2.7 should verify publish, discard, page-delete behavior, unauthorized access failures, and no-byte-copy publish semantics

## Unresolved Wiring

Still open for implementation, not for product re-decision:

- exact code-level route, DTO, and function names
- PDI-specific attachment or table policy or ACL friction found during implementation

None of those uncertainties change the core contract above.
