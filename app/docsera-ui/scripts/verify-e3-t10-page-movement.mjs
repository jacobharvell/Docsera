#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { parseArgs } from "node:util";
import { safeDetail, safeErrorMessage } from "./verification-output-safety.mjs";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow",
  pingPath: "/api/x_82900_docsera/docsera_runtime/ping",
  workspacePath: "/api/x_82900_docsera/docsera_runtime/workspaces",
  workspaceProvisioningStatusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status",
  workspaceEditLeasePath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease",
  pagesPath: "/api/x_82900_docsera/docsera_runtime/pages",
  pageMovePath: "/api/x_82900_docsera/docsera_runtime/pages/move",
  requestTable: "x_82900_docsera_workspace_provision_request",
  workspaceTable: "x_82900_docsera_workspace",
  workspaceLeaseTable: "x_82900_docsera_workspace_edit_lease",
  pageTable: "x_82900_docsera_page",
  workspaceChangeSetTable: "x_82900_docsera_workspace_change_set",
  workspaceSnapshotSetTable: "x_82900_docsera_workspace_snapshot_set",
  workspacePageSnapshotTable: "x_82900_docsera_workspace_page_snapshot",
  workspaceChangeEntryTable: "x_82900_docsera_workspace_change_entry",
  workspaceMutationClaimTable: "x_82900_docsera_workspace_mutation_claim"
};

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizePayload(payload) {
  let normalized = payload;
  while (normalized && typeof normalized === "object" && "result" in normalized) normalized = normalized.result;
  return normalized;
}

function parseKeyringRecord(rawValue, authAlias) {
  if (!rawValue) return { error: `No stored SDK credentials were found for alias "${authAlias}".` };
  try {
    const parsed = JSON.parse(rawValue);
    const storedCredential = parsed?.[authAlias];
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
    if (parsedLogin?.status === "error" || parsedLogin?.status === "mfa_code_required") {
      throw new Error(parsedLogin.message ?? "Instance rejected the SDK credentials.");
    }
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
  return { ok: response.ok, payload, status: response.status, text, url: response.url };
}

async function tableQuery(instanceUrl, session, table, { query, fields, limit = 100 } = {}) {
  const params = new URLSearchParams({
    sysparm_query: cleanText(query) || "sys_idISNOTEMPTY",
    sysparm_limit: String(limit),
    sysparm_exclude_reference_link: "true"
  });
  if (fields) params.set("sysparm_fields", fields);
  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}?${params.toString()}`);
  if (!result.ok) throw new Error(`Query ${table} failed with HTTP ${result.status}.`);
  return Array.isArray(result.payload?.result) ? result.payload.result : [];
}

async function tableDelete(instanceUrl, session, table, sysId) {
  return fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}`, { method: "DELETE" });
}

async function fetchText(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: { ...createAuthHeaders(session, options.accept ?? "text/html"), ...(options.headers ?? {}) }
  });
  return { ok: response.ok, status: response.status, text: await response.text(), url: response.url };
}

async function runBackgroundScript(instanceUrl, session, script, scopeName = "x_82900_docsera") {
  const form = await fetchText(instanceUrl, session, "sys.scripts.do", { accept: "text/html" });
  if (!form.ok) throw new Error(`Background script form failed with HTTP ${form.status}.`);
  const ckMatch = form.text.match(/name="sysparm_ck" type="hidden" value="([^"]+)"/i);
  const scopePattern = new RegExp(`<option[^>]+value="([^"]+)"[^>]*>${scopeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</option>`, "i");
  const scopeMatch = form.text.match(scopePattern);
  if (!ckMatch?.[1] || !scopeMatch?.[1]) throw new Error("Could not resolve the background script form token or Docsera scope.");
  const response = await fetchText(instanceUrl, session, "sys.scripts.do", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      script,
      sys_scope: scopeMatch[1],
      sysparm_ck: ckMatch[1],
      runscript: "Run script",
      record_for_rollback: "false",
      quota_managed_transaction: "true"
    }).toString(),
    accept: "text/html"
  });
  if (!response.ok) throw new Error(`Background script execution failed with HTTP ${response.status}.`);
  const resultMatch = response.text.match(/DOCSERA_RESULT:([\s\S]*?)(?:<BR\/>|<\/PRE>)/i);
  if (!resultMatch?.[1]) throw new Error("Background script result marker was not found.");
  const parsed = JSON.parse(resultMatch[1].replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim());
  if (parsed?.error) throw new Error(safeErrorMessage(parsed.error, "Background script failed."));
  return parsed;
}

