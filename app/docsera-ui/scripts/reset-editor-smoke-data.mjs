#!/usr/bin/env node

import { Entry } from "@napi-rs/keyring";
import { parseArgs } from "node:util";

const defaults = {
  authAlias: "docsera-pdi",
  instanceUrl: "https://dev295482.service-now.com",
  keyringAccount: "now-sdk",
  keyringService: "ServiceNow",
  pingPath: "/api/x_82900_docsera/docsera_runtime/ping",
  pagesPath: "/api/x_82900_docsera/docsera_runtime/pages"
};

const ownedWorkspaceConfigs = Object.freeze([
  {
    slug: "task-32-jacob-smoke-populated",
    name: "Task 32 Jacob Smoke Populated",
    shortDescription: "Disposable populated editor smoke workspace owned by reset-editor-smoke-data.mjs",
    groups: {
      admin: "Docsera_Task_32_Jacob_Smoke_Populated_Admins",
      editor: "Docsera_Task_32_Jacob_Smoke_Populated_Editors"
    },
    page: {
      draftSlug: "editor-controls-smoke",
      draftTitle: "Editor Controls Smoke",
      draftBodyText: "Docsera editor smoke content",
      publicationState: "published"
    }
  },
  {
    slug: "task-32-jacob-smoke-empty",
    name: "Task 32 Jacob Smoke Empty",
    shortDescription: "Disposable empty editor smoke workspace owned by reset-editor-smoke-data.mjs",
    groups: {
      admin: "Docsera_Task_32_Jacob_Smoke_Empty_Admins",
      editor: "Docsera_Task_32_Jacob_Smoke_Empty_Editors"
    }
  }
]);

const legacyOwnedWorkspaceSlugs = Object.freeze(["task-32-jacob-smoke"]);
const ownedWorkspaceSlugs = Object.freeze([
  ...legacyOwnedWorkspaceSlugs,
  ...ownedWorkspaceConfigs.map((workspace) => workspace.slug)
]);
const ownedGroupNames = Object.freeze(
  ownedWorkspaceConfigs.flatMap((workspace) => [workspace.groups.admin, workspace.groups.editor])
);
const workspaceRoleNames = Object.freeze({
  workspaceAdmin: "x_82900_docsera.workspace_admin",
  editor: "x_82900_docsera.editor"
});

const representativeEnvelope = Object.freeze({
  schemaVersion: 1,
  document: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Overview" }]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Combined",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://example.com/docs",
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: null,
                  title: null
                }
              },
              { type: "bold" },
              { type: "italic" },
              { type: "strike" }
            ]
          },
          { type: "text", text: " inline" },
          { type: "text", text: " code", marks: [{ type: "code" }] },
          {
            type: "text",
            text: " link",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://example.com/docs",
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: null,
                  title: null
                }
              }
            ]
          },
          { type: "hardBreak" },
          { type: "text", text: "after break" }
        ]
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Overview" }]
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Overview" }]
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Bullet item" }]
              },
              {
                type: "orderedList",
                attrs: { start: 2, type: "a" },
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Nested ordered" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        type: "orderedList",
        attrs: { start: 3, type: null },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Ordered item" }]
              },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Nested bullet" }]
                      }
                    ]
                  }
                ]
              },
              {
                type: "taskList",
                content: [
                  {
                    type: "taskItem",
                    attrs: { checked: false },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Nested task" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Checked task" }]
              },
              {
                type: "taskList",
                content: [
                  {
                    type: "taskItem",
                    attrs: { checked: false },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Nested checked task" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Quoted text" }]
          }
        ]
      },
      { type: "horizontalRule" },
      {
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [{ type: "text", text: "const smoke = true;   \n" }]
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: []
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Closing paragraph" }
        ]
      }
    ]
  }
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

async function tableInsert(instanceUrl, session, table, body) {
  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!result.ok) {
    throw new Error(`Insert ${table} failed with HTTP ${result.status}: ${result.text}`);
  }

  return result.payload?.result ?? null;
}

async function tableDelete(instanceUrl, session, table, sysId) {
  const result = await fetchJson(instanceUrl, session, `/api/now/table/${table}/${sysId}`, {
    method: "DELETE"
  });

  if (![200, 204].includes(result.status)) {
    throw new Error(`Delete ${table}:${sysId} failed with HTTP ${result.status}: ${result.text}`);
  }
}

function printSection(title) {
  console.log("");
  console.log(title);
}

function listValue(values) {
  return values.length ? values.join(", ") : "(none)";
}

