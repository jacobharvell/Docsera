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
  pageSavePath: "/api/x_2300756_docsera/docsera_runtime/pages",
  pageMovePath: "/api/x_2300756_docsera/docsera_runtime/pages/move",
  pageDeletePath: "/api/x_2300756_docsera/docsera_runtime/pages/delete",
  requestTable: "x_2300756_docsera_workspace_provision_request",
  workspaceTable: "x_2300756_docsera_workspace",
  workspaceLeaseTable: "x_2300756_docsera_workspace_edit_lease",
  pageTable: "x_2300756_docsera_page",
  workspaceChangeSetTable: "x_2300756_docsera_workspace_change_set",
  workspaceSnapshotSetTable: "x_2300756_docsera_workspace_snapshot_set",
  workspacePageSnapshotTable: "x_2300756_docsera_workspace_page_snapshot",
  workspaceChangeEntryTable: "x_2300756_docsera_workspace_change_entry",
  workspaceMutationClaimTable: "x_2300756_docsera_workspace_mutation_claim",
  workspaceRemovalBatchTable: "x_2300756_docsera_workspace_removal_batch",
  workspaceRemovalMemberTable: "x_2300756_docsera_workspace_removal_member"
};

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePayload(payload) {
  let normalized = payload;
  while (normalized && typeof normalized === "object" && "result" in normalized) normalized = normalized.result;
  return normalized;
}

function addCheck(checks, ok, label, detail = "") {
  checks.push({ ok: Boolean(ok), label, detail: safeDetail(detail) });
}

function printCheck(check) {
  console.log(`${check.ok ? "[pass]" : "[fail]"} ${check.label}`);
  if (check.detail) console.log(`       ${check.detail}`);
}

function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function getOptionValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function getSetCookieHeaders(headers) {
  const getSetCookie = headers.getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(headers);
  const singleHeader = headers.get("set-cookie");
  return singleHeader ? [singleHeader] : [];
}

function ingestCookies(cookieStore, headers) {
  for (const setCookie of getSetCookieHeaders(headers)) {
    const [cookiePair] = setCookie.split(";", 1);
    const separatorIndex = cookiePair.indexOf("=");
    if (separatorIndex > 0) cookieStore.set(cookiePair.slice(0, separatorIndex), cookiePair.slice(separatorIndex + 1));
  }
}

