#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { chromium } from "playwright-core";
import { parseArgs } from "node:util";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  pageEndpoint: "x_82900_docsera_docsera_sdk_runtime.do",
  browserExecutablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
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

function printUsage() {
  console.log(`Docsera standalone layout verification

Usage:
  node ./scripts/verify-standalone-layout.mjs [options]

Options:
  --instance-url <url>   Override the ServiceNow instance URL.
  --auth-alias <alias>   Override the SDK auth alias.
  --page-endpoint <path> Override the UI Page endpoint.
  -h, --help             Show this message.

Environment overrides:
  DOCSERA_SDK_INSTANCE_URL
  SN_SDK_INSTANCE_URL
  DOCSERA_SDK_AUTH_ALIAS
  SN_SDK_AUTH_ALIAS
  DOCSERA_SDK_PAGE_ENDPOINT
  DOCSERA_BROWSER_EXECUTABLE_PATH
`);
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
    return { error: `Login to ${instanceUrl} failed with HTTP ${loginResponse.status}.` };
  }

  try {
    const parsedLogin = JSON.parse(loginText);
    if (typeof parsedLogin?.session_token === "string") {
      loginSessionToken = parsedLogin.session_token;
    }
  } catch {
    // Keep going; the session cookie is the primary signal.
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
    return { error: "The SDK login session did not return a usable user token." };
  }

  return {
    cookieHeader: getCookieHeader(cookieStore),
    cookieStore,
    userToken
  };
}

function launchBrowserExecutable() {
  return getOptionValue(readEnv("DOCSERA_BROWSER_EXECUTABLE_PATH")) ?? defaults.browserExecutablePath;
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      headless: true,
      executablePath: launchBrowserExecutable()
    });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

async function findWorkspacePage(page, rootUrl) {
  await page.goto(rootUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".docsera-launcher", { state: "attached", timeout: 20000 });
  await page.waitForLoadState("networkidle");

  const workspaceCount = Math.min(await page.locator(".docsera-workspace-row__name").count(), 10);
  for (let index = 0; index < workspaceCount; index += 1) {
    await page.goto(rootUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".docsera-launcher", { state: "attached", timeout: 20000 });

    const row = page.locator(".docsera-workspace-row__name").nth(index);
    const rowName = (await row.textContent())?.trim() ?? `workspace-${index + 1}`;
    await row.click();

    await page.waitForSelector(".docsera-workspace", { state: "attached", timeout: 20000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    if (!(await page.locator(".docsera-toc-rail__toggle").count())) {
      continue;
    }

    const editButtons = page.getByRole("button", { name: /^Edit$/ });
    if (await editButtons.count()) {
      const editButton = editButtons.first();
      if (await editButton.isEnabled()) {
        await editButton.click();
        await page.waitForTimeout(1200);
      }
    }

    const publishButton = page.locator('button[aria-label="Open Changes Center"]');
    const publishEnabled = (await publishButton.count()) > 0 && (await publishButton.isEnabled().catch(() => false));
    return {
      rowName,
      publishEnabled,
      rootHash: await page.evaluate(() => location.hash),
      hasChangesCenterButton: (await publishButton.count()) > 0
    };
  }

  throw new Error("Unable to find a workspace page with a Table of Contents toggle.");
}

async function measureViewport(page, label) {
  return await page.evaluate((labelValue) => {
    function rectData(element) {
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    }

    const viewportWidth = document.documentElement.clientWidth;
    const toggle = document.querySelector(".docsera-toc-rail__toggle");
    const changesCenter = document.querySelector(".docsera-changes-center");
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          cls: element.className || "",
          tag: element.tagName,
          text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
          left: rect.left,
          right: rect.right
        };
      })
      .filter((element) => element.right > viewportWidth + 1 || element.left < -1)
      .sort((a, b) => b.right - a.right || a.left - b.left)
      .slice(0, 10);

    return {
      label: labelValue,
      href: location.href,
      docW: document.documentElement.clientWidth,
      docSW: document.documentElement.scrollWidth,
      bodyW: document.body.clientWidth,
      bodySW: document.body.scrollWidth,
      toggleExpanded: toggle?.getAttribute("aria-expanded") ?? null,
      toggleRect: rectData(toggle),
      changesCenterOpen: Boolean(changesCenter),
      changesCenterRect: rectData(changesCenter),
      offenders
    };
  }, label);
}

function assertViewportBounds(result) {
  const rootOk = result.docSW <= result.docW + 1;
  const bodyOk = result.bodySW <= result.bodyW + 1;
  if (!rootOk || !bodyOk) {
    throw new Error(
      `${result.label} exceeded viewport: document ${result.docSW}/${result.docW}, body ${result.bodySW}/${result.bodyW}. Offenders: ${JSON.stringify(result.offenders)}`
    );
  }
}

async function setTocState(page, collapsed) {
  const toggle = page.locator(".docsera-toc-rail__toggle");
  const expanded = await toggle.getAttribute("aria-expanded");
  const shouldBeExpanded = !collapsed;
  if (expanded === String(shouldBeExpanded)) {
    return;
  }

  await toggle.click();
  await page.waitForTimeout(1200);
}

async function main() {
  const parsedArgs = parseArgs({
    allowPositionals: false,
    options: {
      "auth-alias": { type: "string" },
      "instance-url": { type: "string" },
      "page-endpoint": { type: "string" },
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

  const keyringEntry = new Entry("ServiceNow", "now-sdk");
  const rawKeyringValue = keyringEntry.getPassword();
  if (!rawKeyringValue) {
    throw new Error(`No stored SDK credentials were found in the local keyring for alias "${authAlias}".`);
  }

  const parsedCredential = JSON.parse(rawKeyringValue);
  const storedCredential = parsedCredential?.[authAlias];
  if (!storedCredential?.creds) {
    throw new Error(`Stored SDK credentials do not include alias "${authAlias}".`);
  }

  const session = await establishBasicSession(instanceUrl, storedCredential.creds);
  if (session.error) {
    throw new Error(session.error);
  }

  const browser = await launchBrowser();
  const instance = new URL(instanceUrl);
  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });

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

  const rootUrl = new URL(pageEndpoint, instanceUrl).toString();
  const workspaceProbe = await findWorkspacePage(page, rootUrl);
  console.log(`Selected workspace: ${workspaceProbe.rowName}`);
  console.log(`Workspace route: ${workspaceProbe.rootHash || "(no hash)"}`);
  console.log(`Changes Center button present: ${workspaceProbe.hasChangesCenterButton}`);
  console.log(`Changes Center button enabled: ${workspaceProbe.publishEnabled}`);
  console.log("");

  const widths = [1280, 1440, 1600, 1920];
  const measurements = [];

  await setTocState(page, false);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1200 });
    await page.waitForTimeout(1000);
    const result = await measureViewport(page, `expanded-${width}`);
    assertViewportBounds(result);
    measurements.push(result);
  }

  await setTocState(page, true);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1200 });
    await page.waitForTimeout(1000);
    const result = await measureViewport(page, `collapsed-${width}`);
    assertViewportBounds(result);
    measurements.push(result);
  }

  console.log(JSON.stringify(measurements, null, 2));
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