function buildWorkspaceInsert(config, currentUserSysId, groupSysIds) {
  return {
    name: config.name,
    workspace_slug: config.slug,
    short_description: config.shortDescription,
    icon_type: "builtin",
    icon_key: "docsera-workspace",
    icon_label: "Docsera workspace icon",
    status: "active",
    admin_group: groupSysIds.admin,
    editor_group: groupSysIds.editor,
    creator: currentUserSysId,
    toc_default_visible: true,
    page_width: "readable"
  };
}

function buildRepresentativePageInsert(workspaceSysId, pageConfig) {
  return {
    workspace: workspaceSysId,
    parent_page: "",
    sibling_order: "1",
    draft_title: pageConfig.draftTitle,
    draft_slug: pageConfig.draftSlug,
    draft_slug_normalized: pageConfig.draftSlug,
    draft_content_json: JSON.stringify(representativeEnvelope),
    draft_revision: 0,
    draft_body_text: pageConfig.draftBodyText,
    published_title: pageConfig.draftTitle,
    published_slug: pageConfig.draftSlug,
    published_slug_normalized: pageConfig.draftSlug,
    published_content_json: JSON.stringify(representativeEnvelope),
    published_body_text: pageConfig.draftBodyText,
    publication_state: pageConfig.publicationState,
    active: true
  };
}

async function getCurrentUser(instanceUrl, session) {
  const pingResult = await fetchJson(instanceUrl, session, defaults.pingPath);
  if (!pingResult.ok || !pingResult.payload) {
    throw new Error(`Runtime ping failed with HTTP ${pingResult.status}: ${pingResult.text}`);
  }

  const pingPayload = normalizePayload(pingResult.payload);
  return {
    sysId: cleanText(pingPayload?.userSysId ?? pingPayload?.user_sys_id),
    userName: cleanText(pingPayload?.userName ?? pingPayload?.user_name)
  };
}

async function deleteOwnedRecords(instanceUrl, session, dryRun) {
  const requestRecords = await tableQuery(instanceUrl, session, "x_82900_docsera_workspace_provision_request", {
    query: `workspace_slugIN${ownedWorkspaceSlugs.join(",")}`,
    fields: "sys_id,workspace_slug,name",
    limit: 100
  });
  const workspaceRecords = await tableQuery(instanceUrl, session, "x_82900_docsera_workspace", {
    query: `workspace_slugIN${ownedWorkspaceSlugs.join(",")}`,
    fields: "sys_id,workspace_slug,name,admin_group,editor_group",
    limit: 100
  });
  const workspaceSysIds = workspaceRecords.map((record) => cleanText(record.sys_id)).filter(Boolean);
  const pageRecords = workspaceSysIds.length
    ? await tableQuery(instanceUrl, session, "x_82900_docsera_page", {
        query: `workspaceIN${workspaceSysIds.join(",")}`,
        fields: "sys_id,draft_title,draft_slug,workspace",
        limit: 200
      })
    : [];
  const groupRecords = await tableQuery(instanceUrl, session, "sys_user_group", {
    query: `nameIN${ownedGroupNames.join(",")}`,
    fields: "sys_id,name",
    limit: 100
  });
  const groupSysIds = groupRecords.map((record) => cleanText(record.sys_id)).filter(Boolean);
  const membershipRecords = groupSysIds.length
    ? await tableQuery(instanceUrl, session, "sys_user_grmember", {
        query: `groupIN${groupSysIds.join(",")}`,
        fields: "sys_id,group,user",
        limit: 200
      })
    : [];
  const groupRoleRecords = groupSysIds.length
    ? await tableQuery(instanceUrl, session, "sys_group_has_role", {
        query: `groupIN${groupSysIds.join(",")}`,
        fields: "sys_id,group,role",
        limit: 200
      })
    : [];

  printSection("Owned disposable records");
  console.log(`Workspaces: ${listValue(workspaceRecords.map((record) => cleanText(record.workspace_slug) || cleanText(record.name)))}`);
  console.log(`Pages: ${listValue(pageRecords.map((record) => cleanText(record.draft_slug) || cleanText(record.draft_title)))}`);
  console.log(`Groups: ${listValue(groupRecords.map((record) => cleanText(record.name)))}`);
  console.log(`Provision requests: ${requestRecords.length}`);

  if (dryRun) {
    return {
      deleted: {
        requestCount: requestRecords.length,
        workspaceCount: workspaceRecords.length,
        pageCount: pageRecords.length,
        groupCount: groupRecords.length,
        membershipCount: membershipRecords.length,
        groupRoleCount: groupRoleRecords.length
      }
    };
  }

  for (const record of pageRecords) {
    await tableDelete(instanceUrl, session, "x_82900_docsera_page", cleanText(record.sys_id));
  }

  for (const record of requestRecords) {
    await tableDelete(instanceUrl, session, "x_82900_docsera_workspace_provision_request", cleanText(record.sys_id));
  }

  for (const record of workspaceRecords) {
    await tableDelete(instanceUrl, session, "x_82900_docsera_workspace", cleanText(record.sys_id));
  }

  for (const record of membershipRecords) {
    await tableDelete(instanceUrl, session, "sys_user_grmember", cleanText(record.sys_id));
  }

  for (const record of groupRoleRecords) {
    await tableDelete(instanceUrl, session, "sys_group_has_role", cleanText(record.sys_id));
  }

  for (const record of groupRecords) {
    await tableDelete(instanceUrl, session, "sys_user_group", cleanText(record.sys_id));
  }

  return {
    deleted: {
      requestCount: requestRecords.length,
      workspaceCount: workspaceRecords.length,
      pageCount: pageRecords.length,
      groupCount: groupRecords.length,
      membershipCount: membershipRecords.length,
      groupRoleCount: groupRoleRecords.length
    }
  };
}