function addCheck(checks, ok, label, detail = "") {
  checks.push({ ok: Boolean(ok), label, detail: safeDetail(detail) });
}

function printCheck(check) {
  console.log(`${check.ok ? "[pass]" : "[fail]"} ${check.label}`);
  if (check.detail) console.log(`       ${check.detail}`);
}

function runtimeResult(result) {
  return result?.payload ? normalizePayload(result.payload) : null;
}

async function callRuntime(instanceUrl, session, path, body, method = "POST") {
  return fetchJson(instanceUrl, session, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function createWorkspace(instanceUrl, session, workspaceName) {
  const createResult = await callRuntime(instanceUrl, session, defaults.workspacePath, {
    name: workspaceName,
    shortDescription: "Disposable verification workspace owned by verify-e3-t10-page-movement.mjs",
    icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
    layout: { tocVisible: true, pageWidth: "readable" }
  });
  if (![201, 202].includes(createResult.status)) throw new Error(`Workspace create failed with HTTP ${createResult.status}: ${createResult.text}`);
  const created = normalizePayload(createResult.payload);
  if (createResult.status === 201) return created;
  const requestId = cleanText(created?.provisioning?.requestId);
  for (let attempt = 0; attempt < 20 && requestId; attempt += 1) {
    const statusResult = await fetchJson(instanceUrl, session, `${defaults.workspaceProvisioningStatusPath}?requestId=${encodeURIComponent(requestId)}`);
    const payload = normalizePayload(statusResult.payload);
    if (cleanText(payload?.provisioning?.state) === "succeeded") return payload;
    if (cleanText(payload?.provisioning?.state) === "failed") throw new Error(payload?.error?.message ?? "Workspace provisioning failed.");
    await sleep(500);
  }
  throw new Error("Workspace provisioning did not complete within the polling window.");
}

function cleanupRecord(workspaceResult) {
  return {
    requestSysId: cleanText(workspaceResult?.provisioning?.requestId),
    workspaceSysId: cleanText(workspaceResult?.workspace?.sysId),
    workspaceSlug: cleanText(workspaceResult?.workspace?.slug),
    adminGroupSysId: cleanText(workspaceResult?.groups?.admin?.sysId),
    editorGroupSysId: cleanText(workspaceResult?.groups?.editor?.sysId)
  };
}

async function seedMovementWorkspace(instanceUrl, session, workspaceSysId) {
  return runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (!workspace.get(workspaceSysId)) { gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found.' })); return; }
      var currentUser = String(gs.getUserID() || '');
      function envelope(text) { return JSON.stringify({ schemaVersion: 1, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: text }] }] } }); }
      function deleteBy(table, field) {
        var existing = new GlideRecord(table);
        existing.addQuery(field, workspaceSysId);
        existing.query();
        while (existing.next()) existing.deleteRecord();
      }
      deleteBy('${defaults.workspaceMutationClaimTable}', 'workspace');
      deleteBy('${defaults.workspaceChangeEntryTable}', 'workspace');
      deleteBy('${defaults.workspacePageSnapshotTable}', 'snapshot_set.workspace');
      deleteBy('${defaults.workspaceSnapshotSetTable}', 'workspace');
      deleteBy('${defaults.workspaceChangeSetTable}', 'workspace');
      deleteBy('${defaults.pageTable}', 'workspace');
      function page(title, slug, order, parent) {
        var body = title + ' body';
        var row = new GlideRecord('${defaults.pageTable}');
        row.initialize();
        row.workspace = workspaceSysId;
        row.parent_page = parent || '';
        row.sibling_order = order;
        row.draft_title = title;
        row.draft_slug = slug;
        row.draft_slug_normalized = slug;
        row.draft_content_json = envelope(body);
        row.draft_body_text = body;
        row.draft_revision = 0;
        row.published_title = title;
        row.published_slug = slug;
        row.published_slug_normalized = slug;
        row.published_content_json = envelope(body);
        row.published_body_text = body;
        row.published_at = new GlideDateTime();
        row.published_by = currentUser;
        row.publication_state = 'published';
        row.active = true;
        return String(row.insert() || '');
      }
      function snapshot(snapshotSet, pageId, parent, order, title, slug) {
        var body = title + ' body';
        var row = new GlideRecord('${defaults.workspacePageSnapshotTable}');
        row.initialize();
        row.snapshot_set = snapshotSet;
        row.page = pageId;
        row.snapshot_page_key = snapshotSet + ':' + pageId;
        row.parent_page = parent || '';
        row.sibling_order = order;
        row.title = title;
        row.slug = slug;
        row.slug_normalized = slug;
        row.content_json = envelope(body);
        row.body_text = body;
        row.active = true;
        row.published_on = new GlideDateTime();
        row.published_by = currentUser;
        row.insert();
      }
      var changeSet = new GlideRecord('${defaults.workspaceChangeSetTable}');
      changeSet.initialize();
      changeSet.workspace = workspaceSysId;
      changeSet.generation_key = workspaceSysId + ':change-set';
      changeSet.change_set_revision = 0;
      changeSet.next_pending_sequence = 1;
      changeSet.lifecycle_state = 'active';
      changeSet.recovery_state = 'none';
      var changeSetId = String(changeSet.insert() || '');
      var snapshotSet = new GlideRecord('${defaults.workspaceSnapshotSetTable}');
      snapshotSet.initialize();
      snapshotSet.workspace = workspaceSysId;
      snapshotSet.snapshot_key = workspaceSysId + ':snapshot';
      snapshotSet.readiness_state = 'ready';
      snapshotSet.source_change_set = changeSetId;
      snapshotSet.source_change_set_revision = 0;
      snapshotSet.published_on = new GlideDateTime();
      var snapshotSetId = String(snapshotSet.insert() || '');
      var root = page('Overview', 'overview', '1', '');
      var child = page('Child', 'child', '1', root);
      var second = page('Second', 'second', '2', '');
      var l3 = page('Level Three', 'level-three', '1', child);
      var l4 = page('Level Four', 'level-four', '1', l3);
      var l5 = page('Level Five', 'level-five', '1', l4);
      var l6 = page('Level Six', 'level-six', '1', l5);
      snapshot(snapshotSetId, root, '', '1', 'Overview', 'overview');
      snapshot(snapshotSetId, child, root, '1', 'Child', 'child');
      snapshot(snapshotSetId, second, '', '2', 'Second', 'second');
      snapshot(snapshotSetId, l3, child, '1', 'Level Three', 'level-three');
      snapshot(snapshotSetId, l4, l3, '1', 'Level Four', 'level-four');
      snapshot(snapshotSetId, l5, l4, '1', 'Level Five', 'level-five');
      snapshot(snapshotSetId, l6, l5, '1', 'Level Six', 'level-six');
      workspace.pending_change_set = changeSetId;
      workspace.published_snapshot_set = snapshotSetId;
      workspace.workspace_state_revision = 0;
      workspace.update();
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ changeSetId: changeSetId, snapshotSetId: snapshotSetId, root: root, child: child, second: second, l6: l6 }));
    })();
  `);
}

async function acquireLease(instanceUrl, session, cleanup) {
  const result = await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/acquire`, {
    workspaceSlug: cleanup.workspaceSlug,
    workspaceSysId: cleanup.workspaceSysId
  });
  const lease = runtimeResult(result);
  cleanup.leaseToken = cleanText(lease?.leaseToken);
  return { raw: result, lease };
}

