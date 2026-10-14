#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import {
  collectLocalInlineRuntimeCssBuild,
  runtimeStyleIdentity,
  sha256Hex
} from "./inline-runtime-css.mjs";
import { parseRuntimeVerificationOptions } from "./sdk-runtime-verification-options.mjs";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  pageEndpoint: "x_82900_docsera_docsera_sdk_runtime.do",
  pingPath: "/api/x_82900_docsera/docsera_runtime/ping",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow",
  propagationAttempts: 10,
  propagationDelayMs: 3000
};

const browserChannels = ["msedge", "chrome", "chromium"];

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

function printUsage() {
  console.log(`Docsera SDK runtime verification

Usage:
  node ./scripts/verify-sdk-runtime.mjs [options]

Options:
  --instance-url <url>   Override the ServiceNow instance URL.
  --auth-alias <alias>   Override the SDK auth alias.
  --page-endpoint <path> Override the UI Page endpoint.
  --ping-path <path>     Override the REST ping path.
  --browser              Run the optional browser/computed-style verification step.
  --skip-browser         Explicitly skip browser proof (retained for compatibility).
  -h, --help             Show this message.

Environment overrides:
  DOCSERA_SDK_INSTANCE_URL
  DOCSERA_SDK_AUTH_ALIAS
  DOCSERA_SDK_PAGE_ENDPOINT
  DOCSERA_SDK_PING_PATH
  SN_SDK_INSTANCE_URL
  SN_SDK_AUTH_ALIAS
`);
}

function printCheck(check) {
  const prefix = check.ok ? "[pass]" : "[fail]";
  console.log(`${prefix} ${check.label}`);

  if (check.detail) {
    console.log(`       ${check.detail}`);
  }

  if (!check.ok && check.diagnostic) {
    console.log(`       Likely next diagnostic: ${check.diagnostic}`);
  }
}

function passCheck(checks, label, detail) {
  checks.push({ ok: true, label, detail });
}

function failCheck(checks, label, diagnostic, detail) {
  checks.push({ ok: false, label, diagnostic, detail });
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
    // Keep going; the session cookie is the primary signal.
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
  const resolvedUserToken = userToken || loginSessionToken || "";

  if (!resolvedUserToken) {
    return {
      error:
        "The SDK login session did not return a usable user token. Re-run auth setup and confirm the instance still accepts the stored credentials."
    };
  }

  return {
    cookieHeader: getCookieHeader(cookieStore),
    cookieStore,
    userToken: resolvedUserToken
  };
}

async function fetchJson(instanceUrl, session, pathname, searchParams = {}, fields = []) {
  const url = new URL(pathname, instanceUrl);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  if (fields.length > 0) {
    url.searchParams.set("sysparm_fields", fields.join(","));
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: session.cookieHeader,
      "X-UserToken": session.userToken
    }
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }

  return { payload, response, text, url };
}

async function queryRecords(instanceUrl, session, table, query, fields) {
  const { payload, response, url } = await fetchJson(
    instanceUrl,
    session,
    `/api/now/table/${table}`,
    {
      sysparm_limit: "25",
      sysparm_query: query,
      sysparm_exclude_reference_link: "true"
    },
    fields
  );

  if (response.status !== 200) {
    throw new Error(`${table} query failed with HTTP ${response.status} at ${url.toString()}.`);
  }

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.result)) {
    throw new Error(`${table} query did not return a JSON result array.`);
  }

  return payload.result;
}

