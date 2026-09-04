#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { createHash } from "node:crypto";
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
  pageDeleteActionPath: "/api/x_82900_docsera/docsera_runtime/pages/delete",
  requestTable: "x_82900_docsera_workspace_provision_request",
  workspaceTable: "x_82900_docsera_workspace",
  pageTable: "x_82900_docsera_page",
  workspaceChangeSetTable: "x_82900_docsera_workspace_change_set",
  workspaceSnapshotSetTable: "x_82900_docsera_workspace_snapshot_set",
  workspacePageSnapshotTable: "x_82900_docsera_workspace_page_snapshot",
  workspaceChangeEntryTable: "x_82900_docsera_workspace_change_entry",
  workspaceRemovalBatchTable: "x_82900_docsera_workspace_removal_batch",
  workspaceRemovalMemberTable: "x_82900_docsera_workspace_removal_member",
  workspaceMutationClaimTable: "x_82900_docsera_workspace_mutation_claim"
};

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

function safeInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function sortForSerialization(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortForSerialization(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce((result, key) => {
      result[key] = sortForSerialization(value[key]);
      return result;
    }, {});
}

function stableSerialize(value) {
  return JSON.stringify(sortForSerialization(value));
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").toUpperCase();
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
    url: response.url
  };
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

function addCheck(checks, ok, label, detail = "") {
  checks.push({ ok: Boolean(ok), label, detail: safeDetail(detail) });
}

function printCheck(check) {
  console.log(`${check.ok ? "[pass]" : "[fail]"} ${check.label}`);
  if (check.detail) {
    console.log(`       ${check.detail}`);
  }
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

async function listRuntimePages(instanceUrl, session, workspaceSlug, mode) {
  return fetchJson(
    instanceUrl,
    session,
    `${defaults.pagesPath}?workspaceSlug=${encodeURIComponent(workspaceSlug)}&mode=${encodeURIComponent(mode)}`
  );
}

function createLargeDraftEnvelope(prefix, paragraphCount = 120) {
  const lines = Array.from({ length: paragraphCount }, (_, index) => `${prefix} paragraph ${String(index + 1).padStart(3, "0")} stable payload text`);
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: lines.map((line) => ({
        type: "paragraph",
        content: [{ type: "text", text: line }]
      }))
    }
  };
}

async function createWorkspace(instanceUrl, session, workspaceName) {
  const createResult = await fetchJson(instanceUrl, session, defaults.workspacePath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: workspaceName,
      shortDescription: "Disposable verification workspace owned by verify-e3-t9-mutation-conversion.mjs",
      icon: {
        type: "builtin",
        key: "docsera-workspace",
        label: "Docsera workspace icon"
      },
      layout: {
        tocVisible: true,
        pageWidth: "readable"
      }
    })
  });

  if (![201, 202].includes(createResult.status)) {
    throw new Error(`Workspace create failed with HTTP ${createResult.status}: ${createResult.text}`);
  }

  const created = normalizePayload(createResult.payload);
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
    const payload = normalizePayload(statusResult.payload);
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

function createCleanupRecord(workspaceResult) {
  return {
    requestSysId: cleanText(workspaceResult?.provisioning?.requestId),
    workspaceSysId: cleanText(workspaceResult?.workspace?.sysId),
    workspaceSlug: cleanText(workspaceResult?.workspace?.slug),
    adminGroupSysId: cleanText(workspaceResult?.groups?.admin?.sysId),
    editorGroupSysId: cleanText(workspaceResult?.groups?.editor?.sysId)
  };
}

async function provisionSeededWorkspace(instanceUrl, session, workspaceName) {
  const workspaceResult = await createWorkspace(instanceUrl, session, workspaceName);
  const cleanup = createCleanupRecord(workspaceResult);
  const seed = await seedWorkspaceMutationState(instanceUrl, session, cleanup.workspaceSysId);
  const leaseAcquire = await callRuntime(instanceUrl, session, `${defaults.workspaceEditLeasePath}/acquire`, {
    workspaceSlug: cleanup.workspaceSlug,
    workspaceSysId: cleanup.workspaceSysId
  });
  return {
    cleanup,
    lease: runtimeResult(leaseAcquire),
    leaseAcquire,
    seed,
    workspaceResult
  };
}

async function seedWorkspaceMutationState(instanceUrl, session, workspaceSysId) {
  return runBackgroundScript(
    instanceUrl,
    session,
    `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (!workspace.get(workspaceSysId)) {
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found.' }));
        return;
      }

      var currentUser = String(gs.getUserID() || '');
      var changeSetKey = workspaceSysId + ':change-set';
      var snapshotKey = workspaceSysId + ':snapshot';

      function createEnvelopeJson(text) {
        return JSON.stringify({
          schemaVersion: 1,
          document: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: text }] }]
          }
        });
      }

      function createPage(title, slug, siblingOrder, parentPageSysId) {
        var bodyText = title + ' published body';
        var envelopeJson = createEnvelopeJson(bodyText);
        var page = new GlideRecord('${defaults.pageTable}');
        page.initialize();
        page.workspace = workspaceSysId;
        page.parent_page = parentPageSysId || '';
        page.sibling_order = siblingOrder;
        page.draft_parent_page = parentPageSysId || '';
        page.draft_sibling_order = siblingOrder;
        page.draft_removed = false;
        page.last_draft_changed_on = new GlideDateTime();
        page.last_draft_changed_by = currentUser;
        page.draft_title = title;
        page.draft_slug = slug;
        page.draft_slug_normalized = slug;
        page.draft_content_json = envelopeJson;
        page.draft_revision = 0;
        page.draft_body_text = bodyText;
        page.published_title = title;
        page.published_slug = slug;
        page.published_slug_normalized = slug;
        page.published_content_json = envelopeJson;
        page.published_body_text = bodyText;
        page.published_at = new GlideDateTime();
        page.published_by = currentUser;
        page.publication_state = 'published';
        page.active = true;
        return String(page.insert() || '');
      }

      function insertSnapshotPage(snapshotSetSysId, pageSysId, parentPageSysId, siblingOrder, title, slug) {
        var bodyText = title + ' published body';
        var envelopeJson = createEnvelopeJson(bodyText);
        var snapshotPage = new GlideRecord('${defaults.workspacePageSnapshotTable}');
        snapshotPage.initialize();
        snapshotPage.snapshot_set = snapshotSetSysId;
        snapshotPage.page = pageSysId;
        snapshotPage.snapshot_page_key = snapshotSetSysId + ':' + pageSysId;
        snapshotPage.parent_page = parentPageSysId || '';
        snapshotPage.sibling_order = siblingOrder;
        snapshotPage.title = title;
        snapshotPage.slug = slug;
        snapshotPage.slug_normalized = slug;
        snapshotPage.content_json = envelopeJson;
        snapshotPage.body_text = bodyText;
        snapshotPage.active = true;
        snapshotPage.published_on = new GlideDateTime();
        snapshotPage.published_by = currentUser;
        return String(snapshotPage.insert() || '');
      }

      var activeChangeSetSysId = '';
      var existingActive = new GlideRecord('${defaults.workspaceChangeSetTable}');
      existingActive.addQuery('generation_key', changeSetKey);
      existingActive.setLimit(1);
      existingActive.query();
      if (existingActive.next()) {
        activeChangeSetSysId = String(existingActive.getUniqueValue() || '');
      } else {
        var active = new GlideRecord('${defaults.workspaceChangeSetTable}');
        active.initialize();
        active.workspace = workspaceSysId;
        active.generation_key = changeSetKey;
        active.change_set_revision = 0;
        active.next_pending_sequence = 1;
        active.lifecycle_state = 'active';
        active.recovery_state = 'none';
        activeChangeSetSysId = String(active.insert() || '');
      }

      var snapshotSetSysId = '';
      var existingSnapshot = new GlideRecord('${defaults.workspaceSnapshotSetTable}');
      existingSnapshot.addQuery('snapshot_key', snapshotKey);
      existingSnapshot.setLimit(1);
      existingSnapshot.query();
      if (existingSnapshot.next()) {
        snapshotSetSysId = String(existingSnapshot.getUniqueValue() || '');
      } else {
        var snapshot = new GlideRecord('${defaults.workspaceSnapshotSetTable}');
        snapshot.initialize();
        snapshot.workspace = workspaceSysId;
        snapshot.snapshot_key = snapshotKey;
        snapshot.readiness_state = 'ready';
        snapshot.source_change_set = activeChangeSetSysId;
        snapshot.source_change_set_revision = 0;
        snapshot.published_on = new GlideDateTime();
        snapshotSetSysId = String(snapshot.insert() || '');
      }

      var rootPageSysId = createPage('Overview', 'overview', 'a', '');
      var childPageSysId = createPage('Child', 'child', 'a', rootPageSysId);
      var siblingPageSysId = createPage('Second', 'second', 'b', '');

      insertSnapshotPage(snapshotSetSysId, rootPageSysId, '', 'a', 'Overview', 'overview');
      insertSnapshotPage(snapshotSetSysId, childPageSysId, rootPageSysId, 'a', 'Child', 'child');
      insertSnapshotPage(snapshotSetSysId, siblingPageSysId, '', 'b', 'Second', 'second');

      workspace.pending_change_set = activeChangeSetSysId;
      workspace.published_snapshot_set = snapshotSetSysId;
      workspace.workspace_state_revision = 0;
      workspace.update();

      gs.info('DOCSERA_RESULT:' + JSON.stringify({
        activeChangeSetSysId: activeChangeSetSysId,
        snapshotSetSysId: snapshotSetSysId,
        rootPageSysId: rootPageSysId,
        childPageSysId: childPageSysId,
        siblingPageSysId: siblingPageSysId
      }));
    })();
    `
  );
}