async function renewLease(instanceUrl, session, cleanup, lease) {
  const result = await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/renew`, {
    workspaceSlug: cleanup.workspaceSlug,
    workspaceSysId: cleanup.workspaceSysId,
    leaseToken: lease.leaseToken
  });
  return { raw: result, lease: runtimeResult(result) };
}

async function listPages(instanceUrl, session, workspaceSlug, mode) {
  const result = await fetchJson(instanceUrl, session, `${defaults.pagesPath}?workspaceSlug=${encodeURIComponent(workspaceSlug)}&mode=${encodeURIComponent(mode)}`);
  return runtimeResult(result)?.items ?? [];
}

function movePayload(cleanup, lease, seed, pageSysId, parentPageSysId, siblingOrder, revision = lease.changeSetRevision) {
  return {
    workspaceSlug: cleanup.workspaceSlug,
    workspaceSysId: cleanup.workspaceSysId,
    workspaceLeaseToken: lease.leaseToken,
    expectedChangeSetId: lease.changeSetId,
    expectedChangeSetRevision: revision,
    pageSysId,
    parentPageSysId,
    siblingOrder
  };
}

async function tableWriteDenied(instanceUrl, session) {
  const result = await fetchJson(instanceUrl, session, `/api/now/table/${defaults.workspaceMutationClaimTable}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generation_key: `denied-${Date.now()}` })
  });
  return !result.ok;
}

