#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { parseArgs } from "node:util";
import { safeDetail, safeErrorMessage } from "./verification-output-safety.mjs";
import {
  initializeWorkspaceFoundationViaLiveLoad,
  prepareProvisionedWorkspaceForEdit
} from "./workspace-verifier-runtime-sequence.mjs";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow",
  pingPath: "/api/x_2300756_docsera/docsera_runtime/ping",
  workspacePath: "/api/x_2300756_docsera/docsera_runtime/workspaces",
  workspaceProvisioningStatusPath: "/api/x_2300756_docsera/docsera_runtime/workspace-provisioning-status",
  workspaceEditLeasePath: "/api/x_2300756_docsera/docsera_runtime/workspaces/edit-lease",
  pendingChangesPath: "/api/x_2300756_docsera/docsera_runtime/workspaces/pending-changes",
  pagesPath: "/api/x_2300756_docsera/docsera_runtime/pages",
  pageMovePath: "/api/x_2300756_docsera/docsera_runtime/pages/move",
  pageDeletePath: "/api/x_2300756_docsera/docsera_runtime/pages/delete",
  workspacePublishPath: "/api/x_2300756_docsera/docsera_runtime/workspaces/publish",
  workspaceDiscardAllPath: "/api/x_2300756_docsera/docsera_runtime/workspaces/discard-all",
  workspaceDiscardPagePath: "/api/x_2300756_docsera/docsera_runtime/workspaces/discard-page"
};

