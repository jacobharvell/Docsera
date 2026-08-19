# Implementation Notes - E5-T2.1 Server Runtime Module Boundary and Exact Specifier Safety

Date: 2026-08-19

Status: implementation note

## Scope

- The Docsera page-list server runtime keeps the authoritative image contract in `app/docsera-ui/src/server/pages/serverImageContract.ts`, and `app/docsera-ui/src/server/pages/serverEditorDocument.ts` consumes that contract.
- The image helper now remains part of the deployable server module graph, but the runtime import must use the exact `.ts` specifier that the ServiceNow module loader resolves.
- The shared image wrapper continues to re-export the server contract for client/shared consumers.

## Runtime Boundary

- `serverEditorDocument.ts` imports the image contract with `./serverImageContract.ts`.
- The deployable SDK package includes a matching `sys_module` artifact for `src/server/pages/serverImageContract.ts`.
- `app/docsera-ui/tsconfig.app.json` now allows importing `.ts` extensions so the exact runtime module name can type-check and build.
- The repo-side module-boundary guard now rejects new relative server-runtime imports that omit an explicit source-file extension.

## Validation

- Focused boundary test coverage now includes the server-runtime import-specifier guard.
- The correction should be validated with the managed app tests, SDK build, and a non-interactive installed-runtime route check for the page-list route.
- The live `GET /api/x_82900_docsera/docsera_runtime/pages?workspaceSlug=task-32-jacob-smoke-empty&mode=edit` route returned HTTP 200 after the corrected install.
