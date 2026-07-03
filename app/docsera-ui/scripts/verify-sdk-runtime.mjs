#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { parseArgs } from "node:util";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  pageEndpoint: "x_82900_docsera_docsera_sdk_runtime.do",
  pingPath: "/api/x_82900_docsera/docsera_runtime/ping",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow"
};

function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getOptionValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getSetCookieHeaders(headers) {
  const getSetCookie = headers.getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const singleHeader = headers.get("set-cookie");
  return singleHeader ? [singleHeader] : [];
}

function ingestCookies(cookieStore, headers) {
  for (const setCookie of getSetCookieHeaders(headers)) {
    const [cookiePair] = setCookie.split(";", 1);
    const separatorIndex = cookiePair.indexOf("=");

    if (separatorIndex > 0) {
      cookieStore.set(cookiePair.slice(0, separatorIndex), cookiePair.slice(separatorIndex + 1));
    }
  }
}

function getCookieHeader(cookieStore) {
  return [...cookieStore.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function hasSessionTimeout(text, responseUrl) {
  return text.includes("session_timeout.do") || responseUrl.includes("session_timeout.do");
}

function normalizePingPayload(payload) {
  let normalizedPayload = payload;

  while (
    normalizedPayload &&
    typeof normalizedPayload === "object" &&
    "result" in normalizedPayload &&
    normalizedPayload.result
  ) {
    const nextPayload = normalizedPayload.result;

    if (
      nextPayload &&
      typeof nextPayload === "object" &&
      ("authenticated" in nextPayload || "scope" in nextPayload || "status" in nextPayload)
    ) {
      normalizedPayload = nextPayload;
      break;
    }

    normalizedPayload = nextPayload;
  }

  if (!normalizedPayload || typeof normalizedPayload !== "object") {
    return {
      authenticated: false,
      scope: "unknown",
      status: "unknown",
      timestamp: "unknown",
      userName: "unknown",
      userSysId: "unknown"
    };
  }

  return {
    authenticated: Boolean(normalizedPayload.authenticated),
    scope: normalizedPayload.scope ?? "unknown",
    status: normalizedPayload.status ?? "unknown",
    timestamp: normalizedPayload.timestamp ?? "unknown",
    userName: normalizedPayload.userName ?? normalizedPayload.user_name ?? "unknown",
    userSysId: normalizedPayload.userSysId ?? normalizedPayload.user_sys_id ?? "unknown"
  };
}

function extractCssAssetPaths(bundleText) {
  const matches = bundleText.match(/\/uxta\/[^"'`\s)]+\.assetx\?path=[^"'`\s)]+\.css(?:&[^"'`\s)]*)?/g);
  return matches ? [...new Set(matches)] : [];
}

function printUsage() {
  console.log(`Docsera SDK runtime verification

Usage:
  node ./scripts/verify-sdk-runtime.mjs [options]

Options:
  --instance-url <url>   Override the ServiceNow instance URL.
  --auth-alias <alias>   Override the SDK auth alias.
  --page-endpoint <path> Override the UI Page endpoint.
  --ping-path <path>     Override the REST ping path.
  -h, --help             Show this message.

Environment overrides:
  DOCSERA_SDK_INSTANCE_URL
  DOCSERA_SDK_AUTH_ALIAS
  DOCSERA_SDK_PAGE_ENDPOINT
  DOCSERA_SDK_PING_PATH
  SN_SDK_INSTANCE_URL
  SN_SDK_AUTH_ALIAS

This command verifies the installed SDK-native UI Page host over HTTP.
It does not execute the React app in a browser.
`);
}

function printCheck(check) {
  const prefix = check.ok ? "[pass]" : "[fail]";
  console.log(`${prefix} ${check.label}`);

  if (!check.ok && check.diagnostic) {
    console.log(`       Likely next diagnostic: ${check.diagnostic}`);
  }
}

function failCheck(checks, label, diagnostic) {
  checks.push({ ok: false, label, diagnostic });
}

function passCheck(checks, label) {
  checks.push({ ok: true, label });
}

function parseKeyringRecord(rawValue, authAlias) {
  if (!rawValue) {
    return {
      error: `No stored SDK credentials were found in the local keyring. Re-run \`npx @servicenow/sdk auth --add <instance-url> --type basic --alias ${authAlias} --username <user> --password-stdin\`.`
    };
  }

  try {
    const parsed = JSON.parse(rawValue);
    const storedCredential = parsed?.[authAlias];

    if (!storedCredential) {
      return {
        error: `Stored SDK credentials do not include alias "${authAlias}". Re-run SDK auth setup or pass the correct \`--auth-alias\` value.`
      };
    }

    return { credential: storedCredential };
  } catch {
    return {
      error: "The local SDK credential store could not be parsed. Re-run SDK auth setup before verifying the runtime."
    };
  }
}

async function establishBasicSession(instanceUrl, creds) {
  const cookieStore = new Map();
  let loginSessionToken = "";
  const loginUrl = new URL("angular.do?sysparm_type=view_form.login", instanceUrl);
  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      sysparm_type: "login",
      "ni.nolog.user_password": "true",
      user_name: creds.username,
      user_password: creds.password
    }).toString()
  });

  const loginText = await loginResponse.text();
  ingestCookies(cookieStore, loginResponse.headers);

  if (!loginResponse.ok) {
    return {
      error: `Login to ${instanceUrl} failed with HTTP ${loginResponse.status}. Re-run SDK auth setup for alias "${creds.alias ?? "unknown"}" and confirm the stored password is still valid.`
    };
  }

  try {
    const parsedLogin = JSON.parse(loginText);
    if (parsedLogin?.status === "error" || parsedLogin?.status === "mfa_code_required") {
      return {
        error: `Login to ${instanceUrl} was rejected by the instance: ${parsedLogin.message ?? "unknown error"}. Re-run SDK auth setup for alias "${creds.alias ?? "unknown"}".`
      };
    }

    if (typeof parsedLogin?.session_token === "string" && parsedLogin.session_token) {
      loginSessionToken = parsedLogin.session_token;
    }
  } catch {
    // Login body is expected to be JSON for the local SDK auth flow, but keep the session checks going.
  }

  const refreshUrl = new URL("angular.do?sysparm_type=get_user", instanceUrl);
  const refreshResponse = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      Cookie: getCookieHeader(cookieStore)
    }
  });

  await refreshResponse.text();
  ingestCookies(cookieStore, refreshResponse.headers);

  if (!refreshResponse.ok && refreshResponse.status !== 401) {
    return {
      error: `Session refresh failed with HTTP ${refreshResponse.status}. Re-run SDK auth setup and confirm the instance accepts a fresh login session.`
    };
  }

  const userToken = refreshResponse.headers.get("x-usertoken-response");
  const fallbackToken = loginSessionToken;
  const resolvedUserToken = userToken || fallbackToken || "";

  if (!resolvedUserToken) {
    return {
      error:
        "The SDK login session did not return a usable user token. Re-run auth setup and confirm the instance still accepts the stored credentials."
    };
  }

  return {
    cookieHeader: getCookieHeader(cookieStore),
    refreshStatus: refreshResponse.status,
    userToken: resolvedUserToken
  };
}