async function inspectWorkspaceMutationState(instanceUrl, session, workspaceSysId) {
  return runBackgroundScript(
    instanceUrl,
    session,
    `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var summary = {
        workspace: null,
        activeChangeSet: null,
        pages: [],
        changeEntries: [],
        removalBatches: [],
        mutationClaims: [],
        selectedSnapshotPages: []
      };

      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (!workspace.get(workspaceSysId)) {
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found during inspection.' }));
        return;
      }

      summary.workspace = {
        sysId: String(workspace.getUniqueValue() || ''),
        pendingChangeSet: String(workspace.getValue('pending_change_set') || ''),
        publishedSnapshotSet: String(workspace.getValue('published_snapshot_set') || ''),
        workspaceStateRevision: Number(workspace.getValue('workspace_state_revision') || 0)
      };

      if (summary.workspace.pendingChangeSet) {
        var active = new GlideRecord('${defaults.workspaceChangeSetTable}');
        if (active.get(summary.workspace.pendingChangeSet)) {
          summary.activeChangeSet = {
            sysId: String(active.getUniqueValue() || ''),
            changeSetRevision: Number(active.getValue('change_set_revision') || 0),
            nextPendingSequence: Number(active.getValue('next_pending_sequence') || 0),
            lifecycleState: String(active.getValue('lifecycle_state') || ''),
            recoveryState: String(active.getValue('recovery_state') || '')
          };
        }
      }

      if (summary.workspace.publishedSnapshotSet) {
        var selectedSnapshotPages = new GlideRecord('${defaults.workspacePageSnapshotTable}');
        selectedSnapshotPages.addQuery('snapshot_set', summary.workspace.publishedSnapshotSet);
        selectedSnapshotPages.orderBy('sys_created_on');
        selectedSnapshotPages.query();
        while (selectedSnapshotPages.next()) {
          summary.selectedSnapshotPages.push({
            sysId: String(selectedSnapshotPages.getUniqueValue() || ''),
            pageSysId: String(selectedSnapshotPages.getValue('page') || ''),
            parentPageSysId: String(selectedSnapshotPages.getValue('parent_page') || ''),
            siblingOrder: String(selectedSnapshotPages.getValue('sibling_order') || ''),
            title: String(selectedSnapshotPages.getValue('title') || ''),
            slug: String(selectedSnapshotPages.getValue('slug_normalized') || selectedSnapshotPages.getValue('slug') || ''),
            bodyText: String(selectedSnapshotPages.getValue('body_text') || '')
          });
        }
      }

      var pages = new GlideRecord('${defaults.pageTable}');
      pages.addQuery('workspace', workspaceSysId);
      pages.orderBy('sys_created_on');
      pages.query();
      while (pages.next()) {
        summary.pages.push({
          sysId: String(pages.getUniqueValue() || ''),
          parentPageSysId: String(pages.getValue('parent_page') || ''),
          siblingOrder: String(pages.getValue('sibling_order') || ''),
          draftTitle: String(pages.getValue('draft_title') || ''),
          draftSlug: String(pages.getValue('draft_slug') || ''),
          draftRevision: Number(pages.getValue('draft_revision') || 0),
          draftBodyText: String(pages.getValue('draft_body_text') || ''),
          publishedTitle: String(pages.getValue('published_title') || ''),
          publicationState: String(pages.getValue('publication_state') || ''),
          active: String(pages.getValue('active') || '')
        });
      }

      if (summary.workspace.pendingChangeSet) {
        var entries = new GlideRecord('${defaults.workspaceChangeEntryTable}');
        entries.addQuery('change_set', summary.workspace.pendingChangeSet);
        entries.orderBy('first_pending_sequence');
        entries.query();
        while (entries.next()) {
          summary.changeEntries.push({
            sysId: String(entries.getUniqueValue() || ''),
            pageSysId: String(entries.getValue('page') || ''),
            firstPendingSequence: Number(entries.getValue('first_pending_sequence') || 0),
            lastChangedOn: String(entries.getValue('last_changed_on') || '')
          });
        }

        var batches = new GlideRecord('${defaults.workspaceRemovalBatchTable}');
        batches.addQuery('change_set', summary.workspace.pendingChangeSet);
        batches.orderBy('sys_created_on');
        batches.query();
        while (batches.next()) {
          var batchSysId = String(batches.getUniqueValue() || '');
          var members = [];
          var memberRows = new GlideRecord('${defaults.workspaceRemovalMemberTable}');
          memberRows.addQuery('removal_batch', batchSysId);
          memberRows.orderBy('sys_created_on');
          memberRows.query();
          while (memberRows.next()) {
            members.push({
              sysId: String(memberRows.getUniqueValue() || ''),
              batchPageKey: String(memberRows.getValue('batch_page_key') || ''),
              firstPendingSequence: Number(memberRows.getValue('first_pending_sequence') || 0),
              pageSysId: String(memberRows.getValue('page') || '')
            });
          }
          summary.removalBatches.push({
            sysId: batchSysId,
            batchKey: String(batches.getValue('batch_key') || ''),
            lifecycleState: String(batches.getValue('lifecycle_state') || ''),
            removedOn: String(batches.getValue('removed_on') || ''),
            rootPageSysId: String(batches.getValue('root_page') || ''),
            members: members
          });
        }
      }

      var claims = new GlideRecord('${defaults.workspaceMutationClaimTable}');
      claims.addQuery('workspace', workspaceSysId);
      claims.orderBy('claimed_on');
      claims.query();
      while (claims.next()) {
        summary.mutationClaims.push({
          sysId: String(claims.getUniqueValue() || ''),
          generationKey: String(claims.getValue('generation_key') || ''),
          mutationKey: String(claims.getValue('mutation_key') || ''),
          mutationKind: String(claims.getValue('mutation_kind') || ''),
          mutationState: String(claims.getValue('mutation_state') || ''),
          executionPhase: String(claims.getValue('execution_phase') || ''),
          claimOwnerKey: String(claims.getValue('claim_owner_key') || ''),
          ownerExpiresOn: String(claims.getValue('owner_expires_on') || ''),
          resultChangeSet: String(claims.getValue('result_change_set') || ''),
          resultChangeSetRevision: Number(claims.getValue('result_change_set_revision') || 0),
          targetPageSysId: String(claims.getValue('target_page_sys_id') || ''),
          targetNextPageSysId: String(claims.getValue('target_next_page_sys_id') || ''),
          targetRemovalBatchKey: String(claims.getValue('target_removal_batch_key') || ''),
          payloadLength: String(claims.getValue('mutation_payload_json') || '').length,
          resultLength: String(claims.getValue('mutation_result_json') || '').length
        });
      }

      gs.info('DOCSERA_RESULT:' + JSON.stringify(summary));
    })();
    `
  );
}

