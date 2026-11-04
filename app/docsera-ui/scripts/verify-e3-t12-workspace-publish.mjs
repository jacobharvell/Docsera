#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { parseArgs } from "node:util";
import { safeDetail, safeErrorMessage } from "./verification-output-safety.mjs";

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
  requestTable: "x_2300756_docsera_workspace_provision_request",
  workspaceTable: "x_2300756_docsera_workspace",
  workspaceLeaseTable: "x_2300756_docsera_workspace_edit_lease",
  pageTable: "x_2300756_docsera_page",
  workspaceChangeSetTable: "x_2300756_docsera_workspace_change_set",
  workspaceSnapshotSetTable: "x_2300756_docsera_workspace_snapshot_set",
  workspacePageSnapshotTable: "x_2300756_docsera_workspace_page_snapshot",
  workspaceChangeEntryTable: "x_2300756_docsera_workspace_change_entry",
  workspaceRemovalBatchTable: "x_2300756_docsera_workspace_removal_batch",
  workspaceRemovalMemberTable: "x_2300756_docsera_workspace_removal_member",
  workspaceMutationClaimTable: "x_2300756_docsera_workspace_mutation_claim"
};

function cleanText(value) { return typeof value === "string" ? value.trim() : ""; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalizePayload(payload) { let normalized = payload; while (normalized && typeof normalized === "object" && "result" in normalized) normalized = normalized.result; return normalized; }
function readEnv(...names) { for (const name of names) { const value = process.env[name]; if (value && value.trim()) return value.trim(); } return undefined; }
function getOptionValue(value) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function addCheck(checks, ok, label, detail = "") { checks.push({ ok: Boolean(ok), label, detail: safeDetail(detail) }); }
function printCheck(check) { console.log(`${check.ok ? "[pass]" : "[fail]"} ${check.label}`); if (check.detail) console.log(`       ${check.detail}`); }
function envelope(text) { return { schemaVersion: 1, document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } }; }
function liveProjectionSignature(pages) {
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

async function fetchText(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), { ...options, headers: { ...createAuthHeaders(session, options.accept ?? "text/html"), ...(options.headers ?? {}) } });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

async function runBackgroundScript(instanceUrl, session, script, scopeName = "x_2300756_docsera") {
  const form = await fetchText(instanceUrl, session, "sys.scripts.do", { accept: "text/html" });
  if (!form.ok) throw new Error(`Background script form failed with HTTP ${form.status}.`);
  const ckMatch = form.text.match(/name="sysparm_ck" type="hidden" value="([^"]+)"/i);
  const scopePattern = new RegExp(`<option[^>]+value="([^"]+)"[^>]*>${scopeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</option>`, "i");
  const scopeMatch = form.text.match(scopePattern);
  if (!ckMatch?.[1] || !scopeMatch?.[1]) throw new Error("Could not resolve the background script form token or Docsera scope.");
  const response = await fetchText(instanceUrl, session, "sys.scripts.do", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ script, sys_scope: scopeMatch[1], sysparm_ck: ckMatch[1], runscript: "Run script", record_for_rollback: "false", quota_managed_transaction: "true" }).toString(),
    accept: "text/html"
  });
  if (!response.ok) throw new Error(`Background script execution failed with HTTP ${response.status}.`);
  const resultMatch = response.text.match(/DOCSERA_RESULT:([\s\S]*?)(?:<BR\/>|<\/PRE>)/i);
  if (!resultMatch?.[1]) throw new Error("Background script result marker was not found.");
  const parsed = JSON.parse(resultMatch[1].replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim());
  if (parsed?.error) throw new Error(safeErrorMessage(parsed.error, "Background script failed."));
  return parsed;
}