async function createOwnedRecords(instanceUrl, session, currentUser, dryRun) {
  const roleRecords = await tableQuery(instanceUrl, session, "sys_user_role", {
    query: `nameIN${workspaceRoleNames.workspaceAdmin},${workspaceRoleNames.editor}`,
    fields: "sys_id,name",
    limit: 10
  });
  const rolesByName = new Map(roleRecords.map((record) => [cleanText(record.name), cleanText(record.sys_id)]));

  if (!rolesByName.get(workspaceRoleNames.workspaceAdmin) || !rolesByName.get(workspaceRoleNames.editor)) {
    throw new Error("Required workspace roles are not installed on the instance.");
  }

  const created = {
    groups: [],
    workspaces: [],
    pages: []
  };

  printSection("Planned smoke fixtures");
  for (const workspace of ownedWorkspaceConfigs) {
    console.log(`${workspace.slug}: ${workspace.name}`);
  }

  if (dryRun) {
    return created;
  }

  for (const workspaceConfig of ownedWorkspaceConfigs) {
    const adminGroup = await tableInsert(instanceUrl, session, "sys_user_group", {
      name: workspaceConfig.groups.admin,
      description: `Disposable Docsera admin group for ${workspaceConfig.slug}`
    });
    const editorGroup = await tableInsert(instanceUrl, session, "sys_user_group", {
      name: workspaceConfig.groups.editor,
      description: `Disposable Docsera editor group for ${workspaceConfig.slug}`
    });

    created.groups.push(cleanText(adminGroup?.sys_id), cleanText(editorGroup?.sys_id));

    await tableInsert(instanceUrl, session, "sys_group_has_role", {
      group: cleanText(adminGroup?.sys_id),
      role: rolesByName.get(workspaceRoleNames.workspaceAdmin)
    });
    await tableInsert(instanceUrl, session, "sys_group_has_role", {
      group: cleanText(editorGroup?.sys_id),
      role: rolesByName.get(workspaceRoleNames.editor)
    });
    await tableInsert(instanceUrl, session, "sys_user_grmember", {
      group: cleanText(adminGroup?.sys_id),
      user: currentUser.sysId
    });

    const workspaceRecord = await tableInsert(
      instanceUrl,
      session,
      "x_82900_docsera_workspace",
      buildWorkspaceInsert(workspaceConfig, currentUser.sysId, {
        admin: cleanText(adminGroup?.sys_id),
        editor: cleanText(editorGroup?.sys_id)
      })
    );

    const workspaceSysId = cleanText(workspaceRecord?.sys_id);
    created.workspaces.push(workspaceSysId);

    if (workspaceConfig.page) {
      const pageRecord = await tableInsert(
        instanceUrl,
        session,
        "x_82900_docsera_page",
        buildRepresentativePageInsert(workspaceSysId, workspaceConfig.page)
      );
      created.pages.push(cleanText(pageRecord?.sys_id));
    }
  }

  return created;
}

async function verifyWorkspaceRoute(instanceUrl, session, slug, mode, expectedCount) {
  const result = await fetchJson(
    instanceUrl,
    session,
    `${defaults.pagesPath}?workspaceSlug=${encodeURIComponent(slug)}&mode=${encodeURIComponent(mode)}`
  );

  if (!result.ok) {
    throw new Error(`Page list ${slug} (${mode}) failed with HTTP ${result.status}: ${result.text}`);
  }

  const payload = normalizePayload(result.payload);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length !== expectedCount) {
    throw new Error(`Page list ${slug} (${mode}) returned ${items.length} items, expected ${expectedCount}.`);
  }

  return {
    status: result.status,
    items,
    payload
  };
}