function cleanText(value) { return typeof value === "string" ? value.trim() : ""; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalizePayload(payload) { let normalized = payload; while (normalized && typeof normalized === "object" && "result" in normalized) normalized = normalized.result; return normalized; }
function readEnv(...names) { for (const name of names) { const value = process.env[name]; if (value && value.trim()) return value.trim(); } return undefined; }
function getOptionValue(value) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function addCheck(checks, ok, label, detail = "") { checks.push({ ok: Boolean(ok), label, detail: safeDetail(detail) }); }
function printCheck(check) { console.log(`${check.ok ? "[pass]" : "[fail]"} ${check.label}`); if (check.detail) console.log(`       ${check.detail}`); }
function envelope(text) { return { schemaVersion: 1, document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } }; }
function signature(pages) {
  return JSON.stringify((Array.isArray(pages) ? pages : []).map((page) => ({
    parentPageSysId: cleanText(page.parentPageSysId),
    publishedBodyText: cleanText(page.publishedBodyText),
    publishedSlug: cleanText(page.publishedSlug),
    publishedTitle: cleanText(page.publishedTitle),
    siblingOrder: Number(page.siblingOrder),
    sysId: cleanText(page.sysId)
  })));
}
function getSetCookieHeaders(headers) { const getSetCookie = headers.getSetCookie; if (typeof getSetCookie === "function") return getSetCookie.call(headers); const singleHeader = headers.get("set-cookie"); return singleHeader ? [singleHeader] : []; }
function ingestCookies(cookieStore, headers) { for (const setCookie of getSetCookieHeaders(headers)) { const [cookiePair] = setCookie.split(";", 1); const separatorIndex = cookiePair.indexOf("="); if (separatorIndex > 0) cookieStore.set(cookiePair.slice(0, separatorIndex), cookiePair.slice(separatorIndex + 1)); } }
function getCookieHeader(cookieStore) { return [...cookieStore.entries()].map(([name, value]) => `${name}=${value}`).join("; "); }
function createAuthHeaders(session, accept = "application/json") { return { Accept: accept, Cookie: session.cookieHeader, "X-UserToken": session.userToken }; }
function failStep(step, detail) { throw new Error(`${step} failed: ${detail}`); }
function requireObject(step, value, label = "response payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) failStep(step, `${label} was missing or invalid.`);
  return value;
}
function requireArray(step, value, label) {
  if (!Array.isArray(value)) failStep(step, `${label} was missing or invalid.`);
  return value;
}
function requireText(step, value, label) {
  const text = cleanText(value);
  if (!text) failStep(step, `${label} was missing or invalid.`);
  return text;
}
function requireInteger(step, value, label) {
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized)) failStep(step, `${label} was missing or invalid.`);
  return normalized;
}
function assertStatus(step, result, expectedStatuses) {
  if (!expectedStatuses.includes(result.status)) {
    failStep(step, `expected HTTP ${expectedStatuses.join(" or ")}, received HTTP ${result.status}.`);
  }
}
function readStepPayload(step, result, expectedStatuses) {
  assertStatus(step, result, expectedStatuses);
  return requireObject(step, normalizePayload(result.payload));
}
function validateAuthorityShape(step, payload) {
  const record = requireObject(step, payload);
  requireText(step, record.changeSetId, "changeSetId");
  requireInteger(step, record.changeSetRevision, "changeSetRevision");
  return record;
}
function validatePageShape(step, page, label = "page") {
  const record = requireObject(step, page, label);
  requireText(step, record.sysId, `${label}.sysId`);
  return record;
}
function validatePageMutationPayload(step, result, expectedStatuses = [200]) {
  const payload = validateAuthorityShape(step, readStepPayload(step, result, expectedStatuses));
  validatePageShape(step, payload.page, "page");
  return payload;
}
function validateMovePayload(step, result) {
  const payload = validateAuthorityShape(step, readStepPayload(step, result, [200]));
  const pages = requireArray(step, payload.pages, "pages");
  if (pages.length === 0) failStep(step, "pages was empty.");
  pages.forEach((page, index) => validatePageShape(step, page, `pages[${index}]`));
  return payload;
}
function validateDeletePayload(step, result) {
  const payload = validateAuthorityShape(step, readStepPayload(step, result, [200]));
  requireText(step, payload.nextPageSysId, "nextPageSysId");
  return payload;
}
function validatePendingPayload(step, result) {
  const payload = readStepPayload(step, result, [200]);
  requireInteger(step, payload.affectedPageCount, "affectedPageCount");
  requireText(step, payload.changeSetId, "changeSetId");
  requireInteger(step, payload.changeSetRevision, "changeSetRevision");
  requireArray(step, payload.rows, "rows");
  requireText(step, payload.workspaceSysId, "workspaceSysId");
  return payload;
}
function validateWorkspaceMutationPayload(step, result, options = {}) {
  const payload = validateAuthorityShape(step, readStepPayload(step, result, [200]));
  requireInteger(step, payload.workspaceStateRevision, "workspaceStateRevision");
  const pages = requireArray(step, payload.pages, "pages");
  pages.forEach((page, index) => validatePageShape(step, page, `pages[${index}]`));
  const pending = requireObject(step, payload.pendingChanges, "pendingChanges");
  validatePendingPayload(`${step} pendingChanges`, { payload: pending, status: 200 }, [200]);
  if (options.requirePublishedSnapshotSetId) requireText(step, payload.publishedSnapshotSetId, "publishedSnapshotSetId");
  return payload;
}
function validateDiscardPagePayload(step, result) {
  const payload = validateWorkspaceMutationPayload(step, result);
  requireText(step, payload.discardedPageSysId, "discardedPageSysId");
  return payload;
}
function validateLeasePayload(step, result) {
  const payload = readStepPayload(step, result, [200]);
  if (cleanText(payload.state) !== "held") failStep(step, `expected lease state "held", received "${cleanText(payload.state) || "unknown"}".`);
  requireText(step, payload.leaseToken, "leaseToken");
  requireText(step, payload.changeSetId, "changeSetId");
  requireInteger(step, payload.changeSetRevision, "changeSetRevision");
  requireInteger(step, payload.workspaceStateRevision, "workspaceStateRevision");
  return payload;
}
function validateWorkspaceCreatePayload(step, payload) {
  const record = requireObject(step, payload);
  const workspace = requireObject(step, record.workspace, "workspace");
  requireText(step, workspace.sysId, "workspace.sysId");
  requireText(step, workspace.slug, "workspace.slug");
  return record;
}
function validatePageList(step, pages) {
  const items = requireArray(step, pages, "pages");
  items.forEach((page, index) => validatePageShape(step, page, `pages[${index}]`));
  return items;
}

