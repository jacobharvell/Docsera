#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { parseArgs } from "node:util";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow",
  pingPath: "/api/x_82900_docsera/docsera_runtime/ping",
  workspacePath: "/api/x_82900_docsera/docsera_runtime/workspaces",
  workspaceName: "Verification Workspace",
  workspaceDescription: "Temporary workspace for Docsera platform verification"
};

const workspaceRoleNames = Object.freeze({
  docseraAdmin: "x_82900_docsera.admin",
  workspaceAdmin: "x_82900_docsera.workspace_admin",
  editor: "x_82900_docsera.editor"
});

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

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePayload(payload) {
  let normalizedPayload = payload;
  while (normalizedPayload && typeof normalizedPayload === "object" && "result" in normalizedPayload) {
    normalizedPayload = normalizedPayload.result;
  }

  return normalizedPayload;
}

function parseKeyringRecord(rawValue, authAlias) {
  if (!rawValue) {
    return {
      error: `No stored SDK credentials were found for alias "${authAlias}".`
    };
  }

  try {
    const parsed = JSON.parse(rawValue);
    const storedCredential = parsed?.[authAlias];
    if (!storedCredential) {
      return {
        error: `Stored SDK credentials do not include alias "${authAlias}".`
      };
    }

    return { credential: storedCredential };
  } catch {
    return {
      error: "The local SDK credential store could not be parsed."
    };
  }
}