async function callRuntime(instanceUrl, session, path, body, method = "POST") {
  return fetchJson(instanceUrl, session, path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function createWorkspace(instanceUrl, session, workspaceName) {
  const result = await callRuntime(instanceUrl, session, defaults.workspacePath, {
    name: workspaceName,
    shortDescription: "Disposable verification workspace owned by verify-e3-t12-workspace-publish.mjs",
    icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
    layout: { tocVisible: true, pageWidth: "readable" }
  });
  if (![201, 202].includes(result.status)) throw new Error(`Workspace create failed with HTTP ${result.status}: ${result.text}`);
  const created = normalizePayload(result.payload);
  if (result.status === 201) return created;
  const requestId = cleanText(created?.provisioning?.requestId);
  for (let attempt = 0; attempt < 30 && requestId; attempt += 1) {
    const statusResult = await fetchJson(instanceUrl, session, `${defaults.workspaceProvisioningStatusPath}?requestId=${encodeURIComponent(requestId)}`);
    const payload = normalizePayload(statusResult.payload);
    if (cleanText(payload?.provisioning?.state) === "succeeded") return payload;
    if (cleanText(payload?.provisioning?.state) === "failed") throw new Error(payload?.error?.message ?? "Workspace provisioning failed.");
    await sleep(1000);
  }
  throw new Error("Workspace provisioning did not complete within the polling window.");
}

function cleanupRecord(workspaceResult) {
  return {
    requestSysId: cleanText(workspaceResult?.provisioning?.requestId),
    workspaceSysId: cleanText(workspaceResult?.workspace?.sysId),
    workspaceSlug: cleanText(workspaceResult?.workspace?.slug),
    adminGroupSysId: cleanText(workspaceResult?.groups?.admin?.sysId),
    editorGroupSysId: cleanText(workspaceResult?.groups?.editor?.sysId),
    leaseToken: ""
  };
}

async function seedPublishWorkspace(instanceUrl, session, workspaceSysId) {
  return runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (!workspace.get(workspaceSysId)) { gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found.' })); return; }
      var currentUser = String(gs.getUserID() || '');
      function envelope(text) { return JSON.stringify({ schemaVersion: 1, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: text }] }] } }); }
      function deleteBy(table, field) { var row = new GlideRecord(table); row.addQuery(field, workspaceSysId); row.query(); while (row.next()) row.deleteRecord(); }
      deleteBy('${defaults.workspaceLeaseTable}', 'workspace'); deleteBy('${defaults.workspaceMutationClaimTable}', 'workspace'); deleteBy('${defaults.workspaceChangeEntryTable}', 'workspace');
      deleteBy('${defaults.workspaceRemovalMemberTable}', 'removal_batch.change_set.workspace'); deleteBy('${defaults.workspaceRemovalBatchTable}', 'change_set.workspace');
      deleteBy('${defaults.workspacePageSnapshotTable}', 'snapshot_set.workspace'); deleteBy('${defaults.workspaceSnapshotSetTable}', 'workspace'); deleteBy('${defaults.workspaceChangeSetTable}', 'workspace'); deleteBy('${defaults.pageTable}', 'workspace');
      function page(title, slug, order, parent) {
        var body = title + ' body';
        var row = new GlideRecord('${defaults.pageTable}'); row.initialize();
        row.workspace = workspaceSysId; row.parent_page = parent || ''; row.sibling_order = order;
        row.draft_title = title; row.draft_slug = slug; row.draft_slug_normalized = slug; row.draft_content_json = envelope(body); row.draft_body_text = body; row.draft_revision = 0;
        row.published_title = title; row.published_slug = slug; row.published_slug_normalized = slug; row.published_content_json = envelope(body); row.published_body_text = body; row.published_on = new GlideDateTime(); row.published_by = currentUser; row.publication_state = 'published'; row.active = true;
        return String(row.insert() || '');
      }
      function snapshot(snapshotSet, pageId, parent, order, title, slug) {
        var body = title + ' body';
        var row = new GlideRecord('${defaults.workspacePageSnapshotTable}'); row.initialize();
        row.snapshot_set = snapshotSet; row.page = pageId; row.snapshot_page_key = snapshotSet + ':' + pageId; row.parent_page = parent || ''; row.sibling_order = order;
        row.title = title; row.slug = slug; row.slug_normalized = slug; row.content_json = envelope(body); row.body_text = body; row.active = true; row.published_on = new GlideDateTime(); row.published_by = currentUser; row.insert();
      }
      var changeSet = new GlideRecord('${defaults.workspaceChangeSetTable}'); changeSet.initialize();
      changeSet.workspace = workspaceSysId; changeSet.generation_key = workspaceSysId + ':e3-t12-change-set'; changeSet.change_set_revision = 0; changeSet.next_pending_sequence = 1; changeSet.lifecycle_state = 'active'; changeSet.recovery_state = 'none';
      var changeSetId = String(changeSet.insert() || '');
      var snapshotSet = new GlideRecord('${defaults.workspaceSnapshotSetTable}'); snapshotSet.initialize();
      snapshotSet.workspace = workspaceSysId; snapshotSet.snapshot_key = workspaceSysId + ':e3-t12-snapshot'; snapshotSet.readiness_state = 'ready'; snapshotSet.source_change_set = changeSetId; snapshotSet.source_change_set_revision = 0; snapshotSet.published_on = new GlideDateTime();
      var snapshotSetId = String(snapshotSet.insert() || '');
      var root = page('Overview', 'overview', '1', '');
      var child = page('Child', 'child', '1', root);
      var removed = page('Deprecated', 'deprecated', '2', '');
      snapshot(snapshotSetId, root, '', '1', 'Overview', 'overview');
      snapshot(snapshotSetId, child, root, '1', 'Child', 'child');
      snapshot(snapshotSetId, removed, '', '2', 'Deprecated', 'deprecated');
      workspace.pending_change_set = changeSetId; workspace.published_snapshot_set = snapshotSetId; workspace.workspace_state_revision = 0; workspace.update();
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ changeSetId: changeSetId, snapshotSetId: snapshotSetId, root: root, child: child, removed: removed }));
    })();
  `);
}

async function acquireLease(instanceUrl, session, cleanup) {
  const result = await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/acquire`, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId });
  const lease = normalizePayload(result.payload);
  cleanup.leaseToken = cleanText(lease?.leaseToken);
  return { raw: result, lease };
}