function parseKeyringRecord(rawValue, authAlias) {
  if (!rawValue) return { error: `No stored SDK credentials were found for alias "${authAlias}".` };
  try {
    const parsed = JSON.parse(rawValue);
    return parsed?.[authAlias] ? { credential: parsed[authAlias] } : { error: `Stored SDK credentials do not include alias "${authAlias}".` };
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
    body: new URLSearchParams({ sysparm_type: "login", "ni.nolog.user_password": "true", user_name: creds.username, user_password: creds.password }).toString()
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
  const refreshResponse = await fetch(new URL("angular.do?sysparm_type=get_user", instanceUrl), { method: "POST", headers: { Cookie: getCookieHeader(cookieStore) } });
  await refreshResponse.text();
  ingestCookies(cookieStore, refreshResponse.headers);
  const userToken = refreshResponse.headers.get("x-usertoken-response") || loginSessionToken;
  if (!userToken) throw new Error("The SDK login flow did not return a usable X-UserToken.");
  return { cookieHeader: getCookieHeader(cookieStore), userToken };
}

async function fetchJson(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: { ...createAuthHeaders(session, options.accept ?? "application/json"), ...(options.headers ?? {}) }
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  return { ok: response.ok, payload, status: response.status, text };
}

async function callRuntime(instanceUrl, session, path, body, method = "POST") {
  return fetchJson(instanceUrl, session, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function createWorkspace(instanceUrl, session, workspaceName) {
  const result = await callRuntime(instanceUrl, session, defaults.workspacePath, {
    name: workspaceName,
    shortDescription: "Disposable verification workspace owned by verify-e3-t13-workspace-discard-all.mjs",
    icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
    layout: { tocVisible: true, pageWidth: "readable" }
  });
  assertStatus("workspace create", result, [201, 202]);
  const created = requireObject("workspace create", normalizePayload(result.payload));
  if (result.status === 201) return validateWorkspaceCreatePayload("workspace create", created);
  const provisioning = requireObject("workspace create", created.provisioning, "provisioning");
  const requestId = requireText("workspace create", provisioning.requestId, "provisioning.requestId");
  for (let attempt = 0; attempt < 30 && requestId; attempt += 1) {
    const statusResult = await fetchJson(instanceUrl, session, `${defaults.workspaceProvisioningStatusPath}?requestId=${encodeURIComponent(requestId)}`);
    assertStatus("workspace provisioning status", statusResult, [200]);
    const payload = requireObject("workspace provisioning status", normalizePayload(statusResult.payload));
    const statusProvisioning = requireObject("workspace provisioning status", payload.provisioning, "provisioning");
    const state = requireText("workspace provisioning status", statusProvisioning.state, "provisioning.state");
    if (state === "succeeded") return validateWorkspaceCreatePayload("workspace provisioning status", payload);
    if (state === "failed") failStep("workspace provisioning status", cleanText(payload?.error?.message) || "Workspace provisioning failed.");
    await sleep(1000);
  }
  failStep("workspace create", "Workspace provisioning did not complete within the polling window.");
}

async function acquireLease(instanceUrl, session, workspace) {
  return callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/acquire`, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId
  });
}

async function renewLease(instanceUrl, session, workspace, leaseToken) {
  return callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/renew`, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId,
    leaseToken
  });
}

async function listPages(instanceUrl, session, workspaceSlug, mode) {
  const result = await fetchJson(instanceUrl, session, `${defaults.pagesPath}?workspaceSlug=${encodeURIComponent(workspaceSlug)}&mode=${encodeURIComponent(mode)}`);
  return normalizePayload(result.payload)?.items ?? [];
}

function mutationBase(workspace, lease, authority = lease) {
  return {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId,
    workspaceLeaseToken: lease.leaseToken,
    expectedChangeSetId: authority.changeSetId,
    expectedChangeSetRevision: authority.changeSetRevision
  };
}

async function main() {
  const parsedArgs = parseArgs({ allowPositionals: false, options: { "auth-alias": { type: "string" }, "instance-url": { type: "string" }, help: { type: "boolean", short: "h" } }, args: process.argv.slice(2) });
  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/verify-e3-t14-workspace-individual-undo.mjs [--auth-alias <alias>] [--instance-url <url>]");
    return;
  }

  const authAlias = getOptionValue(parsedArgs.values["auth-alias"]) ?? readEnv("DOCSERA_SDK_AUTH_ALIAS", "SN_SDK_AUTH_ALIAS") ?? defaults.authAlias;
  const instanceUrl = getOptionValue(parsedArgs.values["instance-url"]) ?? readEnv("DOCSERA_SDK_INSTANCE_URL", "SN_SDK_INSTANCE_URL") ?? defaults.instanceUrl;
  console.log("Docsera E3-T14 Workspace Individual Undo verification");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);

  const parsedCredential = parseKeyringRecord(new Entry(defaults.keyringService, defaults.keyringAccount).getPassword(), authAlias);
  if (parsedCredential.error) throw new Error(parsedCredential.error);
  const session = await establishBasicSession(instanceUrl, parsedCredential.credential.creds);
  const checks = [];

  const ping = await fetchJson(instanceUrl, session, defaults.pingPath);
  addCheck(checks, ping.status === 200, "runtime ping is healthy");

  const { lease: initialLeaseResult, workspaceResult } = await prepareProvisionedWorkspaceForEdit({
    createWorkspace: async () => createWorkspace(instanceUrl, session, `E3-T14 Workspace Individual Undo ${Date.now()}`),
    initializeWorkspace: async ({ workspace }) => {
      const initializedPages = validatePageList(
        "initialize workspace foundation via Live page load",
        await initializeWorkspaceFoundationViaLiveLoad({
          listPages: (workspaceSlug, mode) => listPages(instanceUrl, session, workspaceSlug, mode),
          workspace
        })
      );
      addCheck(
        checks,
        Array.isArray(initializedPages),
        "initialized workspace foundation through the normal Live page load route",
        { loadedPageCount: initializedPages.length, workspaceSlug: workspace.slug, workspaceSysId: workspace.sysId }
      );
    },
    acquireLease: async ({ workspace }) => acquireLease(instanceUrl, session, workspace)
  });
  const workspace = validateWorkspaceCreatePayload("workspace create", workspaceResult).workspace;
  addCheck(checks, true, "created disposable verification workspace", { workspaceSlug: workspace.slug, workspaceSysId: workspace.sysId });

  const lease = validateLeasePayload("lease acquire", initialLeaseResult);
  addCheck(checks, true, "acquired a valid Edit lease", lease);

  const readPendingChanges = async (step) => validatePendingPayload(step, await callRuntime(instanceUrl, session, defaults.pendingChangesPath, {
    workspaceSlug: workspace.slug,
    workspaceSysId: workspace.sysId,
    workspaceLeaseToken: lease.leaseToken
  }));
  const findPage = (pages, pageId) => pages.find((page) => cleanText(page.sysId) === cleanText(pageId)) ?? null;
  const findPendingRow = (pending, pageId) => pending.rows.find((row) => cleanText(row.pageSysId) === cleanText(pageId)) ?? null;

  let authority = lease;
  let response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: null, title: "Overview" });
  authority = validatePageMutationPayload("create root page", response, [201]);
  const rootPageId = requireText("create root page", authority?.page?.sysId, "page.sysId");
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: rootPageId, title: "Child" });
  authority = validatePageMutationPayload("create child page", response, [201]);
  const childPageId = requireText("create child page", authority?.page?.sysId, "page.sysId");
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: null, title: "Deprecated" });
  authority = validatePageMutationPayload("create removable root page", response, [201]);
  const removedRootPageId = requireText("create removable root page", authority?.page?.sysId, "page.sysId");
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: removedRootPageId, title: "Deprecated Child" });
  authority = validatePageMutationPayload("create removable child page", response, [201]);
  const removedChildPageId = requireText("create removable child page", authority?.page?.sysId, "page.sysId");

  const baselinePublish = await callRuntime(instanceUrl, session, defaults.workspacePublishPath, {
    ...mutationBase(workspace, lease, authority),
    commandId: `baseline-publish-${Date.now()}`
  });
  const baselinePublished = validateWorkspaceMutationPayload("baseline publish", baselinePublish, { requirePublishedSnapshotSetId: true });
  authority = baselinePublished;
  const liveBaseline = validatePageList("list Live pages before undo", await listPages(instanceUrl, session, workspace.slug, "live"));
  addCheck(checks, baselinePublished.pendingChanges.affectedPageCount === 0 && Number(baselinePublished.changeSetRevision) === 0, "baseline publish succeeded and returned successor authority", baselinePublish.payload);

  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), pageSysId: rootPageId, expectedRevision: 0, draftContentJson: envelope("Overview edited body") }, "PATCH");
  authority = validatePageMutationPayload("save page body", response);
  let pending = await readPendingChanges("read pending changes after body edit");
  addCheck(checks, findPendingRow(pending, rootPageId)?.category === "Modified", "Modified row is present before individual undo", pending);
  const modifiedAuthorityBeforeUndo = { changeSetId: authority.changeSetId, changeSetRevision: authority.changeSetRevision };
  let discardResponse = await callRuntime(instanceUrl, session, defaults.workspaceDiscardPagePath, {
    ...mutationBase(workspace, lease, authority),
    pageSysId: rootPageId
  });
  let discardPayload = validateDiscardPagePayload("discard modified row", discardResponse);
  authority = discardPayload;
  let editPages = discardPayload.pages;
  addCheck(checks, discardPayload.discardedPageSysId === rootPageId && discardPayload.changeSetId === modifiedAuthorityBeforeUndo.changeSetId && Number(discardPayload.changeSetRevision) > Number(modifiedAuthorityBeforeUndo.changeSetRevision), "Modified Undo advances authority for the same active change set", discardPayload);
  addCheck(checks, signature(await listPages(instanceUrl, session, workspace.slug, "live")) === signature(liveBaseline), "Live remains unchanged after Modified Undo", { liveBaseline });
  addCheck(checks, findPendingRow(discardPayload.pendingChanges, rootPageId) === null && cleanText(findPage(editPages, rootPageId)?.draftBodyText) === cleanText(findPage(liveBaseline, rootPageId)?.draftBodyText), "Modified Undo restores published content/settings and removes the row", { editPages, pending: discardPayload.pendingChanges });

  response = await callRuntime(instanceUrl, session, defaults.pageMovePath, { ...mutationBase(workspace, lease, authority), pageSysId: childPageId, parentPageSysId: null, siblingOrder: "9" });
  authority = validateMovePayload("move child page", response);
  pending = await readPendingChanges("read pending changes after move");
  addCheck(checks, findPendingRow(pending, childPageId)?.category === "Moved", "Moved row is present before individual undo", pending);
  discardResponse = await callRuntime(instanceUrl, session, defaults.workspaceDiscardPagePath, {
    ...mutationBase(workspace, lease, authority),
    pageSysId: childPageId
  });
  discardPayload = validateDiscardPagePayload("discard moved row", discardResponse);
  authority = discardPayload;
  editPages = discardPayload.pages;
  addCheck(checks, findPendingRow(discardPayload.pendingChanges, childPageId) === null && cleanText(findPage(editPages, childPageId)?.parentPageSysId) === cleanText(findPage(liveBaseline, childPageId)?.parentPageSysId), "Moved Undo restores the published hierarchy and clears the row", { editPages, pending: discardPayload.pendingChanges });

  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: rootPageId, title: "New Guide" });
  authority = validatePageMutationPayload("create added page", response, [201]);
  const addedPageId = requireText("create added page", authority?.page?.sysId, "page.sysId");
  pending = await readPendingChanges("read pending changes after added page create");
  addCheck(checks, findPendingRow(pending, addedPageId)?.category === "Added", "Added row is present before individual undo", pending);
  discardResponse = await callRuntime(instanceUrl, session, defaults.workspaceDiscardPagePath, {
    ...mutationBase(workspace, lease, authority),
    pageSysId: addedPageId
  });
  discardPayload = validateDiscardPagePayload("discard added row", discardResponse);
  authority = discardPayload;
  editPages = discardPayload.pages;
  addCheck(checks, findPendingRow(discardPayload.pendingChanges, addedPageId) === null && !editPages.some((page) => cleanText(page.sysId) === addedPageId), "Added Undo removes the draft-only page and clears the row", { editPages, pending: discardPayload.pendingChanges });

  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: rootPageId, title: "Added Parent" });
  authority = validatePageMutationPayload("create Added subtree parent", response, [201]);
  const addedParentPageId = requireText("create Added subtree parent", authority?.page?.sysId, "page.sysId");
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: addedParentPageId, title: "Added Child" });
  authority = validatePageMutationPayload("create Added subtree child", response, [201]);
  const addedChildPageId = requireText("create Added subtree child", authority?.page?.sysId, "page.sysId");
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), parentPageSysId: addedChildPageId, title: "Added Grandchild" });
  authority = validatePageMutationPayload("create Added subtree grandchild", response, [201]);
  const addedGrandchildPageId = requireText("create Added subtree grandchild", authority?.page?.sysId, "page.sysId");
  pending = await readPendingChanges("read pending changes after Added subtree create");
  addCheck(checks, findPendingRow(pending, addedParentPageId)?.category === "Added" && findPendingRow(pending, addedChildPageId)?.category === "Added" && findPendingRow(pending, addedGrandchildPageId)?.category === "Added", "Added-parent subtree exposes Added rows for every nested Added page before undo", pending);
  discardResponse = await callRuntime(instanceUrl, session, defaults.workspaceDiscardPagePath, {
    ...mutationBase(workspace, lease, authority),
    pageSysId: addedParentPageId
  });
  discardPayload = validateDiscardPagePayload("discard Added subtree parent row", discardResponse);
  authority = discardPayload;
  editPages = discardPayload.pages;
  addCheck(checks, !findPendingRow(discardPayload.pendingChanges, addedParentPageId) && !findPendingRow(discardPayload.pendingChanges, addedChildPageId) && !findPendingRow(discardPayload.pendingChanges, addedGrandchildPageId), "Added-parent Undo clears the complete nested Added subtree from pending rows", discardPayload.pendingChanges);
  addCheck(checks, !findPage(editPages, addedParentPageId) && !findPage(editPages, addedChildPageId) && !findPage(editPages, addedGrandchildPageId), "Added-parent Undo removes the complete nested Added subtree from Edit mode", editPages);
  addCheck(checks, signature(await listPages(instanceUrl, session, workspace.slug, "live")) === signature(liveBaseline), "Live remains unchanged after nested Added subtree Undo", { liveBaseline });

  response = await callRuntime(instanceUrl, session, defaults.pageDeletePath, { ...mutationBase(workspace, lease, authority), pageSysId: removedRootPageId });
  authority = validateDeletePayload("delete removable subtree root", response);
  pending = await readPendingChanges("read pending changes after subtree remove");
  addCheck(checks, findPendingRow(pending, removedRootPageId)?.category === "Removed" && findPendingRow(pending, removedChildPageId)?.category === "Removed", "Removed subtree exposes Removed rows for both root and descendant", pending);
  discardResponse = await callRuntime(instanceUrl, session, defaults.workspaceDiscardPagePath, {
    ...mutationBase(workspace, lease, authority),
    pageSysId: removedChildPageId
  });
  discardPayload = validateDiscardPagePayload("discard removed descendant row", discardResponse);
  authority = discardPayload;
  editPages = discardPayload.pages;
  addCheck(checks, findPendingRow(discardPayload.pendingChanges, removedRootPageId) === null && findPendingRow(discardPayload.pendingChanges, removedChildPageId) === null, "Undoing a descendant Removed row clears the complete subtree removal batch", discardPayload.pendingChanges);
  addCheck(checks, Boolean(findPage(editPages, removedRootPageId)) && Boolean(findPage(editPages, removedChildPageId)), "Removed subtree Undo restores the complete subtree in Edit mode", editPages);
  addCheck(checks, signature(await listPages(instanceUrl, session, workspace.slug, "live")) === signature(liveBaseline), "Live remains unchanged after Removed subtree Undo", { liveBaseline });

  const currentRootDraftRevision = Number(findPage(editPages, rootPageId)?.draftRevision ?? 0);
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(workspace, lease, authority), pageSysId: rootPageId, expectedRevision: currentRootDraftRevision, draftContentJson: envelope("Overview stale test") }, "PATCH");
  authority = validatePageMutationPayload("save page body for stale rejection", response);
  const staleResponse = await callRuntime(instanceUrl, session, defaults.workspaceDiscardPagePath, {
    ...mutationBase(workspace, lease, {
      changeSetId: authority.changeSetId,
      changeSetRevision: Number(authority.changeSetRevision) - 1
    }),
    pageSysId: rootPageId
  });
  const stalePayload = staleResponse.payload && typeof staleResponse.payload === "object" ? staleResponse.payload : {};
  const staleError =
    stalePayload && typeof stalePayload === "object" && stalePayload.error && typeof stalePayload.error === "object"
      ? stalePayload.error
      : {};
  pending = await readPendingChanges("read pending changes after stale rejection");
  addCheck(checks, staleResponse.status === 409, "stale authority is rejected without mutating durable state", { payload: stalePayload, status: staleResponse.status });
  addCheck(checks, findPendingRow(pending, rootPageId)?.category === "Modified", "stale individual Undo leaves the pending row intact", pending);

  const renewed = validateLeasePayload("lease renew", await renewLease(instanceUrl, session, workspace, lease.leaseToken));
  addCheck(checks, cleanText(renewed?.state) === "held" && renewed?.leaseToken === lease.leaseToken && renewed?.changeSetId === authority.changeSetId && Number(renewed?.changeSetRevision) === Number(authority.changeSetRevision), "Edit lease is retained and reports the latest authority after individual Undo mutations", renewed);

  for (const check of checks) printCheck(check);
  console.log("");
  console.log(`Disposable workspace left behind: ${workspace.slug} (${workspace.sysId})`);
  const failed = checks.some((check) => !check.ok);
  console.log(`Result: ${failed ? "fail" : "pass"}`);
  if (failed) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(`[fail] ${safeErrorMessage(error, "E3-T14 Workspace Individual Undo verification failed.")}`);
  console.log("");
  console.log("Result: fail");
  process.exitCode = 1;
});
