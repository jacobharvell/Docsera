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
  pageEndpoint: "x_82900_docsera_docsera_sdk_runtime.do",
  pingPath: "/api/x_82900_docsera/docsera_runtime/ping",
  pagesPath: "/api/x_82900_docsera/docsera_runtime/pages",
  workspacePublishPath: "/api/x_82900_docsera/docsera_runtime/workspaces/publish",
  workspaceEditLeasePath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease",
  workspaceDeletePath: "/api/x_82900_docsera/docsera_runtime/workspaces/delete",
  workspacePath: "/api/x_82900_docsera/docsera_runtime/workspaces",
  workspaceProvisioningStatusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status"
};

const pasteText = "Alpha\r\n\r\nBeta\r\n\r\nGamma\r\n\r\nDelta";

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizePayload(payload) {
  let current = payload;
  while (current && typeof current === "object" && "result" in current) current = current.result;
  return current;
}

function getSetCookieHeaders(headers) {
  return typeof headers.getSetCookie === "function" ? headers.getSetCookie() : headers.get("set-cookie") ? [headers.get("set-cookie")] : [];
}

function ingestCookies(cookieStore, headers) {
  for (const setCookie of getSetCookieHeaders(headers)) {
    const [cookiePair] = setCookie.split(";", 1);
    const separatorIndex = cookiePair.indexOf("=");
    if (separatorIndex > 0) cookieStore.set(cookiePair.slice(0, separatorIndex), cookiePair.slice(separatorIndex + 1));
  }
}

const getCookieHeader = (cookieStore) => [...cookieStore.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

function parseKeyringRecord(rawValue, authAlias) {
  if (!rawValue) return { error: `No stored SDK credentials were found for alias "${authAlias}".` };
  try {
    const storedCredential = JSON.parse(rawValue)?.[authAlias];
    return storedCredential ? { credential: storedCredential } : { error: `Stored SDK credentials do not include alias "${authAlias}".` };
  } catch {
    return { error: "The local SDK credential store could not be parsed." };
  }
}

async function establishBasicSession(instanceUrl, creds) {
  const cookieStore = new Map();
  let loginSessionToken = "";
  const loginResponse = await fetch(new URL("angular.do?sysparm_type=view_form.login", instanceUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      sysparm_type: "login",
      "ni.nolog.user_password": "true",
      user_name: creds.username,
      user_password: creds.password
    }).toString()
  });
  const loginText = await loginResponse.text();
  ingestCookies(cookieStore, loginResponse.headers);
  if (!loginResponse.ok) throw new Error(`Login failed with HTTP ${loginResponse.status}.`);
  try {
    const parsedLogin = JSON.parse(loginText);
    if (parsedLogin?.status === "error" || parsedLogin?.status === "mfa_code_required") throw new Error(parsedLogin.message ?? "Instance rejected the SDK credentials.");
    if (typeof parsedLogin?.session_token === "string") loginSessionToken = parsedLogin.session_token;
  } catch (error) {
    if (error instanceof Error) throw error;
  }
  const refreshResponse = await fetch(new URL("angular.do?sysparm_type=get_user", instanceUrl), {
    method: "POST",
    headers: { Cookie: getCookieHeader(cookieStore) }
  });
  await refreshResponse.text();
  ingestCookies(cookieStore, refreshResponse.headers);
  const userToken = refreshResponse.headers.get("x-usertoken-response") || loginSessionToken;
  if (!userToken) throw new Error("The SDK login flow did not return a usable X-UserToken.");
  return { cookieStore, cookieHeader: getCookieHeader(cookieStore), userToken };
}