async function renewLease(instanceUrl, session, cleanup, leaseToken) {
  const result = await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/renew`, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, leaseToken });
  return normalizePayload(result.payload);
}

async function listPages(instanceUrl, session, workspaceSlug, mode) {
  const result = await fetchJson(instanceUrl, session, `${defaults.pagesPath}?workspaceSlug=${encodeURIComponent(workspaceSlug)}&mode=${encodeURIComponent(mode)}`);
  return normalizePayload(result.payload)?.items ?? [];
}

function mutationBase(cleanup, lease, authority = lease) {
  return {
    workspaceSlug: cleanup.workspaceSlug,
    workspaceSysId: cleanup.workspaceSysId,
    workspaceLeaseToken: lease.leaseToken,
    expectedChangeSetId: authority.changeSetId,
    expectedChangeSetRevision: authority.changeSetRevision
  };
}

async function cleanupWorkspace(instanceUrl, session, cleanup) {
  if (!cleanup.workspaceSysId) return { skipped: true };
  if (cleanup.workspaceSlug && cleanup.leaseToken) {
    await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/release`, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, leaseToken: cleanup.leaseToken }).catch(() => undefined);
  }
  return runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(cleanup.workspaceSysId)};
      var requestSysId = ${JSON.stringify(cleanup.requestSysId)};
      var adminGroup = ${JSON.stringify(cleanup.adminGroupSysId)};
      var editorGroup = ${JSON.stringify(cleanup.editorGroupSysId)};
      function deleteBy(table, field) { var row = new GlideRecord(table); row.addQuery(field, workspaceSysId); row.query(); while (row.next()) row.deleteRecord(); }
      deleteBy('${defaults.workspaceLeaseTable}', 'workspace'); deleteBy('${defaults.workspaceMutationClaimTable}', 'workspace'); deleteBy('${defaults.workspaceChangeEntryTable}', 'workspace');
      deleteBy('${defaults.workspaceRemovalMemberTable}', 'removal_batch.change_set.workspace'); deleteBy('${defaults.workspaceRemovalBatchTable}', 'change_set.workspace');
      deleteBy('${defaults.workspacePageSnapshotTable}', 'snapshot_set.workspace'); deleteBy('${defaults.workspaceSnapshotSetTable}', 'workspace'); deleteBy('${defaults.workspaceChangeSetTable}', 'workspace'); deleteBy('${defaults.pageTable}', 'workspace');
      if (requestSysId) { var request = new GlideRecord('${defaults.requestTable}'); if (request.get(requestSysId)) request.deleteRecord(); }
      var workspace = new GlideRecord('${defaults.workspaceTable}'); if (workspace.get(workspaceSysId)) workspace.deleteRecord();
      function cleanupGroup(groupId) { if (!groupId) return; var member = new GlideRecord('sys_user_grmember'); member.addQuery('group', groupId); member.query(); while (member.next()) member.deleteRecord(); var role = new GlideRecord('sys_group_has_role'); role.addQuery('group', groupId); role.query(); while (role.next()) role.deleteRecord(); var group = new GlideRecord('sys_user_group'); if (group.get(groupId)) group.deleteRecord(); }
      cleanupGroup(adminGroup); cleanupGroup(editorGroup);
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
    })();
  `);
}

async function runMixedPublishScenario(instanceUrl, session, checks, cleanupItems) {
  const workspaceResult = await createWorkspace(instanceUrl, session, `E3-T12 Workspace Publish ${Date.now()}`);
  const cleanup = cleanupRecord(workspaceResult);
  cleanupItems.push(cleanup);
  const seed = await seedPublishWorkspace(instanceUrl, session, cleanup.workspaceSysId);
  const { raw: leaseRaw, lease } = await acquireLease(instanceUrl, session, cleanup);
  addCheck(checks, leaseRaw.status === 200 && cleanText(lease?.state) === "held" && lease?.changeSetRevision === 0, "acquired a valid Edit lease for publish", leaseRaw.payload);

  const liveBefore = await listPages(instanceUrl, session, cleanup.workspaceSlug, "live");
  let authority = lease;
  let response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(cleanup, lease, authority), pageSysId: seed.root, expectedRevision: 0, draftContentJson: envelope("Overview edited body") }, "PATCH");
  authority = normalizePayload(response.payload);
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(cleanup, lease, authority), pageSysId: seed.root, title: "Overview Published", slug: "overview-published" }, "PUT");
  authority = normalizePayload(response.payload);
  response = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(cleanup, lease, authority), parentPageSysId: seed.root, title: "New Guide" });
  authority = normalizePayload(response.payload);
  const addedPageId = cleanText(authority?.page?.sysId);
  response = await callRuntime(instanceUrl, session, defaults.pageMovePath, { ...mutationBase(cleanup, lease, authority), pageSysId: seed.child, parentPageSysId: null, siblingOrder: "9" });
  authority = normalizePayload(response.payload);
  response = await callRuntime(instanceUrl, session, defaults.pageDeletePath, { ...mutationBase(cleanup, lease, authority), pageSysId: seed.removed });
  authority = normalizePayload(response.payload);

  const pendingBefore = normalizePayload((await callRuntime(instanceUrl, session, defaults.pendingChangesPath, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, workspaceLeaseToken: lease.leaseToken })).payload);
  const liveStillBeforePublish = await listPages(instanceUrl, session, cleanup.workspaceSlug, "live");
  addCheck(checks, pendingBefore?.affectedPageCount === 4 && pendingBefore?.rows?.some((row) => row.category === "Added") && pendingBefore?.rows?.some((row) => row.category === "Modified") && pendingBefore?.rows?.some((row) => row.category === "Moved") && pendingBefore?.rows?.some((row) => row.category === "Removed"), "mixed pending set contains Added, Modified, Moved, and Removed rows", pendingBefore);
  addCheck(checks, liveProjectionSignature(liveStillBeforePublish) === liveProjectionSignature(liveBefore), "Live remains unchanged before publish succeeds", { liveBefore, liveStillBeforePublish });

  const noLease = await callRuntime(instanceUrl, session, defaults.workspacePublishPath, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, commandId: "no-lease", expectedChangeSetId: authority.changeSetId, expectedChangeSetRevision: authority.changeSetRevision });
  const stale = await callRuntime(instanceUrl, session, defaults.workspacePublishPath, { ...mutationBase(cleanup, lease, { changeSetId: seed.changeSetId, changeSetRevision: 0 }), commandId: "stale-generation" });
  addCheck(checks, [400, 403, 409].includes(noLease.status) && cleanText(normalizePayload(noLease.payload)?.error?.code) === "workspace_lease_invalid", "publish without current lease is denied", noLease.payload);
  addCheck(checks, stale.status === 409, "publish with stale authority is denied before selector change", stale.payload);

  const publish = await callRuntime(instanceUrl, session, defaults.workspacePublishPath, { ...mutationBase(cleanup, lease, authority), commandId: `publish-${Date.now()}` });
  const published = normalizePayload(publish.payload);
  const liveAfter = await listPages(instanceUrl, session, cleanup.workspaceSlug, "live");
  const renewed = await renewLease(instanceUrl, session, cleanup, lease.leaseToken);
  addCheck(checks, publish.status === 200 && published?.pendingChanges?.affectedPageCount === 0 && published?.changeSetRevision === 0, "publish succeeds and returns successor authority with zero pending changes", published);
  addCheck(checks, liveAfter.some((page) => cleanText(page.sysId) === addedPageId) && liveAfter.some((page) => cleanText(page.draftTitle) === "Overview Published") && liveAfter.some((page) => cleanText(page.sysId) === seed.child && cleanText(page.parentPageSysId) === "") && !liveAfter.some((page) => cleanText(page.sysId) === seed.removed), "Live reflects the exact published Edit outcome after success", liveAfter);
  addCheck(checks, cleanText(renewed?.state) === "held" && renewed?.leaseToken === lease.leaseToken && renewed?.changeSetId === published?.changeSetId && Number(renewed?.changeSetRevision) === 0, "Edit lease is retained and now reports returned successor authority", renewed);

  const followup = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(cleanup, lease, published), pageSysId: seed.root, title: "Post Publish Edit", slug: "post-publish-edit" }, "PUT");
  const followupPayload = normalizePayload(followup.payload);
  addCheck(checks, followup.status === 200 && followupPayload?.changeSetId === published?.changeSetId && Number(followupPayload?.changeSetRevision) === 1, "subsequent Edit mutation uses returned server authority", followup.payload);
}

async function runCompetingPublishScenario(instanceUrl, session, checks, cleanupItems) {
  const workspaceResult = await createWorkspace(instanceUrl, session, `E3-T12 Publish Contention ${Date.now()}`);
  const cleanup = cleanupRecord(workspaceResult);
  cleanupItems.push(cleanup);
  const seed = await seedPublishWorkspace(instanceUrl, session, cleanup.workspaceSysId);
  const { lease } = await acquireLease(instanceUrl, session, cleanup);
  const settings = await callRuntime(instanceUrl, session, defaults.pagesPath, { ...mutationBase(cleanup, lease), pageSysId: seed.root, title: "Contended Publish", slug: "contended-publish" }, "PUT");
  const authority = normalizePayload(settings.payload);
  const [first, second] = await Promise.all([
    callRuntime(instanceUrl, session, defaults.workspacePublishPath, { ...mutationBase(cleanup, lease, authority), commandId: "contender-one" }),
    callRuntime(instanceUrl, session, defaults.workspacePublishPath, { ...mutationBase(cleanup, lease, authority), commandId: "contender-two" })
  ]);
  const statuses = [first.status, second.status];
  addCheck(checks, statuses.filter((status) => status === 200).length === 1 && statuses.filter((status) => status === 409).length === 1, "competing Publish requests have one authoritative winner", { first: first.payload, second: second.payload });
}

async function main() {
  const parsedArgs = parseArgs({ allowPositionals: false, options: { "auth-alias": { type: "string" }, "instance-url": { type: "string" }, "keep-data": { type: "boolean" }, help: { type: "boolean", short: "h" } }, args: process.argv.slice(2) });
  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/verify-e3-t12-workspace-publish.mjs [--auth-alias <alias>] [--instance-url <url>] [--keep-data]");
    return;
  }
  const authAlias = getOptionValue(parsedArgs.values["auth-alias"]) ?? readEnv("DOCSERA_SDK_AUTH_ALIAS", "SN_SDK_AUTH_ALIAS") ?? defaults.authAlias;
  const instanceUrl = getOptionValue(parsedArgs.values["instance-url"]) ?? readEnv("DOCSERA_SDK_INSTANCE_URL", "SN_SDK_INSTANCE_URL") ?? defaults.instanceUrl;
  const keepData = Boolean(parsedArgs.values["keep-data"]);
  console.log("Docsera E3-T12 Workspace Publish verification");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  const parsedCredential = parseKeyringRecord(new Entry(defaults.keyringService, defaults.keyringAccount).getPassword(), authAlias);
  if (parsedCredential.error) throw new Error(parsedCredential.error);
  const session = await establishBasicSession(instanceUrl, parsedCredential.credential.creds);
  const checks = [];
  const cleanupItems = [];
  try {
    addCheck(checks, (await fetchJson(instanceUrl, session, defaults.pingPath)).status === 200, "runtime ping is healthy");
    await runMixedPublishScenario(instanceUrl, session, checks, cleanupItems);
    await runCompetingPublishScenario(instanceUrl, session, checks, cleanupItems);
  } finally {
    if (!keepData) {
      for (const cleanup of cleanupItems.reverse()) {
        addCheck(checks, (await cleanupWorkspace(instanceUrl, session, cleanup)).ok, `verification data cleanup removed ${cleanup.workspaceSlug || cleanup.workspaceSysId}`);
      }
    }
  }
  for (const check of checks) printCheck(check);
  const failed = checks.some((check) => !check.ok);
  console.log("");
  console.log(`Result: ${failed ? "fail" : "pass"}`);
  if (failed) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(`[fail] ${safeErrorMessage(error, "E3-T12 Workspace Publish verification failed.")}`);
  console.log("");
  console.log("Result: fail");
  process.exitCode = 1;
});
