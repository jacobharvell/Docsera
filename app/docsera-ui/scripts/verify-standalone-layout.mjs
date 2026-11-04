#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { chromium } from "playwright-core";
import { parseArgs } from "node:util";
import { safeErrorMessage } from "./verification-output-safety.mjs";

const defaults = {
  authAlias: "docsera-pdi",
  browserExecutablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  instanceUrl: "https://dev295482.service-now.com",
  pageEndpoint: "x_2300756_docsera_docsera_sdk_runtime.do"
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

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePayload(payload) {
  let normalized = payload;
  while (normalized && typeof normalized === "object" && "result" in normalized) {
    normalized = normalized.result;
  }

  return normalized;
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
    // The session cookie is the primary signal.
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

async function fetchJson(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: {
      ...options.headers,
      Accept: options.accept ?? "application/json",
      Cookie: session.cookieHeader,
      "X-UserToken": session.userToken
    }
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    payload,
    status: response.status,
    text
  };
}

async function fetchText(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: {
      ...options.headers,
      Accept: options.accept ?? "text/html",
      Cookie: session.cookieHeader,
      "X-UserToken": session.userToken
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text()
  };
}

async function openWorkspacePage(page, rootUrl) {
  const candidateRoutes = [
    { pageSlug: "overview", workspaceSlug: "product-docs" },
    { pageSlug: "details", workspaceSlug: "product-docs" },
    { pageSlug: "overview", workspaceSlug: "api-docs" },
    { pageSlug: "getting-started", workspaceSlug: "api-docs" }
  ];

  for (const route of candidateRoutes) {
    const workspaceUrl = new URL(rootUrl);
    workspaceUrl.hash = `/${encodeURIComponent(route.workspaceSlug)}/${encodeURIComponent(route.pageSlug)}`;

    await page.goto(workspaceUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".docsera-workspace", { state: "attached", timeout: 20000 });
    await page.waitForSelector(".docsera-main", { state: "attached", timeout: 20000 });
    await page.waitForTimeout(1200);

    const hasTocToggle = (await page.locator(".docsera-toc-rail__toggle").count()) > 0;
    const hasModeToggle = (await page.locator(".docsera-header__mode-toggle").getByRole("button").count()) > 0;
    if (!hasTocToggle) {
      continue;
    }

    return {
      hasChangesCenterButton: (await page.locator('button[aria-label="Open Changes Center"]').count()) > 0,
      hasTocToggle,
      hasModeToggle,
      rootHash: await page.evaluate(() => location.hash),
      rowName: `${route.workspaceSlug}/${route.pageSlug}`
    };
  }

  throw new Error(`Unable to locate a seeded workspace route with a TOC toggle. Tried: ${candidateRoutes.map((route) => `${route.workspaceSlug}/${route.pageSlug}`).join(", ")}`);
}

async function setWorkspaceMode(page, mode) {
  const button = page
    .locator(".docsera-header__mode-toggle")
    .getByRole("button", { name: mode === "edit" ? "Edit" : "Live", exact: true });
  if (!(await button.count())) {
    return false;
  }

  if ((await button.getAttribute("aria-pressed")) === "true") {
    return true;
  }

  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await page.waitForTimeout(1200);
  }

  return true;
}

async function setTocState(page, collapsed) {
  const toggle = page.locator(".docsera-toc-rail__toggle");
  if (!(await toggle.count())) {
    return false;
  }

  const expanded = await toggle.getAttribute("aria-expanded");
  const shouldBeExpanded = !collapsed;
  if (expanded === String(shouldBeExpanded)) {
    return true;
  }

  await toggle.click();
  await page.waitForTimeout(1200);
  return true;
}

async function setChangesCenterState(page, open) {
  const button = page.locator('button[aria-label="Open Changes Center"]');
  if (!(await button.count()) || !(await button.isEnabled().catch(() => false))) {
    return false;
  }

  const isOpen = (await button.getAttribute("aria-expanded")) === "true";
  if (isOpen === open) {
    return true;
  }

  await button.click();
  await page.waitForTimeout(800);
  return true;
}