async function cleanupWorkspace(instanceUrl, session, cleanup) {
  if (!cleanup.workspaceSysId) return { skipped: true };
  if (cleanup.workspaceSlug && cleanup.leaseToken) {
    await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/release`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken: cleanup.leaseToken
    }).catch(() => undefined);
  }

  await runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(cleanup.workspaceSysId)};
      var requestSysId = ${JSON.stringify(cleanup.requestSysId)};
      function deleteBy(table, field) {
        var row = new GlideRecord(table);
        row.addQuery(field, workspaceSysId);
        row.query();
        while (row.next()) row.deleteRecord();
      }
      deleteBy('${defaults.workspaceLeaseTable}', 'workspace');
      deleteBy('${defaults.workspaceMutationClaimTable}', 'workspace');
      deleteBy('${defaults.workspaceChangeEntryTable}', 'workspace');
      deleteBy('${defaults.workspacePageSnapshotTable}', 'snapshot_set.workspace');
      deleteBy('${defaults.workspaceSnapshotSetTable}', 'workspace');
      deleteBy('${defaults.workspaceChangeSetTable}', 'workspace');
      deleteBy('${defaults.pageTable}', 'workspace');
      if (requestSysId) {
        var request = new GlideRecord('${defaults.requestTable}');
        if (request.get(requestSysId)) request.deleteRecord();
      }
      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (workspace.get(workspaceSysId)) workspace.deleteRecord();
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
    })();
  `);

  const groupIds = [cleanup.adminGroupSysId, cleanup.editorGroupSysId].map(cleanText).filter(Boolean);
  for (const groupId of groupIds) {
    const memberships = await tableQuery(instanceUrl, session, "sys_user_grmember", {
      query: `group=${groupId}`,
      fields: "sys_id",
      limit: 100
    });
    for (const row of memberships) await tableDelete(instanceUrl, session, "sys_user_grmember", cleanText(row.sys_id));

    const roles = await tableQuery(instanceUrl, session, "sys_group_has_role", {
      query: `group=${groupId}`,
      fields: "sys_id",
      limit: 100
    });
    for (const row of roles) await tableDelete(instanceUrl, session, "sys_group_has_role", cleanText(row.sys_id));

    await tableDelete(instanceUrl, session, "sys_user_group", groupId);
  }

  const [remaining] = await runBackgroundScript(instanceUrl, session, `
    (function () {
      var workspaceSysId = ${JSON.stringify(cleanup.workspaceSysId)};
      var requestSysId = ${JSON.stringify(cleanup.requestSysId)};
      var adminGroupSysId = ${JSON.stringify(cleanup.adminGroupSysId)};
      var editorGroupSysId = ${JSON.stringify(cleanup.editorGroupSysId)};
      function exists(table, sysId) {
        if (!sysId) return false;
        var row = new GlideRecord(table);
        return row.get(sysId);
      }
      function countBy(table, field, value) {
        if (!value) return 0;
        var count = new GlideAggregate(table);
        count.addAggregate('COUNT');
        count.addQuery(field, value);
        count.query();
        return count.next() ? Number(count.getAggregate('COUNT') || 0) : 0;
      }
      var remaining = {
        workspace: exists('${defaults.workspaceTable}', workspaceSysId) ? 1 : 0,
        lease: countBy('${defaults.workspaceLeaseTable}', 'workspace', workspaceSysId),
        request: exists('${defaults.requestTable}', requestSysId) ? 1 : 0,
        adminMemberships: countBy('sys_user_grmember', 'group', adminGroupSysId),
        editorMemberships: countBy('sys_user_grmember', 'group', editorGroupSysId),
        adminGroup: exists('sys_user_group', adminGroupSysId) ? 1 : 0,
        editorGroup: exists('sys_user_group', editorGroupSysId) ? 1 : 0
      };
      remaining.memberships = remaining.adminMemberships + remaining.editorMemberships;
      gs.info('DOCSERA_RESULT:' + JSON.stringify([remaining]));
    })();
  `);
  const ok = Object.values(remaining ?? {}).every((value) => Number(value) === 0);
  return { ok, remaining };
}

