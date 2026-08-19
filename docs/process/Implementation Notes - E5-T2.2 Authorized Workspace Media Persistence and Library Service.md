# Implementation Notes - E5-T2.2 Authorized Workspace Media Persistence and Library Service

## Status

Established implementation note for the E5-T2.2 workspace media service and library boundary.

## Confirmed Implementation

The workspace media service stores media as direct workspace-owned `sys_attachment` records.

Confirmed attachment contract:

- attachment table: `x_82900_docsera_workspace`
- attachment `sys_id` is the stable `mediaId`
- descriptor fields: `mediaId`, `fileName`, `contentType`, `sizeBytes`, `createdOn`, `updatedOn`

Confirmed routes:

- `GET /workspaces/media`
- `POST /workspaces/media`
- `GET /workspaces/media/file`

Library and upload access rules:

- list requires workspace authoring capability
- list does not require a held workspace Edit lease
- upload requires workspace authoring capability plus a held workspace Edit lease
- upload does not require or mutate `expectedChangeSetId` or `expectedChangeSetRevision`
- upload is durable immediately

Upload transport and validation:

- raw non-JSON upload uses `request.body.dataStream`
- supported content types are `image/jpeg`, `image/png`, `image/webp`, and `image/gif`
- supported filename mappings are `.jpg`/`.jpeg` -> `image/jpeg`, `.png` -> `image/png`, `.webp` -> `image/webp`, and `.gif` -> `image/gif`
- exact server upload limit is 10 MB
- reliable `Content-Length` is checked before attachment creation
- persisted attachment size is checked after write
- zero-byte or oversize persisted uploads are deleted immediately
- filename collisions use `name.ext`, `name-1.ext`, `name-2.ext`, and so on

Retrieval contract:

- retrieval requires workspace view access
- retrieval resolves workspace attachment ownership and supported image type first
- retrieval uses `GlideSysAttachment.getContentStream()`
- the response streams the attachment through the Scripted REST response stream writer
- a missing or unavailable attachment content stream returns the safe `404 Media could not be found` boundary

Library scope:

- the library contains all supported direct workspace image attachments
- no delete, orphan, publish-copy, or separate media lifecycle is introduced

Server boundary:

- the deployable server runtime boundary remains explicit and `.ts`-based
- the service continues to depend on the server-runtime module graph already established in `app/docsera-ui/src/server`

## Notes

This document records confirmed implementation behavior only. It does not change product requirements.

## Installed Runtime / PDI Validation

- Deployed code commit: `6f2e462bf28de39834c915baafe9c824f8e8c144`
- SDK install and runtime verification succeeded.
- All three installed media routes loaded without HTTP 500 or `ModuleResolutionException`.
- Controlled missing-workspace probes returned Docsera `404` responses for:
  - `GET /workspaces/media`
  - `POST /workspaces/media`
  - `GET /workspaces/media/file`
- The POST route accepted a raw `image/png` request body at the installed Scripted REST resource boundary.
- Installed content negotiation behavior:
  - `GET /workspaces/media/file` returned `406` when probed with `Accept: application/json`
  - `Accept: image/*` reached the route and returned the controlled response
- Jacob then performed live PDI acceptance in an Edit-mode workspace with a held workspace lease and verified the real attachment lifecycle:
  - upload returned HTTP `201`
  - uploaded media appeared in the workspace library with HTTP `200`
  - retrieval returned HTTP `200`
  - returned `Content-Type` was `image/png`
  - returned binary size was `100` bytes
- This confirms the real installed `GlideSysAttachment.writeContentStream()` -> workspace-owned `sys_attachment` -> `GlideSysAttachment.getContentStream()` -> response stream-writer path.