async function measureViewport(page, label) {
  return await page.evaluate((labelValue) => {
    function rectData(element) {
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const root = document.scrollingElement ?? document.documentElement;
    const body = document.body;
    const app = document.querySelector(".docsera-app");
    const header = document.querySelector(".docsera-header");
    const appBody = document.querySelector(".docsera-app__body");
    const shell = document.querySelector(".docsera-shell");
    const workspace = document.querySelector(".docsera-workspace");
    const main = document.querySelector(".docsera-main");
    const surface = document.querySelector(".docsera-main__surface");
    const reader = document.querySelector(".docsera-main__reader");
    const editorForm = document.querySelector(".docsera-main__editor-form");
    const fixture = document.querySelector('[data-docsera-layout-long-fixture="true"]');
    const tocToggle = document.querySelector(".docsera-toc-rail__toggle");
    const changesCenter = document.querySelector('button[aria-label="Open Changes Center"]');
    const modeButton = document.querySelector('.docsera-header__mode-segment[aria-pressed="true"]');
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: element.className || "",
          tag: element.tagName,
          text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top
        };
      })
      .filter((element) => element.right > viewportWidth + 1 || element.left < -1 || element.bottom > viewportHeight + 1 || element.top < -1)
      .sort((a, b) => b.bottom - a.bottom || b.right - a.right || a.top - b.top)
      .slice(0, 12);

    const fixtureRect = rectData(fixture);
    const mainRect = rectData(main);
    const rootClientHeight = root?.clientHeight ?? null;
    const rootScrollHeight = root?.scrollHeight ?? null;
    const rootScrollTop = root?.scrollTop ?? null;
    const bodyClientHeight = body?.clientHeight ?? null;
    const bodyScrollHeight = body?.scrollHeight ?? null;
    const mainClientHeight = main?.clientHeight ?? null;
    const mainScrollHeight = main?.scrollHeight ?? null;
    const mainScrollTop = main?.scrollTop ?? null;

    return {
      appRect: rectData(app),
      bodyClientHeight,
      bodyRect: rectData(appBody),
      bodyScrollHeight,
      changesCenterEnabled: Boolean(changesCenter && !changesCenter.hasAttribute("disabled")),
      changesCenterOpen: Boolean(changesCenter && changesCenter.getAttribute("aria-expanded") === "true"),
      docClientHeight: rootClientHeight,
      docScrollHeight: rootScrollHeight,
      fixtureRect,
      headerRect: rectData(header),
      label: labelValue,
      mainCanScroll: Boolean(main && mainScrollHeight !== null && mainClientHeight !== null && mainScrollHeight > mainClientHeight + 1),
      mainClientHeight,
      mainRect,
      mainScrollHeight,
      mainScrollTop,
      mode: modeButton?.textContent?.trim() ?? null,
      offenders,
      readerRect: rectData(reader),
      rootBand: Math.max(0, Math.min(rootScrollHeight ?? viewportHeight, bodyScrollHeight ?? viewportHeight) - viewportHeight),
      rootCanScroll: Boolean(root && rootScrollHeight !== null && rootClientHeight !== null && rootScrollHeight > rootClientHeight + 1),
      rootScrollHeight,
      rootScrollTop,
      shellRect: rectData(shell),
      shortContent: (rootScrollHeight ?? Infinity) <= (rootClientHeight ?? Infinity) + 1 && (bodyScrollHeight ?? Infinity) <= (bodyClientHeight ?? Infinity) + 1,
      surfaceRect: rectData(surface),
      tocCollapsed: tocToggle?.getAttribute("aria-expanded") === "false",
      tocRect: rectData(tocToggle),
      viewportHeight,
      viewportWidth,
      workspaceRect: rectData(workspace)
    };
  }, label);
}