async function fetchJson(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: {
      Accept: options.accept ?? "application/json",
      Cookie: session.cookieHeader,
      "X-UserToken": session.userToken,
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { ok: response.ok, payload, status: response.status, text };
}

async function callRuntime(instanceUrl, session, path, body, method = "POST") {
  return fetchJson(instanceUrl, session, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function createWorkspace(instanceUrl, session) {
  const result = await callRuntime(instanceUrl, session, defaults.workspacePath, {
    name: `Task 87 Native Paste ${Date.now()}`,
    shortDescription: "Disposable native paste diagnostic workspace",
    icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
    layout: { tocVisible: true, pageWidth: "readable" }
  });
  if (![201, 202].includes(result.status)) throw new Error(`Workspace create failed with HTTP ${result.status}: ${result.text}`);
  const created = normalizePayload(result.payload);
  if (result.status === 201) return created;
  const requestId = cleanText(created?.provisioning?.requestId);
  for (let attempt = 0; attempt < 30 && requestId; attempt += 1) {
    const status = await fetchJson(instanceUrl, session, `${defaults.workspaceProvisioningStatusPath}?requestId=${encodeURIComponent(requestId)}`);
    const payload = normalizePayload(status.payload);
    const state = cleanText(payload?.provisioning?.state);
    if (state === "succeeded") return payload;
    if (state === "failed") throw new Error(payload?.error?.message ?? "Workspace provisioning failed.");
    await sleep(1000);
  }
  throw new Error("Workspace provisioning did not complete within the polling window.");
}

async function cleanupWorkspace(instanceUrl, session, workspaceResult) {
  const workspaceSysId = cleanText(workspaceResult?.workspace?.sysId);
  const workspaceSlug = cleanText(workspaceResult?.workspace?.slug);
  if (!workspaceSysId && !workspaceSlug) {
    return;
  }
  await callRuntime(instanceUrl, session, defaults.workspaceDeletePath, {
    workspaceSlug,
    workspaceSysId
  }).catch(() => undefined);
}

const envelope = (text) => ({
  schemaVersion: 1,
  document: { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }] }
});

async function createPageFixture(instanceUrl, session, workspace) {
  await fetchJson(instanceUrl, session, `${defaults.pagesPath}?workspaceSlug=${encodeURIComponent(workspace.slug)}&mode=live`);
  const leasePayload = normalizePayload((await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/acquire`, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId
  })).payload);
  const lease = leasePayload?.lease ?? leasePayload;
  if (!lease?.leaseToken) throw new Error(`Lease acquire returned an unexpected payload: ${JSON.stringify(leasePayload)}`);
  const createResponse = await callRuntime(instanceUrl, session, defaults.pagesPath, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId,
    workspaceLeaseToken: lease.leaseToken,
    expectedChangeSetId: lease.changeSetId,
    expectedChangeSetRevision: lease.changeSetRevision,
    parentPageSysId: null,
    title: "Native Paste Probe"
  });
  if (createResponse.status !== 201) throw new Error(`Page create failed with HTTP ${createResponse.status}: ${createResponse.text}`);
  const created = normalizePayload(createResponse.payload);
  const page = created?.page ?? created?.createdPage ?? created?.item ?? created?.items?.[0];
  if (!page?.sysId) throw new Error(`Page create returned an unexpected payload: ${JSON.stringify(created)}`);
  page.slug = cleanText(page.slug) || cleanText(page.draftSlug) || cleanText(page.pageSlug);
  if (!page.slug) throw new Error(`Page create did not return a usable slug: ${JSON.stringify(created)}`);
  const saved = await callRuntime(instanceUrl, session, defaults.pagesPath, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId,
    workspaceLeaseToken: lease.leaseToken,
    expectedChangeSetId: created.changeSetId,
    expectedChangeSetRevision: created.changeSetRevision,
    pageSysId: page.sysId,
    expectedRevision: 0,
    draftContentJson: envelope("")
  }, "PATCH");
  if (saved.status !== 200) throw new Error(`Page seed save failed with HTTP ${saved.status}: ${saved.text}`);
  const savedPayload = normalizePayload(saved.payload);
  const published = await callRuntime(instanceUrl, session, defaults.workspacePublishPath, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId,
    workspaceLeaseToken: lease.leaseToken,
    expectedChangeSetId: savedPayload.changeSetId,
    expectedChangeSetRevision: savedPayload.changeSetRevision,
    commandId: `task-87-native-paste-${Date.now()}`
  });
  if (published.status !== 200) throw new Error(`Workspace publish failed with HTTP ${published.status}: ${published.text}`);
  await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/release`, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId,
    leaseToken: lease.leaseToken
  }).catch(() => undefined);
  return { lease, page };
}

async function captureNativePaste(page, label) {
  console.error("[task87] waiting for ProseMirror root");
  try {
    await page.waitForFunction(() => Boolean(document.querySelector("[data-docsera-page-editor-host='true']")?.shadowRoot?.querySelector(".ProseMirror")), { timeout: 30000 });
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      bodyText: document.body?.innerText?.slice(0, 1000) ?? "",
      hostCount: document.querySelectorAll("[data-docsera-page-editor-host='true']").length,
      title: document.title,
      url: location.href
    })).catch(() => null);
    throw new Error(`ProseMirror root did not mount. Snapshot: ${JSON.stringify(snapshot)}. ${String(error)}`);
  }
  console.error("[task87] writing clipboard payload");
  await page.evaluate((text) => navigator.clipboard.writeText(text), pasteText);
  console.error("[task87] reading clipboard payload");
  const clipboardReadText = await page.evaluate(() => navigator.clipboard.readText().catch((error) => `readText failed: ${String(error)}`));
  console.error("[task87] installing page trace hooks");
  await page.evaluate(() => {
    const proseMirror = document.querySelector("[data-docsera-page-editor-host='true']")?.shadowRoot?.querySelector(".ProseMirror");
    if (!proseMirror) throw new Error("ProseMirror root not found.");
    window.__TASK87_NATIVE_PASTE__ = { beforeDom: proseMirror.innerHTML, events: [], transactions: [] };
    const docseraEditableState = proseMirror.__docseraEditableState?.() ?? null;
    const view = proseMirror.pmViewDesc?.editorView ?? proseMirror.pmViewDesc?.view ?? null;
    window.__TASK87_NATIVE_PASTE__.viewFound = Boolean(view);
    if (view?.dispatch && !view.__task87DispatchWrapped) {
      const originalDispatch = view.dispatch.bind(view);
      view.dispatch = (transaction) => {
        window.__TASK87_NATIVE_PASTE__.transactions.push({
          doc: transaction.doc?.toJSON?.() ?? null,
          docChanged: transaction.docChanged,
          selection: transaction.selection?.toJSON?.() ?? null,
          steps: transaction.steps.map((step) => step.toJSON?.() ?? String(step))
        });
        return originalDispatch(transaction);
      };
      view.__task87DispatchWrapped = true;
    }
    const editableProps = [];
    view?.someProp?.("editable", (value) => {
      editableProps.push(typeof value === "function" ? value(view.state) : value);
      return false;
    });
    window.__TASK87_NATIVE_PASTE__.editableBeforePaste = {
      docsera: docseraEditableState,
      domContentEditable: docseraEditableState?.domContentEditable ?? proseMirror.contentEditable,
      editorIsEditable: docseraEditableState?.editorIsEditable ?? null,
      optionsEditable: docseraEditableState?.optionsEditable ?? null,
      somePropEditable: editableProps,
      viewEditable: docseraEditableState?.viewEditable ?? null
    };
    proseMirror.addEventListener("paste", (event) => {
      const data = event.clipboardData;
      window.__TASK87_NATIVE_PASTE__.events.push({
        defaultPreventedAtCapture: event.defaultPrevented,
        textHtml: data?.getData("text/html") ?? "",
        textPlain: data?.getData("text/plain") ?? "",
        types: data ? Array.from(data.types) : []
      });
    }, { capture: true, once: true });
    proseMirror.addEventListener("paste", (event) => {
      window.__TASK87_NATIVE_PASTE__.events.push({
        defaultPreventedAtBubble: event.defaultPrevented,
        type: "paste-bubble"
      });
    }, { once: true });
    proseMirror.addEventListener("beforeinput", (event) => {
      window.__TASK87_NATIVE_PASTE__.events.push({
        inputType: event.inputType,
        type: "beforeinput"
      });
    });
    proseMirror.focus();
  });
  console.error("[task87] selecting existing editor content");
  await page.keyboard.press("Control+A");
  console.error("[task87] deleting selected content");
  await page.keyboard.press("Backspace");
  console.error("[task87] pressing native paste");
  await page.keyboard.press("Control+V");
  console.error("[task87] waiting after native paste");
  await page.waitForTimeout(1000);
  console.error("[task87] collecting paste result");
  return page.evaluate(({ captureLabel, clipboardReadText: readback }) => {
    const proseMirror = document.querySelector("[data-docsera-page-editor-host='true']")?.shadowRoot?.querySelector(".ProseMirror");
    const topLevel = proseMirror ? Array.from(proseMirror.children).map((child) => ({
      html: child.outerHTML,
      isEmptyParagraph: child.tagName === "P" && (child.textContent ?? "") === "",
      tag: child.tagName,
      text: child.textContent
    })) : [];
    const view = proseMirror?.pmViewDesc?.editorView ?? proseMirror?.pmViewDesc?.view ?? null;
    const docseraEditableState = proseMirror?.__docseraEditableState?.() ?? null;
    const editableProps = [];
    view?.someProp?.("editable", (value) => {
      editableProps.push(typeof value === "function" ? value(view.state) : value);
      return false;
    });
    return {
      ...window.__TASK87_NATIVE_PASTE__,
      afterDom: proseMirror?.innerHTML ?? "",
      canonicalEmptyParagraphCount: topLevel.filter((entry) => entry.isEmptyParagraph).length,
      clipboardReadText: readback,
      documentJson: view?.state?.doc?.toJSON?.() ?? null,
      editableAfterPaste: {
        docsera: docseraEditableState,
        domContentEditable: docseraEditableState?.domContentEditable ?? proseMirror?.contentEditable ?? null,
        somePropEditable: editableProps,
        viewEditable: docseraEditableState?.viewEditable ?? null
      },
      label: captureLabel,
      topLevel
    };
  }, { captureLabel: label, clipboardReadText });
}