function extractMainBundleReference(pageText, instanceUrl) {
  const assetMatch = pageText.match(/<script[^>]+src=["']([^"']*main\.jsdbx[^"']*)["'][^>]*>/i);

  if (!assetMatch) {
    return null;
  }

  const assetUrl = new URL(assetMatch[1], instanceUrl);
  const uxpcbEntry = [...assetUrl.searchParams.entries()].find(([key]) => key.toLowerCase().includes("uxpcb"));

  return {
    assetUrl,
    source: assetMatch[1],
    uxpcb: uxpcbEntry?.[1] ?? null
  };
}

async function fetchPageAndBundle({ authHeaders, instanceUrl, pageEndpoint }) {
  const pageUrl = new URL(pageEndpoint, instanceUrl);
  const pageResponse = await fetch(pageUrl, {
    headers: {
      ...authHeaders,
      Accept: "text/html"
    }
  });
  const pageText = await pageResponse.text();
  const bundleReference = extractMainBundleReference(pageText, instanceUrl);

  let bundleResponse;
  let bundleText = "";
  let bundleHash = null;

  if (bundleReference) {
    bundleResponse = await fetch(bundleReference.assetUrl, {
      headers: {
        ...authHeaders,
        Accept: "application/javascript,text/javascript,*/*;q=0.1"
      }
    });
    bundleText = await bundleResponse.text();
    bundleHash = sha256Hex(bundleText);
  }

  return {
    bundleHash,
    bundleReference,
    bundleResponse,
    bundleText,
    pageResponse,
    pageText,
    pageUrl
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExpectedBundle({
  authHeaders,
  instanceUrl,
  localBundleHash,
  pageEndpoint
}) {
  const attempts = [];

  for (let attempt = 1; attempt <= defaults.propagationAttempts; attempt += 1) {
    const snapshot = await fetchPageAndBundle({
      authHeaders,
      instanceUrl,
      pageEndpoint
    });

    const matches =
      snapshot.pageResponse.status === 200 &&
      !hasSessionTimeout(snapshot.pageText, snapshot.pageResponse.url) &&
      Boolean(snapshot.bundleReference) &&
      snapshot.bundleResponse?.status === 200 &&
      !hasSessionTimeout(snapshot.bundleText, snapshot.bundleResponse.url) &&
      snapshot.bundleText.includes(runtimeStyleIdentity.marker) &&
      snapshot.bundleHash === localBundleHash;

    attempts.push({
      attempt,
      bundleHash: snapshot.bundleHash,
      bundleStatus: snapshot.bundleResponse?.status ?? null,
      bundleUrl: snapshot.bundleReference?.source ?? null,
      pageStatus: snapshot.pageResponse.status,
      uxpcb: snapshot.bundleReference?.uxpcb ?? null
    });

    if (matches) {
      return { attempts, snapshot };
    }

    if (attempt < defaults.propagationAttempts) {
      await sleep(defaults.propagationDelayMs);
    }
  }

  return { attempts, snapshot: null };
}

async function launchVerificationBrowser() {
  const errors = [];

  for (const channel of browserChannels) {
    try {
      const browser =
        channel === "chromium"
          ? await chromium.launch({ headless: true })
          : await chromium.launch({ channel, headless: true });

      return { browser, channel };
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Could not launch Playwright browser. ${errors.join(" | ")}`);
}

function isRuntimeCssAssetRequest(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    const pathParam = parsed.searchParams.get("path");
    return (
      requestUrl.includes("runtime-shell.css") ||
      pathParam === "styles/runtime-shell.css" ||
      pathParam?.includes("runtime-shell") === true
    );
  } catch {
    return requestUrl.includes("runtime-shell.css");
  }
}

async function runBrowserVerification({
  authHeaders,
  instanceUrl,
  localBundleHash,
  pageEndpoint,
  probeValue,
  session
}) {
  const { browser, channel } = await launchVerificationBrowser();
  const instance = new URL(instanceUrl);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const consoleMessages = [];
  const pageErrors = [];

  await context.addCookies(
    [...session.cookieStore.entries()].map(([name, value]) => ({
      domain: instance.hostname,
      httpOnly: false,
      name,
      path: "/",
      sameSite: "Lax",
      secure: instance.protocol === "https:",
      value
    }))
  );

  const page = await context.newPage({
    extraHTTPHeaders: {
      "X-UserToken": session.userToken
    }
  });

  const mainBundleRequests = [];
  const runtimeCssRequests = [];

  page.on("console", (message) => {
    consoleMessages.push({ text: message.text(), type: message.type() });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("request", (request) => {
    const requestUrl = request.url();

    if (requestUrl.includes("main.jsdbx")) {
      mainBundleRequests.push(requestUrl);
    }

    if (isRuntimeCssAssetRequest(requestUrl)) {
      runtimeCssRequests.push(requestUrl);
    }
  });

  const pageUrl = new URL(pageEndpoint, instanceUrl);
  await page.goto(pageUrl.toString(), {
    waitUntil: "domcontentloaded"
  });
  await page.waitForSelector(runtimeStyleIdentity.styleSelector, { state: "attached", timeout: 20000 });
  await page.waitForSelector(".docsera-app-frame, .docsera-launcher, .docsera-workspace", {
    state: "attached",
    timeout: 20000
  });
  await page.waitForLoadState("networkidle");

  const browserBundleReference = await page
    .locator('script[src*="main.jsdbx"]')
    .first()
    .getAttribute("src");
  const styleTagCount = await page.locator(runtimeStyleIdentity.styleSelector).count();
  const computedProbeValue = await page.locator(runtimeStyleIdentity.probeSelector).evaluate((element, property) => {
    return getComputedStyle(element).getPropertyValue(property).trim();
  }, runtimeStyleIdentity.probeCssProperty);
  const bundleReferenceUrl = browserBundleReference
    ? new URL(browserBundleReference, instanceUrl)
    : null;
  let browserBundleHash = null;

  if (bundleReferenceUrl) {
    const bundleResponse = await page.request.get(bundleReferenceUrl.toString(), {
      headers: authHeaders
    });
    const bundleText = await bundleResponse.text();
    browserBundleHash = sha256Hex(bundleText);
  }

  await context.close();
  await browser.close();

  const cspConsoleMessages = consoleMessages.filter(
    (message) =>
      message.type === "error" &&
      /(content security policy|csp|unsafe-inline|refused to apply|refused to load)/i.test(message.text)
  );

  return {
    browserBundleHash,
    browserBundleReference,
    channel,
    computedProbeValue,
    cspConsoleMessages,
    mainBundleRequests,
    pageErrors,
    runtimeCssRequests,
    styleTagCount
  };
}

async function main() {
  const parsedOptions = parseRuntimeVerificationOptions(process.argv.slice(2));
  const { values: parsedArgs, browserProofEnabled } = parsedOptions;

  if (parsedOptions.help) {
    printUsage();
    return;
  }

  const authAlias =
    getOptionValue(parsedArgs["auth-alias"]) ??
    readEnv("DOCSERA_SDK_AUTH_ALIAS", "SN_SDK_AUTH_ALIAS") ??
    defaults.authAlias;
  const instanceUrl =
    getOptionValue(parsedArgs["instance-url"]) ??
    readEnv("DOCSERA_SDK_INSTANCE_URL", "SN_SDK_INSTANCE_URL") ??
    defaults.instanceUrl;
  const pageEndpoint =
    getOptionValue(parsedArgs["page-endpoint"]) ??
    readEnv("DOCSERA_SDK_PAGE_ENDPOINT") ??
    defaults.pageEndpoint;
  const pingPath =
    getOptionValue(parsedArgs["ping-path"]) ??
    readEnv("DOCSERA_SDK_PING_PATH") ??
    defaults.pingPath;
  const checks = [];
  let fatalError = false;
  let localBuild;

  console.log("Docsera SDK runtime verification");
  console.log("");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  console.log(`Browser proof: ${browserProofEnabled ? "enabled" : "skipped"}`);
  console.log("");

  try {
    localBuild = collectLocalInlineRuntimeCssBuild();
    passCheck(
      checks,
      "Local build output satisfies the inline runtime CSS invariant",
      `main.jsdbx sha256=${localBuild.bundleHash}`
    );
  } catch (error) {
    failCheck(
      checks,
      "Local build output satisfies the inline runtime CSS invariant",
      error instanceof Error ? error.message : String(error)
    );
    fatalError = true;
  }

  const keyringEntry = new Entry(defaults.keyringService, defaults.keyringAccount);
  const rawKeyringValue = keyringEntry.getPassword();
  const parsedCredential = parseKeyringRecord(rawKeyringValue, authAlias);

  if (parsedCredential.error) {
    failCheck(checks, "SDK auth alias exists", parsedCredential.error);
    fatalError = true;
  } else {
    passCheck(checks, "SDK auth alias exists");
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

  const storedCredential = parsedCredential.credential;
  const storedInstanceUrl = storedCredential.creds?.instanceUrl;

  if (storedInstanceUrl && storedInstanceUrl !== instanceUrl) {
    failCheck(
      checks,
      "SDK auth alias matches instance URL",
      `Stored alias "${authAlias}" points to ${storedInstanceUrl}, not ${instanceUrl}. Pass the matching \`--instance-url\` or update the local alias before verifying.`
    );
    fatalError = true;
  } else {
    passCheck(checks, "SDK auth alias matches instance URL");
  }

  if (storedCredential.creds?.type !== "basic") {
    failCheck(
      checks,
      "SDK auth alias is basic auth",
      `Stored alias "${authAlias}" is ${storedCredential.creds?.type ?? "unknown"} auth. This verifier currently expects a basic-auth alias so it can reuse the local session-cookie flow.`
    );
    fatalError = true;
  } else {
    passCheck(checks, "SDK auth alias is basic auth");
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
    "X-UserToken": session.userToken
  };

  const freshnessResult = await waitForExpectedBundle({
    authHeaders,
    instanceUrl,
    localBundleHash: localBuild.bundleHash,
    pageEndpoint
  });
  const finalAttempt = freshnessResult.attempts.at(-1);

  if (!freshnessResult.snapshot) {
    failCheck(
      checks,
      "Live UI page advanced to the current main.jsdbx bundle during uxpcb propagation",
      `Expected bundle sha256=${localBuild.bundleHash}, last observed bundle sha256=${finalAttempt?.bundleHash ?? "missing"}, uxpcb=${finalAttempt?.uxpcb ?? "missing"}, attempts=${freshnessResult.attempts.length}.`,
      freshnessResult.attempts
        .map((attempt) => `#${attempt.attempt} hash=${attempt.bundleHash ?? "missing"} uxpcb=${attempt.uxpcb ?? "missing"}`)
        .join(" | ")
    );
    for (const check of checks) {
      printCheck(check);
    }
    console.log("");
    console.log("Result: fail");
    process.exitCode = 1;
    return;
  }

  const liveSnapshot = freshnessResult.snapshot;

  passCheck(
    checks,
    "Live UI page advanced to the current main.jsdbx bundle during uxpcb propagation",
    `attempts=${freshnessResult.attempts.length} hash=${liveSnapshot.bundleHash} uxpcb=${liveSnapshot.bundleReference?.uxpcb ?? "missing"}`
  );

  checks.push({
    ok: liveSnapshot.pageResponse.status === 200,
    label: "UI Page returned 200",
    diagnostic:
      liveSnapshot.pageResponse.status === 200
        ? undefined
        : `The UI Page request returned HTTP ${liveSnapshot.pageResponse.status}. Re-run \`npx @servicenow/sdk install --auth ${authAlias}\` and confirm the endpoint is still installed on ${instanceUrl}.`
  });

  checks.push({
    ok: !hasSessionTimeout(liveSnapshot.pageText, liveSnapshot.pageResponse.url),
    label: "UI Page did not redirect to session_timeout.do",
    diagnostic: hasSessionTimeout(liveSnapshot.pageText, liveSnapshot.pageResponse.url)
      ? "The page request landed on session_timeout.do, which usually means the stored login session is stale or the instance rejected the cookie/token pair."
      : undefined
  });

  checks.push({
    ok: liveSnapshot.pageText.includes('id="docsera-root"'),
    label: 'UI Page contains id="docsera-root"',
    diagnostic: liveSnapshot.pageText.includes("docsera-root")
      ? undefined
      : "The installed page HTML does not contain the Docsera mount node. Re-run the SDK build/install and confirm the UI Page metadata matches the active runtime."
  });

  checks.push({
    ok:
      liveSnapshot.pageText.includes("<title>Docsera</title>") &&
      liveSnapshot.pageText.includes("window.DOCSERA_RUNTIME_CONFIG") &&
      liveSnapshot.pageText.includes("backendPingPath"),
    label: "UI Page contains expected title/config marker",
    diagnostic:
      "The installed page HTML is missing the runtime title or inline config marker. Confirm the HTML shipped by the SDK build matches the current source tree."
  });

  checks.push({
    ok: Boolean(liveSnapshot.bundleReference),
    label: "UI Page contains SDK-managed main.jsdbx asset reference",
    diagnostic:
      "The installed page HTML did not expose the expected SDK-managed main.jsdbx reference. Re-run the SDK build/install and confirm the app is serving the bundled asset path."
  });

  checks.push({
    ok: liveSnapshot.bundleResponse?.status === 200,
    label: "SDK-managed main.jsdbx asset returned 200",
    diagnostic:
      liveSnapshot.bundleResponse?.status === 200
        ? undefined
        : `The SDK-managed JS asset returned HTTP ${liveSnapshot.bundleResponse?.status ?? "missing"}. Re-run the SDK build/install and confirm the asset path still resolves on the instance.`
  });

  checks.push({
    ok: !hasSessionTimeout(liveSnapshot.bundleText, liveSnapshot.bundleResponse?.url ?? ""),
    label: "SDK-managed main.jsdbx asset did not redirect to session_timeout.do",
    diagnostic:
      "The SDK-managed JS asset landed on session_timeout.do, which means the authenticated session is not being reused correctly for the asset request."
  });

  checks.push({
    ok: liveSnapshot.bundleHash === localBuild.bundleHash,
    label: "Live main.jsdbx hash matches the local built bundle",
    detail: `live=${liveSnapshot.bundleHash} local=${localBuild.bundleHash}`,
    diagnostic:
      `The live bundle hashed to ${liveSnapshot.bundleHash}, but the local build hashed to ${localBuild.bundleHash}. The page is still serving stale JavaScript.`
  });

  checks.push({
    ok: liveSnapshot.bundleText.includes(runtimeStyleIdentity.marker),
    label: "Live main.jsdbx contains the runtime style injection marker",
    diagnostic:
      "The live bundle does not contain the runtime style injection marker. Re-run the build/install and confirm the inline CSS path shipped."
  });

  checks.push({
    ok: liveSnapshot.bundleText.includes(`${runtimeStyleIdentity.probeCssProperty}: ${localBuild.probeValue};`),
    label: "Live main.jsdbx contains the inlined runtime CSS probe",
    detail: `${runtimeStyleIdentity.probeCssProperty}: ${localBuild.probeValue}`,
    diagnostic:
      "The live bundle does not contain the expected runtime CSS probe value. The deployed JS bundle is not the current local build."
  });

  checks.push({
    ok: !/\/uxta\/[^"'`\s)]+\.assetx\?path=[^"'`\s)]+\.css/i.test(liveSnapshot.bundleText),
    label: "Live main.jsdbx contains no runtime CSS asset URL",
    diagnostic:
      "The live bundle still references a CSS asset URL. The fallback theme-asset pipeline is still active."
  });

  let legacyThemeAssets = [];
  try {
    legacyThemeAssets = await queryRecords(
      instanceUrl,
      session,
      "sys_ux_theme_asset",
      "nameLIKEruntime-shell",
      ["sys_id", "name", "sys_updated_on"]
    );
    passCheck(
      checks,
      "Legacy runtime-shell theme asset inventory was inspected",
      legacyThemeAssets.length === 0
        ? "No sys_ux_theme_asset records matched runtime-shell."
        : legacyThemeAssets.map((record) => `${record.sys_id}:${record.name}`).join(", ")
    );
  } catch (error) {
    failCheck(
      checks,
      "Legacy runtime-shell theme asset inventory was inspected",
      error instanceof Error ? error.message : String(error)
    );
  }

  const pingUrl = new URL(pingPath, instanceUrl);
  const pingResponse = await fetch(pingUrl, {
    headers: {
      Accept: "application/json",
      ...authHeaders
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
    failCheck(
      checks,
      "REST ping returned JSON payload",
      "The REST ping response was not valid JSON. Re-run the install and confirm the scripted REST endpoint is still returning the expected envelope."
    );
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

  if (browserProofEnabled) {
    try {
      const browserResult = await runBrowserVerification({
        authHeaders,
        instanceUrl,
        localBundleHash: localBuild.bundleHash,
        pageEndpoint,
        probeValue: localBuild.probeValue,
        session
      });

      passCheck(
        checks,
        "Browser loaded the runtime page through Playwright",
        `channel=${browserResult.channel}`
      );

      checks.push({
        ok: browserResult.mainBundleRequests.length > 0,
        label: "Browser requested main.jsdbx",
        detail: browserResult.mainBundleRequests[0] ?? "",
        diagnostic:
          "The browser did not request main.jsdbx while loading the runtime page."
      });

      checks.push({
        ok: browserResult.browserBundleHash === localBuild.bundleHash,
        label: "Browser saw the current main.jsdbx bundle hash",
        detail: `browser=${browserResult.browserBundleHash} local=${localBuild.bundleHash}`,
        diagnostic:
          "The browser did not load the same JS bundle that was built locally."
      });

      checks.push({
        ok: browserResult.runtimeCssRequests.length === 0,
        label: "Browser did not request a runtime-shell CSS asset",
        detail: browserResult.runtimeCssRequests.join(", "),
        diagnostic:
          "The browser still requested a runtime-shell CSS asset. The inline CSS pipeline is not the only active runtime path."
      });

      checks.push({
        ok: browserResult.styleTagCount === 1,
        label: "Browser has exactly one injected runtime style tag",
        detail: `count=${browserResult.styleTagCount}`,
        diagnostic:
          `Expected one ${runtimeStyleIdentity.styleSelector} element, found ${browserResult.styleTagCount}.`
      });

      checks.push({
        ok: browserResult.computedProbeValue === localBuild.probeValue,
        label: "Browser computed style proves the inline runtime CSS applied",
        detail: `${runtimeStyleIdentity.probeCssProperty}: ${browserResult.computedProbeValue}`,
        diagnostic:
          `Expected computed ${runtimeStyleIdentity.probeCssProperty} ${localBuild.probeValue}, got ${browserResult.computedProbeValue || "missing"}.`
      });

      checks.push({
        ok: browserResult.cspConsoleMessages.length === 0,
        label: "Browser console has no CSP/style-injection violations",
        detail: browserResult.cspConsoleMessages.map((message) => message.text).join(" | "),
        diagnostic:
          "The browser reported CSP or style-injection console errors."
      });

      checks.push({
        ok: browserResult.pageErrors.length === 0,
        label: "Browser had no uncaught runtime page errors",
        detail: browserResult.pageErrors.join(" | "),
        diagnostic:
          "The browser reported uncaught runtime page errors during verification."
      });
    } catch (error) {
      failCheck(
        checks,
        "Browser verification completed",
        error instanceof Error ? error.message : String(error)
      );
    }
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

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