function assertShortLayout(result) {
  const rootOk = Math.abs((result.docScrollHeight ?? 0) - (result.docClientHeight ?? 0)) <= 1;
  const bodyOk = Math.abs((result.bodyScrollHeight ?? 0) - (result.bodyClientHeight ?? 0)) <= 1;
  const mainBottomOk = result.mainRect ? Math.abs(result.mainRect.bottom - result.viewportHeight) <= 1 : false;
  const workspaceBottomOk = result.workspaceRect ? Math.abs(result.workspaceRect.bottom - result.viewportHeight) <= 1 : false;
  const shellBottomOk = result.shellRect ? Math.abs(result.shellRect.bottom - result.viewportHeight) <= 1 : false;
  const bodyBottomOk = result.bodyRect ? Math.abs(result.bodyRect.bottom - result.viewportHeight) <= 1 : false;
  const rootBandOk = result.rootBand <= 1;

  if (!rootOk || !bodyOk || !mainBottomOk || !workspaceBottomOk || !shellBottomOk || !bodyBottomOk || !rootBandOk) {
    throw new Error(
      `${result.label} overflowed or exposed a root band: ${JSON.stringify({
        body: {
          clientHeight: result.bodyClientHeight,
          scrollHeight: result.bodyScrollHeight
        },
        doc: {
          clientHeight: result.docClientHeight,
          scrollHeight: result.docScrollHeight
        },
        offenders: result.offenders,
        rects: {
          app: result.appRect,
          body: result.bodyRect,
          header: result.headerRect,
          main: result.mainRect,
          reader: result.readerRect,
          shell: result.shellRect,
          surface: result.surfaceRect,
          workspace: result.workspaceRect
        },
        viewportHeight: result.viewportHeight
      })}`
    );
  }
}

function assertLongContentReachable(result, scrollTarget) {
  const mainScrollable = result.mainCanScroll;
  const rootScrollable = result.rootCanScroll;
  const mainReachedBottom = mainScrollable && Math.abs((result.mainScrollTop ?? 0) - ((result.mainScrollHeight ?? 0) - (result.mainClientHeight ?? 0))) <= 1;
  const rootReachedBottom = rootScrollable && Math.abs((result.rootScrollTop ?? 0) - ((result.rootScrollHeight ?? 0) - (result.docClientHeight ?? 0))) <= 1;
  const fixtureReachable = result.fixtureRect ? result.fixtureRect.bottom <= result.viewportHeight + 1 : false;
  const scrolledContainerReachedBottom = scrollTarget === "main" ? mainReachedBottom : rootReachedBottom;

  if (!fixtureReachable || !scrolledContainerReachedBottom) {
    throw new Error(
      `${result.label} did not demonstrate intended pane scrolling: ${JSON.stringify({
        body: {
          clientHeight: result.bodyClientHeight,
          scrollHeight: result.bodyScrollHeight
        },
        doc: {
          clientHeight: result.docClientHeight,
          scrollHeight: result.docScrollHeight
        },
        fixtureRect: result.fixtureRect,
        main: {
          clientHeight: result.mainClientHeight,
          scrollHeight: result.mainScrollHeight,
          scrollTop: result.mainScrollTop
        },
        root: {
          canScroll: rootScrollable,
          scrollHeight: result.rootScrollHeight,
          scrollTop: result.rootScrollTop
        },
        scrollTarget,
        viewportHeight: result.viewportHeight
      })}`
    );
  }
}

