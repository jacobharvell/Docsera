# Implementation Notes - Standalone Scoped UI Page Host Spike

Date: 2026-07-02

Status: pass for standalone Direct UI Page host proof

## Problem Statement

This spike evaluates whether Docsera should use a standalone scoped ServiceNow-hosted page surface instead of continuing to host the app shell inside UI Builder and the native Now Experience frame.

The question is not whether Docsera should move off ServiceNow. It should not. The question is whether the frontend host should remain a UI Builder custom component at all.

## Why The Current Host Is Being Questioned

The current `x-82900-docsera-shell` path is deployed successfully but the runtime evidence from Task 24 and Task 25 points to a host/runtime problem before Docsera product behavior can even begin:

- the custom element is registered in the runtime
- the host can be discovered in nested ServiceNow shadow roots
- the earlier host probe reported a height of `0`
- the shell shadow root remained empty at first render
- the browser console reported repeated transformed-bundle/module interop failures from `index.jsdbx?sysparm_replace_imports=true...`

That failure shape is materially different from a normal application bug inside a rendered Docsera shell. The shell is not winning control of its own runtime.

## Current Evidence From The UI Builder Path

Evidence already recorded in the Task 24 validation branch note and the attached Task 25 spike brief:

- deploys succeed through `snc ui-component deploy`
- the custom element record exists on-instance
- runtime still fails before the shell renders useful shadow DOM
- the failure is associated with the transformed ServiceNow bundle path rather than a normal Docsera render error

The repo-side import-graph narrowing done on `validation/pdi-live-edit-boundary-smoke` was a reasonable diagnosis step, but that branch is intentionally left unmerged while this host-surface spike is evaluated.

## Options Considered

### 1. UI Builder / native frame host

Current path.

Pros:

- already integrated with the current component package
- deploy path is known

Cons:

- current evidence shows runtime interference before shell render
- Docsera does not own the full document, CSS baseline, or routing surface
- failures are happening inside ServiceNow's transformed module/runtime path

### 2. Scoped Direct UI Page as standalone app host

Main candidate.

Pros:

- official ServiceNow docs state that a Direct UI Page does not include the common HTML, CSS, and scripts and therefore requires custom CSS and JavaScript
- the page is still a scoped ServiceNow artifact served from the same instance
- the URL is direct and addressable with a `.do` route
- this gives Docsera control of the document shell, CSS, layout, and client bootstrap

Cons:

- it is a lower-level surface and must be composed manually
- current repo tooling does not create `sys_ui_page` records
- proof still requires manual PDI validation

### 3. Scoped UI Page plus ServiceNow-hosted bundled assets

Likely practical follow-on shape if the Direct UI Page host works.

Pros:

- keeps the host page small
- allows a future bundled SPA-style client bootstrap
- still packages inside the scoped app

Cons:

- the exact asset record type still needs proof
- this spike does not yet prove the best durable asset packaging record

### 4. Scripted REST backend from the same instance/session

Recommended backend proof path if the frontend host opens cleanly.

Pros:

- official ServiceNow guidance positions Scripted REST APIs as the custom service surface
- scoped namespace and ACL boundaries are explicit
- cleaner future app boundary than GlideAjax for a standalone page host

Cons:

- this repo cannot safely create those records from the current CLI surface
- manual PDI setup is likely required for the first proof

## ServiceNow UI Page / Direct UI Page Findings

Official ServiceNow documentation for UI Pages states:

- UI Pages can exist under `System UI > UI Pages`
- the page name is invoked via a URL
- a Direct UI Page does not include the common HTML, CSS, and scripts
- direct mode therefore requires custom CSS and JavaScript
- a UI Page URL is computed from the application scope, page name, and `.do`

For the manually created Docsera scoped app in the PDI proof, the actual scope prefix is `x_82900_docsera`, so the page named `docsera_standalone_host_spike` resolves to:

`https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`

Inference from the official docs:

- if Direct mode truly omits common HTML/CSS/scripts, the page is a plausible standalone Docsera host
- that should materially reduce the chance of loading through the UI Builder `index.jsdbx?sysparm_replace_imports=true` path
- this still needs manual browser proof on the actual PDI page

## Repo / Tooling Findings

Current local tooling does not expose a safe repo-driven path for creating UI Page or Scripted REST records:

- installed CLI surface in this environment exposes `ui-component` deployment only
- no repo automation currently creates `sys_ui_page`, `sys_ui_script`, or Scripted REST records
- no committed server-side scoped app metadata for a standalone UI Page host exists in this repo today

Result:

- Codex can document and prepare the proof
- Jacob likely must create the first UI Page and optional backend endpoint manually in the PDI

## Proof Attempted

Codex completed the repo-side spike work:

- reviewed current runtime-failure evidence
- confirmed the CLI cannot create arbitrary scoped app records from this repo environment
- prepared the smallest manual proof for a Direct UI Page host

Jacob then completed the manual ServiceNow UI work in the PDI:

- created the new Docsera scoped application
- created the Direct UI Page
- removed the original `<!DOCTYPE html>` scaffold line because the UI Page HTML field rejected DOCTYPE content

## Manual PDI Proof Result

### Goal

Confirm whether a scoped Direct UI Page can render a full-page Docsera-owned shell outside the UI Builder/native frame and without the transformed bundle path.

### Actual Record Details

- `PDI`: `dev295482`
- `Scope prefix`: `x_82900_docsera`
- `UI Page name`: `docsera_standalone_host_spike`
- `URL tested`: `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`
- `Result`: visible Docsera standalone content rendered successfully
- `Console`: zero errors, zero warnings

### HTML Used

The final page HTML used the same spike structure as the original proof scaffold, but without the top-level `<!DOCTYPE html>` line because the UI Page HTML field rejected it.

```html
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Docsera Standalone Host Spike</title>
  <style>
    :root {
      --bg: #f4efe4;
      --panel: rgba(255, 255, 255, 0.9);
      --ink: #14213d;
      --muted: #5b6576;
      --accent: #d95d39;
      --line: rgba(20, 33, 61, 0.12);
      --shadow: 0 24px 60px rgba(20, 33, 61, 0.14);
      color-scheme: light;
      font-family: Georgia, "Times New Roman", serif;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at top left, rgba(217, 93, 57, 0.14), transparent 34%),
        linear-gradient(180deg, #fbf8f1 0%, var(--bg) 100%);
      color: var(--ink);
    }

    body {
      min-height: 100vh;
    }

    .app {
      min-height: 100vh;
      padding: 32px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 24px;
    }

    .hero,
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
    }

    .hero {
      padding: 28px 32px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(217, 93, 57, 0.08);
      color: var(--accent);
      font: 600 12px/1.2 Arial, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 18px 0 10px;
      font-size: clamp(2.4rem, 5vw, 4.6rem);
      line-height: 0.95;
      letter-spacing: -0.04em;
    }

    .lede {
      max-width: 760px;
      margin: 0;
      color: var(--muted);
      font: 400 1.05rem/1.7 Arial, sans-serif;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
      gap: 24px;
    }

    .panel {
      padding: 24px;
    }

    .panel h2 {
      margin: 0 0 14px;
      font-size: 1.35rem;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .status-card {
      padding: 14px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.72);
    }

    .status-label {
      margin: 0 0 6px;
      color: var(--muted);
      font: 600 0.72rem/1.3 Arial, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .status-value {
      margin: 0;
      font: 600 1rem/1.5 Arial, sans-serif;
      overflow-wrap: anywhere;
    }

    .status-value.ok {
      color: #136f63;
    }

    .status-value.warn {
      color: #9a3412;
    }

    .status-value.err {
      color: #b42318;
    }

    .notes {
      margin: 0;
      padding-left: 20px;
      color: var(--muted);
      font: 400 0.98rem/1.7 Arial, sans-serif;
    }

    code,
    pre {
      font-family: Consolas, "Courier New", monospace;
    }

    pre {
      margin: 14px 0 0;
      padding: 16px;
      overflow: auto;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: #fffdf9;
      font-size: 0.88rem;
    }

    @media (max-width: 900px) {
      .app {
        padding: 18px;
      }

      .layout {
        grid-template-columns: 1fr;
      }

      .hero,
      .panel {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <section class="hero">
      <div class="eyebrow">Docsera Spike</div>
      <h1>Docsera Standalone Host Spike</h1>
      <p class="lede">
        This page tests whether a scoped Direct UI Page can host a full-page Docsera shell
        without UI Builder, native workspace chrome, or transformed custom-component bundles.
      </p>
    </section>

    <div class="layout">
      <section class="panel">
        <h2>Runtime status</h2>
        <div id="status-grid" class="status-grid"></div>
      </section>

      <aside class="panel">
        <h2>Expected pass signal</h2>
        <ul class="notes">
          <li>The page fills the browser viewport with Docsera-owned styling.</li>
          <li>No Polaris or macroponent shell wraps the content.</li>
          <li>No `index.jsdbx?sysparm_replace_imports=true` script is loaded.</li>
          <li>Basic client-side JavaScript updates the status panel.</li>
          <li>An optional same-origin backend ping either succeeds or reports a deliberate skip.</li>
        </ul>
        <pre id="debug-output">Waiting for runtime probe...</pre>
      </aside>
    </div>
  </div>

  <script>
    (async function () {
      const selectors = [
        'macroponent-root',
        'sn-polaris-layout',
        'now-appshell',
        'now-nav-ui'
      ];

      const scriptSources = Array.from(document.scripts)
        .map((script) => script.src || '')
        .filter(Boolean);

      const transformedBundleScripts = scriptSources.filter((src) =>
        src.includes('index.jsdbx?sysparm_replace_imports=true')
      );

      const hostSignals = selectors.reduce((acc, selector) => {
        acc[selector] = Boolean(document.querySelector(selector));
        return acc;
      }, {});

      const backend = {
        attempted: false,
        result: 'skipped',
        detail: 'No scoped backend endpoint configured for the spike yet.'
      };

      const rows = [
        ['pageLoaded', 'yes', 'ok'],
        ['url', window.location.href, 'ok'],
        ['directGuess', transformedBundleScripts.length === 0 ? 'likely direct host' : 'unexpected transformed bundle', transformedBundleScripts.length === 0 ? 'ok' : 'err'],
        ['frameSignals', Object.values(hostSignals).some(Boolean) ? 'native shell markers found' : 'native shell markers absent', Object.values(hostSignals).some(Boolean) ? 'warn' : 'ok'],
        ['backendPing', backend.result, backend.result === 'skipped' ? 'warn' : 'ok']
      ];

      const grid = document.getElementById('status-grid');
      rows.forEach(([label, value, tone]) => {
        const card = document.createElement('section');
        card.className = 'status-card';
        card.innerHTML =
          '<p class="status-label">' + label + '</p>' +
          '<p class="status-value ' + tone + '">' + value + '</p>';
        grid.appendChild(card);
      });

      document.getElementById('debug-output').textContent = JSON.stringify({
        title: document.title,
        url: window.location.href,
        bodyClassName: document.body.className || null,
        transformedBundleScripts,
        hostSignals,
        backend
      }, null, 2);
    })();
  </script>
</body>
</html>
```