async function main() {
  const parsedArgs = parseArgs({
    allowPositionals: false,
    options: {
      "auth-alias": { type: "string" },
      "instance-url": { type: "string" },
      "page-endpoint": { type: "string" },
      "ping-path": { type: "string" },
      help: { type: "boolean", short: "h" }
    },
    args: process.argv.slice(2)
  });

  if (parsedArgs.values.help) {
    printUsage();
    return;
  }

  const authAlias =
    getOptionValue(parsedArgs.values["auth-alias"]) ??
    readEnv("DOCSERA_SDK_AUTH_ALIAS", "SN_SDK_AUTH_ALIAS") ??
    defaults.authAlias;
  const instanceUrl =
    getOptionValue(parsedArgs.values["instance-url"]) ??
    readEnv("DOCSERA_SDK_INSTANCE_URL", "SN_SDK_INSTANCE_URL") ??
    defaults.instanceUrl;
  const pageEndpoint =
    getOptionValue(parsedArgs.values["page-endpoint"]) ??
    readEnv("DOCSERA_SDK_PAGE_ENDPOINT") ??
    defaults.pageEndpoint;
  const pingPath =
    getOptionValue(parsedArgs.values["ping-path"]) ??
    readEnv("DOCSERA_SDK_PING_PATH") ??
    defaults.pingPath;

  const checks = [];
  let fatalError = null;

  console.log("Docsera SDK runtime verification");
  console.log("");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  console.log("");

  const keyringEntry = new Entry(defaults.keyringService, defaults.keyringAccount);
  const rawKeyringValue = keyringEntry.getPassword();
  const parsedCredential = parseKeyringRecord(rawKeyringValue, authAlias);

  if (parsedCredential.error) {
    failCheck(checks, "SDK auth alias exists", parsedCredential.error);
    fatalError = true;
  }

  if (fatalError) {
    for (const check of checks) {
      printCheck(check);
    }
    console.log("");
    console.log("Result: fail");
    process.exitCode = 1;
    return;
  }

  passCheck(checks, "SDK auth alias exists");

  const storedCredential = parsedCredential.credential;
  const storedInstanceUrl = storedCredential.creds?.instanceUrl;
  if (storedInstanceUrl && storedInstanceUrl !== instanceUrl) {
    failCheck(
      checks,
      "SDK auth alias matches instance URL",
      `Stored alias "${authAlias}" points to ${storedInstanceUrl}, not ${instanceUrl}. Pass the matching \`--instance-url\` or update the local alias before verifying.`
    );
    for (const check of checks) {
      printCheck(check);
    }
    console.log("");
    console.log("Result: fail");
    process.exitCode = 1;
    return;
  }

  if (storedCredential.creds?.type !== "basic") {
    failCheck(
      checks,
      "SDK auth alias is basic auth",
      `Stored alias "${authAlias}" is ${storedCredential.creds?.type ?? "unknown"} auth. This verifier currently expects a basic-auth alias so it can reuse the local session-cookie flow.`
    );
    for (const check of checks) {
      printCheck(check);
    }
    console.log("");
    console.log("Result: fail");
    process.exitCode = 1;
    return;
  }
  passCheck(checks, "SDK auth alias matches instance URL");
  passCheck(checks, "SDK auth alias is basic auth");

  const session = await establishBasicSession(instanceUrl, {
    ...storedCredential.creds,
    alias: authAlias
  });

  if (session.error) {
    failCheck(checks, "Authenticated session established", session.error);
    for (const check of checks) {
      printCheck(check);
    }
    console.log("");
    console.log("Result: fail");
    process.exitCode = 1;
    return;
  }

  passCheck(checks, "Authenticated session established");

  const authHeaders = {
    Cookie: session.cookieHeader,
    "X-UserToken": session.userToken,
    Accept: "text/html"
  };

  const pageUrl = new URL(pageEndpoint, instanceUrl);
  const pageResponse = await fetch(pageUrl, { headers: authHeaders });
  const pageText = await pageResponse.text();

  const pageOk = pageResponse.status === 200;
  checks.push({
    ok: pageOk,
    label: "UI Page returned 200",
    diagnostic: pageOk
      ? undefined
      : `The UI Page request returned HTTP ${pageResponse.status}. Re-run \`npx @servicenow/sdk install --auth ${authAlias}\` and confirm the endpoint is still installed on ${instanceUrl}.`
  });

  checks.push({
    ok: !hasSessionTimeout(pageText, pageResponse.url),
    label: "UI Page did not redirect to session_timeout.do",
    diagnostic: hasSessionTimeout(pageText, pageResponse.url)
      ? "The page request landed on session_timeout.do, which usually means the stored login session is stale or the instance rejected the cookie/token pair."
      : undefined
  });

  checks.push({
    ok: pageText.includes('id="docsera-root"'),
    label: 'UI Page contains id="docsera-root"',
    diagnostic: pageText.includes("docsera-root")
      ? undefined
      : "The installed page HTML does not contain the Docsera mount node. Re-run the SDK build/install and confirm the UI Page metadata matches the active runtime."
  });

  checks.push({
    ok:
      pageText.includes("Docsera SDK Runtime Baseline") &&
      pageText.includes("window.DOCSERA_RUNTIME_CONFIG") &&
      pageText.includes("backendPingPath"),
    label: "UI Page contains expected title/config marker",
    diagnostic:
      "The installed page HTML is missing the runtime title or inline config marker. Confirm the HTML shipped by the SDK build matches the current source tree."
  });

  const assetMatch = pageText.match(/<script[^>]+src=["']([^"']*main\.jsdbx[^"']*)["'][^>]*>/i);

  checks.push({
    ok: Boolean(assetMatch),
    label: "UI Page contains SDK-managed main.jsdbx asset reference",
    diagnostic: assetMatch
      ? undefined
      : "The installed page HTML did not expose the expected SDK-managed main.jsdbx reference. Re-run the SDK build/install and confirm the app is serving the bundled asset path."
  });

  if (assetMatch) {
    const assetUrl = new URL(assetMatch[1], instanceUrl);
    const assetResponse = await fetch(assetUrl, { headers: authHeaders });
    const assetText = await assetResponse.text();

    checks.push({
      ok: assetResponse.status === 200,
      label: "SDK-managed main.jsdbx asset returned 200",
      diagnostic:
        assetResponse.status === 200
          ? undefined
          : `The SDK-managed JS asset returned HTTP ${assetResponse.status}. Re-run the SDK build/install and confirm the asset path still resolves on the instance.`
    });

    checks.push({
      ok: !hasSessionTimeout(assetText, assetResponse.url),
      label: "SDK-managed main.jsdbx asset did not redirect to session_timeout.do",
      diagnostic:
        "The SDK-managed JS asset landed on session_timeout.do, which means the authenticated session is not being reused correctly for the asset request."
    });

    checks.push({
      ok: assetText.includes("docsera-root"),
      label: 'SDK-managed main.jsdbx asset contains "docsera-root"',
      diagnostic:
        'The bundled SDK-managed asset does not contain the expected "docsera-root" mount marker. Re-run the build/install and confirm the active bundle matches the source tree.'
    });

    const cssAssetPaths = extractCssAssetPaths(assetText);
    checks.push({
      ok: cssAssetPaths.length > 0,
      label: "SDK-managed main.jsdbx asset contains CSS asset reference",
      diagnostic:
        "The bundled SDK-managed asset did not expose a scoped CSS asset URL. Confirm the client stylesheet is still imported and emitted by the SDK build."
    });

    if (cssAssetPaths.length > 0) {
      const cssAssetUrl = new URL(cssAssetPaths[0], instanceUrl);
      const cssAssetResponse = await fetch(cssAssetUrl, {
        headers: {
          ...authHeaders,
          Accept: "text/css,*/*;q=0.1"
        }
      });
      const cssAssetText = await cssAssetResponse.text();

      checks.push({
        ok: cssAssetResponse.status === 200,
        label: "SDK-managed runtime CSS asset returned 200",
        diagnostic:
          cssAssetResponse.status === 200
            ? undefined
            : `The SDK-managed CSS asset returned HTTP ${cssAssetResponse.status}. Re-run the SDK build/install and confirm the theme asset record referenced by the bundle exists on the instance.`
      });

      checks.push({
        ok: !hasSessionTimeout(cssAssetText, cssAssetResponse.url),
        label: "SDK-managed runtime CSS asset did not redirect to session_timeout.do",
        diagnostic:
          "The SDK-managed CSS asset landed on session_timeout.do, which means the authenticated session is not being reused correctly for the CSS request."
      });

      checks.push({
        ok: cssAssetText.includes(".docsera-shell") || cssAssetText.includes(":root"),
        label: "SDK-managed runtime CSS asset contains Docsera styles",
        diagnostic:
          "The runtime CSS asset resolved, but it did not contain the expected Docsera style markers. Confirm the emitted stylesheet matches the active client source."
      });
    }
  }

  const pingUrl = new URL(pingPath, instanceUrl);
  const pingResponse = await fetch(pingUrl, {
    headers: {
      Cookie: session.cookieHeader,
      "X-UserToken": session.userToken,
      Accept: "application/json"
    }
  });
  const pingText = await pingResponse.text();

  checks.push({
    ok: pingResponse.status === 200,
    label: "REST ping returned 200",
    diagnostic:
      pingResponse.status === 200
        ? undefined
        : `The REST ping returned HTTP ${pingResponse.status}. Re-run the SDK install and confirm the scoped REST API is still deployed.`
  });

  checks.push({
    ok: !hasSessionTimeout(pingText, pingResponse.url),
    label: "REST ping did not redirect to session_timeout.do",
    diagnostic:
      "The REST ping landed on session_timeout.do, which means the request is missing a valid session cookie or user token."
  });

  let pingPayload;
  try {
    pingPayload = JSON.parse(pingText);
  } catch {
    pingPayload = undefined;
  }

  if (pingPayload === undefined) {
    checks.push({
      ok: false,
      label: "REST ping returned JSON payload",
      diagnostic:
        "The REST ping response was not valid JSON. Re-run the install and confirm the scripted REST endpoint is still returning the expected envelope."
    });
  } else {
    const normalizedPing = normalizePingPayload(pingPayload);
    checks.push({
      ok:
        normalizedPing.authenticated === true &&
        normalizedPing.scope === "x_82900_docsera" &&
        normalizedPing.status === "ok",
      label: "REST ping returned authenticated scope payload",
      diagnostic:
        `Expected authenticated=true, scope=x_82900_docsera, status=ok but got authenticated=${normalizedPing.authenticated}, scope=${normalizedPing.scope}, status=${normalizedPing.status}.`
    });
  }

  for (const check of checks) {
    printCheck(check);
  }

  console.log("");
  console.log(`Result: ${checks.every((check) => check.ok) ? "pass" : "fail"}`);

  if (!checks.every((check) => check.ok)) {
    process.exitCode = 1;
  }
}

await main();
