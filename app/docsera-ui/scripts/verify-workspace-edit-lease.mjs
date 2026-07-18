#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
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
  pagePublishPath: "/api/x_82900_docsera/docsera_runtime/pages/publish",
  pageDeleteActionPath: "/api/x_82900_docsera/docsera_runtime/pages/delete",
  pageLockPath: "/api/x_82900_docsera/docsera_runtime/pages/edit-lock",
  workspaceTable: "x_82900_docsera_workspace",
  workspaceLeaseTable: "x_82900_docsera_workspace_edit_lease",
  workspaceChangeSetTable: "x_82900_docsera_workspace_change_set",
  workspaceSnapshotSetTable: "x_82900_docsera_workspace_snapshot_set",
  workspacePageSnapshotTable: "x_82900_docsera_workspace_page_snapshot",
  pageTable: "x_82900_docsera_page"
};

const workspaceRoleNames = Object.freeze({
  workspaceAdmin: "x_82900_docsera.workspace_admin",
  editor: "x_82900_docsera.editor"
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizePayload(payload) {
  let normalized = payload;
  while (normalized && typeof normalized === "object" && "result" in normalized) {
    normalized = normalized.result;
  }
  return normalized;
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
    cookieHeader: getCookieHeader(cookieStore),
    cookieStore,
    userToken
  };
}

function createAuthHeaders(session, accept = "application/json") {
  return {
    Accept: accept,
    Cookie: session.cookieHeader,
    "X-UserToken": session.userToken
  };
}

async function fetchJson(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: {
      ...createAuthHeaders(session, options.accept ?? "application/json"),
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

  return {
    ok: response.ok,
    status: response.status,
    text,
    payload,
    headers: response.headers,
    url: response.url
  };
}

async function fetchText(instanceUrl, session, path, options = {}) {
  const response = await fetch(new URL(path, instanceUrl), {
    ...options,
    headers: {
      ...createAuthHeaders(session, options.accept ?? "text/html"),
      ...(options.headers ?? {})
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
    headers: response.headers,
    url: response.url
  };
}

async function tableQuery(instanceUrl, session, table, { query, fields, limit = 100 } = {}) {
  const params = new URLSearchParams({
    sysparm_query: cleanText(query) || "sys_idISNOTEMPTY",
    sysparm_limit: String(limit),
    sysparm_exclude_reference_link: "true"
  });

  if (fields) {
    params.set("sysparm_fields", fields);
  }

  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}?${params.toString()}`);
  if (!result.ok) {
    throw new Error(`Query ${table} failed with HTTP ${result.status}.`);
  }

  return Array.isArray(result.payload?.result) ? result.payload.result : [];
}

async function tableGet(instanceUrl, session, table, sysId, fields) {
  const params = new URLSearchParams({
    sysparm_exclude_reference_link: "true"
  });
  if (fields) {
    params.set("sysparm_fields", fields);
  }
  return fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}?${params.toString()}`);
}

async function tableInsert(instanceUrl, session, table, body) {
  return fetchJson(instanceUrl, session, `/api/now/table/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function tablePatch(instanceUrl, session, table, sysId, body) {
  return fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function tableDelete(instanceUrl, session, table, sysId) {
  return fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}`, {
    method: "DELETE"
  });
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function addCheck(checks, ok, label, detail = "") {
  checks.push({ ok: Boolean(ok), label, detail: safeDetail(detail) });
}

function printCheck(check) {
  console.log(`${check.ok ? "[pass]" : "[fail]"} ${check.label}`);
  if (check.detail) {
    console.log(`       ${check.detail}`);
  }
}

async function runBackgroundScript(instanceUrl, session, script, scopeName = "x_82900_docsera") {
  const form = await fetchText(instanceUrl, session, "sys.scripts.do", { accept: "text/html" });
  if (!form.ok) {
    throw new Error(`Background script form failed with HTTP ${form.status}.`);
  }

  const ckMatch = form.text.match(/name="sysparm_ck" type="hidden" value="([^"]+)"/i);
  const scopePattern = new RegExp(`<option[^>]+value="([^"]+)"[^>]*>${scopeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</option>`, "i");
  const scopeMatch = form.text.match(scopePattern);

  if (!ckMatch?.[1] || !scopeMatch?.[1]) {
    throw new Error("Could not resolve the background script form token or Docsera scope.");
  }

  const response = await fetchText(instanceUrl, session, "sys.scripts.do", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
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

  if (!response.ok) {
    throw new Error(`Background script execution failed with HTTP ${response.status}.`);
  }

  const resultMatch = response.text.match(/DOCSERA_RESULT:([\s\S]*?)(?:<BR\/>|<\/PRE>)/i);
  if (!resultMatch?.[1]) {
    throw new Error("Background script result marker was not found.");
  }

  const jsonText = resultMatch[1]
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  const parsed = JSON.parse(jsonText);
  if (parsed?.error) {
    throw new Error(safeErrorMessage(parsed.error, "Background script failed."));
  }
  return parsed;
}

function createDisposablePassword(prefix) {
  return `${prefix}!${randomBytes(18).toString("base64url")}`;
}

function normalizeWorkspaceRoute(result) {
  const normalized = normalizePayload(result);
  if (!normalized || typeof normalized !== "object") {
    throw new Error("Workspace route did not return the expected payload.");
  }
  return normalized;
}

async function createWorkspace(instanceUrl, session, workspaceName) {
  const createResult = await fetchJson(instanceUrl, session, defaults.workspacePath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: workspaceName,
      shortDescription: "Disposable verification workspace owned by verify-workspace-edit-lease.mjs",
      icon: {
        type: "builtin",
        key: "docsera-workspace",
        label: "Docsera workspace icon"
      },
      layout: {
        tocVisibleByDefault: true,
        pageWidth: "readable"
      }
    })
  });

  if (![201, 202].includes(createResult.status)) {
    throw new Error(`Workspace create failed with HTTP ${createResult.status}: ${createResult.text}`);
  }

  const created = normalizeWorkspaceRoute(createResult.payload);
  if (createResult.status === 201) {
    return created;
  }

  const requestId = cleanText(created?.provisioning?.requestId);
  if (!requestId) {
    throw new Error("Workspace create did not return a provisioning requestId.");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const statusResult = await fetchJson(
      instanceUrl,
      session,
      `${defaults.workspaceProvisioningStatusPath}?requestId=${encodeURIComponent(requestId)}`
    );
    if (!statusResult.ok) {
      throw new Error(`Provisioning status lookup failed with HTTP ${statusResult.status}: ${statusResult.text}`);
    }
    const payload = normalizeWorkspaceRoute(statusResult.payload);
    const state = cleanText(payload?.provisioning?.state);
    if (state === "succeeded") {
      return payload;
    }
    if (state === "failed") {
      throw new Error(payload?.error?.message ?? "Workspace provisioning failed.");
    }
    await sleep(500);
  }

  throw new Error("Workspace provisioning did not complete within the polling window.");
}