async function insertLongFixture(page) {
  return await page.evaluate(() => {
    const main = document.querySelector(".docsera-main");
    if (!main) {
      throw new Error("The Docsera main pane could not be found.");
    }

    const candidateSelectors = [
      ".docsera-main__reader",
      ".docsera-main__editor-form",
      ".docsera-main__editor-recovery",
      ".docsera-main__access-loss",
      ".docsera-main__pending",
      ".docsera-main__surface",
      ".docsera-main"
    ];

    const candidates = candidateSelectors
      .map((selector) => (selector === ".docsera-main" ? main : main.querySelector(selector)))
      .filter((candidate) => candidate instanceof HTMLElement)
      .map((candidate, index) => {
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return {
          candidate,
          index,
          rect,
          selector: candidate.className ? `.${String(candidate.className).trim().split(/\s+/).join(".")}` : candidate.tagName.toLowerCase(),
          style
        };
      })
      .filter(({ rect, style }) => rect.width > 0 && rect.height > 0 && style.display !== "none" && style.display !== "contents" && style.position !== "fixed" && style.position !== "absolute");

    const ranked = candidates.sort((left, right) => left.rect.width - right.rect.width || left.rect.height - right.rect.height || left.index - right.index);
    const chosen = ranked[0]?.candidate ?? main;
    const hostSelector = ranked[0]?.selector ?? ".docsera-main";

    const fixture = document.createElement("div");
    fixture.dataset.docseraLayoutLongFixture = "true";
    fixture.setAttribute("aria-hidden", "true");
    fixture.style.display = "block";
    fixture.style.position = "static";
    fixture.style.width = "100%";
    fixture.style.maxWidth = "100%";
    fixture.style.margin = "0";
    fixture.style.padding = "0";
    fixture.style.border = "0";
    fixture.style.boxSizing = "border-box";
    fixture.style.overflow = "visible";

    for (let index = 0; index < 80; index += 1) {
      const paragraph = document.createElement("p");
      paragraph.style.margin = "0 0 24px";
      paragraph.textContent = `Temporary layout fixture paragraph ${String(index + 1).padStart(3, "0")} extends the page content flow without changing durable state.`;
      fixture.appendChild(paragraph);
    }

    chosen.appendChild(fixture);

    const root = document.scrollingElement ?? document.documentElement;
    const mainCanScroll = Boolean(main.scrollHeight > main.clientHeight + 1);
    const rootCanScroll = Boolean(root && root.scrollHeight > root.clientHeight + 1);

    if (!mainCanScroll && !rootCanScroll) {
      throw new Error("The long-content fixture did not create a scrollable container.");
    }

    return {
      fixtureSelector: '[data-docsera-layout-long-fixture="true"]',
      hostSelector,
      mainScrollTopBefore: main.scrollTop,
      rootScrollTopBefore: root?.scrollTop ?? 0,
      scrollTarget: mainCanScroll ? "main" : "root"
    };
  });
}

async function scrollLongFixtureToBottom(page, scrollTarget) {
  await page.evaluate((target) => {
    const main = document.querySelector(".docsera-main");
    const root = document.scrollingElement ?? document.documentElement;
    const targetElement = target === "main" ? main : root;
    if (!targetElement) {
      throw new Error("The expected scroll container was not available.");
    }

    targetElement.scrollTop = targetElement.scrollHeight;
  }, scrollTarget);
}

async function cleanupLongFixture(page, snapshot) {
  await page.evaluate((cleanupState) => {
    const fixture = document.querySelector(cleanupState.fixtureSelector);
    if (fixture) {
      fixture.remove();
    }

    const main = document.querySelector(".docsera-main");
    const root = document.scrollingElement ?? document.documentElement;
    if (main) {
      main.scrollTop = cleanupState.mainScrollTopBefore;
    }
    if (root) {
      root.scrollTop = cleanupState.rootScrollTopBefore;
    }
  }, snapshot);
}