function getCookieHeader(cookieStore) {
  return [...cookieStore.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function establishBasicSession(instanceUrl, creds) {
  const cookieStore = new Map();
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
  const parsedLogin = loginText.trim().startsWith("{") ? JSON.parse(loginText) : {};
  if (parsedLogin?.status === "error" || parsedLogin?.status === "mfa_code_required") throw new Error(parsedLogin.message ?? "Instance rejected the SDK credentials.");
  const refreshResponse = await fetch(new URL("angular.do?sysparm_type=get_user", instanceUrl), {
    method: "POST",
    headers: { Cookie: getCookieHeader(cookieStore) }
  });
  await refreshResponse.text();
  ingestCookies(cookieStore, refreshResponse.headers);
  const userToken = refreshResponse.headers.get("x-usertoken-response") || parsedLogin.session_token;
  if (!userToken) throw new Error("The SDK login flow did not return a usable X-UserToken.");
  return { cookieHeader: getCookieHeader(cookieStore), userToken };
}

function createAuthHeaders(session, accept = "application/json") {
  return { Accept: accept, Cookie: session.cookieHeader, "X-UserToken": session.userToken };
}

async function fetchJson(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: { ...createAuthHeaders(session, options.accept ?? "application/json"), ...(options.headers ?? {}) }
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

async function fetchText(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: { ...createAuthHeaders(session, options.accept ?? "text/html"), ...(options.headers ?? {}) }
  });
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

async function callRuntime(instanceUrl, session, path, body) {
  return fetchJson(instanceUrl, session, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function normalizeProvisioningStatus(result) {
  const normalized = normalizePayload(result);
  if (!normalized || typeof normalized !== "object") {
    throw new Error("Workspace provisioning status route did not return the expected result payload.");
  }
  return normalized;
}

async function pollProvisioningStatus(instanceUrl, session, requestId) {
  const attempts = 30;
  const delayMs = 1000;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const statusResult = await fetchJson(instanceUrl, session, `${defaults.workspaceProvisioningStatusPath}?requestId=${encodeURIComponent(requestId)}`);
    if (!statusResult.ok) throw new Error(`Provisioning status lookup failed with HTTP ${statusResult.status}: ${statusResult.text}`);
    const payload = normalizeProvisioningStatus(statusResult.payload);
    const state = cleanText(payload?.provisioning?.state);
    if (state === "succeeded") return payload;
    if (state === "failed") throw new Error(`Workspace provisioning failed for request ${requestId}.`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Provisioning request ${requestId} did not leave pending state within ${attempts * delayMs}ms.`);
}

async function createWorkspace(instanceUrl, session, workspaceName) {
  const createResult = await callRuntime(instanceUrl, session, defaults.workspacePath, {
    name: workspaceName,
    shortDescription: "Disposable verification workspace owned by verify-e3-t11-changes-center.mjs",
    icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
    layout: { tocVisible: true, pageWidth: "readable" }
  });
  if (![201, 202].includes(createResult.status)) throw new Error(`Workspace create failed with HTTP ${createResult.status}: ${createResult.text}`);
  const created = normalizePayload(createResult.payload);
  if (createResult.status === 201) return created;
  const requestId = cleanText(created?.provisioning?.requestId);
  if (!requestId) throw new Error("Workspace provisioning returned pending without a requestId.");
  return pollProvisioningStatus(instanceUrl, session, requestId);
}

async function seedPendingWorkspace(instanceUrl, session, workspaceSysId) {
  return runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var currentUser = String(gs.getUserID() || '');
      function envelope(text) { return JSON.stringify({ schemaVersion: 1, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: text }] }] } }); }
      function page(draftTitle, publishedTitle, slug, order, parent, published) {
        var row = new GlideRecord('${defaults.pageTable}'); row.initialize();
        row.workspace = workspaceSysId; row.parent_page = parent || ''; row.sibling_order = order;
        row.draft_title = draftTitle; row.draft_slug = slug; row.draft_slug_normalized = slug; row.draft_content_json = envelope(draftTitle + ' draft'); row.draft_body_text = draftTitle + ' draft'; row.draft_revision = 0;
        if (published) {
          row.published_title = publishedTitle; row.published_slug = slug; row.published_slug_normalized = slug; row.published_content_json = envelope(publishedTitle + ' published'); row.published_body_text = publishedTitle + ' published';
          row.published_at = new GlideDateTime(); row.published_by = currentUser; row.publication_state = 'published';
        } else {
          row.publication_state = 'draft';
        }
        row.active = true;
        return String(row.insert() || '');
      }
      function snapshot(snapshotSet, pageId, parent, order, title, slug) {
        var row = new GlideRecord('${defaults.workspacePageSnapshotTable}'); row.initialize();
        row.snapshot_set = snapshotSet; row.page = pageId; row.snapshot_page_key = snapshotSet + ':' + pageId; row.parent_page = parent || ''; row.sibling_order = order;
        row.title = title; row.slug = slug; row.slug_normalized = slug; row.content_json = envelope(title + ' published'); row.body_text = title + ' published'; row.active = true; row.published_on = new GlideDateTime(); row.published_by = currentUser; row.insert();
      }
      function entry(changeSetId, pageId, sequence) {
        var row = new GlideRecord('${defaults.workspaceChangeEntryTable}'); row.initialize();
        row.change_set = changeSetId; row.page = pageId; row.generation_page_key = changeSetId + ':' + pageId; row.first_pending_sequence = sequence; row.first_pending_on = new GlideDateTime(); row.last_changed_on = new GlideDateTime(); row.last_changed_by = currentUser; row.insert();
      }
      var changeSet = new GlideRecord('${defaults.workspaceChangeSetTable}'); changeSet.initialize();
      changeSet.workspace = workspaceSysId; changeSet.generation_key = workspaceSysId + ':e3-t11-change-set'; changeSet.change_set_revision = 0; changeSet.next_pending_sequence = 7; changeSet.lifecycle_state = 'active'; changeSet.recovery_state = 'none';
      var changeSetId = String(changeSet.insert() || '');
      var snapshotSet = new GlideRecord('${defaults.workspaceSnapshotSetTable}'); snapshotSet.initialize();
      snapshotSet.workspace = workspaceSysId; snapshotSet.snapshot_key = workspaceSysId + ':e3-t11-snapshot'; snapshotSet.readiness_state = 'ready'; snapshotSet.source_change_set = changeSetId; snapshotSet.source_change_set_revision = 0; snapshotSet.published_on = new GlideDateTime();
      var snapshotSetId = String(snapshotSet.insert() || '');
      var modified = page('Overview Draft', 'Overview', 'overview', '1', '', true);
      var moved = page('Moved', 'Moved', 'moved', '2', '', true);
      var combined = page('Combined Draft', 'Combined', 'combined', '3', '', true);
      var added = page('Added Draft', '', 'added-draft', '4', '', false);
      var removed = page('Removed Parent', 'Removed Parent', 'removed-parent', '5', '', true);
      var removedChild = page('Removed Child', 'Removed Child', 'removed-child', '1', removed, true);
      var movedRow = new GlideRecord('${defaults.pageTable}');
      if (movedRow.get(moved)) {
        movedRow.draft_content_json = envelope('Moved published');
        movedRow.draft_body_text = 'Moved published';
        movedRow.update();
      }
      snapshot(snapshotSetId, modified, '', '1', 'Overview', 'overview');
      snapshot(snapshotSetId, moved, modified, '1', 'Moved', 'moved');
      snapshot(snapshotSetId, combined, modified, '2', 'Combined', 'combined');
      snapshot(snapshotSetId, removed, '', '5', 'Removed Parent', 'removed-parent');
      snapshot(snapshotSetId, removedChild, removed, '1', 'Removed Child', 'removed-child');
      entry(changeSetId, added, 1); entry(changeSetId, modified, 2); entry(changeSetId, moved, 3); entry(changeSetId, combined, 4);
      var batch = new GlideRecord('${defaults.workspaceRemovalBatchTable}'); batch.initialize();
      batch.change_set = changeSetId; batch.root_page = removed; batch.batch_key = changeSetId + ':remove:' + removed; batch.lifecycle_state = 'active'; batch.removed_on = new GlideDateTime(); batch.removed_by = currentUser;
      var batchId = String(batch.insert() || '');
      function member(pageId, sequence) {
        var row = new GlideRecord('${defaults.workspaceRemovalMemberTable}'); row.initialize();
        row.removal_batch = batchId; row.page = pageId; row.batch_page_key = batchId + ':' + pageId; row.first_pending_sequence = sequence; row.insert();
      }
      member(removed, 5); member(removedChild, 6);
      var workspace = new GlideRecord('${defaults.workspaceTable}'); workspace.get(workspaceSysId); workspace.pending_change_set = changeSetId; workspace.published_snapshot_set = snapshotSetId; workspace.workspace_state_revision = 0; workspace.update();
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ changeSetId: changeSetId, added: added, modified: modified, moved: moved, combined: combined, removed: removed, removedChild: removedChild }));
    })();
  `);
}

async function cleanupWorkspace(instanceUrl, session, cleanup) {
  if (!cleanup.workspaceSysId) return { skipped: true };
  return runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(cleanup.workspaceSysId)};
      var adminGroup = '';
      var editorGroup = '';
      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (workspace.get(workspaceSysId)) {
        adminGroup = String(workspace.admin_group || '');
        editorGroup = String(workspace.editor_group || '');
      }
      function deleteBy(table, field) { var row = new GlideRecord(table); row.addQuery(field, workspaceSysId); row.query(); while (row.next()) row.deleteRecord(); }
      deleteBy('${defaults.workspaceLeaseTable}', 'workspace'); deleteBy('${defaults.workspaceMutationClaimTable}', 'workspace'); deleteBy('${defaults.workspaceChangeEntryTable}', 'workspace');
      deleteBy('${defaults.workspaceRemovalMemberTable}', 'removal_batch.change_set.workspace'); deleteBy('${defaults.workspaceRemovalBatchTable}', 'change_set.workspace');
      deleteBy('${defaults.workspacePageSnapshotTable}', 'snapshot_set.workspace'); deleteBy('${defaults.workspaceSnapshotSetTable}', 'workspace'); deleteBy('${defaults.workspaceChangeSetTable}', 'workspace'); deleteBy('${defaults.pageTable}', 'workspace');
      var request = new GlideRecord('${defaults.requestTable}'); request.addQuery('workspace', workspaceSysId); request.query(); while (request.next()) request.deleteRecord();
      if (workspace.isValidRecord()) workspace.deleteRecord();
      function cleanupGroup(groupId) {
        if (!groupId) return;
        var member = new GlideRecord('sys_user_grmember'); member.addQuery('group', groupId); member.query(); while (member.next()) member.deleteRecord();
        var role = new GlideRecord('sys_group_has_role'); role.addQuery('group', groupId); role.query(); while (role.next()) role.deleteRecord();
        var group = new GlideRecord('sys_user_group'); if (group.get(groupId)) group.deleteRecord();
      }
      cleanupGroup(adminGroup); cleanupGroup(editorGroup);
      var remaining = {};
      function count(table, field) { var row = new GlideRecord(table); row.addQuery(field, workspaceSysId); row.query(); var total = 0; while (row.next()) total += 1; return total; }
      remaining.workspace = count('${defaults.workspaceTable}', 'sys_id');
      remaining.lease = count('${defaults.workspaceLeaseTable}', 'workspace');
      remaining.requests = count('${defaults.requestTable}', 'workspace');
      remaining.pages = count('${defaults.pageTable}', 'workspace');
      remaining.changeSets = count('${defaults.workspaceChangeSetTable}', 'workspace');
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: remaining.workspace === 0 && remaining.lease === 0 && remaining.requests === 0 && remaining.pages === 0 && remaining.changeSets === 0, remaining: remaining }));
    })();
  `);
}

async function capturePendingReadState(instanceUrl, session, workspaceSysId, changeSetId) {
  return runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var changeSetId = ${JSON.stringify(changeSetId)};
      function clean(value) { return String(value || ''); }
      function count(table, field, value) {
        var row = new GlideRecord(table);
        row.addQuery(field, value);
        row.query();
        var total = 0;
        while (row.next()) total += 1;
        return total;
      }
      function rows(table, field, value, fields) {
        var result = [];
        var row = new GlideRecord(table);
        row.addQuery(field, value);
        row.query();
        while (row.next()) {
          var item = { sys_id: clean(row.getUniqueValue()) };
          for (var i = 0; i < fields.length; i += 1) item[fields[i]] = clean(row.getValue(fields[i]));
          result.push(item);
        }
        result.sort(function (left, right) { return clean(left.sys_id).localeCompare(clean(right.sys_id)); });
        return result;
      }
      var workspace = new GlideRecord('${defaults.workspaceTable}');
      var workspaceState = {};
      if (workspace.get(workspaceSysId)) {
        workspaceState = {
          pending_change_set: clean(workspace.getValue('pending_change_set')),
          published_snapshot_set: clean(workspace.getValue('published_snapshot_set')),
          workspace_state_revision: clean(workspace.getValue('workspace_state_revision'))
        };
      }
      var leaseRows = rows('${defaults.workspaceLeaseTable}', 'workspace', workspaceSysId, ['workspace_key', 'workspace', 'holder_user', 'acquired_on', 'last_seen_on']);
      var changeSet = new GlideRecord('${defaults.workspaceChangeSetTable}');
      var changeSetState = {};
      if (changeSet.get(changeSetId)) {
        changeSetState = {
          change_set_revision: clean(changeSet.getValue('change_set_revision')),
          next_pending_sequence: clean(changeSet.getValue('next_pending_sequence')),
          lifecycle_state: clean(changeSet.getValue('lifecycle_state')),
          recovery_state: clean(changeSet.getValue('recovery_state'))
        };
      }
      var snapshotSetId = clean(workspaceState.published_snapshot_set);
      var removalBatches = rows('${defaults.workspaceRemovalBatchTable}', 'change_set', changeSetId, ['root_page', 'batch_key', 'lifecycle_state']);
      var removalBatchIds = {};
      for (var b = 0; b < removalBatches.length; b += 1) removalBatchIds[removalBatches[b].sys_id] = true;
      var removalMembers = [];
      var member = new GlideRecord('${defaults.workspaceRemovalMemberTable}');
      member.query();
      while (member.next()) {
        if (!removalBatchIds[clean(member.getValue('removal_batch'))]) continue;
        removalMembers.push({
          sys_id: clean(member.getUniqueValue()),
          removal_batch: clean(member.getValue('removal_batch')),
          page: clean(member.getValue('page')),
          batch_page_key: clean(member.getValue('batch_page_key')),
          first_pending_sequence: clean(member.getValue('first_pending_sequence'))
        });
      }
      removalMembers.sort(function (left, right) { return clean(left.sys_id).localeCompare(clean(right.sys_id)); });
      var state = {
        changeEntries: rows('${defaults.workspaceChangeEntryTable}', 'change_set', changeSetId, ['page', 'generation_page_key', 'first_pending_sequence', 'last_changed_on', 'last_changed_by']),
        changeSet: changeSetState,
        claims: rows('${defaults.workspaceMutationClaimTable}', 'change_set', changeSetId, ['generation_key', 'mutation_kind', 'mutation_state', 'execution_phase']),
        counts: {
          changeEntries: count('${defaults.workspaceChangeEntryTable}', 'change_set', changeSetId),
          claims: count('${defaults.workspaceMutationClaimTable}', 'change_set', changeSetId),
          leases: leaseRows.length,
          pages: count('${defaults.pageTable}', 'workspace', workspaceSysId),
          removalBatches: removalBatches.length,
          removalMembers: removalMembers.length,
          snapshotPages: count('${defaults.workspacePageSnapshotTable}', 'snapshot_set', snapshotSetId)
        },
        lease: leaseRows[0] || null,
        pages: rows('${defaults.pageTable}', 'workspace', workspaceSysId, ['parent_page', 'sibling_order', 'draft_title', 'draft_slug', 'draft_revision', 'active']),
        removalBatches: removalBatches,
        removalMembers: removalMembers,
        snapshotPages: rows('${defaults.workspacePageSnapshotTable}', 'snapshot_set', snapshotSetId, ['page', 'parent_page', 'sibling_order', 'title', 'slug', 'active']),
        workspace: workspaceState
      };
      gs.info('DOCSERA_RESULT:' + JSON.stringify(state));
    })();
  `);
}