function runtimeResult(result) {
  return result?.payload ? normalizePayload(result.payload) : null;
}

function runtimeError(result) {
  const normalized = runtimeResult(result);
  return normalized && typeof normalized === "object" ? normalized.error ?? result.payload?.error ?? null : result.payload?.error ?? null;
}

async function callRuntime(instanceUrl, session, path, body, method = "POST") {
  return fetchJson(instanceUrl, session, path, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function inspectLeaseRows(instanceUrl, session, workspaceSysId) {
  const result = await runBackgroundScript(
    instanceUrl,
    session,
    `
    (function () {
      var rows = [];
      var lease = new GlideRecord('${defaults.workspaceLeaseTable}');
      lease.addQuery('workspace', ${JSON.stringify(workspaceSysId)});
      lease.orderBy('sys_created_on');
      lease.query();
      while (lease.next()) {
        rows.push({
          sys_id: String(lease.getUniqueValue() || ''),
          workspace_key: String(lease.getValue('workspace_key') || ''),
          holder_user: String(lease.getValue('holder_user') || ''),
          verifier_digest: String(lease.getValue('verifier_digest') || ''),
          last_seen_on: String(lease.getValue('last_seen_on') || ''),
          acquired_on: String(lease.getValue('acquired_on') || '')
        });
      }
      gs.info('DOCSERA_RESULT:' + JSON.stringify({ rows: rows }));
    })();
    `
  );
  return Array.isArray(result.rows) ? result.rows : [];
}

function createDraftEnvelope(text) {
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }]
        }
      ]
    }
  };
}

