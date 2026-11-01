# RR-031 — Current-Family Platform Compatibility Baseline

Date: 2026-10-31
Status: bounded G3 evidence; **not** an exit decision, upgrade qualification, clean-install qualification, or interactive acceptance.

## Scope and method

This report records a read-only baseline against the development PDI configured by the existing `docsera-pdi` SDK alias. It used authenticated SDK metadata queries and the repository's existing non-browser runtime verifier. It did not deploy, install, export, reset, modify records, use browser automation, or inspect workspace/page/user content.

The source observation was made from `ad601703f0b90a8f1d17664032c31bf42fa15881` (`release/batch-g3-platform-compatibility`, based exactly on `origin/main`). The runtime verifier first built that checkout locally and compared its generated bundle with the authenticated installed response. Build output and credentials are not included here.

`RR-003` is the comparison point. Its preservation-data requirement is superseded by the accepted disposable-development-PDI policy in the Release Readiness Plan; this task neither preserves nor changes disposable development content.

## Platform and installed application identity

| Area | Classification | Installed-instance observation and method |
| --- | --- | --- |
| ServiceNow family/build | **Verified** | `sys_properties` values `glide.buildtag.last=glide-australia-02-11-2026__patch2-04-17-2026` and `glide.builddate.last=04-29-2026_2044`: Australia Patch 2. This is unchanged from RR-003. Platform-UI corroboration was not obtained because this task permits no interactive platform UI work. |
| Scoped application and scope | **Verified** | `sys_app` and `sys_scope` returned `Docsera`, scope `x_82900_docsera`, scope ID `6997f092c3fd8310c569bf0d0501314d`, version `0.1.0`, active app. These values are unchanged from RR-003. |
| Checked-out source ↔ installed runtime | **Verified, bounded** | The verifier built this source commit and obtained matching local/live `main.jsdbx` SHA-256 `c27c75e7a6a0a8113f35d8c27b16aa701c57d5fd3878ce253cefab349bced350` from the scoped host. This establishes the delivered frontend bundle for this checkout, not complete metadata/server-module parity. |
| Global companion host ownership | **Verified, metadata only** | `sys_ui_page` row `docsera` is direct, in Global scope, and has the expected production-friendly-host description. It has the known Docsera page identity `de3b81474ba94c0a9296d12f9c6bd9cc`. A Global `global/docsera-friendly-url-proof` UX asset is installed. |
| Global bridge dependencies | **Verified, bounded** | Nine allowed Global→scoped privileges were returned for the Docsera scope, covering workspace, provision-request, member-command, and icon-asset operations. The two expected active Global Script Includes (`DocseraGlobalWorkspaceProvisioningBridge` and `DocseraGlobalWorkspaceMembershipBridge`) and two expected active Global workers were also returned. This does not prove job execution or effective user permission enforcement. |

## Runtime and component evidence

| Area | Classification | Evidence |
| --- | --- | --- |
| Scoped Direct UI Page and runtime assets | **Verified** | The existing non-browser verifier authenticated successfully, received the scoped UI page with HTTP 200 and no session redirect, found the mount node/config/main.jsdbx reference, fetched the JS asset with HTTP 200, and matched its SHA-256 to the local build. |
| Runtime CSS delivery | **Verified** | The live scoped bundle contains the runtime style marker and inline CSS probe (`--docsera-runtime-probe-size: 18px`) and contains no runtime CSS asset URL. The verifier also inspected two legacy `runtime-shell` theme assets; their continued presence was not treated as an active CSS-delivery failure because the served bundle has no such reference. |
| Authenticated REST ping | **Verified** | The existing verifier received HTTP 200, JSON, no session redirect, and the expected authenticated `x_82900_docsera`/`ok` ping payload. This is a safe read-only representative API probe. |
| Scoped REST definition | **Verified** | `sys_ws_definition` returned active `Docsera Runtime API`, service ID `docsera_runtime`, namespace `x_82900_docsera`, base URI `/api/x_82900_docsera/docsera_runtime`. |
| Scheduled-job definitions | **Verified, metadata only** | The active scoped `Docsera Workspace Edit Lease Cleanup` (periodic) and `Docsera Abandoned Workspace Icon Cleanup` (daily) records were returned. No execution/side-effect probe was made. |
| Global `docsera.do` HTTP/bundle response | **Unverified** | The Global page and its module asset are installed, but the supplied scoped-runtime verifier expects an SDK `main.jsdbx` reference. Running it with `--page-endpoint docsera.do` therefore failed only at that unsuitable bundle-reference expectation (ten missing references), before it can report the normal scoped-page checks. The Global host source intentionally uses a distinct `docsera-friendly-url-proof` module asset. No browser or custom authenticated fetch probe was added in this evidence task. This is a tooling-boundary limitation, not a demonstrated host failure. |