async function establishBasicSession(instanceUrl, creds) {
  const cookieStore = new Map();
  let loginSessionToken = "";
  const loginUrl = new URL("angular.do?sysparm_type=view_form.login", instanceUrl);
  const loginResponse = await fetch(loginUrl, {
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

  const refreshUrl = new URL("angular.do?sysparm_type=get_user", instanceUrl);
  const refreshResponse = await fetch(refreshUrl, {
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

function encodeQuery(query) {
  return cleanText(query) || "sys_idISNOTEMPTY";
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

async function tableQuery(instanceUrl, session, table, { query, fields, limit = 100 } = {}) {
  const params = new URLSearchParams({
    sysparm_query: encodeQuery(query),
    sysparm_limit: String(limit),
    sysparm_exclude_reference_link: "true"
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

async function tableDelete(instanceUrl, session, table, sysId) {
  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}`, {
    method: "DELETE"
  });

  return result.status === 204 || result.status === 200;
}

function slugifyWorkspaceName(name) {
  return cleanText(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

function toWorkspaceTitleFragment(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("_");
}

function buildExpectedGroupNames(name, slug) {
  const baseKey = toWorkspaceTitleFragment(name) || "Workspace";
  const suffix = cleanText(slug).match(/-(\d+)$/)?.[1];
  const workspaceKey = suffix ? `${baseKey}_${suffix}` : baseKey;
  return {
    admin: `Docsera_${workspaceKey}_Admins`,
    editor: `Docsera_${workspaceKey}_Editors`
  };
}

function nextExpectedSlug(name, firstSlug) {
  const baseSlug = slugifyWorkspaceName(name);
  if (firstSlug === baseSlug) {
    return `${baseSlug}-2`;
  }

  const match = cleanText(firstSlug).match(new RegExp(`^${baseSlug.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:-(\\d+))$`));
  if (!match) {
    return "";
  }

  return `${baseSlug}-${Number(match[1]) + 1}`;
}

function normalizeWorkspaceFromRoute(result) {
  const normalized = normalizePayload(result);
  if (!normalized || typeof normalized !== "object") {
    throw new Error("Workspace route did not return the expected result payload.");
  }

  return {
    workspace: normalized.workspace,
    groups: normalized.groups,
    roleNames: normalized.roleNames
  };
}

function printCheck(check) {
  const prefix = check.ok ? "[pass]" : "[fail]";
  console.log(`${prefix} ${check.label}`);
  if (!check.ok && check.detail) {
    console.log(`       ${check.detail}`);
  }
}

function addCheck(checks, ok, label, detail) {
  checks.push({ ok: Boolean(ok), label, detail });
}

function requireValue(value, label) {
  if (!value) {
    throw new Error(label);
  }
  return value;
}

function createWorkspacePayload() {
  return {
    name: defaults.workspaceName,
    shortDescription: defaults.workspaceDescription,
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    layout: {
      tocVisibleByDefault: true,
      pageWidth: "readable"
    }
  };
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
    console.log("Usage: node ./scripts/verify-workspace-foundation.mjs [--auth-alias <alias>] [--instance-url <url>] [--keep-data]");
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

  const checks = [];
  const createdWorkspaceSysIds = [];
  const createdGroupSysIds = [];
  const cleanupFailures = [];

  console.log("Docsera workspace foundation verification");
  console.log("");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  console.log(`Cleanup mode: ${keepData ? "keep verification data" : "delete verification data"}`);
  console.log("");

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

  const session = await establishBasicSession(instanceUrl, storedCredential.creds);
  const pingResult = await fetchJson(instanceUrl, session, defaults.pingPath);
  if (!pingResult.ok || !pingResult.payload) {
    throw new Error(`Runtime ping failed with HTTP ${pingResult.status}: ${pingResult.text}`);
  }

  const pingPayload = normalizePayload(pingResult.payload);
  const currentUserSysId = requireValue(cleanText(pingPayload?.userSysId ?? pingPayload?.user_sys_id), "Current user sys_id could not be resolved from the ping route.");
  const currentUserName = cleanText(pingPayload?.userName ?? pingPayload?.user_name);

  addCheck(checks, pingResult.status === 200, "runtime ping is healthy before workspace verification");

  const tableDefinition = await tableQuery(instanceUrl, session, "sys_db_object", {
    query: "name=x_82900_docsera_workspace",
    fields: "sys_id,name,label,super_class"
  });
  addCheck(checks, tableDefinition.length === 1, "workspace table metadata is installed", tableDefinition.length === 1 ? "" : JSON.stringify(tableDefinition));

  const nativeTableAccess = await tableQuery(instanceUrl, session, "sys_db_object", {
    query: "nameINsys_user_group,sys_group_has_role,sys_user_grmember",
    fields: "name,access,read_access,create_access,update_access,delete_access,sys_scope"
  });
  console.log("Native table access diagnostics");
  for (const record of nativeTableAccess) {
    console.log(
      JSON.stringify(
        {
          name: cleanText(record.name),
          access: cleanText(record.access),
          readAccess: cleanText(record.read_access),
          createAccess: cleanText(record.create_access),
          updateAccess: cleanText(record.update_access),
          deleteAccess: cleanText(record.delete_access),
          scope: cleanText(record.sys_scope)
        },
        null,
        2
      )
    );
  }

  const slugDictionary = await tableQuery(instanceUrl, session, "sys_dictionary", {
    query: "name=x_82900_docsera_workspace^element=workspace_slug",
    fields: "sys_id,name,element,mandatory,unique,max_length"
  });
  const slugField = slugDictionary[0] ?? null;
  addCheck(checks, slugDictionary.length === 1, "workspace_slug dictionary entry exists");
  addCheck(checks, String(slugField?.unique) === "true", "workspace_slug dictionary entry is marked unique", JSON.stringify(slugField));

  const roleRecords = await tableQuery(instanceUrl, session, "sys_user_role", {
    query: `nameIN${workspaceRoleNames.docseraAdmin},${workspaceRoleNames.workspaceAdmin},${workspaceRoleNames.editor}`,
    fields: "sys_id,name"
  });
  const roleNames = new Set(roleRecords.map((record) => cleanText(record.name)));
  addCheck(checks, roleNames.has(workspaceRoleNames.docseraAdmin), "scoped Docsera admin role is installed");
  addCheck(checks, roleNames.has(workspaceRoleNames.workspaceAdmin), "scoped workspace admin role is installed");
  addCheck(checks, roleNames.has(workspaceRoleNames.editor), "scoped editor role is installed");

  const restDefinitions = await tableQuery(instanceUrl, session, "sys_ws_definition", {
    query: "namespace=x_82900_docsera^service_id=docsera_runtime",
    fields: "sys_id,name,namespace,service_id,base_uri"
  });
  const restDefinition = restDefinitions[0] ?? null;
  addCheck(checks, restDefinitions.length === 1, "Docsera runtime REST definition is installed", JSON.stringify(restDefinitions));
  addCheck(checks, cleanText(restDefinition?.base_uri) === "/api/x_82900_docsera/docsera_runtime", "REST definition base URI matches expected value", JSON.stringify(restDefinition));

  const restOperations = await tableQuery(instanceUrl, session, "sys_ws_operation", {
    query: `web_service_definition=${cleanText(restDefinition?.sys_id)}^nameINping,workspaces`,
    fields: "sys_id,name,http_method,operation_uri,relative_path"
  });
  const pingOperation = restOperations.find((record) => cleanText(record.name) === "ping");
  const workspaceOperation = restOperations.find((record) => cleanText(record.name) === "workspaces");
  addCheck(checks, Boolean(pingOperation), "ping REST route metadata is installed");
  addCheck(checks, Boolean(workspaceOperation), "workspaces REST route metadata is installed");
  addCheck(checks, cleanText(pingOperation?.operation_uri) === defaults.pingPath, "ping REST route URI matches expected value", JSON.stringify(pingOperation));
  addCheck(checks, cleanText(workspaceOperation?.operation_uri) === defaults.workspacePath, "workspaces REST route URI matches expected value", JSON.stringify(workspaceOperation));

  let firstWorkspace;
  let secondWorkspace;

  try {
    const firstCreate = await fetchJson(instanceUrl, session, defaults.workspacePath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(createWorkspacePayload())
    });
    if (!firstCreate.ok) {
      throw new Error(`First workspace create failed with HTTP ${firstCreate.status}: ${firstCreate.text}`);
    }

    firstWorkspace = normalizeWorkspaceFromRoute(firstCreate.payload);
    createdWorkspaceSysIds.push(requireValue(cleanText(firstWorkspace.workspace?.sysId), "First workspace response did not include workspace.sysId."));
    createdGroupSysIds.push(requireValue(cleanText(firstWorkspace.groups?.admin?.sysId), "First workspace response did not include admin group sys_id."));
    createdGroupSysIds.push(requireValue(cleanText(firstWorkspace.groups?.editor?.sysId), "First workspace response did not include editor group sys_id."));

    addCheck(checks, cleanText(firstWorkspace.workspace?.name) === defaults.workspaceName, "first workspace route response includes created workspace data");
    addCheck(checks, cleanText(firstWorkspace.workspace?.slug).length > 0, "first workspace route response includes final slug", JSON.stringify(firstWorkspace.workspace));
    addCheck(checks, cleanText(firstWorkspace.groups?.admin?.name).length > 0, "first workspace route response includes admin group data");
    addCheck(checks, cleanText(firstWorkspace.groups?.editor?.name).length > 0, "first workspace route response includes editor group data");
    addCheck(
      checks,
      cleanText(firstWorkspace.roleNames?.workspaceAdmin) === workspaceRoleNames.workspaceAdmin &&
        cleanText(firstWorkspace.roleNames?.editor) === workspaceRoleNames.editor,
      "first workspace route response includes expected scoped role names",
      JSON.stringify(firstWorkspace.roleNames)
    );

    const secondCreate = await fetchJson(instanceUrl, session, defaults.workspacePath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(createWorkspacePayload())
    });
    if (!secondCreate.ok) {
      throw new Error(`Second workspace create failed with HTTP ${secondCreate.status}: ${secondCreate.text}`);
    }

    secondWorkspace = normalizeWorkspaceFromRoute(secondCreate.payload);
    createdWorkspaceSysIds.push(requireValue(cleanText(secondWorkspace.workspace?.sysId), "Second workspace response did not include workspace.sysId."));
    createdGroupSysIds.push(requireValue(cleanText(secondWorkspace.groups?.admin?.sysId), "Second workspace response did not include admin group sys_id."));
    createdGroupSysIds.push(requireValue(cleanText(secondWorkspace.groups?.editor?.sysId), "Second workspace response did not include editor group sys_id."));

    const expectedSecondSlug = nextExpectedSlug(defaults.workspaceName, cleanText(firstWorkspace.workspace?.slug));
    addCheck(checks, cleanText(secondWorkspace.workspace?.name) === defaults.workspaceName, "second workspace route response includes created workspace data");
    addCheck(
      checks,
      expectedSecondSlug ? cleanText(secondWorkspace.workspace?.slug) === expectedSecondSlug : cleanText(secondWorkspace.workspace?.slug) !== cleanText(firstWorkspace.workspace?.slug),
      "second workspace route allocates the next suffixed slug",
      JSON.stringify({
        firstSlug: firstWorkspace.workspace?.slug,
        secondSlug: secondWorkspace.workspace?.slug,
        expectedSecondSlug
      })
    );

    const workspaceRecords = await tableQuery(instanceUrl, session, "x_82900_docsera_workspace", {
      query: `sys_idIN${createdWorkspaceSysIds.join(",")}`,
      fields: "sys_id,name,workspace_slug,status,icon_type,icon_key,icon_label,toc_default_visible,page_width,admin_group,editor_group,creator,short_description"
    });
    const workspaceById = new Map(workspaceRecords.map((record) => [cleanText(record.sys_id), record]));

    for (const workspaceResult of [firstWorkspace, secondWorkspace]) {
      const record = workspaceById.get(cleanText(workspaceResult.workspace?.sysId));
      const expectedGroups = buildExpectedGroupNames(defaults.workspaceName, cleanText(workspaceResult.workspace?.slug));
      addCheck(checks, Boolean(record), `workspace record ${workspaceResult.workspace?.slug} is persisted`);
      addCheck(checks, cleanText(record?.name) === defaults.workspaceName, `workspace record ${workspaceResult.workspace?.slug} keeps the expected name`, JSON.stringify(record));
      addCheck(checks, cleanText(record?.workspace_slug) === cleanText(workspaceResult.workspace?.slug), `workspace record ${workspaceResult.workspace?.slug} keeps the expected slug`, JSON.stringify(record));
      addCheck(checks, cleanText(record?.status) === "active", `workspace record ${workspaceResult.workspace?.slug} defaults status to active`, JSON.stringify(record));
      addCheck(checks, cleanText(record?.icon_type) === "builtin", `workspace record ${workspaceResult.workspace?.slug} stores the default icon type`);
      addCheck(checks, cleanText(record?.icon_key) === "docsera-workspace", `workspace record ${workspaceResult.workspace?.slug} stores the default icon key`);
      addCheck(checks, cleanText(record?.icon_label) === "Docsera workspace icon", `workspace record ${workspaceResult.workspace?.slug} stores the default icon label`);
      addCheck(checks, String(record?.toc_default_visible) === "true", `workspace record ${workspaceResult.workspace?.slug} stores the default ToC visibility`, JSON.stringify(record));
      addCheck(checks, cleanText(record?.page_width) === "readable", `workspace record ${workspaceResult.workspace?.slug} stores the default page width`, JSON.stringify(record));
      addCheck(checks, cleanText(record?.admin_group).length > 0, `workspace record ${workspaceResult.workspace?.slug} stores a non-empty admin_group`);
      addCheck(checks, cleanText(record?.editor_group).length > 0, `workspace record ${workspaceResult.workspace?.slug} stores a non-empty editor_group`);
      addCheck(checks, cleanText(record?.creator) === currentUserSysId, `workspace record ${workspaceResult.workspace?.slug} stores the authenticated creator`, JSON.stringify(record));
      addCheck(
        checks,
        cleanText(workspaceResult.groups?.admin?.name) === expectedGroups.admin && cleanText(workspaceResult.groups?.editor?.name) === expectedGroups.editor,
        `workspace route group names for ${workspaceResult.workspace?.slug} follow the accepted pattern`,
        JSON.stringify({
          expectedGroups,
          actualGroups: workspaceResult.groups
        })
      );
    }

    const groupRecords = await tableQuery(instanceUrl, session, "sys_user_group", {
      query: `sys_idIN${createdGroupSysIds.join(",")}`,
      fields: "sys_id,name,description"
    });
    const groupById = new Map(groupRecords.map((record) => [cleanText(record.sys_id), record]));

    for (const workspaceResult of [firstWorkspace, secondWorkspace]) {
      const adminGroupId = cleanText(workspaceResult.groups?.admin?.sysId);
      const editorGroupId = cleanText(workspaceResult.groups?.editor?.sysId);
      addCheck(checks, Boolean(groupById.get(adminGroupId)), `admin group ${workspaceResult.groups?.admin?.name} exists in sys_user_group`);
      addCheck(checks, Boolean(groupById.get(editorGroupId)), `editor group ${workspaceResult.groups?.editor?.name} exists in sys_user_group`);
    }

    const workspaceAdminRole = roleRecords.find((record) => cleanText(record.name) === workspaceRoleNames.workspaceAdmin);
    const editorRole = roleRecords.find((record) => cleanText(record.name) === workspaceRoleNames.editor);
    const groupRoleRecords = await tableQuery(instanceUrl, session, "sys_group_has_role", {
      query: `groupIN${createdGroupSysIds.join(",")}`,
      fields: "sys_id,group,role"
    });
    const groupRoleKey = new Set(
      groupRoleRecords.map((record) => `${cleanText(record.group)}::${cleanText(record.role)}`)
    );

    addCheck(
      checks,
      groupRoleKey.has(`${cleanText(firstWorkspace.groups?.admin?.sysId)}::${cleanText(workspaceAdminRole?.sys_id)}`),
      "first admin group has x_82900_docsera.workspace_admin"
    );
    addCheck(
      checks,
      groupRoleKey.has(`${cleanText(firstWorkspace.groups?.editor?.sysId)}::${cleanText(editorRole?.sys_id)}`),
      "first editor group has x_82900_docsera.editor"
    );
    addCheck(
      checks,
      groupRoleKey.has(`${cleanText(secondWorkspace.groups?.admin?.sysId)}::${cleanText(workspaceAdminRole?.sys_id)}`),
      "second admin group has x_82900_docsera.workspace_admin"
    );
    addCheck(
      checks,
      groupRoleKey.has(`${cleanText(secondWorkspace.groups?.editor?.sysId)}::${cleanText(editorRole?.sys_id)}`),
      "second editor group has x_82900_docsera.editor"
    );

    const membershipRecords = await tableQuery(instanceUrl, session, "sys_user_grmember", {
      query: `group=${cleanText(firstWorkspace.groups?.admin?.sysId)}^user=${currentUserSysId}`,
      fields: "sys_id,group,user"
    });
    addCheck(
      checks,
      membershipRecords.length === 1,
      `creator ${currentUserName || currentUserSysId} is a member of the first generated admin group`,
      JSON.stringify(membershipRecords)
    );

    const duplicateInsert = await fetchJson(instanceUrl, session, "/api/now/table/x_82900_docsera_workspace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Direct Duplicate Probe",
        workspace_slug: cleanText(firstWorkspace.workspace?.slug),
        short_description: "Direct duplicate slug insert probe",
        icon_type: "builtin",
        icon_key: "docsera-workspace",
        icon_label: "Docsera workspace icon",
        status: "active",
        admin_group: cleanText(secondWorkspace.groups?.admin?.sysId),
        editor_group: cleanText(secondWorkspace.groups?.editor?.sysId),
        creator: currentUserSysId,
        toc_default_visible: true,
        page_width: "readable"
      })
    });

    const duplicateSucceeded = duplicateInsert.ok && cleanText(duplicateInsert.payload?.result?.sys_id);
    if (duplicateSucceeded) {
      createdWorkspaceSysIds.push(cleanText(duplicateInsert.payload.result.sys_id));
    }

    addCheck(
      checks,
      !duplicateSucceeded && duplicateInsert.status >= 400,
      "direct duplicate workspace_slug insert is rejected by the table API",
      JSON.stringify({
        status: duplicateInsert.status,
        payload: duplicateInsert.payload,
        text: duplicateInsert.text
      })
    );
  } finally {
    if (!keepData) {
      for (const workspaceSysId of [...new Set(createdWorkspaceSysIds)].reverse()) {
        const deleted = await tableDelete(instanceUrl, session, "x_82900_docsera_workspace", workspaceSysId);
        if (!deleted) {
          cleanupFailures.push(`workspace:${workspaceSysId}`);
        }
      }

      for (const groupSysId of [...new Set(createdGroupSysIds)].reverse()) {
        const deleted = await tableDelete(instanceUrl, session, "sys_user_group", groupSysId);
        if (!deleted) {
          cleanupFailures.push(`group:${groupSysId}`);
        }
      }
    }
  }

  addCheck(checks, !keepData, "cleanup was configured for this verification run", keepData ? "The verifier ran with --keep-data." : "");
  addCheck(checks, cleanupFailures.length === 0, "verification data cleanup completed", cleanupFailures.join(", "));

  for (const check of checks) {
    printCheck(check);
  }

  console.log("");
  console.log(`Created workspaces: ${createdWorkspaceSysIds.length}`);
  console.log(`Created groups: ${createdGroupSysIds.length}`);
  console.log(`Cleanup failures: ${cleanupFailures.length}`);
  console.log("");
  console.log(`Result: ${checks.every((check) => check.ok) ? "pass" : "fail"}`);

  if (!checks.every((check) => check.ok)) {
    process.exitCode = 1;
  }
}

await main();