async function runScenario(instanceUrl, session, checks, cleanupItems) {
  const workspaceResult = await createWorkspace(instanceUrl, session, `E3-T10 Movement Verification ${Date.now()}`);
  const cleanup = cleanupRecord(workspaceResult);
  cleanupItems.push(cleanup);
  const seed = await seedMovementWorkspace(instanceUrl, session, cleanup.workspaceSysId);
  const { raw: leaseRaw, lease } = await acquireLease(instanceUrl, session, cleanup);
  addCheck(checks, leaseRaw.status === 200 && cleanText(lease?.state) === "held" && lease?.changeSetRevision === 0, "acquired a valid Edit lease for movement", leaseRaw.payload);

  const circular = await callRuntime(instanceUrl, session, defaults.pageMovePath, movePayload(cleanup, lease, seed, seed.root, seed.child, "1"));
  const excessive = await callRuntime(instanceUrl, session, defaults.pageMovePath, movePayload(cleanup, lease, seed, seed.second, seed.l6, "1"));
  const leaseAfterInvalid = (await renewLease(instanceUrl, session, cleanup, lease)).lease;
  addCheck(checks, circular.status === 400 && excessive.status === 400 && leaseAfterInvalid?.changeSetRevision === 0, "invalid circular and excessive-depth moves reject without revision advancement", { circular: circular.payload, excessive: excessive.payload, currentRevision: leaseAfterInvalid?.changeSetRevision });

  const success = await callRuntime(instanceUrl, session, defaults.pageMovePath, movePayload(cleanup, lease, seed, seed.child, null, "3"));
  const successPayload = runtimeResult(success);
  const editPages = await listPages(instanceUrl, session, cleanup.workspaceSlug, "edit");
  const livePages = await listPages(instanceUrl, session, cleanup.workspaceSlug, "live");
  const editChild = editPages.find((page) => cleanText(page.sysId) === seed.child);
  const liveChild = livePages.find((page) => cleanText(page.sysId) === seed.child);
  addCheck(checks, success.status === 200 && successPayload?.changeSetRevision === 1 && cleanText(editChild?.parentPageSysId) === "" && cleanText(liveChild?.parentPageSysId) === seed.root, "successful /pages/move updates Edit projection while Live remains published", { success: success.payload, editChild, liveChild });

  const stale = await callRuntime(instanceUrl, session, defaults.pageMovePath, movePayload(cleanup, lease, seed, seed.second, seed.root, "2", 0));
  const staleError = normalizePayload(stale.payload)?.error ?? stale.payload?.error;
  addCheck(checks, stale.status === 409 && cleanText(staleError?.currentChangeSetId) === lease.changeSetId && Number(staleError?.currentChangeSetRevision) === 1, "stale authority rejects and returns the current generation pair", stale.payload);
}

async function runContentionScenario(instanceUrl, session, checks, cleanupItems) {
  const workspaceResult = await createWorkspace(instanceUrl, session, `E3-T10 Movement Contention ${Date.now()}`);
  const cleanup = cleanupRecord(workspaceResult);
  cleanupItems.push(cleanup);
  const seed = await seedMovementWorkspace(instanceUrl, session, cleanup.workspaceSysId);
  const { lease } = await acquireLease(instanceUrl, session, cleanup);
  const [first, second] = await Promise.all([
    callRuntime(instanceUrl, session, defaults.pageMovePath, movePayload(cleanup, lease, seed, seed.child, null, "3")),
    callRuntime(instanceUrl, session, defaults.pageMovePath, movePayload(cleanup, lease, seed, seed.second, seed.root, "2"))
  ]);
  const statuses = [first.status, second.status];
  addCheck(checks, statuses.filter((status) => status === 200).length === 1 && statuses.filter((status) => status === 409).length === 1, "same-pair movement contention has one durable winner", { first: first.payload, second: second.payload });
}