async function verifyEmptyWorkspaceCreateFlow(instanceUrl, session, slug) {
  const createResult = await fetchJson(instanceUrl, session, defaults.pagesPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: "First Smoke Reset Page",
      workspaceSlug: slug
    })
  });

  if (createResult.status !== 201) {
    throw new Error(`Create-page flow for ${slug} failed with HTTP ${createResult.status}: ${createResult.text}`);
  }

  const payload = normalizePayload(createResult.payload);
  const pageSysId = cleanText(payload?.page?.sysId);
  if (!pageSysId) {
    throw new Error(`Create-page flow for ${slug} did not return a page sys_id.`);
  }

  await tableDelete(instanceUrl, session, "x_82900_docsera_page", pageSysId);
}

async function main() {
  const parsedArgs = parseArgs({
    allowPositionals: false,
    options: {
      "auth-alias": { type: "string" },
      "instance-url": { type: "string" },
      apply: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    },
    args: process.argv.slice(2)
  });

  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/reset-editor-smoke-data.mjs [--auth-alias <alias>] [--instance-url <url>] [--apply]");
    console.log("Defaults to dry-run. Pass --apply to delete and recreate owned disposable smoke records.");
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
  const apply = Boolean(parsedArgs.values.apply);
  const dryRun = !apply;

  console.log("Docsera editor smoke-data reset");
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Auth alias: ${authAlias}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(`Owned workspace slugs: ${ownedWorkspaceSlugs.join(", ")}`);

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
    throw new Error(`Stored alias "${authAlias}" uses ${storedCredential.creds?.type ?? "unknown"} auth; this reset expects basic auth.`);
  }

  const session = await establishBasicSession(instanceUrl, storedCredential.creds);
  const currentUser = await getCurrentUser(instanceUrl, session);
  if (!currentUser.sysId) {
    throw new Error("Current user sys_id could not be resolved from the runtime ping.");
  }

  printSection("Authenticated user");
  console.log(`${currentUser.userName || "(unknown user)"} (${currentUser.sysId})`);

  const deleted = await deleteOwnedRecords(instanceUrl, session, dryRun);

  if (dryRun) {
    printSection("Dry-run result");
    console.log(JSON.stringify(deleted, null, 2));
    return;
  }

  const created = await createOwnedRecords(instanceUrl, session, currentUser, dryRun);

  printSection("Created fixture sys_ids");
  console.log(JSON.stringify(created, null, 2));

  const populatedWorkspace = ownedWorkspaceConfigs[0];
  const emptyWorkspace = ownedWorkspaceConfigs[1];

  const populatedLive = await verifyWorkspaceRoute(instanceUrl, session, populatedWorkspace.slug, "live", 1);
  const populatedEdit = await verifyWorkspaceRoute(instanceUrl, session, populatedWorkspace.slug, "edit", 1);
  const emptyLive = await verifyWorkspaceRoute(instanceUrl, session, emptyWorkspace.slug, "live", 0);
  const emptyEdit = await verifyWorkspaceRoute(instanceUrl, session, emptyWorkspace.slug, "edit", 0);

  const representativePage = populatedEdit.items[0] ?? null;
  const representativeTitle = cleanText(representativePage?.draftTitle ?? representativePage?.publishedTitle);
  const representativeHeading =
    representativePage?.draftContentJson?.document?.content?.[0]?.content?.[0]?.text ??
    representativePage?.draftContentJson?.content?.[0]?.content?.[0]?.text ??
    "";

  await verifyEmptyWorkspaceCreateFlow(instanceUrl, session, emptyWorkspace.slug);

  const restoredEmptyEdit = await verifyWorkspaceRoute(instanceUrl, session, emptyWorkspace.slug, "edit", 0);
  const restoredEmptyLive = await verifyWorkspaceRoute(instanceUrl, session, emptyWorkspace.slug, "live", 0);

  printSection("Verification summary");
  console.log(
    JSON.stringify(
      {
        populatedWorkspace: {
          slug: populatedWorkspace.slug,
          liveStatus: populatedLive.status,
          editStatus: populatedEdit.status,
          pageCount: populatedEdit.items.length,
          representativeTitle,
          representativeHeading
        },
        emptyWorkspace: {
          slug: emptyWorkspace.slug,
          liveStatus: emptyLive.status,
          editStatus: emptyEdit.status,
          restoredLiveStatus: restoredEmptyLive.status,
          restoredEditStatus: restoredEmptyEdit.status,
          pageCount: restoredEmptyEdit.items.length
        }
      },
      null,
      2
    )
  );
}

await main();
