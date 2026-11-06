# RR-013 REST Transport and Error Exposure Review

**Review date:** 2026-10-30
**Scope:** Docsera Runtime REST transport, session/CSRF assumptions, route declarations, error responses, server logging, and client/runtime secret handling.
**Method:** Static, evidence-only source and focused-test review. No PDI/browser testing, authenticated request/CSRF probes, SDK build, deployment, export, or mutation was performed.

## Executive summary

The client uses same-origin `fetch` with `credentials: "same-origin"` and sends ServiceNow's browser-provided user token (`g_ck` or `NOW.user.token`) as `X-UserToken` on every Runtime API request. This is consistent with session-cookie authentication plus a platform anti-CSRF token/header convention. The Docsera REST processors do not implement a second application CSRF check. That absence is **not a demonstrated defect**: platform enforcement for scoped Scripted REST APIs cannot be proven or disproven from these sources, and live verification was expressly out of scope.

One **confirmed low-severity server-log disclosure defect** exists. Several REST exception paths serialize entire request bodies or raw query strings/query parameter objects into `gs.error`. Mutation request bodies can contain a plaintext `workspaceLeaseToken`; the body-save route already proves the intended safe pattern by logging only an allowlisted summary. Full request bodies also retain author-entered names, descriptions, titles, and any future caller-added fields. The file/media paths additionally log unbounded caller-controlled query data. These values are not returned to the browser, but they are unnecessarily written to ServiceNow application logs on failures.

No embedded credential, hard-coded authentication token, or client storage of the ServiceNow user token was found. Workspace lease verifiers are held in same-origin `sessionStorage` for reload recovery, and diagnostics redact plaintext tokens before local trace storage. Client-visible unexpected-error responses reviewed use fixed safe messages; error stacks and exception messages are logged server-side rather than sent to the client.

## Transport and trust-boundary matrix