async function stageSuccessorSelectorScenario(instanceUrl, session, workspaceSysId) {
  return runBackgroundScript(
    instanceUrl,
    session,
    `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (!workspace.get(workspaceSysId)) {
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found.' }));
        return;
      }

      var currentUser = String(gs.getUserID() || '');
      var selectedChangeSet = new GlideRecord('${defaults.workspaceChangeSetTable}');
      selectedChangeSet.initialize();
      selectedChangeSet.workspace = workspaceSysId;
      selectedChangeSet.generation_key = workspaceSysId + ':successor';
      selectedChangeSet.change_set_revision = 4;
      selectedChangeSet.next_pending_sequence = 3;
      selectedChangeSet.lifecycle_state = 'active';
      selectedChangeSet.recovery_state = 'none';
      var selectedChangeSetSysId = String(selectedChangeSet.insert() || '');

      var selectedSnapshot = new GlideRecord('${defaults.workspaceSnapshotSetTable}');
      selectedSnapshot.initialize();
      selectedSnapshot.workspace = workspaceSysId;
      selectedSnapshot.snapshot_key = workspaceSysId + ':selected-ready';
      selectedSnapshot.readiness_state = 'ready';
      selectedSnapshot.source_change_set = selectedChangeSetSysId;
      selectedSnapshot.source_change_set_revision = 4;
      selectedSnapshot.published_on = new GlideDateTime();
      var selectedSnapshotSysId = String(selectedSnapshot.insert() || '');

      function createEnvelope(text) {
        return JSON.stringify({
          schemaVersion: 1,
          document: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: text }] }]
          }
        });
      }

      var pageRows = new GlideRecord('${defaults.pageTable}');
      pageRows.addQuery('workspace', workspaceSysId);
      pageRows.orderBy('sys_created_on');
      pageRows.query();
      var selectedPages = [
        { title: 'Selected Overview', slug: 'selected-overview', bodyText: 'Selected overview body', parentPageSysId: '', siblingOrder: 'a' },
        { title: 'Selected Child', slug: 'selected-child', bodyText: 'Selected child body', parentPageSysId: '', siblingOrder: 'a' },
        { title: 'Selected Second', slug: 'selected-second', bodyText: 'Selected second body', parentPageSysId: '', siblingOrder: 'b' }
      ];
      var index = 0;
      var pageIds = [];
      while (pageRows.next()) {
        var selected = selectedPages[index] || selectedPages[selectedPages.length - 1];
        var pageSysId = String(pageRows.getUniqueValue() || '');
        if (index === 1) {
          selected.parentPageSysId = pageIds[0] || '';
        }
        pageIds.push(pageSysId);
        pageRows.draft_title = selected.title;
        pageRows.draft_slug = selected.slug;
        pageRows.draft_slug_normalized = selected.slug;
        pageRows.draft_content_json = createEnvelope(selected.bodyText);
        pageRows.draft_body_text = selected.bodyText;
        pageRows.published_title = 'Legacy ' + selected.title;
        pageRows.published_slug = 'legacy-' + selected.slug;
        pageRows.published_slug_normalized = 'legacy-' + selected.slug;
        pageRows.published_content_json = createEnvelope('Legacy ' + selected.bodyText);
        pageRows.published_body_text = 'Legacy ' + selected.bodyText;
        pageRows.update();

        var snapshotPage = new GlideRecord('${defaults.workspacePageSnapshotTable}');
        snapshotPage.initialize();
        snapshotPage.snapshot_set = selectedSnapshotSysId;
        snapshotPage.page = pageSysId;
        snapshotPage.snapshot_page_key = selectedSnapshotSysId + ':' + pageSysId;
        snapshotPage.parent_page = selected.parentPageSysId;
        snapshotPage.sibling_order = selected.siblingOrder;
        snapshotPage.title = selected.title;
        snapshotPage.slug = selected.slug;
        snapshotPage.slug_normalized = selected.slug;
        snapshotPage.content_json = createEnvelope(selected.bodyText);
        snapshotPage.body_text = selected.bodyText;
        snapshotPage.active = true;
        snapshotPage.published_on = new GlideDateTime();
        snapshotPage.published_by = currentUser;
        snapshotPage.insert();
        index += 1;
      }

      workspace.pending_change_set = selectedChangeSetSysId;
      workspace.published_snapshot_set = selectedSnapshotSysId;
      workspace.workspace_state_revision = 12;
      workspace.update();

      gs.info('DOCSERA_RESULT:' + JSON.stringify({
        selectedChangeSetSysId: selectedChangeSetSysId,
        selectedSnapshotSysId: selectedSnapshotSysId,
        selectedRevision: 4,
        pageIds: pageIds
      }));
    })();
    `
  );
}