async function runMoveBeforeFirstScenario(instanceUrl, session, checks, cleanupItems) {
  const workspaceResult = await createWorkspace(instanceUrl, session, `E3-T10 Movement Rank Zero ${Date.now()}`);
  const cleanup = cleanupRecord(workspaceResult);
  cleanupItems.push(cleanup);
  const seed = await seedMovementWorkspace(instanceUrl, session, cleanup.workspaceSysId);
  const { lease } = await acquireLease(instanceUrl, session, cleanup);

  const editBefore = await listPages(instanceUrl, session, cleanup.workspaceSlug, "edit");
  const liveBefore = await listPages(instanceUrl, session, cleanup.workspaceSlug, "live");
  const firstBefore = editBefore.find((page) => cleanText(page.sysId) === seed.root);
  const secondBefore = editBefore.find((page) => cleanText(page.sysId) === seed.second);
  const move = await callRuntime(instanceUrl, session, defaults.pageMovePath, movePayload(cleanup, lease, seed, seed.second, null, "0"));
  const payload = runtimeResult(move);
  const editAfter = await listPages(instanceUrl, session, cleanup.workspaceSlug, "edit");
  const liveAfter = await listPages(instanceUrl, session, cleanup.workspaceSlug, "live");
  const editOrder = editAfter.filter((page) => [seed.root, seed.second].includes(cleanText(page.sysId))).map((page) => ({ sysId: cleanText(page.sysId), siblingOrder: Number(page.siblingOrder) }));
  const liveOrder = liveAfter.filter((page) => [seed.root, seed.second].includes(cleanText(page.sysId))).map((page) => ({ sysId: cleanText(page.sysId), siblingOrder: Number(page.siblingOrder) }));

  addCheck(
    checks,
    Number(firstBefore?.siblingOrder) === 1 &&
      Number(secondBefore?.siblingOrder) === 2 &&
      Number(liveBefore.find((page) => cleanText(page.sysId) === seed.root)?.siblingOrder) === 1 &&
      move.status === 200 &&
      payload?.changeSetRevision === 1 &&
      editOrder[0]?.sysId === seed.second &&
      editOrder[0]?.siblingOrder === 0 &&
      editOrder[1]?.sysId === seed.root &&
      liveOrder[0]?.sysId === seed.root &&
      liveOrder[0]?.siblingOrder === 1 &&
      liveOrder[1]?.sysId === seed.second &&
      liveOrder[1]?.siblingOrder === 2,
    "move-before-first preserves rank zero in Edit while Live remains published",
    { before: { firstBefore, secondBefore }, move: move.payload, editOrder, liveOrder }
  );
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
    console.log("Usage: node ./scripts/verify-e3-t10-page-movement.mjs [--auth-alias <alias>] [--instance-url <url>] [--keep-data]");
    return;
  }
  const authAlias = getOptionValue(parsedArgs.values["auth-alias"]) ?? readEnv("DOCSERA_SDK_AUTH_ALIAS", "SN_SDK_AUTH_ALIAS") ?? defaults.authAlias;
  const instanceUrl = getOptionValue(parsedArgs.values["instance-url"]) ?? readEnv("DOCSERA_SDK_INSTANCE_URL", "SN_SDK_INSTANCE_URL") ?? defaults.instanceUrl;
  const keepData = Boolean(parsedArgs.values["keep-data"]);

  console.log("Docsera E3-T10 page movement verification");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  console.log(`Cleanup mode: ${keepData ? "keep verification data" : "delete verification data"}`);
  console.log("");

  const keyringEntry = new Entry(defaults.keyringService, defaults.keyringAccount);
  const parsedCredential = parseKeyringRecord(keyringEntry.getPassword(), authAlias);
  if (parsedCredential.error) throw new Error(parsedCredential.error);
  const storedCredential = parsedCredential.credential;
  if (storedCredential.creds?.instanceUrl && storedCredential.creds.instanceUrl !== instanceUrl) throw new Error(`Stored alias "${authAlias}" points to ${storedCredential.creds.instanceUrl}, not ${instanceUrl}.`);
  if (storedCredential.creds?.type !== "basic") throw new Error(`Stored alias "${authAlias}" uses ${storedCredential.creds?.type ?? "unknown"} auth; this verifier expects basic auth.`);

  const session = await establishBasicSession(instanceUrl, storedCredential.creds);
  const checks = [];
  const cleanupItems = [];
  try {
    const ping = await fetchJson(instanceUrl, session, defaults.pingPath);
    addCheck(checks, ping.status === 200, "runtime ping is healthy before movement verification", ping.payload);
    await runScenario(instanceUrl, session, checks, cleanupItems);
    await runMoveBeforeFirstScenario(instanceUrl, session, checks, cleanupItems);
    await runContentionScenario(instanceUrl, session, checks, cleanupItems);
    addCheck(checks, await tableWriteDenied(instanceUrl, session), "unauthorized direct workflow-table write remains denied");
  } finally {
    if (!keepData) {
      for (const cleanup of cleanupItems.reverse()) {
        const result = await cleanupWorkspace(instanceUrl, session, cleanup);
        addCheck(checks, result?.ok === true, "verification data cleanup removed durable artifacts", result);
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
  console.error(`[fail] ${safeErrorMessage(error, "E3-T10 page movement verification failed.")}`);
  console.log("");
  console.log("Result: fail");
  process.exitCode = 1;
});
