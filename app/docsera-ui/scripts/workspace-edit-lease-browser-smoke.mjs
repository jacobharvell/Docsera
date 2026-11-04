#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { chromium } from "playwright-core";
import { parseArgs } from "node:util";
import { safeDetail, safeErrorMessage } from "./verification-output-safety.mjs";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow",
  pageEndpoint: "x_2300756_docsera_docsera_sdk_runtime.do"
};

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unwrapPayload(payload) {
  let current = payload;
  while (current && typeof current === "object" && "result" in current) {
    current = current.result;
  }
  return current;
}

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
  return trimmed ? trimmed : undefined;
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

function parseKeyringRecord(rawValue, authAlias) {
  if (!rawValue) {
    return { error: `No stored SDK credentials were found for alias "${authAlias}".` };
  }
  try {
    const parsed = JSON.parse(rawValue);
    const storedCredential = parsed?.[authAlias];
    if (!storedCredential) {
      return { error: `Stored SDK credentials do not include alias "${authAlias}".` };
    }
    return { credential: storedCredential };
  } catch {
    return { error: "The local SDK credential store could not be parsed." };
  }
}

async function establishBasicSession(instanceUrl, creds) {
  const cookieStore = new Map();
  let loginSessionToken = "";
  const loginResponse = await fetch(new URL("angular.do?sysparm_type=view_form.login", instanceUrl), {
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
    throw new Error(`Login failed with HTTP ${loginResponse.status}.`);
  }
  try {
    const parsedLogin = JSON.parse(loginText);
    if (parsedLogin?.status === "error" || parsedLogin?.status === "mfa_code_required") {
      throw new Error(parsedLogin.message ?? "Instance rejected the SDK credentials.");
    }
    if (typeof parsedLogin?.session_token === "string" && parsedLogin.session_token) {
      loginSessionToken = parsedLogin.session_token;
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
  }

  const refreshResponse = await fetch(new URL("angular.do?sysparm_type=get_user", instanceUrl), {
    method: "POST",
    headers: {
      Cookie: getCookieHeader(cookieStore)
    }
  });
  await refreshResponse.text();
  ingestCookies(cookieStore, refreshResponse.headers);
  const userToken = refreshResponse.headers.get("x-usertoken-response") || loginSessionToken;
  if (!userToken) {
    throw new Error("The SDK login flow did not return a usable X-UserToken.");
  }

  return {
    cookieStore,
    cookieHeader: getCookieHeader(cookieStore),
    userToken
  };
}

async function main() {
  const parsedArgs = parseArgs({
    allowPositionals: false,
    options: {
      "auth-alias": { type: "string" },
      "instance-url": { type: "string" },
      "page-endpoint": { type: "string" },
      "workspace-slug": { type: "string" },
      "page-slug": { type: "string" },
      help: { type: "boolean", short: "h" }
    },
    args: process.argv.slice(2)
  });

  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/workspace-edit-lease-browser-smoke.mjs --workspace-slug <slug> --page-slug <slug> [--auth-alias <alias>] [--instance-url <url>] [--page-endpoint <endpoint>]");
    return;
  }

  const workspaceSlug = cleanText(parsedArgs.values["workspace-slug"]);
  const pageSlug = cleanText(parsedArgs.values["page-slug"]);
  if (!workspaceSlug || !pageSlug) {
    throw new Error("Both --workspace-slug and --page-slug are required.");
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

  const keyringEntry = new Entry(defaults.keyringService, defaults.keyringAccount);
  const parsedCredential = parseKeyringRecord(keyringEntry.getPassword(), authAlias);
  if (parsedCredential.error) {
    throw new Error(parsedCredential.error);
  }
  const session = await establishBasicSession(instanceUrl, parsedCredential.credential.creds);

  const browser = await chromium.launch({ headless: true });
  const instance = new URL(instanceUrl);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
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

  const checks = [];
  const liveUrl = new URL(pageEndpoint, instanceUrl);
  liveUrl.hash = `/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(pageSlug)}`;
  const targetUrl = new URL(pageEndpoint, instanceUrl);
  targetUrl.hash = `/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(pageSlug)}?mode=edit`;

  await page.goto(liveUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.waitForSelector(".docsera-workspace", { timeout: 20000 });
  checks.push({
    ok:
      page.url().includes(`${pageEndpoint}#/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(pageSlug)}`) &&
      !page.url().includes("/now/nav/ui/classic/params/target/"),
    label: "direct canonical page link loads outside the native Classic shell",
    detail: page.url()
  });
  checks.push({
    ok:
      (await page.locator(".sn-polaris-layout, now-app-shell, sn-canvas-appshell-root, .navbar, #gsft_nav").count()) === 0,
    label: "standalone runtime has no native ServiceNow header"
  });

  await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.waitForSelector(".docsera-workspace", { timeout: 20000 });
  checks.push({
    ok: page.url().endsWith(`#/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(pageSlug)}?mode=edit`),
    label: "direct Edit route startup preserves canonical mode URL",
    detail: page.url()
  });

  const editButton = page.getByRole("button", { name: /edit/i }).first();
  if (await editButton.isVisible().catch(() => false)) {
    await editButton.click();
    await page.waitForLoadState("networkidle");
  }
  await page.waitForFunction(() =>
    Object.entries(window.sessionStorage).some(([key, value]) =>
      key.startsWith("docsera.workspace-edit-lease.") &&
      !key.startsWith("docsera.workspace-edit-lease-reload.") &&
      String(value).includes("\"token\"")
    ),
    { timeout: 20000 }
  );

  const refreshBefore = await page.locator("body").textContent();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  const refreshAfter = await page.locator("body").textContent();
  const refreshUrl = page.url();
  const refreshBody = cleanText(refreshAfter || "");
  checks.push({
    ok:
      refreshUrl.includes(`${pageEndpoint}#/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(pageSlug)}`) &&
      refreshUrl.includes("mode=edit") &&
      /liveedit/i.test(refreshBody.replace(/\s+/g, "")) &&
      !/already being edited in another tab or window/i.test(refreshBody) &&
      !/authoring access is no longer available/i.test(refreshBody),
    label: "hard refresh preserves the canonical Edit route and resumes the owner edit session",
    detail: safeDetail({
      before: cleanText(refreshBefore || "").slice(0, 120),
      after: refreshBody.slice(0, 180),
      url: refreshUrl
    })
  });

  const clonedState = await page.evaluate(() => ({
    session: { ...window.sessionStorage },
    windowName: window.name
  }));

  const secondPage = await context.newPage({
    extraHTTPHeaders: {
      "X-UserToken": session.userToken
    }
  });
  const duplicateLeaseResponses = [];
  secondPage.on("response", async (response) => {
    if (!response.url().includes("/workspaces/edit-lease/")) {
      return;
    }
    let payload = null;
    try {
      payload = unwrapPayload(JSON.parse(await response.text()));
    } catch {
      payload = null;
    }
    duplicateLeaseResponses.push({
      payload,
      status: response.status(),
      url: response.url()
    });
  });
  await secondPage.addInitScript((state) => {
    window.name = state.windowName;
    for (const [key, value] of Object.entries(state.session)) {
      window.sessionStorage.setItem(key, String(value));
    }
  }, clonedState);
  await secondPage.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
  await secondPage.waitForLoadState("networkidle");
  const secondBody = cleanText(await secondPage.locator("body").textContent());
  const duplicateLeaseContended = duplicateLeaseResponses.some(
    (response) => response.status === 409 && response.payload?.error?.sameUserDifferentSession === true
  );
  checks.push({
    ok: duplicateLeaseContended || /already being edited in another tab or window/i.test(secondBody),
    label: "a duplicated tab cannot reuse the copied credential and contends normally",
    detail: safeDetail({
      body: secondBody.slice(0, 180),
      leaseResponses: duplicateLeaseResponses.map((response) => ({
        code: response.payload?.error?.code ?? null,
        sameUserDifferentSession: response.payload?.error?.sameUserDifferentSession ?? null,
        status: response.status,
        url: response.url
      }))
    })
  });

  const liveButton = page.getByRole("button", { name: /live/i }).first();
  if (await liveButton.isVisible().catch(() => false)) {
    await liveButton.click();
    await page.waitForLoadState("networkidle");
    const returned = await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    const bodyText = cleanText(await page.locator("body").textContent());
    checks.push({
      ok: returned?.ok() !== false && /edit/i.test(bodyText),
      label: "leaving Edit released the client binding so edit can be reacquired"
    });
  } else {
    checks.push({
      ok: false,
      label: "leaving Edit released the client binding so edit can be reacquired",
      detail: "Live-mode toggle was not found in the current runtime."
    });
  }

  await context.close();
  await browser.close();

  for (const check of checks) {
    console.log(`${check.ok ? "[pass]" : "[fail]"} ${check.label}`);
    if (check.detail) {
      console.log(`       ${safeDetail(check.detail)}`);
    }
  }

  console.log("");
  console.log(`Result: ${checks.every((check) => check.ok) ? "pass" : "fail"}`);

  if (!checks.every((check) => check.ok)) {
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  throw new Error(safeErrorMessage(error, "workspace edit lease browser smoke failed"));
});
