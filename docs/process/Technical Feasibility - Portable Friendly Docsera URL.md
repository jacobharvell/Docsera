# Technical Feasibility - Portable Friendly Docsera URL

Date: 2026-10-27

Status: passed controlled PDI proof; production integration candidate pending independent
remote code review and final packaged PDI acceptance.

## Decision

There is no SDK-supported alias mechanism that changes the scoped Direct UI Page endpoint
to `docsera.do`. The supported Docsera solution is therefore a second, Global, Direct UI
Page named `docsera`, packaged in the existing Global companion. It is a minimal host only:
it retains `docsera.do#/<route>` and loads the already-installed scoped SDK runtime bundle.
It does not redirect to the scoped page.

The controlled PDI proof passed scoped asset loading, navigation, authentication, and
runtime behavior. Task 185 promotes this host into the normal companion package, retains
the scoped UI Page as a fallback, and changes the scoped application launcher to
`docsera.do`.

## Confirmed platform and SDK behavior

- A UI Page URL is calculated from its scope, name, and `.do`. Thus a Global UI
  Page named `docsera` is the platform mechanism that maps to `/docsera.do`,
  while the scoped page must remain
  `/x_82900_docsera_docsera_sdk_runtime.do`. Direct UI Pages require their own
  JavaScript and CSS bootstrap. [ServiceNow UI Pages documentation](https://www.servicenow.com/docs/r/api-reference/scripts/r_UIPages.html)
- UI Pages have a `ui_page`/`read` ACL surface. The Global host needs a specific
  `docsera` UI Page read ACL with the same intentional audience as the Docsera
  launch surface; it must not be public merely to make the alias work.
  [ServiceNow ACL rule types](https://www.servicenow.com/docs/r/platform-security/access-control/acl-rule-types.html)
- The existing scoped Direct UI Page is SDK-defined as `direct: true`, endpoint
  `x_82900_docsera_docsera_sdk_runtime.do`. Existing routes are fragments, so a
  direct host page, refresh, and browser history can keep the same route without
  server URL rewriting.
- Existing scoped REST calls are absolute same-origin `/api/x_82900_docsera/...`
  URLs. Moving only the HTML host does not change their service, session cookie,
  CSRF token, or scoped REST authorization.

## Local source and artifact evidence

Inspection used the current `app/docsera-ui` source plus the locally available
SDK 4.8.1 build artifact at `app/docsera-ui/dist` (the task worktree had no
prebuilt artifact). The emitted `sys_ui_page` confirms all of the following:

- `sys_scope` is `x_82900_docsera`; page name is `docsera_sdk_runtime`; endpoint
  is `x_82900_docsera_docsera_sdk_runtime.do`.
- The SDK resolves `src/client/index.html`'s `./main.tsx` to the absolute module
  URL `/uxasset/externals/x_82900_docsera/main.jsdbx?uxpcb=$[UxFrameworkScriptables.getFlushTimestamp()]`.
  It also expands `sdk:now-ux-globals` into the ServiceNow bootstrap and required
  scripts in the page HTML.
- Runtime CSS is injected from `main.jsdbx`; it is not a separately loadable CSS
  file. The built output contains `main.jsdbx`, `index.jsdbx`, and lazy chunks
  including `PageEditorHostRuntime.jsdbx` and `MarkdownSourceSession.jsdbx`.
  Lazy imports are bundle-relative, hence resolve under the scoped external-asset
  directory when the scoped main bundle is loaded.
- The current client route builder derives its base from `window.location.pathname`.
  When loaded from the proposed host it will generate `/docsera.do#/...`, while
  parsing the same hash routes, responding to `hashchange`/history navigation,
  and retaining refresh behavior.
- The current Global companion contains only server-side provisioning records and
  an update-set generator. It contains no UI Page, client HTML, or runtime asset.
  Its supported PDI delivery is its generated Global update-set import, not
  `now-sdk install`.

The repository explicitly cautions runtime work not to derive critical assets
from `main.jsdbx` or assume `/uxasset/externals/...` sibling paths. That rule is
decisive here: copying the emitted URL into a Global host is an intentional
cross-host dependency, not a supported conclusion from local output alone.

## Production design

1. Extend the existing Global companion update-set with one `direct: true` Global
   `sys_ui_page`, name `docsera`, and a specific Global `ui_page` read ACL.
   Its source contains the SDK-required host bootstrap, the existing runtime
   config, `#docsera-root`, and one module script reference to the installed
   scoped `main.jsdbx` asset. It contains no React bundle, no copied CSS, no
   redirect, and no server-side proxy.
2. Keep the scoped `UiPage`, generated bundle, and REST APIs unchanged. The scoped
   application menu opens `docsera.do`; the scoped page remains a supported fallback.
   The Global page is a companion-owned host while the scoped application remains
   authoritative for all Docsera data and permission checks.
3. The companion requires the scoped app first and uses the proof's stable Docsera-owned
   identities. The `ui_page/read` ACL allows only authenticated users through
   `answer = gs.isLoggedIn();`; it does not require the Editor role. Existing scoped REST
   authorization remains authoritative for protected actions. The former editor-role ACL
   relation is retired during upgrade.
4. Before install or upgrade, preflight `sys_ui_page` for a Global `docsera`
   name/endpoint collision. If another owner has it, fail without overwrite and
   report the conflict. A clean instance creates it; an existing matching
   Docsera-owned record may be upgraded.

This adds a small second HTML host but not a second React/CSS bundle. It is the
only candidate found that keeps `docsera.do` visible and avoids a new framework,
redirect, proxy, or customer record editing.

## Completed controlled PDI verification

The isolated PDI proof passed after installing the scoped package and importing the Global
host. It verified:

- `/docsera.do#/workspace/page` stays visibly at `docsera.do` through launch,
  workspace/page changes, refresh, Back/Forward, and Edit mode.
- the Global host and scoped bundle both return successfully; main and lazy chunks
  resolve, exactly one injected runtime style appears, and there are no CSP or
  module/CORS errors.
- login/session timeout returns through normal ServiceNow authentication; scoped
  REST calls retain their current authentication and ACL outcomes.
- the Global page ACL blocks unauthorized users, while the scoped REST ACLs still
  make the final data authorization decision.
- clean install, companion upgrade, removal, and an existing non-Docsera Global
  `docsera` page each produce the ownership/collision behavior above.

## Remaining release checks

The cross-host module/CSP uncertainty was resolved by the controlled proof. Before release,
independently review this candidate and validate the generated production companion's clean
install and in-place proof upgrade using its read-only collision preflight. Do not delete the
installed proof before that replacement is reviewed and approved. A redirect-only alias
remains excluded.

## Validation performed

- Targeted source inspection of the scoped `UiPage`, client host, route builder,
  runtime CSS pipeline, and Global companion/update-set generator.
- Inspection of an existing SDK 4.8.1 build artifact in the primary checkout;
  no metadata was changed or deployed.
- Official ServiceNow UI Page and ACL documentation review.
- No tests, deployment, PDI install, browser testing, or runtime metadata changes
  were run; this task is documentation-only and those actions are out of scope.