| Boundary | Evidence | Protection / behavior | Assessment |
| --- | --- | --- | --- |
| Browser to Runtime API | [`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L279) uses relative API paths, `credentials: "same-origin"`, and `X-UserToken` from `window.g_ck`/`NOW.user.token` ([`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L123)). | Browser sends same-origin session credentials; client supplies the platform token header when available. | Platform-session/CSRF boundary; no Docsera-specific token is used for platform authentication. |
| Runtime API declaration | [`docsera-runtime.now.ts`](../../../app/docsera-ui/src/fluent/rest-api/docsera-runtime.now.ts#L40) declares a scoped REST API and explicit GET/POST/PUT/PATCH/DELETE routes. JSON mutations declare `consumes: "application/json"`; binary upload routes declare `image/*`. | Method and declared content type are metadata-level controls. Route code still validates its actual inputs. | No unsafe method fallback found. The legacy DELETE route intentionally has no body because its runtime cannot read one. |
| REST processor to ServiceNow identity/capability services | Runtime handlers use scoped server services; lease verification derives current identity/capability server-side (covered in RR-010, not re-audited here). | Client fields are not treated as a platform session identity. | Outside this review except where it shapes transport trust. |
| Lease verifier | Client sends it in JSON for normal mutations and in `X-Docsera-Workspace-Lease-Token` for media upload ([`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L2326)). It is stored in same-origin `sessionStorage` for intended reload resume. | It is an application bearer verifier, separate from ServiceNow's session/CSRF token. | No new authorization finding; see RR-010 for lifecycle controls. Logging of this value is the confirmed issue below. |
| Unexpected server error to browser | Reviewed handlers set fixed messages on 500 paths, e.g. workspaces ([`docsera-runtime-workspaces.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-workspaces.ts#L150)) and page listing ([`docsera-runtime-pages.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-pages.ts#L120)). | Stack/message details go to `gs.error`, not response payloads. | No client stack-trace/internal-error exposure demonstrated. |
| Exception to ServiceNow log | Several handlers call `gs.error(JSON.stringify(...))` with raw request bodies or query objects. | No redaction/allowlist at those call sites. | Confirmed low-severity log disclosure. |
| Client diagnostics | Diagnostics are opt-in, sanitize token/cookie/password/credential/secret-like keys, and retain fingerprints ([`diagnostics.ts`](../../../app/docsera-ui/src/client/diagnostics.ts#L194)). | Plaintext lease token redaction is tested. | No plaintext token diagnostic-storage issue found. |

## Evidence and assessment

### Session and CSRF assumptions

`requestJson`, `requestRaw`, and `requestBinary` all use `credentials: "same-origin"`, default to an `Accept` header, and merge `X-UserToken` when `resolveUserToken()` finds `g_ck` or `NOW.user.token` ([`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L123), [`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L279), [`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L316), and [`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L353)). There is no `Authorization: Bearer` flow, cross-origin credential mode, custom external endpoint, or persisted copy of the ServiceNow user token.

This establishes the client contract, not the deployed platform rule. The route scripts do not read or validate `X-UserToken` themselves. ServiceNow, not Docsera source, determines whether the session cookie and user-token header are required/enforced before the scoped REST script executes. A missing in-script app token check is therefore **platform-dependent unknown, not a demonstrated CSRF flaw**. No live probe was authorized to establish instance behavior.

### Route method and content-type handling

The metadata explicitly maps each supported method. JSON operations declare JSON consumption; the two image uploads declare `image/*`; file retrieval produces `image/*` ([`docsera-runtime.now.ts`](../../../app/docsera-ui/src/fluent/rest-api/docsera-runtime.now.ts#L59)). The upload processors independently read Content-Type, Content-Length, query parameters, and the data stream rather than assuming JSON ([`docsera-runtime-workspace-media-upload.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-workspace-media-upload.ts#L35)).

The API has action-style POST routes where the runtime cannot support the usual body semantics for the corresponding method (notably body-free legacy page DELETE). That is a platform compatibility design, not method confusion: each has a separately declared method/path and processor. This review found no source evidence that a GET performs a mutation or that a processor accepts a body from an undeclared method.

### Error response safety

Unexpected exceptions are normally logged and transformed into fixed 500 payloads. `runtimeApiErrors.test.ts` demonstrates this for workspace listing, lookup, page listing, workspace creation, and provisioning status; its mocked internal table/ACL messages are asserted to be absent from the recorded HTTP body ([`runtimeApiErrors.test.ts`](../../../app/docsera-ui/test/runtimeApiErrors.test.ts#L146)). Media/icon file and upload routes also return fixed 500 messages while logging exceptions ([`docsera-runtime-workspace-media-file.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-workspace-media-file.ts#L60), [`docsera-runtime-workspace-icon-upload.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-workspace-icon-upload.ts#L52)).

One narrow code pattern deserves retention as a review item: workspace create returns `error.message` for caught `TypeError` values ([`docsera-runtime-create-workspace.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-create-workspace.ts#L172)). The directly reachable route validation shown in source throws a fixed message for an unsupported built-in icon. Other `TypeError` sources in the same domain are mostly invariant/dependency failures, but no adversarial runtime test was performed to prove the complete reachable set. Classify this as a **theoretical hardening opportunity**, not a confirmed response-disclosure defect; use explicit validation error types/codes before broadening that response path.

### Confirmed server-log disclosure

The following error paths pass raw request data to loggers that serialize it verbatim with `JSON.stringify`:

| Route / handler | Raw logged field | Sensitive or uncontrolled content demonstrably possible |
| --- | --- | --- |
| Page create | `requestBody` ([`docsera-runtime-create-page.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-create-page.ts#L142)) | `workspaceLeaseToken`, workspace/page identifiers, title. |
| Page delete action | `requestBody` ([`docsera-runtime-page-delete-action.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-page-delete-action.ts#L142)) | `workspaceLeaseToken` and page/workspace identifiers. |
| Page settings save | `requestBody` ([`docsera-runtime-page-settings-save.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-page-settings-save.ts#L160)) | `workspaceLeaseToken`, title/slug and identifiers. |
| Workspace create/settings | `requestBody` ([`docsera-runtime-create-workspace.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-create-workspace.ts#L191), [`docsera-runtime-workspace-settings-save.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-workspace-settings-save.ts#L89)) | User-authored workspace name/description and arbitrary extra submitted fields. |
| Workspace/page/media listing and media/icon upload/file paths | Raw `queryString` and/or `queryParams` ([`docsera-runtime-pages.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-pages.ts#L113), [`docsera-runtime-workspace-media-file.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-workspace-media-file.ts#L60)) | Caller-controlled query values, including filenames and opaque unexpected values. |

This is inconsistent with the already safer page-save path: it emits a bounded summary that records presence/length for draft body text and does not log the body JSON or lease token ([`docsera-runtime-page-save.ts`](../../../app/docsera-ui/src/server/api/docsera-runtime-page-save.ts#L31)). `runtimeApiErrors.test.ts` protects that behavior for page-body text and the lease token ([`runtimeApiErrors.test.ts`](../../../app/docsera-ui/test/runtimeApiErrors.test.ts#L237)).

**Severity: Low (confirmed).** Exploitation requires an exception path plus access to application logs, and the server logs are not browser responses. Nonetheless, logging plaintext application bearers and author input violates least disclosure, expands retention/access scope, and allows a deliberately malformed request to place arbitrary data in a high-value operational log. No evidence shows a log reader can use a disclosed lease verifier across a different ServiceNow user; RR-010 establishes the verifier is user-bound. That limits impact but does not make the logging appropriate.

**Smallest coherent correction (not implemented):** replace each raw-body/raw-query logging context with a per-route allowlist of non-secret operational fields (for example action name, bounded identifier presence/length, HTTP content type, and status category). Never log `workspaceLeaseToken`, `leaseToken`, request body/content, raw query string, raw query parameter object, or request headers. Preserve exception message/stack only for server logs as needed. Add focused regression tests that force each affected handler's error path and assert the serialized log contains neither a marker lease token nor marker author/query content.

### Client/runtime configuration and secret storage

The client default paths are same-origin relative `/api/...` paths, not configured credential-bearing URLs ([`client.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.ts#L99)). Targeted source/config searches found no committed API key, password, OAuth client secret, bearer token constant, private key, or `.env` credential. Generated key metadata contains ServiceNow record identities, not secrets.

The user token is read transiently from the browser window solely to form the request header. It is not written to either browser storage mechanism. The lease verifier is intentionally written to `sessionStorage`; it is not authentication authority by itself and exists for same-tab reload behavior. Opt-in diagnostics fingerprint it and redact the plaintext; the dedicated test verifies serialized trace data excludes the token ([`diagnostics.test.ts`](../../../app/docsera-ui/src/client/diagnostics.test.ts#L51)). This is an expected same-origin/XSS sensitivity, not a distinct credential-storage defect.

## Focused test coverage and gaps

Existing useful coverage:

- `runtimeApiErrors.test.ts` verifies selected safe unexpected-error responses and page-save log redaction.
- `client.ts` unit tests exercise use of `g_ck` and `X-UserToken` (see [`client.test.ts`](../../../app/docsera-ui/src/client/platform/servicenow/client.test.ts#L173)).
- `diagnostics.test.ts` verifies plaintext lease-token redaction with a stable fingerprint.

Material missing coverage:

1. No test asserts request setup uses both `credentials: "same-origin"` and `X-UserToken` for JSON, raw upload, and binary fetch helpers together. This is defense-in-depth transport-contract coverage.
2. No focused test forces raw-body logger failures for page create/delete/settings and verifies a lease-token/content marker is absent. This gap directly leaves the confirmed issue unprotected.
3. No focused test forces media/icon/page-list error logging with a marker query value and verifies it is absent. This also directly leaves the confirmed issue unprotected.
4. No focused test distinguishes intentional client validation `TypeError` messages from an unexpected `TypeError` at workspace-create's response boundary. This is hardening coverage for the theoretical concern above.

## Findings classification

### Confirmed defect

- **Low — raw request data in server error logs.** Full mutation bodies, including plaintext workspace lease tokens, and raw query data are logged on several exception paths. Correction is described above; do not implement it as part of this review.

### Platform-dependent unknowns

- **Session/CSRF enforcement for scoped REST requests.** Source proves use of ServiceNow session cookies and `X-UserToken`; it cannot prove PDI/runtime rejection behavior for absent/invalid tokens. Verify only through an explicitly authorized installed-runtime security test.
- **Log access/retention policy.** Source establishes what Docsera submits to `gs.error`, not which roles, exports, integrations, or retention rules expose ServiceNow logs.

### Theoretical improvements, not defects

- Replace workspace-create's broad caught-`TypeError` response with explicit validation error types/codes if that route expands.
- Add a central safe error-context summarizer to make new route logging defaults safer. This is an implementation-quality improvement; adopting it would require ensuring the ServiceNow server-runtime module graph remains deployable.
- Consider browser-level response-header controls only through a separately scoped ServiceNow hosting/configuration review; they cannot be established from this API source review.

## Recommendation

Prioritize a small follow-up to remove raw body/query data from REST `gs.error` contexts and add the three direct redaction regression families above. Treat it as a low-severity data-handling correction, not an emergency authorization response. Do not add an application-specific CSRF token check or change session policy based solely on this report: the source shows a ServiceNow-native token/header flow, while actual enforcement is an unverified platform boundary.

## RR-014 implementation disposition

RR-014 replaced the confirmed raw request-body and raw query logging contexts with route-local allowlisted summaries. The summaries retain only operation identity, presence flags, bounded string lengths, selected safe enum values, and validated numeric metadata. They do not serialize request bodies, query strings, query parameter objects, header collections, or plaintext lease verifiers. Focused regression tests inspect serialized `gs.error` output for page create/delete/settings, workspace create/settings/catalog, page listing, workspace media, workspace icon, and workspace membership exception paths.

## Review limitations

This report proves checked-in source behavior and declared SDK REST metadata only. It does not prove deployed ServiceNow session-cookie flags, user-token validation, CORS, CSRF enforcement, response headers, ACL behavior, log access/retention, or installed generated metadata. No live authentication, CSRF, mutation, browser, or PDI probe was run, by constraint. RR-008 through RR-012 were not repeated except for their directly relevant established lease-token and authorization context.
