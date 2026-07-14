#!/usr/bin/env node

import { createHash } from "node:crypto";
import { Entry } from "@napi-rs/keyring";
import { parseArgs } from "node:util";

const defaults = {
  acquirePath: "/api/x_82900_docsera/docsera_runtime/pages/edit-lock/acquire",
  authAlias: "docsera-pdi",
  cleanupPath: "/api/x_82900_docsera/docsera_runtime/pages/edit-lock/release",
  heartbeatPath: "/api/x_82900_docsera/docsera_runtime/pages/edit-lock/heartbeat",
  instanceUrl: "https://dev295482.service-now.com",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow",
  lockTable: "x_82900_docsera_page_edit_lock",
  pageCreatePath: "/api/x_82900_docsera/docsera_runtime/pages",
  pageTable: "x_82900_docsera_page",
  statusPath: "/api/x_82900_docsera/docsera_runtime/pages/edit-lock/status",
  workspacePath: "/api/x_82900_docsera/docsera_runtime/workspaces",
  workspaceProvisioningStatusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status"
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
  return trimmed ? trimmed : undefined;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
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
  let current = payload;
  while (current && typeof current === "object" && "result" in current) {
    current = current.result;
  }

  return current;
}

function getRuntimeResult(result) {
  return normalizePayload(result.payload);
}

function getRuntimeError(result) {
  const normalized = getRuntimeResult(result);
  return normalized && typeof normalized === "object" ? normalized.error ?? null : null;
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
      throw new Error(parsedLogin.message ?? "Instance rejected the stored SDK credentials.");
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
    payload,
    status: response.status,
    text
  };
}

async function tableQuery(instanceUrl, session, table, { fields, limit = 25, query }) {
  const params = new URLSearchParams({
    sysparm_exclude_reference_link: "true",
    sysparm_limit: String(limit),
    sysparm_query: cleanText(query) || "sys_idISNOTEMPTY"
  });

  if (fields) {
    params.set("sysparm_fields", fields);
  }

  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}?${params.toString()}`);
  if (!result.ok) {
    throw new Error(`Query ${table} failed with HTTP ${result.status}: ${result.text}`);
  }

  return Array.isArray(result.payload?.result) ? result.payload.result : [];
}

async function tablePatch(instanceUrl, session, table, sysId, body) {
  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json"
    },
    method: "PATCH"
  });

  return result;
}

async function tableDelete(instanceUrl, session, table, sysId) {
  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}`, {
    method: "DELETE"
  });

  return result.status === 200 || result.status === 204;
}

function buildWorkspacePayload(name) {
  return {
    icon: {
      key: "docsera-workspace",
      label: "Docsera workspace icon",
      type: "builtin"
    },
    layout: {
      pageWidth: "readable",
      tocVisibleByDefault: true
    },
    name,
    shortDescription: "Temporary verification workspace for the page edit lock guard"
  };
}

function unwrapWorkspaceResult(payload) {
  const normalized = normalizePayload(payload);
  if (!normalized || typeof normalized !== "object") {
    throw new Error("Workspace route did not return the expected result payload.");
  }

  return normalized;
}