async function stageBodyPostAdvanceRecoveryScenario(instanceUrl, session, workspaceSysId, input) {
  return runBackgroundScript(
    instanceUrl,
    session,
    `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var pageSysId = ${JSON.stringify(input.pageSysId)};
      var generationKey = ${JSON.stringify(input.generationKey)};
      var mutationKey = ${JSON.stringify(input.mutationKey)};
      var mutationPayloadJson = ${JSON.stringify(input.mutationPayloadJson)};
      var resultJson = ${JSON.stringify(input.resultJson)};
      var draftEnvelopeJson = ${JSON.stringify(input.draftEnvelopeJson)};
      var draftBodyText = ${JSON.stringify(input.draftBodyText)};
      var claimOwnerKey = ${JSON.stringify(input.claimOwnerKey)};

      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (!workspace.get(workspaceSysId)) {
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found.' }));
        return;
      }

      var changeSetSysId = String(workspace.getValue('pending_change_set') || '');
      var page = new GlideRecord('${defaults.pageTable}');
      if (!page.get(pageSysId)) {
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Page not found.' }));
        return;
      }
      page.draft_content_json = draftEnvelopeJson;
      page.draft_body_text = draftBodyText;
      page.draft_revision = 1;
      page.update();

      var entry = new GlideRecord('${defaults.workspaceChangeEntryTable}');
      entry.initialize();
      entry.change_set = changeSetSysId;
      entry.page = pageSysId;
      entry.generation_page_key = changeSetSysId + ':' + pageSysId;
      entry.first_pending_sequence = 1;
      entry.first_pending_on = '2026-07-18 00:00:00';
      entry.last_changed_on = '2026-07-18 00:00:00';
      entry.last_changed_by = String(gs.getUserID() || '');
      entry.insert();

      var changeSet = new GlideRecord('${defaults.workspaceChangeSetTable}');
      changeSet.get(changeSetSysId);
      changeSet.change_set_revision = 1;
      changeSet.next_pending_sequence = 2;
      changeSet.update();

      var claim = new GlideRecord('${defaults.workspaceMutationClaimTable}');
      claim.initialize();
      claim.workspace = workspaceSysId;
      claim.change_set = changeSetSysId;
      claim.generation_key = generationKey;
      claim.mutation_key = mutationKey;
      claim.mutation_kind = 'body';
      claim.mutation_state = 'claimed';
      claim.claim_owner_key = claimOwnerKey;
      claim.owner_expires_on = '2026-07-18 00:00:30';
      claim.execution_phase = 'change_set_advancing';
      claim.mutation_payload_json = mutationPayloadJson;
      claim.mutation_result_json = resultJson;
      claim.target_page_sys_id = pageSysId;
      claim.claimed_on = '2026-07-18 00:00:00';
      claim.applied_on = '2026-07-18 00:00:00';
      claim.insert();

      gs.info('DOCSERA_RESULT:' + JSON.stringify({
        changeSetSysId: changeSetSysId,
        pageSysId: pageSysId
      }));
    })();
    `
  );
}

async function stageExpiredBodyClaimScenario(instanceUrl, session, workspaceSysId, input) {
  return runBackgroundScript(
    instanceUrl,
    session,
    `
    (function () {
      var workspaceSysId = ${JSON.stringify(workspaceSysId)};
      var pageSysId = ${JSON.stringify(input.pageSysId)};
      var generationKey = ${JSON.stringify(input.generationKey)};
      var mutationKey = ${JSON.stringify(input.mutationKey)};
      var mutationPayloadJson = ${JSON.stringify(input.mutationPayloadJson)};

      var workspace = new GlideRecord('${defaults.workspaceTable}');
      if (!workspace.get(workspaceSysId)) {
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ error: 'Workspace not found.' }));
        return;
      }

      var changeSetSysId = String(workspace.getValue('pending_change_set') || '');
      var claim = new GlideRecord('${defaults.workspaceMutationClaimTable}');
      claim.initialize();
      claim.workspace = workspaceSysId;
      claim.change_set = changeSetSysId;
      claim.generation_key = generationKey;
      claim.mutation_key = mutationKey;
      claim.mutation_kind = 'body';
      claim.mutation_state = 'claimed';
      claim.claim_owner_key = 'expired-owner';
      claim.owner_expires_on = '2020-01-01 00:00:00';
      claim.execution_phase = 'claimed';
      claim.mutation_payload_json = mutationPayloadJson;
      claim.target_page_sys_id = pageSysId;
      claim.claimed_on = '2020-01-01 00:00:00';
      claim.insert();

      gs.info('DOCSERA_RESULT:' + JSON.stringify({
        changeSetSysId: changeSetSysId,
        pageSysId: pageSysId
      }));
    })();
    `
  );
}

function summarizeMutationResponse(result) {
  const payload = runtimeResult(result);
  const error = runtimeError(result);
  return {
    status: result.status,
    state: cleanText(payload?.state),
    code: cleanText(error?.code ?? payload?.code),
    changeSetId: cleanText(payload?.changeSetId),
    changeSetRevision: safeInteger(payload?.changeSetRevision),
    currentChangeSetId: cleanText(error?.currentChangeSetId ?? payload?.currentChangeSetId),
    currentChangeSetRevision: safeInteger(error?.currentChangeSetRevision ?? payload?.currentChangeSetRevision),
    pageSysId: cleanText(payload?.page?.sysId),
    pageDraftRevision: safeInteger(payload?.page?.draftRevision),
    nextPageSysId: cleanText(payload?.nextPageSysId),
    errorMessage: cleanText(error?.message ?? payload?.errorMessage)
  };
}

function responseSucceeded(summary) {
  return summary.status >= 200 && summary.status < 300 && !summary.code;
}

function responseIsSafeInProgress(summary, currentChangeSetId, currentChangeSetRevision) {
  return (
    summary.status === 409 &&
    summary.code === "invalid" &&
    summary.currentChangeSetId === currentChangeSetId &&
    summary.currentChangeSetRevision === currentChangeSetRevision &&
    /already in progress/i.test(summary.errorMessage)
  );
}

function responseIsStaleGeneration(summary, currentChangeSetId, currentChangeSetRevision) {
  return (
    summary.status === 409 &&
    summary.code === "stale_generation" &&
    summary.currentChangeSetId === currentChangeSetId &&
    summary.currentChangeSetRevision === currentChangeSetRevision
  );
}

function latestClaim(state, generationKey) {
  return [...(state?.mutationClaims ?? [])].reverse().find((claim) => claim.generationKey === generationKey) ?? null;
}