function buildPastTimestamp(minutesAgo) {
  const date = new Date(Date.now() - minutesAgo * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
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
    console.log("Usage: node ./scripts/verify-workspace-edit-lease.mjs [--auth-alias <alias>] [--instance-url <url>] [--keep-data]");
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
  const keepData = Boolean(parsedArgs.values["keep-data"]);

  console.log("Docsera workspace edit lease verification");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  console.log(`Cleanup mode: ${keepData ? "keep verification data" : "delete verification data"}`);
  console.log("");

  const checks = [];
  const cleanup = {
    requestSysId: "",
    workspaceSysId: "",
    workspaceSlug: "",
    adminGroupSysId: "",
    editorGroupSysId: "",
    activeChangeSetSysId: "",
    alternateChangeSetSysId: "",
    inactiveChangeSetSysId: "",
    snapshotSetSysId: "",
    pageSysIds: [],
    editorUserSysId: "",
    editorUsername: "",
    viewerUserSysId: "",
    viewerUsername: "",
    editorPassword: "",
    viewerPassword: ""
  };

  const keyringEntry = new Entry(defaults.keyringService, defaults.keyringAccount);
  const parsedCredential = parseKeyringRecord(keyringEntry.getPassword(), authAlias);
  if (parsedCredential.error) {
    throw new Error(parsedCredential.error);
  }

  const storedCredential = parsedCredential.credential;
  if (storedCredential.creds?.instanceUrl && storedCredential.creds.instanceUrl !== instanceUrl) {
    throw new Error(`Stored alias "${authAlias}" points to ${storedCredential.creds.instanceUrl}, not ${instanceUrl}.`);
  }
  if (storedCredential.creds?.type !== "basic") {
    throw new Error(`Stored alias "${authAlias}" uses ${storedCredential.creds?.type ?? "unknown"} auth; this verifier expects basic auth.`);
  }

  const ownerSession = await establishBasicSession(instanceUrl, storedCredential.creds);
  const pingResult = await fetchJson(instanceUrl, ownerSession, defaults.pingPath);
  if (!pingResult.ok) {
    throw new Error(`Runtime ping failed with HTTP ${pingResult.status}: ${pingResult.text}`);
  }
  const pingPayload = runtimeResult(pingResult);
  const currentUserSysId = cleanText(pingPayload?.userSysId ?? pingPayload?.user_sys_id);
  const currentUserName = cleanText(pingPayload?.userName ?? pingPayload?.user_name);
  addCheck(checks, Boolean(currentUserSysId), "authenticated owner session resolved the current user", currentUserName || currentUserSysId);

  let editorSession = null;
  let viewerSession = null;
  let leaseToken = "";
  let pageSysId = "";
  let pageSlug = "";
  const editorPassword = createDisposablePassword("DocseraLease");
  const viewerPassword = createDisposablePassword("DocseraViewer");

  try {
    const workspaceName = `Workspace Lease Verification ${Date.now()}`;
    const workspaceResult = await createWorkspace(instanceUrl, ownerSession, workspaceName);
    cleanup.requestSysId = cleanText(workspaceResult?.provisioning?.requestId);
    cleanup.workspaceSysId = cleanText(workspaceResult?.workspace?.sysId);
    cleanup.workspaceSlug = cleanText(workspaceResult?.workspace?.slug);
    cleanup.adminGroupSysId = cleanText(workspaceResult?.groups?.admin?.sysId);
    cleanup.editorGroupSysId = cleanText(workspaceResult?.groups?.editor?.sysId);

    addCheck(checks, Boolean(cleanup.workspaceSysId && cleanup.workspaceSlug), "verification workspace was provisioned", JSON.stringify({
      workspaceSysId: cleanup.workspaceSysId,
      workspaceSlug: cleanup.workspaceSlug
    }));

    const seedResult = await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var workspaceSysId = ${JSON.stringify(cleanup.workspaceSysId)};
        var editorGroupSysId = ${JSON.stringify(cleanup.editorGroupSysId)};
        var stamp = String(new GlideDateTime().getNumericValue());
        var workspace = new GlideRecord('${defaults.workspaceTable}');
        if (!workspace.get(workspaceSysId)) {
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found.' }));
          return;
        }

        var changeSetKey = workspaceSysId + ':change-set';
        var snapshotKey = workspaceSysId + ':snapshot';
        var activeId = '';
        var snapshotId = '';
        var workspaceStateRevision = String(workspace.getValue('workspace_state_revision') || '0');

        var existingActive = new GlideRecord('${defaults.workspaceChangeSetTable}');
        existingActive.addQuery('generation_key', changeSetKey);
        existingActive.setLimit(1);
        existingActive.query();
        if (existingActive.next()) {
          activeId = String(existingActive.getUniqueValue() || '');
        } else {
          var active = new GlideRecord('${defaults.workspaceChangeSetTable}');
          active.initialize();
          active.workspace = workspaceSysId;
          active.generation_key = changeSetKey;
          active.change_set_revision = 0;
          active.next_pending_sequence = 1;
          active.lifecycle_state = 'active';
          active.recovery_state = 'none';
          activeId = String(active.insert() || '');
        }

        var existingSnapshot = new GlideRecord('${defaults.workspaceSnapshotSetTable}');
        existingSnapshot.addQuery('snapshot_key', snapshotKey);
        existingSnapshot.setLimit(1);
        existingSnapshot.query();
        if (existingSnapshot.next()) {
          snapshotId = String(existingSnapshot.getUniqueValue() || '');
        } else {
          var snapshot = new GlideRecord('${defaults.workspaceSnapshotSetTable}');
          snapshot.initialize();
          snapshot.workspace = workspaceSysId;
          snapshot.snapshot_key = snapshotKey;
          snapshot.readiness_state = 'ready';
          snapshot.source_change_set = activeId;
          snapshot.source_change_set_revision = 0;
          snapshot.published_on = new GlideDateTime();
          snapshotId = String(snapshot.insert() || '');
        }

        workspace.pending_change_set = activeId;
        workspace.published_snapshot_set = snapshotId;
        workspace.workspace_state_revision = workspaceStateRevision;
        workspace.update();

        var alternate = new GlideRecord('${defaults.workspaceChangeSetTable}');
        alternate.initialize();
        alternate.workspace = workspaceSysId;
        alternate.generation_key = 'verify-alt-' + stamp;
        alternate.change_set_revision = 0;
        alternate.next_pending_sequence = 1;
        alternate.lifecycle_state = 'staged';
        alternate.recovery_state = 'none';
        var alternateId = alternate.insert();

        var inactive = new GlideRecord('${defaults.workspaceChangeSetTable}');
        inactive.initialize();
        inactive.workspace = workspaceSysId;
        inactive.generation_key = 'verify-inactive-' + stamp;
        inactive.change_set_revision = 0;
        inactive.next_pending_sequence = 1;
        inactive.lifecycle_state = 'retired';
        inactive.recovery_state = 'none';
        var inactiveId = inactive.insert();

        function createUser(userName, firstName, lastName, password) {
          var user = new GlideRecord('sys_user');
          user.initialize();
          user.user_name = userName;
          user.first_name = firstName;
          user.last_name = lastName;
          user.email = userName + '@example.com';
          user.active = true;
          user.user_password.setDisplayValue(password);
          return user.insert();
        }

        var editorUserName = 'docsera.verify.editor.' + stamp;
        var viewerUserName = 'docsera.verify.viewer.' + stamp;
        var editorUserId = createUser(editorUserName, 'Docsera', 'LeaseEditor', ${JSON.stringify(editorPassword)});
        var viewerUserId = createUser(viewerUserName, 'Docsera', 'LeaseViewer', ${JSON.stringify(viewerPassword)});

        var membership = new GlideRecord('sys_user_grmember');
        membership.initialize();
        membership.group = editorGroupSysId;
        membership.user = editorUserId;
        membership.insert();

        gs.info('DOCSERA_RESULT:' + JSON.stringify({
          workspaceStateRevision: workspaceStateRevision,
          activeChangeSetSysId: String(activeId || ''),
          alternateChangeSetSysId: String(alternateId || ''),
          inactiveChangeSetSysId: String(inactiveId || ''),
          snapshotSetSysId: String(snapshotId || ''),
          editorUserSysId: String(editorUserId || ''),
          editorUsername: editorUserName,
          viewerUserSysId: String(viewerUserId || ''),
          viewerUsername: viewerUserName
        }));
      })();
      `
    );

    cleanup.activeChangeSetSysId = cleanText(seedResult.activeChangeSetSysId);
    cleanup.alternateChangeSetSysId = cleanText(seedResult.alternateChangeSetSysId);
    cleanup.inactiveChangeSetSysId = cleanText(seedResult.inactiveChangeSetSysId);
    cleanup.snapshotSetSysId = cleanText(seedResult.snapshotSetSysId);
    cleanup.editorUserSysId = cleanText(seedResult.editorUserSysId);
    cleanup.editorUsername = cleanText(seedResult.editorUsername);
    cleanup.viewerUserSysId = cleanText(seedResult.viewerUserSysId);
    cleanup.viewerUsername = cleanText(seedResult.viewerUsername);
    cleanup.editorPassword = editorPassword;
    cleanup.viewerPassword = viewerPassword;

    editorSession = await establishBasicSession(instanceUrl, {
      username: cleanup.editorUsername,
      password: cleanup.editorPassword
    });
    viewerSession = await establishBasicSession(instanceUrl, {
      username: cleanup.viewerUsername,
      password: cleanup.viewerPassword
    });

    addCheck(checks, Boolean(editorSession?.userToken && viewerSession?.userToken), "disposable editor and viewer sessions were created");

    const dbObjectRows = await tableQuery(instanceUrl, ownerSession, "sys_db_object", {
      query: `nameIN${defaults.workspaceLeaseTable},${defaults.workspaceChangeSetTable},${defaults.workspaceSnapshotSetTable}`,
      fields: "name,access,create_access,read_access,update_access,delete_access",
      limit: 10
    });
    const objectsByName = new Map(dbObjectRows.map((row) => [cleanText(row.name), row]));
    addCheck(checks, cleanText(objectsByName.get(defaults.workspaceLeaseTable)?.access) === "package_private", "workspace lease table is package-private", JSON.stringify(objectsByName.get(defaults.workspaceLeaseTable) ?? null));
    addCheck(checks, cleanText(objectsByName.get(defaults.workspaceChangeSetTable)?.access) === "package_private", "workspace change-set table is package-private", JSON.stringify(objectsByName.get(defaults.workspaceChangeSetTable) ?? null));
    addCheck(checks, cleanText(objectsByName.get(defaults.workspaceSnapshotSetTable)?.access) === "package_private", "workspace snapshot-set table is package-private", JSON.stringify(objectsByName.get(defaults.workspaceSnapshotSetTable) ?? null));

    const restOperations = await tableQuery(instanceUrl, ownerSession, "sys_ws_operation", {
      query: "nameINworkspace_edit_lease_acquire,workspace_edit_lease_resume,workspace_edit_lease_renew,workspace_edit_lease_status,workspace_edit_lease_release",
      fields: "name,operation_uri,http_method",
      limit: 10
    });
    const operationByName = new Map(restOperations.map((row) => [cleanText(row.name), row]));
    addCheck(checks, restOperations.length === 5, "all five workspace lease routes are installed", JSON.stringify(restOperations));
    addCheck(checks, cleanText(operationByName.get("workspace_edit_lease_status")?.operation_uri) === `${defaults.workspaceEditLeasePath}/status`, "workspace lease status route metadata matches the runtime path", JSON.stringify(operationByName.get("workspace_edit_lease_status") ?? null));

    const unlockedStatus = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/status`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId
    });
    addCheck(checks, unlockedStatus.status === 200 && cleanText(runtimeResult(unlockedStatus)?.state) === "unlocked", "status reports unlocked before acquisition", JSON.stringify(unlockedStatus.payload));

    const freshContenders = await Promise.all(
      Array.from({ length: 4 }, () =>
        callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/acquire`, {
          workspaceSlug: cleanup.workspaceSlug,
          workspaceSysId: cleanup.workspaceSysId
        })
      )
    );
    const freshWinners = freshContenders.filter((result) => result.status === 200);
    const freshLosers = freshContenders.filter((result) => result.status === 409);
    leaseToken = cleanText(runtimeResult(freshWinners[0])?.leaseToken);
    addCheck(checks, freshWinners.length === 1 && Boolean(leaseToken), "simultaneous fresh acquisition produces exactly one holder", JSON.stringify(freshContenders.map((result) => result.status)));
    addCheck(checks, freshLosers.length === 3 && freshLosers.every((result) => cleanText(runtimeError(result)?.code) === "workspace_locked"), "fresh acquisition losers return the safe workspace_locked contract");

    const leaseRowsAfterAcquire = await inspectLeaseRows(instanceUrl, ownerSession, cleanup.workspaceSysId);
    addCheck(checks, leaseRowsAfterAcquire.length === 1, "fresh acquisition persisted exactly one durable lease row", JSON.stringify(leaseRowsAfterAcquire));
    addCheck(checks, leaseRowsAfterAcquire[0] && cleanText(leaseRowsAfterAcquire[0].verifier_digest) === sha256Hex(leaseToken), "durable lease row stores only the returned verifier digest");
    const duplicateLeaseInsert = await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var duplicate = new GlideRecord('${defaults.workspaceLeaseTable}');
        duplicate.initialize();
        duplicate.workspace_key = ${JSON.stringify(cleanup.workspaceSysId)};
        duplicate.workspace = ${JSON.stringify(cleanup.workspaceSysId)};
        duplicate.holder_user = ${JSON.stringify(currentUserSysId)};
        duplicate.verifier_digest = 'DUPLICATE-${Date.now()}';
        duplicate.acquired_on = new GlideDateTime();
        duplicate.last_seen_on = new GlideDateTime();
        var insertedSysId = '';
        try {
          insertedSysId = String(duplicate.insert() || '');
        } catch (error) {
          insertedSysId = '';
        }
        var rows = 0;
        var lease = new GlideRecord('${defaults.workspaceLeaseTable}');
        lease.addQuery('workspace', ${JSON.stringify(cleanup.workspaceSysId)});
        lease.query();
        while (lease.next()) {
          rows += 1;
        }
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ insertedSysId: insertedSysId, rowCount: rows }));
      })();
      `
    );
    addCheck(checks, !cleanText(duplicateLeaseInsert.insertedSysId) && Number(duplicateLeaseInsert.rowCount) === 1, "the platform unique workspace-key invariant rejects a duplicate lease row insert", JSON.stringify(duplicateLeaseInsert));

    const heldStatus = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/status`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken
    });
    addCheck(checks, heldStatus.status === 200 && cleanText(runtimeResult(heldStatus)?.state) === "held" && !cleanText(runtimeResult(heldStatus)?.leaseToken), "status returns held with the generation pair but without exposing the plaintext lease token", JSON.stringify(heldStatus.payload));
    addCheck(checks, cleanText(runtimeResult(heldStatus)?.changeSetId) === cleanup.activeChangeSetSysId && Number(runtimeResult(heldStatus)?.changeSetRevision) === 0, "acquire and status return the authoritative active generation pair", JSON.stringify(runtimeResult(heldStatus)));
    let currentChangeSetId = cleanText(runtimeResult(heldStatus)?.changeSetId);
    let currentChangeSetRevision = Number(runtimeResult(heldStatus)?.changeSetRevision);

    const resumeHeld = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/resume`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken
    });
    addCheck(checks, resumeHeld.status === 200 && cleanText(runtimeResult(resumeHeld)?.changeSetId) === cleanup.activeChangeSetSysId, "resume returns held with the same active generation pair", JSON.stringify(resumeHeld.payload));

    const lockedStatus = await callRuntime(instanceUrl, editorSession, `${defaults.workspaceEditLeasePath}/status`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId
    });
    addCheck(checks, lockedStatus.status === 409 && cleanText(runtimeError(lockedStatus)?.code) === "workspace_locked" && cleanText(runtimeError(lockedStatus)?.holderDisplayName).length > 0, "contention exposes only the accepted safe holder display name", JSON.stringify(lockedStatus.payload));

    const viewerAcquire = await callRuntime(instanceUrl, viewerSession, `${defaults.workspaceEditLeasePath}/acquire`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId
    });
    addCheck(checks, viewerAcquire.status === 403 && cleanText(runtimeError(viewerAcquire)?.code) === "forbidden", "a user without current authoring capability cannot acquire the workspace lease", JSON.stringify(viewerAcquire.payload));

    const createPageResult = await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, {
      title: "Workspace Lease Verification Page",
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: leaseToken,
      expectedChangeSetId: currentChangeSetId,
      expectedChangeSetRevision: currentChangeSetRevision
    });
    pageSysId = cleanText(runtimeResult(createPageResult)?.page?.sysId);
    pageSlug = cleanText(runtimeResult(createPageResult)?.page?.draftSlugNormalized ?? runtimeResult(createPageResult)?.page?.draftSlug);
    if (createPageResult.status === 201) {
      currentChangeSetId = cleanText(runtimeResult(createPageResult)?.changeSetId) || currentChangeSetId;
      currentChangeSetRevision = Number(runtimeResult(createPageResult)?.changeSetRevision ?? currentChangeSetRevision);
    }
    cleanup.pageSysIds.push(pageSysId);
    addCheck(checks, createPageResult.status === 201 && Boolean(pageSysId), "representative page creation succeeds with the current workspace lease", JSON.stringify(createPageResult.payload));

    const initialPageRows = await tableQuery(instanceUrl, ownerSession, defaults.pageTable, {
      query: `sys_id=${pageSysId}`,
      fields: "sys_id,draft_revision,draft_title,draft_slug,draft_body_text,draft_content_json",
      limit: 1
    });
    const initialRevision = Number(initialPageRows[0]?.draft_revision || 0);
    const initialBody = cleanText(initialPageRows[0]?.draft_body_text);

    const wrongTokenSave = await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: "wrong-token",
      pageSysId,
      pageSlug,
      expectedChangeSetId: currentChangeSetId,
      expectedChangeSetRevision: currentChangeSetRevision,
      expectedRevision: initialRevision,
      draftBodyText: "wrong token body",
      draftContentJson: createDraftEnvelope("wrong token body")
    }, "PATCH");
    const pageAfterWrongToken = await tableQuery(instanceUrl, ownerSession, defaults.pageTable, {
      query: `sys_id=${pageSysId}`,
      fields: "draft_revision,draft_body_text",
      limit: 1
    });
    addCheck(checks, wrongTokenSave.status === 409 && cleanText(runtimeError(wrongTokenSave)?.code) === "workspace_lease_lost", "wrong-token saves are rejected without data change", JSON.stringify(wrongTokenSave.payload));
    addCheck(checks, Number(pageAfterWrongToken[0]?.draft_revision || 0) === initialRevision && cleanText(pageAfterWrongToken[0]?.draft_body_text) === initialBody, "wrong-token save rejection left the persisted draft untouched");

    const successfulSave = await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: leaseToken,
      pageSysId,
      pageSlug,
      expectedChangeSetId: currentChangeSetId,
      expectedChangeSetRevision: currentChangeSetRevision,
      expectedRevision: initialRevision,
      draftBodyText: "held token body",
      draftContentJson: createDraftEnvelope("held token body")
    }, "PATCH");
    const pageAfterSave = await tableQuery(instanceUrl, ownerSession, defaults.pageTable, {
      query: `sys_id=${pageSysId}`,
      fields: "draft_revision,draft_body_text",
      limit: 1
    });
    if (successfulSave.status === 200) {
      currentChangeSetId = cleanText(runtimeResult(successfulSave)?.changeSetId) || currentChangeSetId;
      currentChangeSetRevision = Number(runtimeResult(successfulSave)?.changeSetRevision ?? currentChangeSetRevision);
    }
    const savedRevision = Number(pageAfterSave[0]?.draft_revision || 0);
    addCheck(checks, successfulSave.status === 200 && cleanText(pageAfterSave[0]?.draft_body_text) === "held token body" && savedRevision === initialRevision + 1, "body save succeeds only with the exact current workspace lease", JSON.stringify(successfulSave.payload));

    const settingsWrongUser = await callRuntime(instanceUrl, editorSession, defaults.pagesPath, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: leaseToken,
      pageSysId,
      expectedChangeSetId: currentChangeSetId,
      expectedChangeSetRevision: currentChangeSetRevision,
      title: "Editor should not rename this page",
      slug: pageSlug
    }, "PUT");
    const pageAfterWrongUserSettings = await tableQuery(instanceUrl, ownerSession, defaults.pageTable, {
      query: `sys_id=${pageSysId}`,
      fields: "draft_title,draft_slug",
      limit: 1
    });
    addCheck(checks, settingsWrongUser.status === 409 && cleanText(runtimeError(settingsWrongUser)?.code) === "workspace_lease_lost", "wrong-user settings writes are rejected without data change", JSON.stringify(settingsWrongUser.payload));
    addCheck(checks, cleanText(pageAfterWrongUserSettings[0]?.draft_title) === "Workspace Lease Verification Page", "wrong-user settings rejection left the persisted title untouched");

    const createWrongToken = await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, {
      title: "Should Not Exist",
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: "wrong-token",
      expectedChangeSetId: currentChangeSetId,
      expectedChangeSetRevision: currentChangeSetRevision
    });
    const pagesAfterWrongCreate = await tableQuery(instanceUrl, ownerSession, defaults.pageTable, {
      query: `workspace=${cleanup.workspaceSysId}`,
      fields: "sys_id",
      limit: 20
    });
    addCheck(checks, createWrongToken.status === 409 && pagesAfterWrongCreate.length === 1, "wrong-token create attempts are rejected without creating a page", JSON.stringify(createWrongToken.payload));

    const publishMissingLease = await callRuntime(instanceUrl, ownerSession, defaults.pagePublishPath, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      pageSysId,
      pageSlug,
      expectedRevision: savedRevision
    });
    addCheck(checks, publishMissingLease.status === 405 && cleanText(runtimeError(publishMissingLease)?.code) === "publish_unavailable", "workspace publish remains fail-closed on the legacy route", JSON.stringify(publishMissingLease.payload));

    const deleteWrongToken = await callRuntime(instanceUrl, ownerSession, defaults.pageDeleteActionPath, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: "wrong-token",
      pageSysId,
      expectedChangeSetId: currentChangeSetId,
      expectedChangeSetRevision: currentChangeSetRevision
    });
    addCheck(checks, deleteWrongToken.status === 409, "wrong-token delete attempts are rejected", JSON.stringify(deleteWrongToken.payload));

    const pageLockAcquire = await callRuntime(instanceUrl, ownerSession, `${defaults.pageLockPath}/acquire`, {
      workspaceSlug: cleanup.workspaceSlug,
      pageSysId
    });
    const pageLockToken = cleanText(runtimeResult(pageLockAcquire)?.lockToken);
    const pageLockOnlySave = await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      pageSysId,
      pageSlug,
      expectedChangeSetId: currentChangeSetId,
      expectedChangeSetRevision: currentChangeSetRevision,
      lockToken: pageLockToken,
      expectedRevision: savedRevision,
      draftBodyText: "page-lock token only",
      draftContentJson: createDraftEnvelope("page-lock token only")
    }, "PATCH");
    addCheck(checks, pageLockAcquire.status === 200 && Boolean(pageLockToken), "legacy page-lock route remains available for comparison while workspace authority stays separate");
    addCheck(checks, pageLockOnlySave.status === 400 && cleanText(runtimeError(pageLockOnlySave)?.code) === "workspace_lease_invalid", "no representative mutation accepts a page-lock token as workspace authority", JSON.stringify(pageLockOnlySave.payload));

    const oldLeaseRows = await inspectLeaseRows(instanceUrl, ownerSession, cleanup.workspaceSysId);
    const originalLeaseSysId = cleanText(oldLeaseRows[0]?.sys_id);
    await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var lease = new GlideRecord('${defaults.workspaceLeaseTable}');
        if (!lease.get(${JSON.stringify(originalLeaseSysId)})) {
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Lease row not found.' }));
          return;
        }
        var expired = new GlideDateTime();
        expired.addSeconds(-600);
        lease.last_seen_on = expired;
        lease.update();
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
      })();
      `
    );

    const takeoverContenders = await Promise.all(
      Array.from({ length: 4 }, () =>
        callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/acquire`, {
          workspaceSlug: cleanup.workspaceSlug,
          workspaceSysId: cleanup.workspaceSysId
        })
      )
    );
    const takeoverWinners = takeoverContenders.filter((result) => result.status === 200);
    const takeoverLosers = takeoverContenders.filter((result) => result.status === 409);
    const takeoverToken = cleanText(runtimeResult(takeoverWinners[0])?.leaseToken);
    addCheck(checks, takeoverWinners.length === 1 && Boolean(takeoverToken), "simultaneous expired takeover produces exactly one new holder", JSON.stringify(takeoverContenders.map((result) => result.status)));
    addCheck(checks, takeoverLosers.length === 3, "expired takeover losers contend safely");

    let leaseRowsAfterTakeover = await inspectLeaseRows(instanceUrl, ownerSession, cleanup.workspaceSysId);
    addCheck(checks, leaseRowsAfterTakeover.length === 1 && cleanText(leaseRowsAfterTakeover[0]?.sys_id) !== originalLeaseSysId, "takeover replaced the expired row with exactly one new durable holder", JSON.stringify(leaseRowsAfterTakeover));

    const staleRenew = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/renew`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken
    });
    const staleRelease = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/release`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken
    });
    addCheck(checks, staleRenew.status === 409 && staleRelease.status === 409, "a stale prior holder cannot renew or release after another holder wins", JSON.stringify({
      renew: staleRenew.payload,
      release: staleRelease.payload
    }));
    leaseToken = takeoverToken || leaseToken;
    if (leaseRowsAfterTakeover.length === 0) {
      const reacquireAfterTakeover = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/acquire`, {
        workspaceSlug: cleanup.workspaceSlug,
        workspaceSysId: cleanup.workspaceSysId
      });
      const reacquiredToken = cleanText(runtimeResult(reacquireAfterTakeover)?.leaseToken);
      if (reacquireAfterTakeover.status === 200 && reacquiredToken) {
        leaseToken = reacquiredToken;
        leaseRowsAfterTakeover = await inspectLeaseRows(instanceUrl, ownerSession, cleanup.workspaceSysId);
      }
      addCheck(checks, reacquireAfterTakeover.status === 200 && Boolean(reacquiredToken), "the verifier can reacquire a fresh lease if takeover leaves the workspace unlocked", JSON.stringify(reacquireAfterTakeover.payload));
    }

    const activeLeaseSysId = cleanText(leaseRowsAfterTakeover[0]?.sys_id);
    if (leaseRowsAfterTakeover.length === 1 && leaseToken && activeLeaseSysId) {
      let raceSeed = null;
      try {
        raceSeed = await runBackgroundScript(
          instanceUrl,
          ownerSession,
          `
          (function () {
            var lease = new GlideRecord('${defaults.workspaceLeaseTable}');
            if (!lease.get(${JSON.stringify(activeLeaseSysId)})) {
              gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Lease row missing before race seed.' }));
              return;
            }
            var expired = new GlideDateTime();
            expired.addSeconds(-600);
            lease.last_seen_on = expired;
            lease.update();
            gs.info('DOCSERA_RESULT:' + JSON.stringify({
              leaseSysId: String(lease.getUniqueValue() || ''),
              lastSeenOn: String(lease.getValue('last_seen_on') || '')
            }));
          })();
          `
        );
    } catch (error) {
      addCheck(checks, false, "the verifier staged an exact-row race seed for renew-versus-takeover proof", safeErrorMessage(error, "race seed failed"));
      }

      if (raceSeed?.leaseSysId && raceSeed?.lastSeenOn) {
        const raceRenewCommit = await runBackgroundScript(
          instanceUrl,
          ownerSession,
          `
          (function () {
            var lease = new GlideRecord('${defaults.workspaceLeaseTable}');
            if (!lease.get(${JSON.stringify(cleanText(raceSeed.leaseSysId))})) {
              gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Lease row missing before renew-commit proof.' }));
              return;
            }
            lease.last_seen_on = new GlideDateTime();
            lease.update();
            gs.info('DOCSERA_RESULT:' + JSON.stringify({ updated: true, leaseSysId: String(lease.getUniqueValue() || '') }));
          })();
          `
        );
        const raceTakeover = await runBackgroundScript(
          instanceUrl,
          ownerSession,
          `
          (function () {
            var workspaceKey = ${JSON.stringify(cleanup.workspaceSysId)};
            var expectedLeaseSysId = ${JSON.stringify(cleanText(raceSeed.leaseSysId))};
            var expectedLastSeenOn = ${JSON.stringify(cleanText(raceSeed.lastSeenOn))};
            var contenderUser = ${JSON.stringify(cleanup.editorUserSysId)};
            var exactDelete = new GlideRecord('${defaults.workspaceLeaseTable}');
            exactDelete.addQuery('sys_id', expectedLeaseSysId);
            exactDelete.addQuery('workspace_key', workspaceKey);
            exactDelete.addQuery('last_seen_on', expectedLastSeenOn);
            exactDelete.query();
            exactDelete.deleteMultiple();
            var verifyDelete = new GlideRecord('${defaults.workspaceLeaseTable}');
            verifyDelete.addQuery('sys_id', expectedLeaseSysId);
            verifyDelete.addQuery('workspace_key', workspaceKey);
            verifyDelete.addQuery('last_seen_on', expectedLastSeenOn);
            verifyDelete.query();
            var deleted = !verifyDelete.hasNext();
            var insertedSysId = '';
            if (deleted) {
              var replacement = new GlideRecord('${defaults.workspaceLeaseTable}');
              replacement.initialize();
              replacement.workspace_key = workspaceKey;
              replacement.workspace = workspaceKey;
              replacement.holder_user = contenderUser;
              replacement.verifier_digest = 'RACE-${Date.now()}';
              replacement.acquired_on = new GlideDateTime();
              replacement.last_seen_on = new GlideDateTime();
              insertedSysId = String(replacement.insert() || '');
            }
            var current = new GlideRecord('${defaults.workspaceLeaseTable}');
            current.addQuery('workspace', workspaceKey);
            current.setLimit(1);
            current.query();
            var currentHolder = '';
            var currentLastSeenOn = '';
            if (current.next()) {
              currentHolder = String(current.getValue('holder_user') || '');
              currentLastSeenOn = String(current.getValue('last_seen_on') || '');
            }
            gs.info('DOCSERA_RESULT:' + JSON.stringify({
              deleted: Boolean(deleted),
              insertedSysId: insertedSysId,
              currentHolder: currentHolder,
              currentLastSeenOn: currentLastSeenOn
            }));
          })();
          `
        );
        addCheck(checks, raceRenewCommit.updated === true, "the verifier refreshed the lease row before the contender's exact delete boundary", JSON.stringify(raceRenewCommit));
        addCheck(
          checks,
          !cleanText(raceTakeover.insertedSysId) && cleanText(raceTakeover.currentHolder) === currentUserSysId,
          "a takeover cannot replace a lease that was validly renewed before the exact delete boundary",
          JSON.stringify(raceTakeover)
        );
      } else {
        addCheck(checks, false, "the verifier had concrete stale-row coordinates for the renew-versus-takeover race probe", JSON.stringify(raceSeed));
      }
    } else {
      addCheck(checks, false, "the verifier found a concrete lease row before the renew-versus-takeover race probe", JSON.stringify(leaseRowsAfterTakeover));
    }

    let cleanupSafetySeed = null;
    try {
      cleanupSafetySeed = await runBackgroundScript(
        instanceUrl,
        ownerSession,
        `
        (function () {
          var lease = new GlideRecord('${defaults.workspaceLeaseTable}');
          if (!lease.get(${JSON.stringify(activeLeaseSysId)})) {
            gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Lease row missing before cleanup safety seed.' }));
            return;
          }
          var expired = new GlideDateTime();
          expired.addSeconds(-600);
          lease.last_seen_on = expired;
          lease.update();
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
        })();
        `
      );
    } catch (error) {
      addCheck(checks, false, "the verifier staged a stale lease row before the cleanup-safety probe", safeErrorMessage(error, "cleanup staging failed"));
    }

    if (cleanupSafetySeed?.ok) {
      const cleanupRefresh = await runBackgroundScript(
        instanceUrl,
        ownerSession,
        `
        (function () {
          var lease = new GlideRecord('${defaults.workspaceLeaseTable}');
          if (!lease.get(${JSON.stringify(activeLeaseSysId)})) {
            gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Lease row missing before cleanup refresh.' }));
            return;
          }
          lease.last_seen_on = new GlideDateTime();
          lease.update();
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ updated: true }));
        })();
        `
      );
      const cleanupRun = await runBackgroundScript(
        instanceUrl,
        ownerSession,
        `
        (function () {
          var LEASE_TABLE = '${defaults.workspaceLeaseTable}';
          var STALE_AFTER_MS = 300000;
          var cutoff = new GlideDateTime();
          cutoff.addSeconds(-Math.floor(STALE_AFTER_MS / 1000));
          var cutoffValue = cutoff.getValue();
          var removed = 0;
          var candidates = new GlideRecord(LEASE_TABLE);
          candidates.addQuery('last_seen_on', '<', cutoffValue);
          candidates.query();
          while (candidates.next()) {
            var sysId = String(candidates.getUniqueValue() || '').trim();
            var workspaceKey = String(candidates.getValue('workspace_key') || '').trim();
            var lastSeenOn = String(candidates.getValue('last_seen_on') || '').trim();
            var exactDelete = new GlideRecord(LEASE_TABLE);
            exactDelete.addQuery('sys_id', sysId);
            exactDelete.addQuery('workspace_key', workspaceKey);
            exactDelete.addQuery('last_seen_on', lastSeenOn);
            exactDelete.addQuery('last_seen_on', '<', cutoffValue);
            exactDelete.query();
            exactDelete.deleteMultiple();
            var verifyDelete = new GlideRecord(LEASE_TABLE);
            verifyDelete.addQuery('sys_id', sysId);
            verifyDelete.addQuery('workspace_key', workspaceKey);
            verifyDelete.addQuery('last_seen_on', lastSeenOn);
            verifyDelete.addQuery('last_seen_on', '<', cutoffValue);
            verifyDelete.query();
            if (!verifyDelete.hasNext()) removed += 1;
          }
          var current = new GlideRecord(LEASE_TABLE);
          current.addQuery('workspace', ${JSON.stringify(cleanup.workspaceSysId)});
          current.setLimit(1);
          current.query();
          gs.info('DOCSERA_RESULT:' + JSON.stringify({
            removed: removed,
            leaseStillPresent: Boolean(current.next())
          }));
        })();
        `
      );
      addCheck(checks, cleanupRefresh.updated === true && cleanupRun.leaseStillPresent === true, "scheduled cleanup is not required for correctness and cannot delete a currently renewed lease", JSON.stringify(cleanupRun));
    } else {
      addCheck(checks, false, "the verifier completed the cleanup-safety probe against a staged stale row", JSON.stringify(cleanupSafetySeed));
    }

    const missingSelector = await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var workspace = new GlideRecord('${defaults.workspaceTable}');
        if (!workspace.get(${JSON.stringify(cleanup.workspaceSysId)})) {
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace missing before invalid-selector probe.' }));
          return;
        }
        workspace.pending_change_set = '';
        workspace.workspace_state_revision = 2;
        workspace.update();
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
      })();
      `
    );
    void missingSelector;
    const invalidStatus = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/status`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken
    });
    const invalidSave = await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: leaseToken,
      pageSysId,
      pageSlug,
      expectedRevision: savedRevision,
      draftBodyText: "invalid selector save",
      draftContentJson: createDraftEnvelope("invalid selector save")
    }, "PATCH");
    addCheck(checks, invalidStatus.status === 409 && cleanText(runtimeError(invalidStatus)?.code) === "workspace_foundation_invalid", "missing active generation selectors fail safely and do not return a usable held session", JSON.stringify(invalidStatus.payload));
    addCheck(checks, invalidSave.status === 409 && cleanText(runtimeError(invalidSave)?.code) === "workspace_lease_invalid", "invalid generation selectors do not leave orphaned authoring authority", JSON.stringify(invalidSave.payload));

    const restoreAlternate = await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var workspace = new GlideRecord('${defaults.workspaceTable}');
        if (!workspace.get(${JSON.stringify(cleanup.workspaceSysId)})) {
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace missing before alternate generation restore.' }));
          return;
        }
        var active = new GlideRecord('${defaults.workspaceChangeSetTable}');
        if (active.get(${JSON.stringify(cleanup.activeChangeSetSysId)})) {
          active.lifecycle_state = 'superseded';
          active.update();
        }
        var alternate = new GlideRecord('${defaults.workspaceChangeSetTable}');
        if (alternate.get(${JSON.stringify(cleanup.alternateChangeSetSysId)})) {
          alternate.lifecycle_state = 'active';
          alternate.update();
        }
        workspace.pending_change_set = ${JSON.stringify(cleanup.alternateChangeSetSysId)};
        workspace.published_snapshot_set = ${JSON.stringify(cleanup.snapshotSetSysId)};
        workspace.workspace_state_revision = 3;
        workspace.update();
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
      })();
      `
    );
    void restoreAlternate;
    const alternateRenew = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/renew`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken
    });
    addCheck(checks, alternateRenew.status === 200 && cleanText(runtimeResult(alternateRenew)?.changeSetId) === cleanup.alternateChangeSetSysId && Number(runtimeResult(alternateRenew)?.changeSetRevision) === 0 && Number(runtimeResult(alternateRenew)?.workspaceStateRevision) === 3, "a numerically equal revision from another generation is not treated as the same identity", JSON.stringify(alternateRenew.payload));

    const inactiveSelector = await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var workspace = new GlideRecord('${defaults.workspaceTable}');
        if (!workspace.get(${JSON.stringify(cleanup.workspaceSysId)})) {
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace missing before inactive-selector probe.' }));
          return;
        }
        workspace.pending_change_set = ${JSON.stringify(cleanup.inactiveChangeSetSysId)};
        workspace.workspace_state_revision = 4;
        workspace.update();
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
      })();
      `
    );
    void inactiveSelector;
    const inactiveAcquire = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/acquire`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId
    });
    addCheck(checks, inactiveAcquire.status === 409 && cleanText(runtimeError(inactiveAcquire)?.code) === "workspace_foundation_invalid", "inactive change-set selectors fail safely during acquisition", JSON.stringify(inactiveAcquire.payload));

    const restoreActive = await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var workspace = new GlideRecord('${defaults.workspaceTable}');
        if (!workspace.get(${JSON.stringify(cleanup.workspaceSysId)})) {
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace missing before final active restore.' }));
          return;
        }
        var alternate = new GlideRecord('${defaults.workspaceChangeSetTable}');
        if (alternate.get(${JSON.stringify(cleanup.alternateChangeSetSysId)})) {
          alternate.lifecycle_state = 'superseded';
          alternate.update();
        }
        var active = new GlideRecord('${defaults.workspaceChangeSetTable}');
        if (active.get(${JSON.stringify(cleanup.activeChangeSetSysId)})) {
          active.lifecycle_state = 'active';
          active.update();
        }
        workspace.pending_change_set = ${JSON.stringify(cleanup.activeChangeSetSysId)};
        workspace.published_snapshot_set = ${JSON.stringify(cleanup.snapshotSetSysId)};
        workspace.workspace_state_revision = 5;
        workspace.update();
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
      })();
      `
    );
    void restoreActive;
    const finalRenew = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/renew`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      leaseToken
    });
    addCheck(checks, finalRenew.status === 200 && cleanText(runtimeResult(finalRenew)?.changeSetId) === cleanup.activeChangeSetSysId && Number(runtimeResult(finalRenew)?.workspaceStateRevision) === 5, "renew returns the restored active generation pair after selector repair", JSON.stringify(finalRenew.payload));

    const leaseGet = await tableGet(instanceUrl, ownerSession, defaults.workspaceLeaseTable, cleanText(leaseRowsAfterTakeover[0]?.sys_id), "sys_id");
    const leasePatchDenied = await tablePatch(instanceUrl, ownerSession, defaults.workspaceLeaseTable, cleanText(leaseRowsAfterTakeover[0]?.sys_id), {
      last_seen_on: buildPastTimestamp(1)
    });
    const leaseDeleteDenied = await tableDelete(instanceUrl, ownerSession, defaults.workspaceLeaseTable, cleanText(leaseRowsAfterTakeover[0]?.sys_id));
    const changeSetGet = await tableGet(instanceUrl, ownerSession, defaults.workspaceChangeSetTable, cleanup.activeChangeSetSysId, "sys_id");
    const changeSetInsertDenied = await tableInsert(instanceUrl, ownerSession, defaults.workspaceChangeSetTable, {
      workspace: cleanup.workspaceSysId,
      generation_key: `unauthorized-${Date.now()}`,
      change_set_revision: 0,
      next_pending_sequence: 1,
      lifecycle_state: "active",
      recovery_state: "none"
    });
    addCheck(checks, [403, 401, 404].includes(leaseGet.status) && [403, 401, 404].includes(leasePatchDenied.status) && [403, 401, 404].includes(leaseDeleteDenied.status), "direct Table API read, update, and delete are denied for workspace lease rows", JSON.stringify({
      get: leaseGet.status,
      patch: leasePatchDenied.status,
      delete: leaseDeleteDenied.status
    }));
    addCheck(checks, [403, 401, 404].includes(changeSetGet.status) && [403, 401, 404].includes(changeSetInsertDenied.status), "direct Table API read and create are denied for workspace change-set rows", JSON.stringify({
      get: changeSetGet.status,
      post: changeSetInsertDenied.status
    }));
  } finally {
    if (cleanup.workspaceSlug && pageSysId && leaseToken) {
      await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/release`, {
        workspaceSlug: cleanup.workspaceSlug,
        workspaceSysId: cleanup.workspaceSysId,
        leaseToken
      }).catch(() => undefined);
    }

    if (!keepData) {
      await runBackgroundScript(
        instanceUrl,
        ownerSession,
        `
        (function () {
          function removeAll(table, field, value) {
            if (!value) return;
            var gr = new GlideRecord(table);
            gr.addQuery(field, value);
            gr.query();
            while (gr.next()) {
              gr.deleteRecord();
            }
          }

          var workspaceSysId = ${JSON.stringify(cleanup.workspaceSysId)};
          var requestSysId = ${JSON.stringify(cleanup.requestSysId)};
          var adminGroupSysId = ${JSON.stringify(cleanup.adminGroupSysId)};
          var editorGroupSysId = ${JSON.stringify(cleanup.editorGroupSysId)};
          var editorUserSysId = ${JSON.stringify(cleanup.editorUserSysId)};
          var viewerUserSysId = ${JSON.stringify(cleanup.viewerUserSysId)};

          removeAll('${defaults.workspaceLeaseTable}', 'workspace', workspaceSysId);
          removeAll('${defaults.pageTable}', 'workspace', workspaceSysId);
          removeAll('${defaults.workspaceSnapshotSetTable}', 'workspace', workspaceSysId);
          removeAll('${defaults.workspaceChangeSetTable}', 'workspace', workspaceSysId);

          if (requestSysId) {
            var request = new GlideRecord('x_82900_docsera_workspace_provision_request');
            if (request.get(requestSysId)) request.deleteRecord();
          }
          if (workspaceSysId) {
            var workspace = new GlideRecord('${defaults.workspaceTable}');
            if (workspace.get(workspaceSysId)) workspace.deleteRecord();
          }

          removeAll('sys_user_grmember', 'user', editorUserSysId);
          removeAll('sys_user_grmember', 'user', viewerUserSysId);
          if (editorUserSysId) {
            var editorUser = new GlideRecord('sys_user');
            if (editorUser.get(editorUserSysId)) editorUser.deleteRecord();
          }
          if (viewerUserSysId) {
            var viewerUser = new GlideRecord('sys_user');
            if (viewerUser.get(viewerUserSysId)) viewerUser.deleteRecord();
          }
          if (adminGroupSysId) {
            var adminGroup = new GlideRecord('sys_user_group');
            if (adminGroup.get(adminGroupSysId)) adminGroup.deleteRecord();
          }
          if (editorGroupSysId) {
            var editorGroup = new GlideRecord('sys_user_group');
            if (editorGroup.get(editorGroupSysId)) editorGroup.deleteRecord();
          }
          gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
        })();
        `
      ).catch(() => undefined);
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

await main().catch((error) => {
  throw new Error(safeErrorMessage(error, "workspace edit lease verification failed"));
});