async function main() {
  const parsedArgs = parseArgs({
    allowPositionals: false,
    options: {
      "auth-alias": { type: "string" },
      "instance-url": { type: "string" },
      "keep-data": { type: "boolean" },
      help: { type: "boolean", short: "h" }
    },
    args: process.argv.slice(2)
  });
  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/diagnose-native-paste.mjs [--auth-alias <alias>] [--instance-url <url>] [--keep-data]");
    return;
  }
  const authAlias = cleanText(parsedArgs.values["auth-alias"]) || process.env.DOCSERA_SDK_AUTH_ALIAS || process.env.SN_SDK_AUTH_ALIAS || defaults.authAlias;
  const instanceUrl = cleanText(parsedArgs.values["instance-url"]) || process.env.DOCSERA_SDK_INSTANCE_URL || process.env.SN_SDK_INSTANCE_URL || defaults.instanceUrl;
  console.error("[task87] reading SDK credentials");
  const parsedCredential = parseKeyringRecord(new Entry(defaults.keyringService, defaults.keyringAccount).getPassword(), authAlias);
  if (parsedCredential.error) throw new Error(parsedCredential.error);
  console.error("[task87] establishing session");
  const session = await establishBasicSession(instanceUrl, parsedCredential.credential.creds);
  console.error("[task87] pinging runtime");
  const ping = await fetchJson(instanceUrl, session, defaults.pingPath);
  if (ping.status !== 200) throw new Error(`Runtime ping failed with HTTP ${ping.status}: ${ping.text}`);
  console.error("[task87] creating workspace");
  const workspaceResult = await createWorkspace(instanceUrl, session);
  const workspace = workspaceResult.workspace;
  console.error("[task87] creating page fixture");
  const fixture = await createPageFixture(instanceUrl, session, workspace);
  console.error("[task87] launching browser");
  const browser = await chromium.launch({ headless: true });
  const instance = new URL(instanceUrl);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1440, height: 1000 } });
  await context.addCookies([...session.cookieStore.entries()].map(([name, value]) => ({
    domain: instance.hostname,
    httpOnly: false,
    name,
    path: "/",
    sameSite: "Lax",
    secure: instance.protocol === "https:",
    value
  })));
  const browserPage = await context.newPage({ extraHTTPHeaders: { "X-UserToken": session.userToken } });
  await browserPage.addInitScript(() => {
    window.__DOCSERA_EDITOR_DIAGNOSTICS__ = true;
  });
  const targetUrl = new URL(defaults.pageEndpoint, instanceUrl);
  targetUrl.hash = `/${encodeURIComponent(workspace.slug)}/${encodeURIComponent(fixture.page.slug)}?mode=edit`;
  try {
    console.error("[task87] opening runtime page");
    await browserPage.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
    await browserPage.waitForLoadState("networkidle");
    const editButton = browserPage.getByRole("button", { name: /^edit$/i }).first();
    if (await editButton.isVisible().catch(() => false)) {
      console.error("[task87] entering edit mode");
      await editButton.click();
      await browserPage.waitForLoadState("networkidle");
    }
    console.error("[task87] capturing native paste");
    const current = await captureNativePaste(browserPage, "current-docsera");
    console.error("[task87] reading edit projection");
    await browserPage.waitForTimeout(1500);
    const editProjection = normalizePayload((await fetchJson(
      instanceUrl,
      session,
      `${defaults.pagesPath}?workspaceSlug=${encodeURIComponent(workspace.slug)}&mode=edit`
    )).payload);
    const projectedPage = (editProjection?.items ?? []).find((item) => cleanText(item.sysId) === cleanText(fixture.page.sysId) || cleanText(item.slug) === cleanText(fixture.page.slug)) ?? null;
    console.log(safeDetail({
      current,
      fixture: { pageSlug: fixture.page.slug, url: targetUrl.toString(), workspaceSlug: workspace.slug },
      pasteText,
      projectedPage: projectedPage ? {
        draftContentJson: projectedPage.draftContentJson ?? projectedPage.contentJson ?? null,
        draftRevision: projectedPage.draftRevision ?? null,
        slug: projectedPage.slug ?? null,
        sysId: projectedPage.sysId ?? null,
        title: projectedPage.title ?? projectedPage.draftTitle ?? null
      } : null
    }));
    console.log("");
    const pasteBubble = current.events.find((event) => event.type === "paste-bubble");
    const beforeInputEvents = current.events.filter((event) => event.type === "beforeinput");
    const substantiveParagraphCount = current.topLevel.filter((entry) => entry.tag === "P" && !entry.isEmptyParagraph).length;
    const coherentEditableState =
      current.editableBeforePaste?.docsera?.canEdit === true &&
      current.editableBeforePaste?.docsera?.editorIsEditable === true &&
      current.editableBeforePaste?.docsera?.optionsEditable === true &&
      current.editableBeforePaste?.docsera?.domContentEditable === "true" &&
      current.editableBeforePaste?.docsera?.viewEditable === true;
    const pastePrevented = pasteBubble?.defaultPreventedAtBubble === true;
    const noNativeBeforeInput = beforeInputEvents.every((event) => event.inputType !== "insertFromPaste");
    const accepted =
      coherentEditableState &&
      pastePrevented &&
      noNativeBeforeInput &&
      current.canonicalEmptyParagraphCount === 0 &&
      substantiveParagraphCount === 4;
    console.log(`Result: ${accepted ? "native paste owned by ProseMirror with four paragraphs" : "native paste regression detected"}`);
    if (!accepted) {
      throw new Error(
        `Native paste verifier failed: ${JSON.stringify({
          beforeInputEvents,
          canonicalEmptyParagraphCount: current.canonicalEmptyParagraphCount,
          coherentEditableState,
          pastePrevented,
          substantiveParagraphCount
        })}`
      );
    }
  } finally {
    console.error("[task87] closing browser and cleaning up");
    await context.close();
    await browser.close();
    if (!parsedArgs.values["keep-data"]) await cleanupWorkspace(instanceUrl, session, workspaceResult);
  }
}

await main().catch((error) => {
  throw new Error(safeErrorMessage(error, "native paste diagnostic failed"));
});
