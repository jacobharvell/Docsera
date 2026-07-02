# Implementation Notes - Direct UI Page Assets and Backend Ping Spike

Date: 2026-07-02

Status: pass for manual PDI proof

## Purpose

This note records the follow-on Docsera frontend architecture spike after the standalone Direct UI Page host proof.

The goal was to prove two things on the scoped Direct UI Page host:

1. Docsera JavaScript and CSS can be loaded from ServiceNow-hosted scoped assets instead of staying inline in the UI Page HTML.
2. The same page can call a minimal authenticated same-origin backend endpoint inside the same ServiceNow instance.

This was a proof task, not a product implementation task.

## Source Baseline

The spike builds on the prior host proof recorded in:

- `docs/process/Implementation Notes - Standalone Scoped UI Page Host Spike.md`

Baseline facts carried forward from that note:

- the current scoped app prefix is `x_82900_docsera`
- the standalone Direct UI Page name is `docsera_standalone_host_spike`
- the tested page URL is `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`
- the page already rendered visible Docsera-owned content with zero console errors and zero console warnings
- the page did not show `macroponent-root`, `sn-polaris-layout`, `now-appshell`, or `index.jsdbx?sysparm_replace_imports=true`

The current task continues the same architecture direction:

- frontend host: standalone scoped Direct UI Page
- backend host: scoped ServiceNow record/API surface
- UI Builder / native frame host: paused

## Platform Evidence Used

ServiceNow documentation relevant to this spike says:

- a direct UI page does not include the common HTML, CSS, and scripts, so custom CSS and JavaScript must be added
- UI scripts are reusable client-side JavaScript assets and can be loaded from HTML using a `.jsdbx` URL
- scripted REST APIs are the normal custom web service surface for application developers
- a scripted REST API URI in a scoped application uses the scope name in the namespace
- `gs.getSession().isLoggedIn()` returns whether the current user is logged in
- `gs.getUserID()` returns the current user sys_id and `gs.getUserName()` returns the current user name

Interpretation:

- the smallest ServiceNow-native JS asset for this spike is a scoped UI Script
- the smallest practical CSS asset for this spike is a file attached to a scoped record and linked from the Direct UI Page HTML
- the smallest backend proof is a scoped Scripted REST API with one GET resource

## Asset Options Considered

### 1. Inline HTML, CSS, and JS inside the UI Page

Rejected for the spike because it does not prove external asset loading.

### 2. Scoped UI Script for JavaScript

Chosen for the JavaScript side.

Why:

- it is a first-class ServiceNow client-side asset
- it is reusable across pages
- the UI Page can load it directly from a `.jsdbx` URL

### 3. sys_attachment-backed CSS file on the UI Page record

Chosen for the CSS side.

Why:

- it keeps the CSS outside the HTML field
- it stays same-origin and instance-hosted
- it is the smallest asset form available without moving into a larger SDK/static build pipeline

### 4. ServiceNow SDK static-file packaging

Deferred.

Why:

- it is promising for a later durable packaging shape
- it is not the smallest proof path for this manual PDI spike
- this task is explicitly about the smallest ServiceNow-native proof on the current Direct UI Page host

### 5. Style-sheet/theme-based CSS

Deferred.

Why:

- it is more coupled to broader theme/content surfaces than this standalone page proof
- it does not give the same direct page-local proof as an attached CSS asset

## Chosen Proof Path

The proof path for this spike is:

- scoped UI Script for JavaScript
- attachment-backed CSS file for styling
- existing Direct UI Page as the host shell
- scoped Scripted REST API for the same-origin backend ping

This keeps the page HTML minimal while proving that the page can consume ServiceNow-hosted assets.

## Exact PDI Records

### Already present from the previous spike

- application scope: `x_82900_docsera`
- UI Page: `docsera_standalone_host_spike`

### Records used for the spike

- UI Script
  - table: `sys_ui_script`
  - Script Name: `Docsera Host Spike Bootstrap`
  - API Name: `x_82900_docsera.docsera_host_spike_boots`
  - Application: `Docsera`
  - Active: `true`
  - Global: `false`
  - Resolved `.jsdbx` URL: `https://dev295482.service-now.com/x_82900_docsera.docsera_host_spike_boots.jsdbx`