async function replaceLeaseVerifier(instanceUrl, session, workspaceSysId, replacementToken) {
  return runBackgroundScript(instanceUrl, session, `
    (function () {
      var row = new GlideRecord('${defaults.workspaceLeaseTable}');
      row.addQuery('workspace', ${JSON.stringify(workspaceSysId)});
      row.setLimit(1);
      row.query();
      if (!row.next()) {
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: false, error: 'lease not found' }));
        return;
      }
      var beforeLastSeenOn = String(row.getValue('last_seen_on') || '');
      row.verifier_digest = String(new GlideDigest().getSHA256Hex(${JSON.stringify(replacementToken)}));
      row.update();
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true, beforeLastSeenOn: beforeLastSeenOn, afterLastSeenOn: String(row.getValue('last_seen_on') || '') }));
    })();
  `);
}

async function main() {
  const parsedArgs = parseArgs({ allowPositionals: false, options: { "auth-alias": { type: "string" }, "instance-url": { type: "string" }, "keep-data": { type: "boolean" }, help: { type: "boolean", short: "h" } }, args: process.argv.slice(2) });
  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/verify-e3-t11-changes-center.mjs [--auth-alias <alias>] [--instance-url <url>] [--keep-data]");
    return;
  }
  const authAlias = getOptionValue(parsedArgs.values["auth-alias"]) ?? readEnv("DOCSERA_SDK_AUTH_ALIAS", "SN_SDK_AUTH_ALIAS") ?? defaults.authAlias;
  const instanceUrl = getOptionValue(parsedArgs.values["instance-url"]) ?? readEnv("DOCSERA_SDK_INSTANCE_URL", "SN_SDK_INSTANCE_URL") ?? defaults.instanceUrl;
  const keepData = Boolean(parsedArgs.values["keep-data"]);
  console.log("Docsera E3-T11 Changes Center verification");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  const parsedCredential = parseKeyringRecord(new Entry(defaults.keyringService, defaults.keyringAccount).getPassword(), authAlias);
  if (parsedCredential.error) throw new Error(parsedCredential.error);
  const session = await establishBasicSession(instanceUrl, parsedCredential.credential.creds);
  const checks = [];
  const cleanup = {};
  try {
    addCheck(checks, (await fetchJson(instanceUrl, session, defaults.pingPath)).status === 200, "runtime ping is healthy");
    const workspaceResult = await createWorkspace(instanceUrl, session, `E3-T11 Changes Center ${Date.now()}`);
    cleanup.workspaceSysId = cleanText(workspaceResult?.workspace?.sysId);
    cleanup.workspaceSlug = cleanText(workspaceResult?.workspace?.slug);
    const seed = await seedPendingWorkspace(instanceUrl, session, cleanup.workspaceSysId);
    const leaseResponse = await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/acquire`, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId });
    const lease = normalizePayload(leaseResponse.payload);
    cleanup.leaseToken = cleanText(lease?.leaseToken);
    addCheck(checks, leaseResponse.status === 200 && cleanText(lease?.state) === "held", "authorized lease-holder access succeeds", leaseResponse.payload);
    const noLease = await callRuntime(instanceUrl, session, defaults.pendingChangesPath, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId });
    const noLeasePayload = normalizePayload(noLease.payload);
    addCheck(checks, cleanText(noLeasePayload?.error?.code) === "workspace_lease_invalid" || noLease.status === 409 || noLease.status === 403, "pending read without current lease is denied", noLease.payload);
    const invalidToken = await callRuntime(instanceUrl, session, defaults.pendingChangesPath, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, workspaceLeaseToken: "invalid-e3-t11-token" });
    const invalidTokenPayload = normalizePayload(invalidToken.payload);
    addCheck(checks, invalidToken.status === 409 && cleanText(invalidTokenPayload?.error?.code) === "workspace_lease_lost", "pending read with invalid lease token is denied", invalidToken.payload);
    const durableBefore = await capturePendingReadState(instanceUrl, session, cleanup.workspaceSysId, seed.changeSetId);
    const before = await callRuntime(instanceUrl, session, defaults.pendingChangesPath, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, workspaceLeaseToken: lease.leaseToken });
    const payload = normalizePayload(before.payload);
    addCheck(checks, before.status === 200 && payload?.changeSetId === seed.changeSetId && Number(payload?.changeSetRevision) === 0, "pending read returns generation pair without advancing revision", payload);
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const categoryOrder = rows.map((row) => cleanText(row.category));
    const titleOrder = rows.map((row) => cleanText(row.title));
    addCheck(checks, rows.length === 6 && rows.length === Number(payload.affectedPageCount), "pending read returns every affected page once with count", rows);
    addCheck(checks, categoryOrder.join("|") === "Added|Modified|Moved|Modified · Moved|Removed|Removed", "pending rows preserve first-pending order and all categories", { categoryOrder, titleOrder });
    addCheck(checks, titleOrder.join("|") === "Added Draft|Overview Draft|Moved|Combined Draft|Removed Parent|Removed Child", "pending rows use Edit titles except Removed rows use published titles", titleOrder);
    addCheck(checks, rows.filter((row) => row.navigable === false).every((row) => row.category === "Removed") && rows.filter((row) => row.category !== "Removed").every((row) => row.navigable === true), "pending row navigability matches Removed boundary", rows);
    addCheck(checks, JSON.stringify(payload).indexOf("@") < 0, "pending attribution does not expose login IDs or email addresses", payload);
    const after = await callRuntime(instanceUrl, session, defaults.pendingChangesPath, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, workspaceLeaseToken: lease.leaseToken });
    const afterPayload = normalizePayload(after.payload);
    addCheck(checks, afterPayload?.changeSetRevision === payload?.changeSetRevision, "second pending read remains read-only and does not advance revision", afterPayload);
    const durableAfter = await capturePendingReadState(instanceUrl, session, cleanup.workspaceSysId, seed.changeSetId);
    addCheck(checks, cleanText(durableBefore?.lease?.last_seen_on) && cleanText(durableBefore?.lease?.last_seen_on) === cleanText(durableAfter?.lease?.last_seen_on), "pending reads do not change durable lease last_seen_on", { before: durableBefore?.lease?.last_seen_on, after: durableAfter?.lease?.last_seen_on });
    addCheck(checks, JSON.stringify(durableAfter?.lease) === JSON.stringify(durableBefore?.lease), "pending reads do not insert, update, or delete lease rows", { before: durableBefore?.lease, after: durableAfter?.lease });
    addCheck(checks, JSON.stringify(durableAfter?.changeSet) === JSON.stringify(durableBefore?.changeSet), "pending reads do not change revision or next pending sequence", { before: durableBefore?.changeSet, after: durableAfter?.changeSet });
    addCheck(checks, JSON.stringify(durableAfter?.claims) === JSON.stringify(durableBefore?.claims), "pending reads do not create or update mutation claims", { before: durableBefore?.claims, after: durableAfter?.claims });
    addCheck(checks, JSON.stringify(durableAfter?.counts) === JSON.stringify(durableBefore?.counts), "pending reads do not create or delete workflow rows", { before: durableBefore?.counts, after: durableAfter?.counts });
    addCheck(checks, JSON.stringify(durableAfter?.workspace) === JSON.stringify(durableBefore?.workspace) && JSON.stringify(durableAfter?.changeEntries) === JSON.stringify(durableBefore?.changeEntries) && JSON.stringify(durableAfter?.removalBatches) === JSON.stringify(durableBefore?.removalBatches) && JSON.stringify(durableAfter?.removalMembers) === JSON.stringify(durableBefore?.removalMembers) && JSON.stringify(durableAfter?.snapshotPages) === JSON.stringify(durableBefore?.snapshotPages) && JSON.stringify(durableAfter?.pages) === JSON.stringify(durableBefore?.pages), "pending reads do not change selectors, entries, overlays, snapshots, or page records");
    const replacement = await replaceLeaseVerifier(instanceUrl, session, cleanup.workspaceSysId, "replacement-e3-t11-token");
    addCheck(checks, replacement?.ok === true, "replacement lease setup succeeded without changing last_seen_on", replacement);
    const replacedToken = await callRuntime(instanceUrl, session, defaults.pendingChangesPath, { workspaceSlug: cleanup.workspaceSlug, workspaceSysId: cleanup.workspaceSysId, workspaceLeaseToken: lease.leaseToken });
    const replacedTokenPayload = normalizePayload(replacedToken.payload);
    addCheck(checks, replacedToken.status === 409 && cleanText(replacedTokenPayload?.error?.code) === "workspace_lease_lost", "pending read with replaced lease token is denied", replacedToken.payload);
  } finally {
    if (!keepData && cleanup.workspaceSysId) addCheck(checks, (await cleanupWorkspace(instanceUrl, session, cleanup)).ok, "verification data cleanup removed durable artifacts");
  }
  for (const check of checks) printCheck(check);
  const failed = checks.some((check) => !check.ok);
  console.log("");
  console.log(`Result: ${failed ? "fail" : "pass"}`);
  if (failed) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(`[fail] ${safeErrorMessage(error, "E3-T11 Changes Center verification failed.")}`);
  console.log("");
  console.log("Result: fail");
  process.exitCode = 1;
});