## Installed-state findings

1. **Verified runtime compatibility for the scoped bundle on Australia Patch 2:** the scoped Direct UI Page, authenticated asset delivery, inline CSS architecture, and ping endpoint work against the currently installed family. This is evidence for those bounded surfaces only.
2. **Installed metadata is not a clean copy of the current source footprint:** the active `docsera_runtime` definition returned **50** operations, while current source declares 34 active routes. The surplus includes legacy page-lock and C4/probe routes already classified in RR-018. RR-018 also records the active historical C4 provisioning Business Rule. This is a known populated-development-PDI drift condition, not evidence that the delivered scoped frontend is incompatible and not a reason to alter the disposable PDI in this task.
3. **No new reproducible platform compatibility defect was demonstrated.** The attempted Global-host verifier result is explicitly not classified as a defect because the verifier's `main.jsdbx` assumption does not apply to the installed Global host asset structure.

## Remaining G3 qualification

The following are **unverified**, not passes or defects:

- interactive `docsera.do` loading, routing/deep links, and Global-host asset execution;
- interactive editor behavior, including block editing, Markdown/source switching, media/table interactions, and recovery of unsaved input;
- publishing, individual discard, discard-all, and reader-facing state transitions;
- least-privilege ACL enforcement and ordinary-user behavior (all authenticated probes here used the configured administrator-capable SDK identity);
- scheduled-job execution and outcomes;
- clean-instance installation, cross-family support, platform upgrade behavior, data migration, and artifact portability;
- complete source-to-installed server metadata parity, including the intentional/legacy surplus in this development PDI.

## Recommended next bounded G3 qualification

Have Jacob perform the short interactive Australia Patch 2 smoke on a safe disposable workspace: open both the scoped fallback and `docsera.do`, hard-refresh and deep-link, enter/leave Edit, make a disposable edit, publish, then exercise individual and all-change discard. Record any observable failure without repairing the instance during the smoke. Follow separately with a limited-role authorization qualification; administrator responses from this baseline cannot establish least-privilege behavior.

## Commands and validation

- Read-only `npx @servicenow/sdk query -a docsera-pdi` queries of `sys_properties`, `sys_app`, `sys_scope`, `sys_ui_page`, `sys_ws_definition`, `sys_ws_operation`, `sysauto_script`, `sys_scope_privilege`, `sys_script_include`, `sys_script`, and `sys_ux_lib_asset` with identity/status fields only.
- `npm --prefix app/docsera-ui ci` to make the locked local tools available in the isolated worktree.
- `npm --prefix app/docsera-ui run build` (local build succeeded after dependency installation).
- `npm --prefix app/docsera-ui run verify:sdk-runtime -- --skip-browser` (passed).
- `node ./scripts/verify-sdk-runtime.mjs --skip-browser --page-endpoint docsera.do` (expected verifier limitation documented above; exit 1 because no `main.jsdbx` reference was found).

Intentionally not run: deployment/install, interactive or browser/PDI automation, write probes, broad regression suites, clean-instance testing, platform UI corroboration, or any content/user-data query.