function parseWorkspaceSlugFromHash(hash) {
  const match = cleanText(hash).match(/^#\/([^/]+)(?:\/|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
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
  const workspaceProbe = await openWorkspacePage(page, rootUrl);
  console.log(`Selected workspace: ${workspaceProbe.rowName}`);
  console.log(`Workspace route: ${workspaceProbe.rootHash || "(no hash)"}`);
  console.log(`Changes Center button present: ${workspaceProbe.hasChangesCenterButton}`);
  console.log(`TOC toggle present: ${workspaceProbe.hasTocToggle}`);
  console.log(`Live/Edit toggle present: ${workspaceProbe.hasModeToggle}`);
  console.log("");

  if (!(await setWorkspaceMode(page, "live"))) {
    console.log("[layout] Live/Edit mode toggle not available; continuing with the default workspace mode.");
  }
  if (!workspaceProbe.hasTocToggle) {
    throw new Error("The selected workspace page does not expose the Table of Contents toggle required for the layout matrix.");
  }

  const viewports = [
    { height: 720, width: 1280 },
    { height: 900, width: 1440 },
    { height: 900, width: 1600 },
    { height: 1080, width: 1920 }
  ];
  const measurements = [];

  try {
    console.log("[layout] short-content matrix start");
    for (const viewport of viewports) {
      console.log(`[layout] short viewport ${viewport.width}x${viewport.height}`);
      await page.setViewportSize(viewport);
      await page.waitForTimeout(1000);

      await setWorkspaceMode(page, "live");
      await setTocState(page, false);
      let result = await measureViewport(page, `live-expanded-${viewport.width}x${viewport.height}`);
      assertShortLayout(result);
      measurements.push(result);

      await setTocState(page, true);
      result = await measureViewport(page, `live-collapsed-${viewport.width}x${viewport.height}`);
      assertShortLayout(result);
      measurements.push(result);

      const editAccessible = await setWorkspaceMode(page, "edit");
      if (!editAccessible) {
        console.log(`[layout] edit mode toggle not available at ${viewport.width}x${viewport.height}; skipping edit coverage`);
        continue;
      }

      await setTocState(page, false);
      result = await measureViewport(page, `edit-expanded-${viewport.width}x${viewport.height}`);
      assertShortLayout(result);
      measurements.push(result);

      if (viewport.width === 1280 && viewport.height === 720) {
        const changesCenterAvailable = await setChangesCenterState(page, true);
        if (changesCenterAvailable) {
          const openResult = await measureViewport(page, `edit-expanded-changes-open-${viewport.width}x${viewport.height}`);
          assertShortLayout(openResult);
          measurements.push(openResult);
          await setChangesCenterState(page, false);
        } else {
          console.log("[layout] Changes Center not enabled; skipping optional open-panel measurement");
        }
      }

      await setTocState(page, true);
      result = await measureViewport(page, `edit-collapsed-${viewport.width}x${viewport.height}`);
      assertShortLayout(result);
      measurements.push(result);
    }

    console.log("[layout] long-content fixture start");
    await setWorkspaceMode(page, "live");
    await setTocState(page, false);
    const fixtureState = await insertLongFixture(page);
    console.log(`[layout] long fixture host: ${fixtureState.hostSelector}`);
    console.log(`[layout] long fixture scroll target: ${fixtureState.scrollTarget}`);

    const longBeforeScroll = await measureViewport(page, "long-live-before-scroll");
    if (!(longBeforeScroll.mainCanScroll || longBeforeScroll.rootCanScroll)) {
      throw new Error(`Expected the long-content fixture to provide a scrollable container: ${JSON.stringify(longBeforeScroll)}`);
    }

    await scrollLongFixtureToBottom(page, fixtureState.scrollTarget);
    const longAfterScroll = await measureViewport(page, "long-live-after-scroll");
    assertLongContentReachable(longAfterScroll, fixtureState.scrollTarget);
    measurements.push(longBeforeScroll, longAfterScroll);
    console.log("[layout] long fixture scroll verified");

    await cleanupLongFixture(page, fixtureState);
    const postCleanup = await measureViewport(page, "post-cleanup-short");
    assertShortLayout(postCleanup);
    measurements.push(postCleanup);
    console.log("[layout] long fixture cleanup verified");

    console.log(JSON.stringify(measurements, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(safeErrorMessage(error, "Standalone layout verification failed."));
  process.exitCode = 1;
});