- CSS asset attachment
  - host record: `sys_ui_page.docsera_standalone_host_spike`
  - file name: `docsera-host-spike.css`
  - purpose: keep styling external to the UI Page HTML field
  - Resolved attachment URL: `https://dev295482.service-now.com/sys_attachment.do?sys_id=c81a8996c371c310c569bf0d050131c2`

- Scripted REST API
  - table: `sys_ws_definition`
  - Name: `Docsera Host Spike`
  - API ID: `docsera_host_spike`
  - Application: `Docsera`
  - Requires authentication: `true`
  - Requires ACL authorization: relaxed for the spike proof

- Scripted REST resource
  - table: `sys_ws_operation`
  - Name: `Ping`
  - HTTP method: `GET`
  - Relative path: `/ping`

- Access controls
  - UI Page read ACL on `docsera_standalone_host_spike`
  - REST_Endpoint ACL for `/api/x_82900_docsera/docsera_host_spike/ping`
  - REST endpoint proof used a temporary spike-friendly configuration and should not be treated as the final Docsera security model

## Exact UI Page Result

The existing Direct UI Page HTML was updated so it contained only the host markup and asset references.

The working page used this structure:

```html
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Docsera Asset and Ping Spike</title>
  <link rel="stylesheet" href="/sys_attachment.do?sys_id=<CSS_ATTACHMENT_SYS_ID>" />
  <script src="/x_82900_docsera.docsera_host_spike_boots.jsdbx"></script>
</head>
<body>
  <main id="docsera-host" class="docsera-host">
    <header class="hero">
      <p class="eyebrow">Docsera Spike</p>
      <h1>Direct UI Page asset loading</h1>
      <p class="lede">
        This page proves external ServiceNow-hosted CSS and JavaScript loading plus a same-origin backend ping.
      </p>
    </header>

    <section class="panel">
      <h2>Runtime status</h2>
      <div id="docsera-status"></div>
      <pre id="docsera-payload">Waiting for backend ping...</pre>
    </section>
  </main>
</body>
</html>
```

Notes from the proof:

- the UI Page HTML/Jelly parser rejected the boolean `defer` attribute
- the page worked with a plain script tag and no `defer`
- the external JS loaded and populated the status area

## Exact CSS Asset

Use this as the contents of `docsera-host-spike.css`:

```css
:root {
  color-scheme: light;
  --bg: #f4efe4;
  --panel: rgba(255, 255, 255, 0.9);
  --ink: #14213d;
  --muted: #5b6576;
  --accent: #d95d39;
  --line: rgba(20, 33, 61, 0.12);
  --shadow: 0 24px 60px rgba(20, 33, 61, 0.14);
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(217, 93, 57, 0.14), transparent 34%),
    linear-gradient(180deg, #fbf8f1 0%, var(--bg) 100%);
  color: var(--ink);
  font-family: Georgia, "Times New Roman", serif;
}

body {
  min-height: 100vh;
}

.docsera-host {
  min-height: 100vh;
  padding: 32px;
  display: grid;
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

.panel {
  padding: 24px;
}

.eyebrow {
  display: inline-flex;
  margin: 0;
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

.status-card {
  margin: 0 0 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.72);
  font: 600 1rem/1.5 Arial, sans-serif;
}

.status-card.ok {
  color: #136f63;
}

.status-card.warn {
  color: #9a3412;
}

.status-card.err {
  color: #b42318;
}

pre {
  margin: 14px 0 0;
  padding: 16px;
  overflow: auto;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: #fffdf9;
  font: 400 0.88rem/1.6 Consolas, "Courier New", monospace;
}

@media (max-width: 900px) {
  .docsera-host {
    padding: 18px;
  }

  .hero,
  .panel {
    padding: 20px;
  }
}
```

## Exact JavaScript Asset

The working UI Script resolved as `x_82900_docsera.docsera_host_spike_boots` and used this content:

```js
var docsera_host_spike_bootstrap = (function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(label, value, tone) {
    var host = byId('docsera-status');
    var row = document.createElement('div');
    row.className = 'status-card ' + tone;
    row.textContent = label + ': ' + value;
    host.appendChild(row);
  }

  function requestJson(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }

      callback(xhr.status, xhr.responseText);
    };

    xhr.send(null);
  }

  function ping() {
    setStatus('page', 'loaded', 'ok');
    setStatus('host', window.location.href, 'ok');

    requestJson('/api/x_82900_docsera/docsera_host_spike/ping', function (status, responseText) {
      var payload;
      var data;

      try {
        payload = JSON.parse(responseText);
      } catch (error) {
        payload = null;
      }

      data = payload && payload.result ? payload.result : payload;

      if (!data) {
        byId('docsera-payload').textContent = responseText;
        setStatus('backend', 'failed', 'err');
        setStatus('error', 'Unexpected empty response', 'err');
        return;
      }

      byId('docsera-payload').textContent = JSON.stringify(data, null, 2);
      setStatus('backend', status >= 200 && status < 300 ? 'ok' : 'http ' + status, status >= 200 && status < 300 ? 'ok' : 'err');
      setStatus('session', data.authenticated ? 'authenticated' : 'not authenticated', data.authenticated ? 'ok' : 'warn');
      setStatus('user', data.user_name + ' (' + data.user_sys_id + ')', 'ok');
      setStatus('timestamp', data.timestamp, 'ok');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ping);
  } else {
    ping();
  }

  return ping;
})();
```

## Exact Scripted REST Resource Script

The `Ping` resource script used this body:

```js
(function process(request, response) {
  response.setStatus(200);
  response.setBody({
    status: 'ok',
    scope: 'x_82900_docsera',
    user_name: gs.getUserName(),
    user_sys_id: gs.getUserID(),
    authenticated: gs.getSession().isLoggedIn(),
    timestamp: new GlideDateTime().getDisplayValue()
  });
})(request, response);
```

## Manual Proof Results

### JavaScript Asset Loading

- passed
- the UI Script was created in the Docsera app
- the resolving UI Script URL was `https://dev295482.service-now.com/x_82900_docsera.docsera_host_spike_boots.jsdbx`
- the Direct UI Page loaded the script successfully
- the page status area was populated by the external JS

### CSS Asset Loading

- passed
- the actual attachment URL resolved to `https://dev295482.service-now.com/sys_attachment.do?sys_id=c81a8996c371c310c569bf0d050131c2`
- browser console style probing saw that attachment URL
- the CSS loaded from the instance-hosted attachment

### Backend Endpoint Proof

- passed
- the Scripted REST API existed and responded at the expected same-origin endpoint
- the endpoint returned `authenticated: true`
- the response included the logged-in user name and sys_id
- the response body arrived under ServiceNow's `result` wrapper, so the client normalized `payload.result` when present
- the logged-in session was the admin session used for the spike

### Full Page Probe

- passed
- the page loaded at `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`
- the probe saw no `macroponent-root`, `sn-polaris-layout`, or `now-appshell`
- the UI Script and CSS asset were both present
- the backend ping returned successfully through the page JS
- the initial status area text showed `session: not authenticated` only because the response wrapper was not normalized in the first pass; that was a client parsing issue, not a backend failure

## Current Proof Classification

- asset loading: pass
- backend ping: pass
- standalone Direct UI Page host: pass
- final Docsera API auth/ACL configuration: out of scope for this spike
- UI Builder path: still paused

The manual PDI proof is complete:

- asset loading passed
- backend ping passed
- the standalone Direct UI Page host remains a pass
- final Docsera API auth/ACL configuration remains out of scope for this spike
- the UI Builder path remains paused

The spike used relaxed endpoint auth/ACL settings because final Docsera API security was not part of this proof. ServiceNow authentication and session handling are assumed platform capability; the final Docsera API auth/ACL configuration belongs in a later backend/security task.

## Security Caveats

- do not mark the page public
- do not mark the backend endpoint public
- keep the spike endpoint admin-only or narrowly role-protected
- treat the ACL relaxation, if any, as temporary proof scaffolding only
- do not use the spike security posture as the final Docsera security model

## Packaging And Installability Implications

This spike establishes that:

- a Direct UI Page can act as the actual frontend host
- JS can live in a scoped UI Script
- CSS can live outside the HTML field as an instance-hosted asset
- same-origin backend calls can use a scoped Scripted REST API

What it does not yet prove:

- the best durable packaging layout for a future build pipeline
- whether the JS/CSS should remain split across UI Script and attachment after the spike
- whether a ServiceNow SDK static-file bundle is a better long-term packaging target

The main value of the spike is to reduce the host architecture risk before moving into a more durable packaging strategy.

## Recommendation

Keep the standalone Direct UI Page host direction.

Follow-up work should decide the durable packaging shape for the host, including whether the bootstrap remains split between a UI Script and attachment-backed CSS or moves into a more formal bundled asset layout.

Keep UI Builder/native-frame host work paused.