async function cleanupWorkspaceVerification(instanceUrl, session, cleanup) {
  if (!cleanup.workspaceSysId) {
    return;
  }

  await runBackgroundScript(
    instanceUrl,
    session,
    `
    (function () {
      function deleteByQuery(table, field, value) {
        if (!value) return;
        var rows = new GlideRecord(table);
        rows.addQuery(field, value);
        rows.query();
        while (rows.next()) {
          rows.deleteRecord();
        }
      }

      var workspaceSysId = ${JSON.stringify(cleanup.workspaceSysId)};
      var requestSysId = ${JSON.stringify(cleanup.requestSysId)};
      var adminGroupSysId = ${JSON.stringify(cleanup.adminGroupSysId)};
      var editorGroupSysId = ${JSON.stringify(cleanup.editorGroupSysId)};

      deleteByQuery('${defaults.workspaceMutationClaimTable}', 'workspace', workspaceSysId);
      deleteByQuery('${defaults.workspaceRemovalMemberTable}', 'sys_id', '');

      var batches = new GlideRecord('${defaults.workspaceRemovalBatchTable}');
      batches.addQuery('change_set.workspace', workspaceSysId);
      batches.query();
      while (batches.next()) {
        var batchSysId = String(batches.getUniqueValue() || '');
        deleteByQuery('${defaults.workspaceRemovalMemberTable}', 'removal_batch', batchSysId);
        batches.deleteRecord();
      }

      deleteByQuery('${defaults.workspaceChangeEntryTable}', 'change_set.workspace', workspaceSysId);
      deleteByQuery('${defaults.workspacePageSnapshotTable}', 'snapshot_set.workspace', workspaceSysId);
      deleteByQuery('${defaults.pageTable}', 'workspace', workspaceSysId);
      deleteByQuery('${defaults.workspaceSnapshotSetTable}', 'workspace', workspaceSysId);
      deleteByQuery('${defaults.workspaceChangeSetTable}', 'workspace', workspaceSysId);

      if (requestSysId) {
        var request = new GlideRecord('${defaults.requestTable}');
        if (request.get(requestSysId)) {
          request.deleteRecord();
        }
      }

      if (workspaceSysId) {
        var workspace = new GlideRecord('${defaults.workspaceTable}');
        if (workspace.get(workspaceSysId)) {
          workspace.deleteRecord();
        }
      }

      deleteByQuery('sys_user_grmember', 'group', adminGroupSysId);
      deleteByQuery('sys_user_grmember', 'group', editorGroupSysId);

      if (adminGroupSysId) {
        var adminGroup = new GlideRecord('sys_user_group');
        if (adminGroup.get(adminGroupSysId)) {
          adminGroup.deleteRecord();
        }
      }

      if (editorGroupSysId) {
        var editorGroup = new GlideRecord('sys_user_group');
        if (editorGroup.get(editorGroupSysId)) {
          editorGroup.deleteRecord();
        }
      }

      gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
    })();
    `
  ).catch(() => undefined);
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
    console.log("Usage: node ./scripts/verify-e3-t9-mutation-conversion.mjs [--auth-alias <alias>] [--instance-url <url>] [--keep-data]");
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

  console.log("Docsera E3-T9 mutation conversion verification");
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
    editorGroupSysId: ""
  };
  const extraCleanups = [];

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
  addCheck(
    checks,
    Boolean(cleanText(pingPayload?.userSysId ?? pingPayload?.user_sys_id)),
    "authenticated verification session resolved the current user",
    pingPayload
  );

  try {
    const workspaceName = `E3-T9 Mutation Verification ${Date.now()}`;
    const workspaceResult = await createWorkspace(instanceUrl, ownerSession, workspaceName);
    cleanup.requestSysId = cleanText(workspaceResult?.provisioning?.requestId);
    cleanup.workspaceSysId = cleanText(workspaceResult?.workspace?.sysId);
    cleanup.workspaceSlug = cleanText(workspaceResult?.workspace?.slug);
    cleanup.adminGroupSysId = cleanText(workspaceResult?.groups?.admin?.sysId);
    cleanup.editorGroupSysId = cleanText(workspaceResult?.groups?.editor?.sysId);

    addCheck(checks, Boolean(cleanup.workspaceSysId && cleanup.workspaceSlug), "verification workspace was provisioned", cleanup);

    const seed = await seedWorkspaceMutationState(instanceUrl, ownerSession, cleanup.workspaceSysId);
    addCheck(
      checks,
      Boolean(cleanText(seed.activeChangeSetSysId) && cleanText(seed.snapshotSetSysId) && cleanText(seed.rootPageSysId)),
      "workspace foundation seed created a ready snapshot and published page tree",
      seed
    );

    const leaseAcquire = await callRuntime(instanceUrl, ownerSession, `${defaults.workspaceEditLeasePath}/acquire`, {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId
    });
    const lease = runtimeResult(leaseAcquire);
    const leaseToken = cleanText(lease?.leaseToken);
    const activeChangeSetId = cleanText(lease?.changeSetId);
    const initialRevision = safeInteger(lease?.changeSetRevision);
    addCheck(
      checks,
      leaseAcquire.status === 200 && cleanText(lease?.state) === "held" && Boolean(leaseToken) && Boolean(activeChangeSetId) && initialRevision === 0,
      "workspace edit lease acquisition returned the seeded generation pair",
      leaseAcquire.payload
    );

    const identicalBodyAuthority = {
      expectedChangeSetId: activeChangeSetId,
      expectedChangeSetRevision: initialRevision
    };
    const identicalEnvelope = createLargeDraftEnvelope("E3-T9 identical body");
    const identicalBodyPayload = {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: leaseToken,
      pageSysId: cleanText(seed.rootPageSysId),
      expectedRevision: 0,
      draftContentJson: identicalEnvelope,
      ...identicalBodyAuthority
    };

    const [identicalBodyFirst, identicalBodySecond] = await Promise.all([
      callRuntime(instanceUrl, ownerSession, defaults.pagesPath, identicalBodyPayload, "PATCH"),
      callRuntime(instanceUrl, ownerSession, defaults.pagesPath, identicalBodyPayload, "PATCH")
    ]);
    const identicalBodySummaries = [summarizeMutationResponse(identicalBodyFirst), summarizeMutationResponse(identicalBodySecond)];
    const identicalBodySuccesses = identicalBodySummaries.filter(responseSucceeded);
    const identicalBodyInProgresses = identicalBodySummaries.filter((summary) =>
      responseIsSafeInProgress(summary, activeChangeSetId, initialRevision)
    );
    const identicalBodyReplay = summarizeMutationResponse(
      await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, identicalBodyPayload, "PATCH")
    );
    const stateAfterIdenticalBody = await inspectWorkspaceMutationState(instanceUrl, ownerSession, cleanup.workspaceSysId);
    const claimRev0 = latestClaim(stateAfterIdenticalBody, `${activeChangeSetId}:0`);
    const rootAfterBody = stateAfterIdenticalBody.pages.find((page) => page.sysId === cleanText(seed.rootPageSysId)) ?? null;

    addCheck(
      checks,
      (identicalBodySuccesses.length === 2 && identicalBodySummaries.length === 2) ||
        (identicalBodySuccesses.length === 1 && identicalBodyInProgresses.length === 1),
      "simultaneous identical same-pair body requests returned one winner plus a bounded replay or in-progress result",
      identicalBodySummaries
    );
    addCheck(
      checks,
      stateAfterIdenticalBody.activeChangeSet?.changeSetRevision === 1 &&
        rootAfterBody?.draftRevision === 1 &&
        stateAfterIdenticalBody.changeEntries.length === 1 &&
        stateAfterIdenticalBody.changeEntries[0]?.pageSysId === cleanText(seed.rootPageSysId) &&
        stateAfterIdenticalBody.changeEntries[0]?.firstPendingSequence === 1 &&
        stateAfterIdenticalBody.activeChangeSet?.nextPendingSequence === 2,
      "simultaneous identical body requests produced one executor and one durable pending-entry outcome",
      {
        activeChangeSet: stateAfterIdenticalBody.activeChangeSet,
        changeEntries: stateAfterIdenticalBody.changeEntries,
        page: rootAfterBody
      }
    );
    addCheck(
      checks,
      identicalBodyReplay.status === 200 &&
        identicalBodyReplay.changeSetId === activeChangeSetId &&
        identicalBodyReplay.changeSetRevision === 1 &&
        rootAfterBody?.draftRevision === 1,
      "finalized identical retry replays one stored outcome without a second durable increment",
      identicalBodyReplay
    );
    addCheck(
      checks,
      claimRev0?.mutationKind === "body" &&
        claimRev0?.mutationState === "finalized" &&
        claimRev0?.executionPhase === "finalized" &&
        claimRev0?.mutationKey.length === 64 &&
        claimRev0?.payloadLength > 5000 &&
        claimRev0?.resultChangeSet === activeChangeSetId &&
        claimRev0?.resultChangeSetRevision === 1,
      "large body mutations persist a bounded fingerprint and a finalized replay result",
      claimRev0
    );

    const differentAuthority = {
      expectedChangeSetId: activeChangeSetId,
      expectedChangeSetRevision: 1
    };
    const differentBodyPayload = {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: leaseToken,
      pageSysId: cleanText(seed.rootPageSysId),
      expectedRevision: 1,
      draftContentJson: createDraftEnvelope("E3-T9 different body winner candidate"),
      ...differentAuthority
    };
    const createPayload = {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceLeaseToken: leaseToken,
      title: "Concurrent Create Candidate",
      ...differentAuthority
    };

    const [differentBodyResponse, createResponse] = await Promise.all([
      callRuntime(instanceUrl, ownerSession, defaults.pagesPath, differentBodyPayload, "PATCH"),
      callRuntime(instanceUrl, ownerSession, defaults.pagesPath, createPayload, "POST")
    ]);
    const differentSummaries = [summarizeMutationResponse(differentBodyResponse), summarizeMutationResponse(createResponse)];
    const differentSuccesses = differentSummaries.filter(responseSucceeded);
    const differentStaleFailures = differentSummaries.filter((summary) => responseIsStaleGeneration(summary, activeChangeSetId, 1));
    const stateAfterDifferent = await inspectWorkspaceMutationState(instanceUrl, ownerSession, cleanup.workspaceSysId);
    const claimRev1 = latestClaim(stateAfterDifferent, `${activeChangeSetId}:1`);
    const rootAfterDifferent = stateAfterDifferent.pages.find((page) => page.sysId === cleanText(seed.rootPageSysId)) ?? null;
    const draftOnlyPagesAfterDifferent = stateAfterDifferent.pages.filter((page) => cleanText(page.publicationState) === "draft");

    addCheck(
      checks,
      differentSuccesses.length === 1 &&
        differentStaleFailures.length === 1 &&
        stateAfterDifferent.activeChangeSet?.changeSetRevision === 2,
      "simultaneous different mutation types using one pair produce exactly one winner",
      {
        responses: differentSummaries,
        activeChangeSet: stateAfterDifferent.activeChangeSet
      }
    );
    addCheck(
      checks,
      (rootAfterDifferent?.draftRevision === 2 && draftOnlyPagesAfterDifferent.length === 0) ||
        (rootAfterDifferent?.draftRevision === 1 && draftOnlyPagesAfterDifferent.length === 1),
      "different same-pair mutation contention leaves either one body update or one created page, but not both",
      {
        page: rootAfterDifferent,
        draftOnlyPages: draftOnlyPagesAfterDifferent
      }
    );
    addCheck(
      checks,
      claimRev1?.mutationState === "finalized" &&
        claimRev1?.executionPhase === "finalized" &&
        claimRev1?.resultChangeSetRevision === 2,
      "the winning same-pair different-mutation claim finalized one authoritative next pair",
      claimRev1
    );

    const deleteAuthority = {
      expectedChangeSetId: activeChangeSetId,
      expectedChangeSetRevision: 2
    };
    const deletePayload = {
      workspaceSlug: cleanup.workspaceSlug,
      workspaceSysId: cleanup.workspaceSysId,
      workspaceLeaseToken: leaseToken,
      pageSysId: cleanText(seed.rootPageSysId),
      ...deleteAuthority
    };

    const [deleteFirst, deleteSecond] = await Promise.all([
      callRuntime(instanceUrl, ownerSession, defaults.pageDeleteActionPath, deletePayload, "POST"),
      callRuntime(instanceUrl, ownerSession, defaults.pageDeleteActionPath, deletePayload, "POST")
    ]);
    const deleteSummaries = [summarizeMutationResponse(deleteFirst), summarizeMutationResponse(deleteSecond)];
    const deleteSuccesses = deleteSummaries.filter(responseSucceeded);
    const deleteInProgresses = deleteSummaries.filter((summary) => responseIsSafeInProgress(summary, activeChangeSetId, 2));
    const stateAfterDelete = await inspectWorkspaceMutationState(instanceUrl, ownerSession, cleanup.workspaceSysId);
    const claimRev2 = latestClaim(stateAfterDelete, `${activeChangeSetId}:2`);
    const activeBatches = stateAfterDelete.removalBatches.filter((batch) => batch.lifecycleState === "active");
    const activeMembers = activeBatches.flatMap((batch) => batch.members);
    const uniqueBatchKeys = new Set(activeBatches.map((batch) => batch.batchKey));
    const uniqueMemberKeys = new Set(activeMembers.map((member) => member.batchPageKey));

    addCheck(
      checks,
      ((deleteSuccesses.length === 2 && deleteSummaries.length === 2) ||
        (deleteSuccesses.length === 1 && deleteInProgresses.length === 1)) &&
        stateAfterDelete.activeChangeSet?.changeSetRevision === 3,
      "simultaneous identical delete requests produced one durable removal outcome",
      {
        responses: deleteSummaries,
        activeChangeSet: stateAfterDelete.activeChangeSet
      }
    );
    addCheck(
      checks,
      activeBatches.length === 1 &&
        activeMembers.length === 2 &&
        uniqueBatchKeys.size === 1 &&
        uniqueMemberKeys.size === 2 &&
        activeMembers.some((member) => member.pageSysId === cleanText(seed.rootPageSysId)) &&
        activeMembers.some((member) => member.pageSysId === cleanText(seed.childPageSysId)),
      "removal retries did not create duplicate batches or duplicate members",
      activeBatches
    );
    addCheck(
      checks,
      claimRev2?.mutationKind === "delete" &&
        claimRev2?.mutationState === "finalized" &&
        claimRev2?.executionPhase === "finalized" &&
        cleanText(claimRev2?.targetRemovalBatchKey) === cleanText(activeBatches[0]?.batchKey),
      "the finalized delete claim persisted the stable removal batch identity",
      claimRev2
    );

    const selectorScenario = await provisionSeededWorkspace(
      instanceUrl,
      ownerSession,
      `E3-T9 Successor Selector Verification ${Date.now()}`
    );
    extraCleanups.push(selectorScenario.cleanup);
    const selectorSeed = await stageSuccessorSelectorScenario(instanceUrl, ownerSession, selectorScenario.cleanup.workspaceSysId);
    const selectorLiveBefore = await listRuntimePages(instanceUrl, ownerSession, selectorScenario.cleanup.workspaceSlug, "live");
    const selectorLiveBeforePayload = runtimeResult(selectorLiveBefore);
    const selectorStateBefore = await inspectWorkspaceMutationState(instanceUrl, ownerSession, selectorScenario.cleanup.workspaceSysId);
    const selectorLiveTitlesBefore = (selectorLiveBeforePayload?.items ?? []).map((page) => cleanText(page.draftTitle));

    addCheck(
      checks,
      selectorStateBefore.workspace?.pendingChangeSet === cleanText(selectorSeed.selectedChangeSetSysId) &&
        selectorStateBefore.workspace?.publishedSnapshotSet === cleanText(selectorSeed.selectedSnapshotSysId) &&
        selectorStateBefore.activeChangeSet?.changeSetRevision === 4,
      "valid successor selectors survive ordinary runtime projection authority selection",
      selectorStateBefore.workspace
    );
    addCheck(
      checks,
      selectorLiveBefore.status === 200 &&
        ["Selected Child", "Selected Overview", "Selected Second"].every((title) => selectorLiveTitlesBefore.includes(title)) &&
        selectorStateBefore.workspace?.pendingChangeSet === cleanText(selectorSeed.selectedChangeSetSysId) &&
        selectorStateBefore.workspace?.publishedSnapshotSet === cleanText(selectorSeed.selectedSnapshotSysId),
      "Live projection uses the selected ready successor snapshot instead of deterministic seed rows",
      {
        items: selectorLiveBeforePayload?.items,
        workspace: selectorStateBefore.workspace
      }
    );

    await runBackgroundScript(
      instanceUrl,
      ownerSession,
      `
      (function () {
        var page = new GlideRecord('${defaults.pageTable}');
        if (page.get(${JSON.stringify(selectorSeed.pageIds?.[0] ?? "")})) {
          page.published_title = 'Published selector rewrite attempt';
          page.published_slug = 'published-selector-rewrite-attempt';
          page.published_slug_normalized = 'published-selector-rewrite-attempt';
          page.published_content_json = JSON.stringify({
            schemaVersion: 1,
            document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Published selector rewrite attempt body' }] }] }
          });
          page.published_body_text = 'Published selector rewrite attempt body';
          page.update();
        }
        gs.info('DOCSERA_RESULT:' + JSON.stringify({ ok: true }));
      })();
      `
    );

    const selectorLiveAfterPublishedRewrite = await listRuntimePages(instanceUrl, ownerSession, selectorScenario.cleanup.workspaceSlug, "live");
    const selectorLiveAfterPayload = runtimeResult(selectorLiveAfterPublishedRewrite);
    const selectorMutationPayload = {
      workspaceSlug: selectorScenario.cleanup.workspaceSlug,
      workspaceSysId: selectorScenario.cleanup.workspaceSysId,
      workspaceLeaseToken: cleanText(selectorScenario.lease?.leaseToken),
      pageSysId: cleanText(selectorSeed.pageIds?.[2] ?? ""),
      expectedRevision: 0,
      draftContentJson: createDraftEnvelope("Selected successor mutation body"),
      expectedChangeSetId: cleanText(selectorSeed.selectedChangeSetSysId),
      expectedChangeSetRevision: 4
    };
    const selectorBodyResponse = summarizeMutationResponse(
      await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, selectorMutationPayload, "PATCH")
    );
    const selectorStateAfter = await inspectWorkspaceMutationState(instanceUrl, ownerSession, selectorScenario.cleanup.workspaceSysId);
    const selectorLiveTitlesAfter = (selectorLiveAfterPayload?.items ?? []).map((page) => cleanText(page.draftTitle));
    const selectorSnapshotTitles = selectorStateAfter.selectedSnapshotPages.map((page) => cleanText(page.title));

    addCheck(
      checks,
      selectorLiveAfterPublishedRewrite.status === 200 &&
        ["Selected Child", "Selected Overview", "Selected Second"].every((title) => selectorLiveTitlesAfter.includes(title)) &&
        ["Selected Child", "Selected Overview", "Selected Second"].every((title) => selectorSnapshotTitles.includes(title)),
      "a ready selected snapshot is not rewritten from page published_* fields",
      {
        items: selectorLiveAfterPayload?.items,
        snapshotPages: selectorStateAfter.selectedSnapshotPages
      }
    );
    addCheck(
      checks,
      selectorBodyResponse.status === 200 &&
        selectorStateAfter.workspace?.pendingChangeSet === cleanText(selectorSeed.selectedChangeSetSysId) &&
        selectorStateAfter.workspace?.publishedSnapshotSet === cleanText(selectorSeed.selectedSnapshotSysId) &&
        selectorStateAfter.activeChangeSet?.changeSetRevision === 5,
      "valid successor selectors remain selected through ordinary mutation projection",
      {
        mutation: selectorBodyResponse,
        workspace: selectorStateAfter.workspace,
        activeChangeSet: selectorStateAfter.activeChangeSet
      }
    );

    const recoveryScenario = await provisionSeededWorkspace(
      instanceUrl,
      ownerSession,
      `E3-T9 Post-Advance Recovery Verification ${Date.now()}`
    );
    extraCleanups.push(recoveryScenario.cleanup);
    const recoveryEnvelope = createDraftEnvelope("Post-advance recovery body");
    const recoveryCanonicalDocument = stableSerialize(recoveryEnvelope);
    const recoveryGenerationKey = `${cleanText(recoveryScenario.lease?.changeSetId)}:0`;
    const recoveryPayload = {
      kind: "body",
      pageSysId: cleanText(recoveryScenario.seed.rootPageSysId),
      draftContentJson: recoveryCanonicalDocument,
      expectedRevision: 0
    };
    const recoveryResultJson = stableSerialize({
      page: {
        sysId: cleanText(recoveryScenario.seed.rootPageSysId),
        draftRevision: 1
      }
    });
    await stageBodyPostAdvanceRecoveryScenario(instanceUrl, ownerSession, recoveryScenario.cleanup.workspaceSysId, {
      claimOwnerKey: "post-advance-owner",
      draftBodyText: "Post-advance recovery body",
      draftEnvelopeJson: JSON.stringify(recoveryEnvelope),
      generationKey: recoveryGenerationKey,
      mutationKey: digest(`body\n${recoveryGenerationKey}\n${stableSerialize(recoveryPayload)}`),
      mutationPayloadJson: stableSerialize(recoveryPayload),
      pageSysId: cleanText(recoveryScenario.seed.rootPageSysId),
      resultJson: recoveryResultJson
    });

    const recoveryResponse = summarizeMutationResponse(
      await callRuntime(instanceUrl, ownerSession, defaults.pagesPath, {
        workspaceSlug: recoveryScenario.cleanup.workspaceSlug,
        workspaceSysId: recoveryScenario.cleanup.workspaceSysId,
        workspaceLeaseToken: cleanText(recoveryScenario.lease?.leaseToken),
        pageSysId: cleanText(recoveryScenario.seed.rootPageSysId),
        expectedRevision: 0,
        draftContentJson: recoveryEnvelope,
        expectedChangeSetId: cleanText(recoveryScenario.lease?.changeSetId),
        expectedChangeSetRevision: 0
      }, "PATCH")
    );
    const recoveryState = await inspectWorkspaceMutationState(instanceUrl, ownerSession, recoveryScenario.cleanup.workspaceSysId);
    const recoveryClaim = latestClaim(recoveryState, recoveryGenerationKey);

    addCheck(
      checks,
      recoveryResponse.status === 200 &&
        recoveryResponse.changeSetRevision === 1 &&
        recoveryState.activeChangeSet?.changeSetRevision === 1 &&
        recoveryClaim?.executionPhase === "finalized" &&
        recoveryClaim?.resultChangeSetRevision === 1,
      "crash recovery immediately after revision advancement finalizes one replayable outcome",
      {
        response: recoveryResponse,
        claim: recoveryClaim,
        activeChangeSet: recoveryState.activeChangeSet
      }
    );

    const takeoverScenario = await provisionSeededWorkspace(
      instanceUrl,
      ownerSession,
      `E3-T9 Expired Claim Takeover Verification ${Date.now()}`
    );
    extraCleanups.push(takeoverScenario.cleanup);
    const takeoverEnvelope = createDraftEnvelope("Expired takeover recovery body");
    const takeoverCanonicalDocument = stableSerialize(takeoverEnvelope);
    const takeoverGenerationKey = `${cleanText(takeoverScenario.lease?.changeSetId)}:0`;
    const takeoverPayload = {
      kind: "body",
      pageSysId: cleanText(takeoverScenario.seed.rootPageSysId),
      draftContentJson: takeoverCanonicalDocument,
      expectedRevision: 0
    };
    const takeoverMutationKey = digest(`body\n${takeoverGenerationKey}\n${stableSerialize(takeoverPayload)}`);
    await stageExpiredBodyClaimScenario(instanceUrl, ownerSession, takeoverScenario.cleanup.workspaceSysId, {
      generationKey: takeoverGenerationKey,
      mutationKey: takeoverMutationKey,
      mutationPayloadJson: stableSerialize(takeoverPayload),
      pageSysId: cleanText(takeoverScenario.seed.rootPageSysId)
    });

    const takeoverRequestBody = {
      workspaceSlug: takeoverScenario.cleanup.workspaceSlug,
      workspaceSysId: takeoverScenario.cleanup.workspaceSysId,
      workspaceLeaseToken: cleanText(takeoverScenario.lease?.leaseToken),
      pageSysId: cleanText(takeoverScenario.seed.rootPageSysId),
      expectedRevision: 0,
      draftContentJson: takeoverEnvelope,
      expectedChangeSetId: cleanText(takeoverScenario.lease?.changeSetId),
      expectedChangeSetRevision: 0
    };
    const [takeoverFirst, takeoverSecond] = await Promise.all([
      callRuntime(instanceUrl, ownerSession, defaults.pagesPath, takeoverRequestBody, "PATCH"),
      callRuntime(instanceUrl, ownerSession, defaults.pagesPath, takeoverRequestBody, "PATCH")
    ]);
    const takeoverSummaries = [summarizeMutationResponse(takeoverFirst), summarizeMutationResponse(takeoverSecond)];
    const takeoverState = await inspectWorkspaceMutationState(instanceUrl, ownerSession, takeoverScenario.cleanup.workspaceSysId);
    const takeoverClaim = latestClaim(takeoverState, takeoverGenerationKey);
    const takeoverSuccesses = takeoverSummaries.filter(responseSucceeded);
    const takeoverSafeResponses = takeoverSummaries.filter((summary) =>
      responseSucceeded(summary) ||
      responseIsSafeInProgress(summary, cleanText(takeoverScenario.lease?.changeSetId), 0)
    );

    addCheck(
      checks,
      takeoverSuccesses.length >= 1 &&
        takeoverSafeResponses.length === 2 &&
        takeoverState.activeChangeSet?.changeSetRevision === 1 &&
        takeoverState.changeEntries.length === 1 &&
        takeoverClaim?.executionPhase === "finalized" &&
        takeoverClaim?.claimOwnerKey !== "expired-owner",
      "simultaneous abandoned-claim recovery produces one executor and one finalized replayable result",
      {
        responses: takeoverSummaries,
        activeChangeSet: takeoverState.activeChangeSet,
        claim: takeoverClaim,
        changeEntries: takeoverState.changeEntries
      }
    );

    console.log("Scenario details");
    console.log(safeDetail({
      identicalBody: {
        responses: identicalBodySummaries,
        replay: identicalBodyReplay,
        activeChangeSet: stateAfterIdenticalBody.activeChangeSet,
        changeEntries: stateAfterIdenticalBody.changeEntries,
        claim: claimRev0
      },
      differentSamePair: {
        responses: differentSummaries,
        activeChangeSet: stateAfterDifferent.activeChangeSet,
        draftOnlyPageCount: draftOnlyPagesAfterDifferent.length,
        claim: claimRev1
      },
      identicalDelete: {
        responses: deleteSummaries,
        activeChangeSet: stateAfterDelete.activeChangeSet,
        removalBatches: activeBatches,
        claim: claimRev2
      },
      successorSelectors: {
        selectorSeed,
        liveTitles: (selectorLiveAfterPayload?.items ?? []).map((page) => cleanText(page.draftTitle)),
        workspace: selectorStateAfter.workspace,
        snapshotPages: selectorStateAfter.selectedSnapshotPages
      },
      postAdvanceRecovery: {
        response: recoveryResponse,
        claim: recoveryClaim,
        activeChangeSet: recoveryState.activeChangeSet
      },
      expiredTakeover: {
        responses: takeoverSummaries,
        claim: takeoverClaim,
        activeChangeSet: takeoverState.activeChangeSet,
        changeEntries: takeoverState.changeEntries
      }
    }));
  } finally {
    if (!keepData) {
      for (const extraCleanup of extraCleanups) {
        await cleanupWorkspaceVerification(instanceUrl, ownerSession, extraCleanup);
      }
      await cleanupWorkspaceVerification(instanceUrl, ownerSession, cleanup);
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
  throw new Error(safeErrorMessage(error, "E3-T9 mutation verification failed"));
});