### Browser Console Probe

The authenticated browser console probe returned:

```js
(() => {
  const scripts = Array.from(document.scripts)
    .map((script) => script.src || '')
    .filter(Boolean);

  return {
    href: window.location.href,
    title: document.title,
    bodyClassName: document.body.className || null,
    hasMacroponentRoot: Boolean(document.querySelector('macroponent-root')),
    hasPolarisLayout: Boolean(document.querySelector('sn-polaris-layout')),
    hasNowAppShell: Boolean(document.querySelector('now-appshell')),
    transformedBundleScripts: scripts.filter((src) =>
      src.includes('index.jsdbx?sysparm_replace_imports=true')
    ),
    fullViewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    appHeight: document.documentElement.scrollHeight
  };
})();
```

Result from the probe:

- `href`: `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`
- `title`: `Docsera Standalone Host Spike`
- `bodyClassName`: `null`
- `hasMacroponentRoot`: `false`
- `hasPolarisLayout`: `false`
- `hasNowAppShell`: `false`
- `transformedBundleScripts`: `[]`
- `fullViewport`: `{ width: 1612, height: 591 }`
- `appHeight`: `982`

Interpretation:

- Direct UI Page standalone host proof is `PASS`
- the page avoids UI Builder/native-frame markers
- the page avoids the UI Builder transformed-bundle path
- Docsera-owned CSS and inline JS executed successfully
- backend/API access was not tested yet
- bundled asset loading was not tested yet
- UI Builder host path should remain paused

## Optional Same-Origin Backend Ping Proof

This should only be attempted after the standalone page itself renders cleanly.

### Recommended First Backend Surface

Use a scoped Scripted REST API, not GlideAjax, for the standalone-host proof.

Reason:

- it matches the future app boundary better for a document-style standalone page
- it keeps the client transport explicit
- it avoids leaning on UI-page-specific client conventions

### Manual PDI Steps

Navigate to:

`Scripted Web Services > Scripted REST APIs`

Create an API with:

- `Name`: `Docsera Host Spike`
- `API ID`: `docsera_host_spike`
- `Application`: `Docsera` scoped app
- `Requires authentication`: checked
- `Requires ACL authorization`: unchecked for the first spike if Jacob is using an admin session and only wants to prove same-origin session access

Create one resource with:

- `Name`: `Ping`
- `HTTP method`: `GET`
- `Relative path`: `/ping`

Use this resource script:

```js
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
  response.setStatus(200);
  response.setBody({
    status: 'ok',
    scope: 'x_82900_docsera',
    user: gs.getUserName(),
    authenticated: gs.isLoggedIn(),
    timestamp: new GlideDateTime().getDisplayValue()
  });
})(request, response);
```

The endpoint URL pattern should be:

`https://dev295482.service-now.com/api/x_82900_docsera/docsera_host_spike/ping`

Then replace the `backend` block in the page script with:

```js
const backend = {attempted: true, result: 'pending', detail: null};
try {
  const response = await fetch('/api/x_82900_docsera/docsera_host_spike/ping', {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json'
    }
  });
  backend.result = response.ok ? 'ok' : 'http-' + response.status;
  backend.detail = await response.text();
} catch (error) {
  backend.result = 'error';
  backend.detail = String(error && error.message ? error.message : error);
}
```

Expected pass signal:

- the fetch returns `200`
- the response identifies the logged-in user
- no separate login prompt appears

Inference:

- if this succeeds from the Direct UI Page, same-origin authenticated backend calls are viable for a standalone Docsera host

## Packaging / Installability Implications

What this spike establishes already:

- a Direct UI Page is a normal ServiceNow platform artifact
- a scoped UI Page keeps the frontend host inside the customer instance
- Scripted REST endpoints are also first-class scoped app artifacts

What still needs proof:

- the best installable asset record for a future bundled JS/CSS payload
- whether a single-page bundle should live inline in the UI Page for early spikes, or move into UI Scripts or another instance-hosted asset record once the host is proven

Current recommendation on asset packaging:

- first proof: keep the bootstrap inline in the UI Page because it removes packaging variables
- second proof: move JavaScript into one or more scoped UI Scripts and load them from the page
- later: choose a durable bundled-asset strategy once the standalone host is confirmed and the real frontend build shape is known

## Security / Auth Considerations

- keep the page scoped and role-protected
- do not mark the page public
- prefer authenticated same-origin calls over anonymous endpoints
- use scoped Scripted REST APIs plus ACLs for real backend operations
- do not treat the admin-session spike configuration as the final security model

Official ServiceNow UI Page guidance also warns that high-risk UI pages should have role-based access controls and that public or insecure server-side data access patterns need explicit scrutiny.

## What Happens To The Existing UI Builder Path

The current UI Builder component should be paused, not deleted.

That path still retains value as:

- a record of the failed host architecture
- a comparison point for later packaging or rendering experiments
- a possible fallback only if the standalone scoped-page path is disproven

It should not remain the assumed default frontend host while this spike is open.

## Result Classification

Current classification:

- `Direct UI Page standalone host`: `pass`
- `same-origin backend ping`: `not tested`
- `bundled asset loading`: `not tested`

## Recommendation

Adopt standalone scoped Direct UI Page hosting as the preferred frontend host direction pending bundled asset and backend proofs.

Keep the UI Builder path paused.

Task 26 now captures the completed asset-loading and backend ping proof. The next task should focus on the durable packaging shape for the Direct UI Page host.

## Next Task

Recommended next task after the completed manual proof:

`Task 26 - Direct UI Page Standalone Host Proof Result and Bundled Asset Follow-Up`

Task 26 proof results and the asset/backend follow-up live in:

- `docs/process/Implementation Notes - Direct UI Page Assets and Backend Ping Spike.md`

Suggested scope:

- capture the actual PDI result as pass, partial, or fail
- if pass, decide whether the durable asset path should stay split across UI Script plus attachment-backed CSS or move into a bundled asset strategy
- if pass, preserve the minimal authenticated Scripted REST ping as the backend proof reference
- if fail, capture the exact failure signature and evaluate the next standalone ServiceNow-hosted surface