async function pollWorkspaceProvisioning(instanceUrl, session, requestId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await fetchJson(
      instanceUrl,
      session,
      `${defaults.workspaceProvisioningStatusPath}?requestId=${encodeURIComponent(requestId)}`
    );

    if (!result.ok) {
      throw new Error(`Workspace provisioning status failed with HTTP ${result.status}: ${result.text}`);
    }

    const normalized = unwrapWorkspaceResult(result.payload);
    const state = cleanText(normalized.provisioning?.state);
    if (state === "succeeded") {
      return normalized;
    }

    if (state === "failed") {
      throw new Error(normalized.error?.message ?? "Workspace provisioning failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Workspace provisioning did not finish within the polling window.");
}

async function createWorkspace(instanceUrl, session, workspaceName) {
  const result = await fetchJson(instanceUrl, session, defaults.workspacePath, {
    body: JSON.stringify(buildWorkspacePayload(workspaceName)),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (![201, 202].includes(result.status)) {
    throw new Error(`Workspace create failed with HTTP ${result.status}: ${result.text}`);
  }

  const normalized = unwrapWorkspaceResult(result.payload);
  if (result.status === 201) {
    return normalized;
  }

  return pollWorkspaceProvisioning(
    instanceUrl,
    session,
    cleanText(normalized.provisioning?.requestId)
  );
}

async function createPage(instanceUrl, session, workspaceSlug, title) {
  const result = await fetchJson(instanceUrl, session, defaults.pageCreatePath, {
    body: JSON.stringify({
      title,
      workspaceSlug
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (result.status !== 201) {
    throw new Error(`Page create failed with HTTP ${result.status}: ${result.text}`);
  }

  const normalized = normalizePayload(result.payload);
  const page = normalized?.page;
  if (!page || typeof page !== "object") {
    throw new Error("Page create did not return a page payload.");
  }

  return page;
}

async function callRuntime(instanceUrl, session, path, body) {
  return fetchJson(instanceUrl, session, path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function createDraftEnvelope(text) {
  return {
    document: {
      content: [
        {
          content: [
            {
              text,
              type: "text"
            }
          ],
          type: "paragraph"
        }
      ],
      type: "doc"
    },
    schemaVersion: 1
  };
}

function addCheck(checks, ok, label, detail = "") {
  checks.push({ detail, label, ok: Boolean(ok) });
}

function printCheck(check) {
  const prefix = check.ok ? "[pass]" : "[fail]";
  console.log(`${prefix} ${check.label}`);
  if (check.detail) {
    console.log(`       ${check.detail}`);
  }
}

async function waitForDeletion(instanceUrl, session, table, sysId, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await tableQuery(instanceUrl, session, table, {
      fields: "sys_id",
      limit: 1,
      query: `sys_id=${sysId}`
    });

    if (rows.length === 0) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return false;
}

async function waitForPersistence(instanceUrl, session, table, sysId, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await tableQuery(instanceUrl, session, table, {
      fields: "sys_id,last_seen_on",
      limit: 1,
      query: `sys_id=${sysId}`
    });

    if (rows.length === 1) {
      return rows[0];
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return null;
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
      "contention-rounds": { type: "string" },
      "instance-url": { type: "string" },
      "keep-data": { type: "boolean" },
      help: { short: "h", type: "boolean" }
    },
    args: process.argv.slice(2)
  });

  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/verify-page-edit-lock-guard.mjs [--auth-alias <alias>] [--instance-url <url>] [--contention-rounds <n>] [--keep-data]");
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
  const contentionRounds = Math.max(1, Number(getOptionValue(parsedArgs.values["contention-rounds"])) || 20);
  const keepData = Boolean(parsedArgs.values["keep-data"]);
  const checks = [];
  const keyringEntry = new Entry(defaults.keyringService, defaults.keyringAccount);
  const parsedCredential = parseKeyringRecord(keyringEntry.getPassword(), authAlias);

  if (parsedCredential.error) {
    throw new Error(parsedCredential.error);
  }

  if (
    parsedCredential.credential.creds?.instanceUrl &&
    parsedCredential.credential.creds.instanceUrl !== instanceUrl
  ) {
    throw new Error(`Stored alias "${authAlias}" points to ${parsedCredential.credential.creds.instanceUrl}, not ${instanceUrl}.`);
  }

  if (parsedCredential.credential.creds?.type !== "basic") {
    throw new Error(`Stored alias "${authAlias}" uses ${parsedCredential.credential.creds?.type ?? "unknown"} auth; this verifier expects basic auth.`);
  }

  const session = await establishBasicSession(instanceUrl, parsedCredential.credential.creds);
  const workspaceName = `Page Lock Verification ${Date.now()}`;
  let requestId = "";
  let workspaceSysId = "";
  let workspaceSlug = "";
  let adminGroupSysId = "";
  let editorGroupSysId = "";
  let pageSysId = "";
  let pageSlug = "";
  let liveLockToken = "";
  let liveLockSysId = "";

  try {
    const workspaceResult = await createWorkspace(instanceUrl, session, workspaceName);
    requestId = cleanText(workspaceResult.provisioning?.requestId);
    workspaceSysId = cleanText(workspaceResult.workspace?.sysId);
    workspaceSlug = cleanText(workspaceResult.workspace?.slug);
    adminGroupSysId = cleanText(workspaceResult.groups?.admin?.sysId);
    editorGroupSysId = cleanText(workspaceResult.groups?.editor?.sysId);

    addCheck(checks, Boolean(workspaceSysId && workspaceSlug), "verification workspace was provisioned", JSON.stringify({
      requestId,
      workspaceSlug,
      workspaceSysId
    }));

    const page = await createPage(instanceUrl, session, workspaceSlug, "Page Lock Verification");
    pageSysId = cleanText(page.sysId);
    pageSlug = cleanText(page.draftSlugNormalized || page.draftSlug);
    addCheck(checks, Boolean(pageSysId), "verification page was created", JSON.stringify({
      pageSlug,
      pageSysId
    }));

    const operations = await tableQuery(instanceUrl, session, "sys_ws_operation", {
      fields: "name,operation_uri,http_method",
      limit: 20,
      query: "operation_uriLIKEedit-lock"
    });
    addCheck(
      checks,
      operations.some((record) => cleanText(record.operation_uri) === defaults.acquirePath),
      "acquire route metadata is installed"
    );
    addCheck(
      checks,
      operations.some((record) => cleanText(record.operation_uri) === defaults.heartbeatPath),
      "heartbeat route metadata is installed"
    );
    addCheck(
      checks,
      operations.some((record) => cleanText(record.operation_uri) === defaults.cleanupPath),
      "release route metadata is installed"
    );
    addCheck(
      checks,
      operations.some((record) => cleanText(record.operation_uri) === defaults.statusPath),
      "status route metadata is installed"
    );

    for (let round = 1; round <= contentionRounds; round += 1) {
      const contenders = await Promise.all(
        Array.from({ length: 4 }, () =>
          callRuntime(instanceUrl, session, defaults.acquirePath, {
            pageSysId,
            workspaceSlug
          })
        )
      );
      const winners = contenders.filter((result) => result.status === 200);
      const losers = contenders.filter((result) => result.status === 409);
      const winnerPayload = winners[0] ? getRuntimeResult(winners[0]) : null;
      const winnerToken = cleanText(winnerPayload?.lockToken);
      const lockRows = await tableQuery(instanceUrl, session, defaults.lockTable, {
        fields: "sys_id,page_key,verifier_digest,holder_user,last_seen_on",
        limit: 5,
        query: `page=${pageSysId}`
      });

      addCheck(checks, winners.length === 1, `contention round ${round}: exactly one winner`, JSON.stringify(contenders.map((result) => result.status)));
      addCheck(checks, losers.length === 3, `contention round ${round}: controlled loser responses`, JSON.stringify(contenders.map((result) => result.status)));
      addCheck(checks, Boolean(winnerToken), `contention round ${round}: winner returned a lock token`);
      addCheck(
        checks,
        losers.every((result) => cleanText(getRuntimeError(result)?.code) === "page_locked"),
        `contention round ${round}: losers returned page_locked`
      );
      addCheck(
        checks,
        losers.every((result) => getRuntimeError(result)?.sameUserDifferentSession === true),
        `contention round ${round}: same-user loser responses distinguish another tab or window`
      );
      addCheck(checks, lockRows.length === 1, `contention round ${round}: exactly one durable lock row`, JSON.stringify(lockRows));
      addCheck(
        checks,
        lockRows[0] && cleanText(lockRows[0].verifier_digest) === sha256Hex(winnerToken),
        `contention round ${round}: durable winner digest matches the returned token`
      );

      const releaseResult = await callRuntime(instanceUrl, session, defaults.cleanupPath, {
        lockToken: winnerToken,
        pageSysId,
        workspaceSlug
      });
      addCheck(checks, releaseResult.status === 200, `contention round ${round}: winner release succeeded`, JSON.stringify(releaseResult.payload));
    }

    const acquireHeld = await callRuntime(instanceUrl, session, defaults.acquirePath, {
      pageSysId,
      workspaceSlug
    });
    const heldPayload = getRuntimeResult(acquireHeld);
    liveLockToken = cleanText(heldPayload?.lockToken);
    addCheck(checks, acquireHeld.status === 200 && Boolean(liveLockToken), "post-contention acquire succeeded");

    const heldRows = await tableQuery(instanceUrl, session, defaults.lockTable, {
      fields: "sys_id,verifier_digest,last_seen_on",
      limit: 1,
      query: `page=${pageSysId}`
    });
    liveLockSysId = cleanText(heldRows[0]?.sys_id);

    const statusHeld = await callRuntime(instanceUrl, session, defaults.statusPath, {
      lockToken: liveLockToken,
      pageSysId,
      workspaceSlug
    });
    addCheck(checks, statusHeld.status === 200 && cleanText(getRuntimeResult(statusHeld)?.state) === "held", "status resumes the same-tab lock");

    const statusSecondSession = await callRuntime(instanceUrl, session, defaults.acquirePath, {
      pageSysId,
      workspaceSlug
    });
    addCheck(
      checks,
      statusSecondSession.status === 409 && getRuntimeError(statusSecondSession)?.sameUserDifferentSession === true,
      "a second tab or window contends as a separate editing session",
      JSON.stringify(getRuntimeResult(statusSecondSession))
    );

    const heartbeatHeld = await callRuntime(instanceUrl, session, defaults.heartbeatPath, {
      lockToken: liveLockToken,
      pageSysId,
      workspaceSlug
    });
    addCheck(checks, heartbeatHeld.status === 200, "heartbeat accepts the correct token");

    const heartbeatWrong = await callRuntime(instanceUrl, session, defaults.heartbeatPath, {
      lockToken: "wrong-token",
      pageSysId,
      workspaceSlug
    });
    addCheck(
      checks,
      heartbeatWrong.status === 409 && cleanText(getRuntimeError(heartbeatWrong)?.code) === "edit_lock_lost",
      "heartbeat rejects a wrong token distinctly",
      JSON.stringify(getRuntimeResult(heartbeatWrong))
    );

    const originalPageRows = await tableQuery(instanceUrl, session, defaults.pageTable, {
      fields: "sys_id,draft_revision,draft_content_json",
      limit: 1,
      query: `sys_id=${pageSysId}`
    });
    const originalRevision = Number(originalPageRows[0]?.draft_revision || 0);
    const originalContent = cleanText(originalPageRows[0]?.draft_content_json);

    const saveWrong = await fetchJson(instanceUrl, session, defaults.pageCreatePath, {
      body: JSON.stringify({
        draftContentJson: createDraftEnvelope("Wrong token draft"),
        expectedRevision: originalRevision,
        lockToken: "wrong-token",
        pageSysId,
        workspaceSlug
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    });
    const pageAfterWrongSave = await tableQuery(instanceUrl, session, defaults.pageTable, {
      fields: "sys_id,draft_revision,draft_content_json",
      limit: 1,
      query: `sys_id=${pageSysId}`
    });
    addCheck(
      checks,
      saveWrong.status === 409 && cleanText(getRuntimeError(saveWrong)?.code) === "edit_lock_lost",
      "autosave rejects a wrong token distinctly",
      JSON.stringify(getRuntimeResult(saveWrong))
    );
    addCheck(
      checks,
      Number(pageAfterWrongSave[0]?.draft_revision || 0) === originalRevision &&
        cleanText(pageAfterWrongSave[0]?.draft_content_json) === originalContent,
      "lock-lost save rejection does not mutate canonical draft content"
    );

    const saveHeld = await fetchJson(instanceUrl, session, defaults.pageCreatePath, {
      body: JSON.stringify({
        draftContentJson: createDraftEnvelope("Held token draft"),
        expectedRevision: originalRevision,
        lockToken: liveLockToken,
        pageSysId,
        workspaceSlug
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    });
    addCheck(checks, saveHeld.status === 200, "autosave accepts the correct token");

    const releaseFirst = await callRuntime(instanceUrl, session, defaults.cleanupPath, {
      lockToken: liveLockToken,
      pageSysId,
      workspaceSlug
    });
    addCheck(checks, releaseFirst.status === 200, "release accepts the correct token");

    const replacementAcquire = await callRuntime(instanceUrl, session, defaults.acquirePath, {
      pageSysId,
      workspaceSlug
    });
    const replacementToken = cleanText(getRuntimeResult(replacementAcquire)?.lockToken);
    const replacementRows = await tableQuery(instanceUrl, session, defaults.lockTable, {
      fields: "sys_id,verifier_digest",
      limit: 1,
      query: `page=${pageSysId}`
    });
    addCheck(checks, replacementAcquire.status === 200 && Boolean(replacementToken), "replacement acquire succeeded");

    const staleRelease = await callRuntime(instanceUrl, session, defaults.cleanupPath, {
      lockToken: liveLockToken,
      pageSysId,
      workspaceSlug
    });
    const rowAfterStaleRelease = await tableQuery(instanceUrl, session, defaults.lockTable, {
      fields: "sys_id,verifier_digest",
      limit: 1,
      query: `page=${pageSysId}`
    });
    addCheck(
      checks,
      staleRelease.status === 409,
      "an old release request cannot delete a replacement lock",
      JSON.stringify(staleRelease.payload)
    );
    addCheck(
      checks,
      rowAfterStaleRelease.length === 1 &&
        cleanText(rowAfterStaleRelease[0].verifier_digest) === sha256Hex(replacementToken),
      "replacement lock remains after an old release request"
    );

    liveLockToken = replacementToken;
    liveLockSysId = cleanText(replacementRows[0]?.sys_id);

    const nearBoundaryPatch = await tablePatch(instanceUrl, session, defaults.lockTable, liveLockSysId, {
      last_seen_on: buildPastTimestamp(2)
    });
    addCheck(checks, nearBoundaryPatch.ok, "near-threshold probe patched the held lock inside the stale window");
    const boundaryHeartbeat = await callRuntime(instanceUrl, session, defaults.heartbeatPath, {
      lockToken: liveLockToken,
      pageSysId,
      workspaceSlug
    });
    addCheck(checks, boundaryHeartbeat.status === 200, "heartbeat renews a lock before the stale threshold");
    const rowAfterBoundary = await waitForPersistence(instanceUrl, session, defaults.lockTable, liveLockSysId, 80000);
    addCheck(checks, Boolean(rowAfterBoundary), "cleanup does not remove a lock renewed before the stale threshold");

    const stalePatch = await tablePatch(instanceUrl, session, defaults.lockTable, liveLockSysId, {
      last_seen_on: buildPastTimestamp(10)
    });
    addCheck(checks, stalePatch.ok, "stale-lock probe patched the lock row beyond expiry");

    const staleStatus = await callRuntime(instanceUrl, session, defaults.statusPath, {
      lockToken: liveLockToken,
      pageSysId,
      workspaceSlug
    });
    addCheck(
      checks,
      staleStatus.status === 409 && cleanText(getRuntimeError(staleStatus)?.code) === "edit_lock_lost",
      "status does not revive an already expired token",
      JSON.stringify(getRuntimeResult(staleStatus))
    );

    const staleHeartbeat = await callRuntime(instanceUrl, session, defaults.heartbeatPath, {
      lockToken: liveLockToken,
      pageSysId,
      workspaceSlug
    });
    addCheck(
      checks,
      staleHeartbeat.status === 409 && cleanText(getRuntimeError(staleHeartbeat)?.code) === "edit_lock_lost",
      "heartbeat does not revive an already expired token",
      JSON.stringify(getRuntimeResult(staleHeartbeat))
    );

    const preExpiredSaveRows = await tableQuery(instanceUrl, session, defaults.pageTable, {
      fields: "sys_id,draft_revision,draft_content_json",
      limit: 1,
      query: `sys_id=${pageSysId}`
    });
    const preExpiredRevision = Number(preExpiredSaveRows[0]?.draft_revision || 0);
    const preExpiredContent = cleanText(preExpiredSaveRows[0]?.draft_content_json);
    const expiredSave = await fetchJson(instanceUrl, session, defaults.pageCreatePath, {
      body: JSON.stringify({
        draftContentJson: createDraftEnvelope("Expired token draft"),
        expectedRevision: preExpiredRevision,
        lockToken: liveLockToken,
        pageSysId,
        workspaceSlug
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    });
    const postExpiredSaveRows = await tableQuery(instanceUrl, session, defaults.pageTable, {
      fields: "sys_id,draft_revision,draft_content_json",
      limit: 1,
      query: `sys_id=${pageSysId}`
    });
    addCheck(
      checks,
      expiredSave.status === 409 && cleanText(getRuntimeError(expiredSave)?.code) === "edit_lock_lost",
      "autosave does not revive an already expired token",
      JSON.stringify(getRuntimeResult(expiredSave))
    );
    addCheck(
      checks,
      Number(postExpiredSaveRows[0]?.draft_revision || 0) === preExpiredRevision &&
        cleanText(postExpiredSaveRows[0]?.draft_content_json) === preExpiredContent,
      "expired-session save rejection does not mutate canonical draft content"
    );

    const deletedByCleanup = await waitForDeletion(instanceUrl, session, defaults.lockTable, liveLockSysId, 120000);
    addCheck(checks, deletedByCleanup, "scheduled cleanup removed an abandoned stale lock");

    const acquireAfterCleanup = await callRuntime(instanceUrl, session, defaults.acquirePath, {
      pageSysId,
      workspaceSlug
    });
    liveLockToken = cleanText(getRuntimeResult(acquireAfterCleanup)?.lockToken);
    const freshRows = await tableQuery(instanceUrl, session, defaults.lockTable, {
      fields: "sys_id,last_seen_on,verifier_digest",
      limit: 1,
      query: `page=${pageSysId}`
    });
    liveLockSysId = cleanText(freshRows[0]?.sys_id);
    addCheck(checks, acquireAfterCleanup.status === 200 && Boolean(liveLockToken), "normal cold acquisition succeeds after stale cleanup");
  } finally {
    if (liveLockToken && pageSysId && workspaceSlug) {
      await callRuntime(instanceUrl, session, defaults.cleanupPath, {
        lockToken: liveLockToken,
        pageSysId,
        workspaceSlug
      }).catch(() => undefined);
    }

    if (!keepData) {
      if (pageSysId) {
        await tableDelete(instanceUrl, session, defaults.pageTable, pageSysId).catch(() => false);
      }
      if (workspaceSysId) {
        await tableDelete(instanceUrl, session, "x_82900_docsera_workspace", workspaceSysId).catch(() => false);
      }
      if (requestId) {
        await tableDelete(instanceUrl, session, "x_82900_docsera_workspace_provision_request", requestId).catch(() => false);
      }
      if (adminGroupSysId) {
        await tableDelete(instanceUrl, session, "sys_user_group", adminGroupSysId).catch(() => false);
      }
      if (editorGroupSysId) {
        await tableDelete(instanceUrl, session, "sys_user_group", editorGroupSysId).catch(() => false);
      }
    }
  }

  for (const check of checks) {
    printCheck(check);
  }

  console.log("");
  console.log(`Contention rounds: ${contentionRounds}`);
  console.log(`Result: ${checks.every((check) => check.ok) ? "pass" : "fail"}`);

  if (!checks.every((check) => check.ok)) {
    process.exitCode = 1;
  }
}

await main();
