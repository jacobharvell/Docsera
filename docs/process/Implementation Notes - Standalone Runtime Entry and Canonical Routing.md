# Implementation Notes - Standalone Runtime Entry and Canonical Routing

Status: implementation note

## Purpose

This note records the repo-side standalone runtime entry and canonical routing behavior for `app/docsera-ui`.

Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Standalone Entry

Docsera's supported runtime entry is the scoped Direct UI Page:

```text
/x_82900_docsera_docsera_sdk_runtime.do
```

The SDK `UiPage` definition remains `direct: true`. The app now also defines a scoped ServiceNow application menu and `My Workspaces` module whose `DIRECT` target is the same UI Page endpoint.

In live ServiceNow navigation, that module target still opens inside the Classic navigator content frame. `DIRECT` resolves the child-frame target to the scoped UI Page endpoint, but it does not replace the top-level shell URL or remove the native banner by itself.

The module is therefore only a compatibility entry point. The sole supported product runtime is the top-level Direct UI Page:

```text
/x_82900_docsera_docsera_sdk_runtime.do
```

`/now/nav/ui/classic/params/target/x_82900_docsera_docsera_sdk_runtime.do` may appear only as the transient ServiceNow navigator compatibility launch path before the handoff runs. The framed Classic URL is not a supported Docsera operating mode. The pre-bootstrap handoff replaces it with the top-level Direct UI Page before Docsera starts.

## Pre-Bootstrap Top-Level Handoff

`src/client/main.tsx` now performs a same-origin frame escape before diagnostics, runtime CSS injection, React mount, route parsing, workspace loading, or lease startup.

- If the Direct UI Page is already the top-level window, normal bootstrap continues unchanged.
- If the UI Page is running in a child frame, the host builds the canonical direct runtime URL from the current pathname, search, and hash, then calls same-origin top-level `location.replace(...)`.
- Hash routes and `?mode=edit` are preserved because the handoff reuses the current direct UI Page location parts instead of rebuilding routing state from app data.
- The framed copy does not initialize diagnostics, runtime styles, React, routing, data loading, or lease coordination while the top-level replacement is in progress.
- If the handoff cannot access or replace the top-level window, the framed copy fails closed with a minimal direct-open surface plus launch diagnostics instead of starting a second active Docsera runtime.

No framed-operation support, parent/child route synchronization, or redirect-back path through `nav_to.do`, UI Builder, or Next Experience routing was added.

## Canonical Route Format

The canonical browser-visible route uses fragment path segments on the Direct UI Page endpoint:

```text
/x_82900_docsera_docsera_sdk_runtime.do
/x_82900_docsera_docsera_sdk_runtime.do#/<workspaceSlug>
/x_82900_docsera_docsera_sdk_runtime.do#/<workspaceSlug>/<pageSlug>
/x_82900_docsera_docsera_sdk_runtime.do#/<workspaceSlug>/<pageSlug>?mode=edit
```

Live is the default mode and does not write a mode parameter. Edit mode writes `mode=edit`.

Workspace and page slugs are URL-encoded path segments. Nested parent slugs are not part of the route. Display names are never route authority.

Fragment routing is used because it preserves ordered workspace/page slug segments while keeping hard refresh on the same scoped UI Page endpoint. It does not require global URL rewriting, Scripted Processors, Service Portal, UI Builder, Next Experience routing, or baseline platform configuration.

## Route Authority and History

`workspaceRouting.ts` is the single client parser/builder for Docsera app routes. It is used by launcher navigation, workspace opening, page selection, breadcrumbs, Live/Edit switching, Recent Workspaces, direct links, hard refresh, and Back/Forward restoration.

The browser URL is authoritative. The client does not recover a durable "last workspace" state when the URL is absent.

Existing query routes can still be read as a compatibility input, but new app navigation builds only canonical fragment routes.

Same-workspace page navigation preserves the current mode. Explicit workspace switching and cross-workspace navigation build Live routes.

## Hard Refresh and Edit Lease

Hard refresh preserves the fragment workspace/page route and requested Edit mode because the network request remains the Direct UI Page endpoint while the browser keeps the fragment locally.

Same-tab Edit lease identity remains owned by the existing combination of:

- `window.name` tab-session identity;
- `sessionStorage` lease token per workspace sys_id;
- `BroadcastChannel` duplicate-runtime probe.

Normal duplicate-runtime probing continues to block a genuinely separate tab or window. A proven same-tab browser reload may resume the matching stored lease even while the outgoing document briefly remains alive and answers a probe. That reload proof remains scoped by the existing tab identity, stored lease credential, and reload-navigation/reload-marker checks. Deliberate Edit exit and workspace switching continue to release the lease through the existing lifecycle.

No lease stealing, startup cleanup, arbitrary delay, retry loop, or same-user weakening was added.

## Validation

Automated coverage now includes:

- pre-bootstrap framed-launch handoff before runtime startup;
- no-mount behavior for the framed copy during redirect or launch failure;
- top-level startup continuing without redirect;
- direct-route preservation across framed handoff and hard refresh;
- canonical route parsing/building for launcher, workspace, and page;
- safe workspace/page slug encoding and decoding;
- Live without `mode`;
- Edit with `mode=edit`;
- same-workspace mode preservation and workspace-switch Live default in App coverage;
- Back/Forward restoration and hard-refresh startup coverage in App coverage;
- unknown workspace/page fallback behavior in App coverage;
- same-tab lease resume and duplicate-tab contention preservation;
- stable workspace shell behavior during route changes;
- route independence from workspace display names.

Manual PDI validation should open the navigator module and direct URLs and confirm:

- the navigator click first targets `/now/nav/ui/classic/params/target/...` and then hands off to top-level `/x_82900_docsera_docsera_sdk_runtime.do`;
- the final browser URL is not under `/now/nav/ui/classic/params/target/`;
- the native ServiceNow header is absent in the final runtime;
- direct workspace/page links load;
- hard refresh preserves the route;
- same-tab Edit resumes;
- a separate tab remains blocked.
