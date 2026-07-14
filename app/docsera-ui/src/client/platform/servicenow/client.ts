import type {
  DocseraRuntimeContext,
  PingEnvelope,
  PingResult,
  PageCreateFailed,
  PageCreateInput,
  PageCreateResult,
  PageCreateSucceeded,
  PageBodySaveFailed,
  PageBodySaveInput,
  PageBodySaveResult,
  PageBodySaveSucceeded,
  PageEditLockAcquireResult,
  PageEditLockFailed,
  PageEditLockHeartbeatResult,
  PageEditLockHeld,
  PageEditLockLocked,
  PageEditLockReferenceInput,
  PageEditLockReleaseResult,
  PageEditLockStatusResult,
  PageDeleteFailed,
  PageDeleteInput,
  PageDeleteResult,
  PageDeleteSucceeded,
  WorkspacePageRecord,
  RawPingPayload,
  ServiceNowClient,
  PageSettingsSaveFailed,
  PageSettingsSaveInput,
  PageSettingsSaveResult,
  PageSettingsSaveSucceeded,
  WorkspaceCreateFailed,
  WorkspaceCreateInput,
  WorkspaceCreatePending,
  WorkspaceCreateResult,
  WorkspaceCreateSucceeded,
  WorkspaceListResult,
  PageListResult,
  WorkspaceLookupResult,
  WorkspaceMode,
  WorkspaceViewRecord
} from "../../shared/types/docsera";

type TokenBearingWindow = Window & {
  NOW?: {
    user?: {
      token?: string;
    };
  };
  g_ck?: string;
};

type JsonResponse<T> = {
  body: T | null;
  status: number;
};

const DEFAULT_WORKSPACE_COLLECTION_PATH = "/api/x_82900_docsera/docsera_runtime/workspaces";
const DEFAULT_PAGE_COLLECTION_PATH = "/api/x_82900_docsera/docsera_runtime/pages";
const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";
const SAFE_PAGE_DELETE_ERROR_MESSAGE = "Something went wrong while deleting the page. The page was not deleted. Please try again.";

function readWindowUserToken(candidate: Window | null | undefined): string | undefined {
  const tokenWindow = candidate as TokenBearingWindow | null | undefined;
  const token = tokenWindow?.g_ck ?? tokenWindow?.NOW?.user?.token;
  return typeof token === "string" && token.trim() ? token.trim() : undefined;
}

function resolveUserToken(): string | undefined {
  const localToken = readWindowUserToken(window);
  if (localToken) {
    return localToken;
  }

  try {
    return readWindowUserToken(window.top);
  } catch {
    return undefined;
  }
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isResultEnvelope(value: unknown): value is { result: unknown } {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "result";
}

function unwrapServiceNowEnvelope(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 2; depth += 1) {
    if (!isResultEnvelope(current)) {
      break;
    }

    current = current.result;
  }

  return current;
}

function resolvePath(value: string | undefined, fallback: string): string {
  return cleanText(value) || fallback;
}

function resolvePageDeleteActionPath(pageCollectionPath: string): string {
  const normalizedPath = cleanText(pageCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/delete`;
}

function resolvePageEditLockPath(pageCollectionPath: string, action: "acquire" | "heartbeat" | "release" | "status"): string {
  const normalizedPath = cleanText(pageCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/edit-lock/${action}`;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<JsonResponse<T>> {
  const userToken = resolveUserToken();
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
      ...(userToken ? { "X-UserToken": userToken } : {})
    }
  });

  let body: T | null = null;

  if (typeof response.text === "function") {
    const text = await response.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text) as T;
      } catch {
        body = null;
      }
    }
  } else if (typeof response.json === "function") {
    try {
      body = (await response.json()) as T;
    } catch {
      body = null;
    }
  }

  return {
    body,
    status: response.status
  };
}

function normalizePingPayload(payload: PingEnvelope): PingResult {
  const normalizedPayload = unwrapServiceNowEnvelope(payload);
  const result: RawPingPayload = isPlainObject(normalizedPayload) ? (normalizedPayload as RawPingPayload) : (payload as RawPingPayload);

  return {
    authenticated: Boolean(result.authenticated),
    scope: result.scope ?? "unknown",
    status: result.status ?? "unknown",
    timestamp: result.timestamp ?? "unknown",
    userName: result.userName ?? result.user_name ?? "unknown",
    userSysId: result.userSysId ?? result.user_sys_id ?? "unknown"
  };
}

function normalizeWorkspaceViewRecord(candidate: unknown): WorkspaceViewRecord {
  const workspace = candidate as Partial<WorkspaceViewRecord> & {
    icon?: WorkspaceViewRecord["icon"] | null;
  };

  return {
    sysId: cleanText(workspace.sysId),
    slug: cleanText(workspace.slug),
    name: cleanText(workspace.name),
    shortDescription: cleanText(workspace.shortDescription) || null,
    icon: workspace.icon ?? {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    status: workspace.status === "inactive" ? "inactive" : "active",
    roleLabel: workspace.roleLabel === "Admin" ? "Admin" : workspace.roleLabel === "Editor" ? "Editor" : null,
    canManageSettings: Boolean(workspace.canManageSettings)
  };
}

function normalizePageRecord(candidate: unknown): WorkspacePageRecord {
  const page = candidate as Partial<WorkspacePageRecord>;
  const publicationState =
    page.publicationState === "published" || page.publicationState === "published_with_unpublished_changes"
      ? page.publicationState
      : "draft";

  return {
    sysId: cleanText(page.sysId),
    workspaceSysId: cleanText(page.workspaceSysId),
    parentPageSysId: cleanText(page.parentPageSysId) || null,
    siblingOrder: Number(page.siblingOrder) || 1,
    draftTitle: cleanText(page.draftTitle),
    draftSlug: cleanText(page.draftSlug),
    draftSlugNormalized: cleanText(page.draftSlugNormalized),
    draftContentJson: page.draftContentJson ?? null,
    draftRevision: Number.isSafeInteger(Number(page.draftRevision)) && Number(page.draftRevision) >= 0 ? Number(page.draftRevision) : 0,
    draftBodyText: cleanText(page.draftBodyText) || null,
    publishedTitle: cleanText(page.publishedTitle) || null,
    publishedSlug: cleanText(page.publishedSlug) || null,
    publishedSlugNormalized: cleanText(page.publishedSlugNormalized) || null,
    publishedContentJson: page.publishedContentJson ?? null,
    publishedBodyText: cleanText(page.publishedBodyText) || null,
    publicationState,
    active: typeof page.active === "boolean" ? page.active : undefined
  };
}

function normalizePageListResult(body: unknown): PageListResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result)) {
    throw new Error("Page list payload was invalid.");
  }

  const itemsSource = Array.isArray(result.items) ? result.items : Array.isArray(result.pages) ? result.pages : [];
  const items = itemsSource.map((item) => normalizePageRecord(item));

  return {
    items,
    mode: cleanText(result.pageMode) === "edit" ? "edit" : "live",
    workspaceSlug: cleanText(result.workspaceSlug),
    workspaceSysId: cleanText(result.workspaceSysId),
    totalCount: Number(result.totalCount) || items.length
  };
}

function extractErrorMessage(body: unknown, fallback: string): string {
  const normalizedBody = unwrapServiceNowEnvelope(body);
  const result = isPlainObject(normalizedBody) ? normalizedBody.error : undefined;
  const nestedMessage =
    result && typeof result === "object" ? cleanText((result as Record<string, unknown>).message) : "";
  return nestedMessage || fallback;
}

function normalizeWorkspaceListResult(body: unknown): WorkspaceListResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result)) {
    throw new Error("Workspace list payload was invalid.");
  }

  const items = Array.isArray(result.items) ? result.items.map((item) => normalizeWorkspaceViewRecord(item)) : [];

  return {
    items,
    page: Number(result.page) || 1,
    pageSize: Number(result.pageSize) || items.length || 10,
    totalCount: Number(result.totalCount) || items.length,
    hasNextPage: Boolean(result.hasNextPage),
    searchText: cleanText(result.searchText)
  };
}

function normalizeWorkspaceLookupResult(body: unknown): WorkspaceLookupResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !("workspace" in result)) {
    throw new Error("Workspace payload was invalid.");
  }

  const workspace = result.workspace ? normalizeWorkspaceViewRecord(result.workspace) : null;

  return {
    workspace
  };
}

function normalizeWorkspaceCreateSucceededResult(body: unknown): WorkspaceCreateSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.workspace) {
    throw new Error("Workspace creation payload was invalid.");
  }

  return {
    state: "succeeded",
    workspace: normalizeWorkspaceViewRecord(result.workspace),
    requestId: cleanText(result.provisioning && typeof result.provisioning === "object" ? (result.provisioning as Record<string, unknown>).requestId : ""),
    statusPath: cleanText(result.provisioning && typeof result.provisioning === "object" ? (result.provisioning as Record<string, unknown>).statusPath : "")
  };
}

function normalizeWorkspaceCreatePendingResult(body: unknown): WorkspaceCreatePending {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.provisioning) {
    throw new Error("Workspace provisioning is pending but the response was invalid.");
  }

  const provisioning = result.provisioning as Record<string, unknown>;

  return {
    state: "pending",
    requestId: cleanText(provisioning.requestId),
    statusPath: cleanText(provisioning.statusPath),
    pollAfterMs: Number(provisioning.pollAfterMs) || 1000
  };
}

function normalizeWorkspaceCreateFailedResult(body: unknown, fallback: string): WorkspaceCreateFailed {
  const result = unwrapServiceNowEnvelope(body);
  const provisioning = isPlainObject(result) && result.provisioning && typeof result.provisioning === "object"
    ? (result.provisioning as Record<string, unknown>)
    : null;

  return {
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback),
    requestId: cleanText(provisioning?.requestId),
    statusPath: cleanText(provisioning?.statusPath)
  };
}

function normalizePageCreateSucceededResult(body: unknown): PageCreateSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.page) {
    throw new Error("Page creation payload was invalid.");
  }

  return {
    state: "succeeded",
    page: normalizePageRecord(result.page)
  };
}

function normalizePageCreateFailedResult(body: unknown, fallback: string): PageCreateFailed {
  return {
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback)
  };
}

function normalizePageBodySaveSucceededResult(body: unknown): PageBodySaveSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.page) {
    throw new Error("Page save payload was invalid.");
  }

  return {
    state: "succeeded",
    page: normalizePageRecord(result.page)
  };
}

function normalizePageEditLockHeldResult(body: unknown): PageEditLockHeld {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result)) {
    throw new Error("Page edit lock payload was invalid.");
  }

  return {
    heartbeatIntervalMs: Math.max(1, Number(result.heartbeatIntervalMs) || 30000),
    lockToken: cleanText(result.lockToken),
    staleAfterMs: Math.max(1, Number(result.staleAfterMs) || 180000),
    state: "held"
  };
}

function normalizePageEditLockLockedResult(body: unknown): PageEditLockLocked {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result)) {
    throw new Error("Page edit lock status payload was invalid.");
  }

  return {
    holderDisplayName: cleanText(result.holderDisplayName) || null,
    sameUserDifferentSession: Boolean(result.sameUserDifferentSession),
    state: "locked"
  };
}

function normalizePageEditLockFailedResult(
  body: unknown,
  fallback: string,
  fallbackCode: PageEditLockFailed["code"],
  fallbackRetryable: boolean
): PageEditLockFailed {
  const normalizedBody = unwrapServiceNowEnvelope(body);
  const errorObject =
    normalizedBody && typeof normalizedBody === "object" && "error" in normalizedBody
      ? ((normalizedBody as Record<string, unknown>).error as Record<string, unknown> | undefined)
      : undefined;
  const errorCode = cleanText(errorObject?.code);
  const normalizedCode: PageEditLockFailed["code"] =
    errorCode === "forbidden"
      ? "forbidden"
      : errorCode === "persistence_transient"
        ? "transient"
        : errorCode === "persistence_invariant"
          ? "persistence_invariant"
          : errorCode === "invalid"
            ? "invalid"
            : fallbackCode;

  return {
    code: normalizedCode,
    errorMessage: extractErrorMessage(body, fallback),
    retryable: normalizedCode === "transient" ? true : fallbackRetryable,
    state: "failed"
  };
}

function normalizePageEditLockLostResult(body: unknown, fallback: string): Exclude<PageEditLockHeartbeatResult | PageEditLockReleaseResult, PageEditLockHeld | PageEditLockFailed | { state: "released" }> {
  const normalizedBody = unwrapServiceNowEnvelope(body);
  const errorObject =
    normalizedBody && typeof normalizedBody === "object" && "error" in normalizedBody
      ? ((normalizedBody as Record<string, unknown>).error as Record<string, unknown> | undefined)
      : undefined;

  return {
    errorMessage: extractErrorMessage(body, fallback),
    holderDisplayName: cleanText(errorObject?.holderDisplayName) || null,
    sameUserDifferentSession: Boolean(errorObject?.sameUserDifferentSession),
    state: "lost"
  };
}

function normalizePageBodySaveFailedResult(
  body: unknown,
  fallback: string,
  fallbackCode: PageBodySaveFailed["code"],
  fallbackRetryable: boolean
): PageBodySaveFailed {
  const normalizedBody = unwrapServiceNowEnvelope(body);
  const errorObject =
    normalizedBody && typeof normalizedBody === "object" && "error" in normalizedBody
      ? ((normalizedBody as Record<string, unknown>).error as Record<string, unknown> | undefined)
      : undefined;
  const errorCode = cleanText(errorObject?.code);
  const currentRevision = Number(errorObject?.currentRevision);
  const normalizedCode: PageBodySaveFailed["code"] =
    errorCode === "draft_revision_conflict"
      ? "conflict"
      : errorCode === "forbidden"
        ? "forbidden"
        : errorCode === "invalid"
          ? "invalid"
          : errorCode === "document_capacity"
            ? "capacity"
            : errorCode === "persistence_invariant"
              ? "persistence_invariant"
              : errorCode === "edit_lock_lost"
                ? "lock_lost"
              : errorCode === "persistence_transient"
                ? "transient"
                : fallbackCode;

  return {
    code: normalizedCode,
    currentRevision: Number.isSafeInteger(currentRevision) && currentRevision >= 0 ? currentRevision : undefined,
    retryable: normalizedCode === "transient" ? true : fallbackRetryable,
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback)
  };
}

function normalizePageSettingsSaveSucceededResult(body: unknown): PageSettingsSaveSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.page) {
    throw new Error("Page settings payload was invalid.");
  }

  return {
    state: "succeeded",
    page: normalizePageRecord(result.page)
  };
}

function normalizePageSettingsSaveFailedResult(body: unknown, fallback: string): PageSettingsSaveFailed {
  return {
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback)
  };
}

function normalizePageDeleteSucceededResult(body: unknown): PageDeleteSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result)) {
    throw new Error("Page delete payload was invalid.");
  }

  return {
    state: "succeeded",
    nextPageSysId: cleanText(result.nextPageSysId)
  };
}

function normalizePageDeleteFailedResult(body: unknown, fallback: string): PageDeleteFailed {
  return {
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback)
  };
}

async function resolveWorkspaceCreateResult(
  path: string,
  input: WorkspaceCreateInput
): Promise<WorkspaceCreateResult> {
  const payload = {
    name: cleanText(input.name),
    shortDescription: cleanText(input.shortDescription) || null,
    ...(input.icon ? { icon: input.icon } : {})
  };

  const response = await requestJson<unknown>(path, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (response.status === 201) {
    return normalizeWorkspaceCreateSucceededResult(response.body);
  }

  if (response.status === 202) {
    return normalizeWorkspaceCreatePendingResult(response.body);
  }

  if (response.status === 400) {
    return normalizeWorkspaceCreateFailedResult(response.body, "Workspace creation failed.");
  }

  throw new Error(`HTTP ${response.status}`);
}

async function resolveWorkspaceProvisioningStatus(path: string): Promise<WorkspaceCreateResult> {
  const response = await requestJson<unknown>(path);

  if (response.status === 200) {
    const result = unwrapServiceNowEnvelope(response.body);
    if (!isPlainObject(result) || !result.provisioning) {
      throw new Error("Workspace provisioning status payload was invalid.");
    }

    const provisioning = result.provisioning as Record<string, unknown>;
    const state = cleanText(provisioning.state);

    if (state === "succeeded" && result.workspace) {
      return {
        state: "succeeded",
        workspace: normalizeWorkspaceViewRecord(result.workspace),
        requestId: cleanText(provisioning.requestId),
        statusPath: cleanText(provisioning.statusPath)
      };
    }

    if (state === "failed") {
      return {
        state: "failed",
        errorMessage: extractErrorMessage(response.body, "Workspace provisioning failed."),
        requestId: cleanText(provisioning.requestId),
        statusPath: cleanText(provisioning.statusPath)
      };
    }

    return {
      state: "pending",
      requestId: cleanText(provisioning.requestId),
      statusPath: cleanText(provisioning.statusPath),
      pollAfterMs: Number(provisioning.pollAfterMs) || 1000
    };
  }

  if (response.status === 400 || response.status === 404) {
    return {
      state: "failed",
      errorMessage: extractErrorMessage(response.body, "Workspace provisioning status lookup failed.")
    };
  }

  throw new Error(`HTTP ${response.status}`);
}

async function resolvePageCreateResult(path: string, input: PageCreateInput): Promise<PageCreateResult> {
  const payload = {
    title: cleanText(input.title),
    workspaceSlug: cleanText(input.workspaceSlug),
    ...(input.parentPageSysId ? { parentPageSysId: cleanText(input.parentPageSysId) } : {})
  };

  const response = await requestJson<unknown>(path, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (response.status === 201) {
    return normalizePageCreateSucceededResult(response.body);
  }

  if (response.status === 400 || response.status === 403 || response.status === 404) {
    return normalizePageCreateFailedResult(response.body, "Page creation failed.");
  }

  throw new Error(`HTTP ${response.status}`);
}

async function resolvePageBodySaveResult(path: string, input: PageBodySaveInput): Promise<PageBodySaveResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    pageSlug: cleanText(input.pageSlug),
    ...(cleanText(input.lockToken) ? { lockToken: cleanText(input.lockToken) } : {}),
    draftBodyText: input.draftBodyText,
    draftContentJson: input.draftContentJson,
    expectedRevision: Number.isSafeInteger(input.expectedRevision) ? input.expectedRevision : undefined
  };

  let response: JsonResponse<unknown>;
  try {
    response = await requestJson<unknown>(path, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      }
    });

  } catch {
    return {
      code: "network",
      retryable: true,
      state: "failed",
      errorMessage: SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE
    };
  }

  if (response.status === 200) {
    try {
      return normalizePageBodySaveSucceededResult(response.body);
    } catch {
      return {
        code: "persistence_invariant",
        retryable: false,
        state: "failed",
        errorMessage: SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE
      };
    }
  }

  if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 500) {
    const fallbackCode: PageBodySaveFailed["code"] =
      response.status === 403 ? "forbidden" : response.status === 409 ? "conflict" : response.status === 500 ? "persistence_invariant" : "invalid";
    return normalizePageBodySaveFailedResult(response.body, SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE, fallbackCode, false);
  }

  if ([408, 429, 502, 503, 504].includes(response.status)) {
    return {
      code: "transient",
      retryable: true,
      state: "failed",
      errorMessage: SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE
    };
  }

  return {
    code: "failed",
    retryable: false,
    state: "failed",
    errorMessage: SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE
  };
}

async function resolvePageEditLockStatusResult(path: string, input: PageEditLockReferenceInput): Promise<PageEditLockStatusResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    pageSlug: cleanText(input.pageSlug),
    ...(cleanText(input.lockToken) ? { lockToken: cleanText(input.lockToken) } : {})
  };

  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (response.status === 200) {
      const result = unwrapServiceNowEnvelope(response.body);
      if (!isPlainObject(result) || !cleanText(result.state)) {
        throw new Error("Page edit lock status payload was invalid.");
      }

      if (cleanText(result.state) === "held") {
        return normalizePageEditLockHeldResult(response.body);
      }

      if (cleanText(result.state) === "locked") {
        return normalizePageEditLockLockedResult(response.body);
      }

      return { state: "unlocked" };
    }

    if (response.status === 409) {
      return normalizePageEditLockLostResult(
        response.body,
        "This edit session ended and unsaved changes were not saved."
      );
    }

    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 500) {
      const fallbackCode: PageEditLockFailed["code"] =
        response.status === 403 ? "forbidden" : response.status === 500 ? "persistence_invariant" : "invalid";
      return normalizePageEditLockFailedResult(
        response.body,
        "Something went wrong while checking the edit session. Please try again.",
        fallbackCode,
        false
      );
    }

    if ([408, 429, 502, 503, 504].includes(response.status)) {
      return {
        code: "transient",
        errorMessage: "Something went wrong while checking the edit session. Please try again.",
        retryable: true,
        state: "failed"
      };
    }

    return {
      code: "failed",
      errorMessage: "Something went wrong while checking the edit session. Please try again.",
      retryable: false,
      state: "failed"
    };
  } catch {
    return {
      code: "network",
      errorMessage: "Something went wrong while checking the edit session. Please try again.",
      retryable: true,
      state: "failed"
    };
  }
}

async function resolvePageEditLockAcquireResult(path: string, input: PageEditLockReferenceInput): Promise<PageEditLockAcquireResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    pageSlug: cleanText(input.pageSlug),
    ...(cleanText(input.lockToken) ? { lockToken: cleanText(input.lockToken) } : {})
  };

  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (response.status === 200) {
      return normalizePageEditLockHeldResult(response.body);
    }

    if (response.status === 409) {
      const normalizedBody = unwrapServiceNowEnvelope(response.body);
      const errorObject =
        normalizedBody && typeof normalizedBody === "object" && "error" in normalizedBody
          ? ((normalizedBody as Record<string, unknown>).error as Record<string, unknown> | undefined)
          : undefined;
      if (cleanText(errorObject?.code) === "page_locked") {
        return {
          holderDisplayName: cleanText(errorObject?.holderDisplayName) || null,
          sameUserDifferentSession: Boolean(errorObject?.sameUserDifferentSession),
          state: "locked"
        };
      }
    }

    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 500) {
      const fallbackCode: PageEditLockFailed["code"] =
        response.status === 403 ? "forbidden" : response.status === 500 ? "persistence_invariant" : "invalid";
      return normalizePageEditLockFailedResult(
        response.body,
        "Something went wrong while starting the edit session. Please try again.",
        fallbackCode,
        false
      );
    }

    if ([408, 429, 502, 503, 504].includes(response.status)) {
      return {
        code: "transient",
        errorMessage: "Something went wrong while starting the edit session. Please try again.",
        retryable: true,
        state: "failed"
      };
    }

    return {
      code: "failed",
      errorMessage: "Something went wrong while starting the edit session. Please try again.",
      retryable: false,
      state: "failed"
    };
  } catch {
    return {
      code: "network",
      errorMessage: "Something went wrong while checking the edit session. Please try again.",
      retryable: true,
      state: "failed"
    };
  }
}

async function resolvePageEditLockHeartbeatResult(path: string, input: PageEditLockReferenceInput): Promise<PageEditLockHeartbeatResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    pageSlug: cleanText(input.pageSlug),
    ...(cleanText(input.lockToken) ? { lockToken: cleanText(input.lockToken) } : {})
  };

  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (response.status === 200) {
      return normalizePageEditLockHeldResult(response.body);
    }

    if (response.status === 409) {
      return normalizePageEditLockLostResult(
        response.body,
        "This edit session ended and unsaved changes were not saved."
      );
    }

    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 500) {
      const fallbackCode: PageEditLockFailed["code"] =
        response.status === 403 ? "forbidden" : response.status === 500 ? "persistence_invariant" : "invalid";
      return normalizePageEditLockFailedResult(
        response.body,
        "Something went wrong while refreshing the edit session. Please try again.",
        fallbackCode,
        false
      );
    }

    if ([408, 429, 502, 503, 504].includes(response.status)) {
      return {
        code: "transient",
        errorMessage: "Something went wrong while refreshing the edit session. Please try again.",
        retryable: true,
        state: "failed"
      };
    }

    return {
      code: "failed",
      errorMessage: "Something went wrong while refreshing the edit session. Please try again.",
      retryable: false,
      state: "failed"
    };
  } catch {
    return {
      code: "network",
      errorMessage: "Something went wrong while refreshing the edit session. Please try again.",
      retryable: true,
      state: "failed"
    };
  }
}

async function resolvePageEditLockReleaseResult(
  path: string,
  input: PageEditLockReferenceInput & { keepalive?: boolean }
): Promise<PageEditLockReleaseResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    pageSlug: cleanText(input.pageSlug),
    ...(cleanText(input.lockToken) ? { lockToken: cleanText(input.lockToken) } : {})
  };

  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      },
      keepalive: Boolean(input.keepalive)
    });

    if (response.status === 200) {
      return {
        state: "released"
      };
    }

    if (response.status === 409) {
      return normalizePageEditLockLostResult(
        response.body,
        "This edit session has already ended."
      );
    }

    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 500) {
      const fallbackCode: PageEditLockFailed["code"] =
        response.status === 403 ? "forbidden" : response.status === 500 ? "persistence_invariant" : "invalid";
      return normalizePageEditLockFailedResult(
        response.body,
        "Something went wrong while ending the edit session. Please try again.",
        fallbackCode,
        false
      );
    }

    if ([408, 429, 502, 503, 504].includes(response.status)) {
      return {
        code: "transient",
        errorMessage: "Something went wrong while ending the edit session. Please try again.",
        retryable: true,
        state: "failed"
      };
    }

    return {
      code: "failed",
      errorMessage: "Something went wrong while ending the edit session. Please try again.",
      retryable: false,
      state: "failed"
    };
  } catch {
    return {
      code: "network",
      errorMessage: "Something went wrong while ending the edit session. Please try again.",
      retryable: true,
      state: "failed"
    };
  }
}

async function resolvePageSettingsSaveResult(path: string, input: PageSettingsSaveInput): Promise<PageSettingsSaveResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    title: cleanText(input.title),
    slug: cleanText(input.slug)
  };

  try {
    const response = await requestJson<unknown>(path, {
      method: "PUT",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (response.status === 200) {
      return normalizePageSettingsSaveSucceededResult(response.body);
    }

    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 500) {
      return normalizePageSettingsSaveFailedResult(response.body, "Something went wrong while saving page settings. Your changes were not saved. Please try again.");
    }

    return {
      state: "failed",
      errorMessage: "Something went wrong while saving page settings. Your changes were not saved. Please try again."
    };
  } catch {
    return {
      state: "failed",
      errorMessage: "Something went wrong while saving page settings. Your changes were not saved. Please try again."
    };
  }
}

async function resolvePageDeleteResult(path: string, input: PageDeleteInput): Promise<PageDeleteResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId)
  };

  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (response.status === 200) {
      return normalizePageDeleteSucceededResult(response.body);
    }

    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 500
    ) {
      return normalizePageDeleteFailedResult(response.body, SAFE_PAGE_DELETE_ERROR_MESSAGE);
    }

    return {
      state: "failed",
      errorMessage: SAFE_PAGE_DELETE_ERROR_MESSAGE
    };
  } catch {
    return {
      state: "failed",
      errorMessage: SAFE_PAGE_DELETE_ERROR_MESSAGE
    };
  }
}

export function createServiceNowClient(runtime: DocseraRuntimeContext): ServiceNowClient {
  const collectionPath = resolvePath(runtime.config.workspaceCollectionPath, DEFAULT_WORKSPACE_COLLECTION_PATH);
  const pageCollectionPath = resolvePath(runtime.config.pageCollectionPath, DEFAULT_PAGE_COLLECTION_PATH);
  const pageDeleteActionPath = resolvePageDeleteActionPath(pageCollectionPath);
  const pageEditLockStatusPath = resolvePageEditLockPath(pageCollectionPath, "status");
  const pageEditLockAcquirePath = resolvePageEditLockPath(pageCollectionPath, "acquire");
  const pageEditLockHeartbeatPath = resolvePageEditLockPath(pageCollectionPath, "heartbeat");
  const pageEditLockReleasePath = resolvePageEditLockPath(pageCollectionPath, "release");
  const provisioningStatusPath = resolvePath(
    runtime.config.workspaceProvisioningStatusPath,
    "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status"
  );

  return {
    async ping(): Promise<PingResult> {
      const pingPath = runtime.config.backendPingPath;

      if (!pingPath) {
        throw new Error("No backend ping path configured.");
      }

      const payload = await requestJson<PingEnvelope>(pingPath);
      if (!payload.body) {
        throw new Error("Ping payload was invalid.");
      }

      return normalizePingPayload(payload.body);
    },

    async listWorkspaces(input = {}): Promise<WorkspaceListResult> {
      const path = new URL(collectionPath, window.location.origin);
      const searchText = cleanText(input.searchText);
      const page = Number(input.page) || 1;
      const pageSize = Number(input.pageSize) || 10;

      if (searchText) {
        path.searchParams.set("q", searchText);
      }

      path.searchParams.set("page", String(page));
      path.searchParams.set("pageSize", String(pageSize));

      const response = await requestJson<unknown>(path.pathname + path.search);
      return normalizeWorkspaceListResult(response.body);
    },

    async getWorkspace(workspaceSlug: string): Promise<WorkspaceLookupResult> {
      const path = new URL(collectionPath, window.location.origin);
      path.searchParams.set("workspaceSlug", cleanText(workspaceSlug));

      const response = await requestJson<unknown>(path.pathname + path.search);
      return normalizeWorkspaceLookupResult(response.body);
    },

    async listPages(input: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> {
      const path = new URL(pageCollectionPath, window.location.origin);
      path.searchParams.set("workspaceSlug", cleanText(input.workspaceSlug));
      if (input.mode === "edit") {
        path.searchParams.set("mode", "edit");
      }

      const response = await requestJson<unknown>(path.pathname + path.search);

      if (response.status === 200) {
        return normalizePageListResult(response.body);
      }

      if (response.status === 400 || response.status === 403 || response.status === 404) {
        throw new Error(extractErrorMessage(response.body, "Unable to load pages."));
      }

      throw new Error(`HTTP ${response.status}`);
    },

    async createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
      return resolveWorkspaceCreateResult(collectionPath, input);
    },

    async getWorkspaceProvisioningStatus(statusPath: string): Promise<WorkspaceCreateResult> {
      const targetPath = cleanText(statusPath) || provisioningStatusPath;
      return resolveWorkspaceProvisioningStatus(targetPath);
    },

    async createPage(input: PageCreateInput): Promise<PageCreateResult> {
      return resolvePageCreateResult(pageCollectionPath, input);
    },

    async getPageEditLockStatus(input: PageEditLockReferenceInput): Promise<PageEditLockStatusResult> {
      return resolvePageEditLockStatusResult(pageEditLockStatusPath, input);
    },

    async acquirePageEditLock(input: PageEditLockReferenceInput): Promise<PageEditLockAcquireResult> {
      return resolvePageEditLockAcquireResult(pageEditLockAcquirePath, input);
    },

    async heartbeatPageEditLock(input: PageEditLockReferenceInput): Promise<PageEditLockHeartbeatResult> {
      return resolvePageEditLockHeartbeatResult(pageEditLockHeartbeatPath, input);
    },

    async releasePageEditLock(input: PageEditLockReferenceInput & { keepalive?: boolean }): Promise<PageEditLockReleaseResult> {
      return resolvePageEditLockReleaseResult(pageEditLockReleasePath, input);
    },

    async savePageBody(input: PageBodySaveInput): Promise<PageBodySaveResult> {
      return resolvePageBodySaveResult(pageCollectionPath, input);
    },

    async savePageSettings(input: PageSettingsSaveInput): Promise<PageSettingsSaveResult> {
      return resolvePageSettingsSaveResult(pageCollectionPath, input);
    },

    async deletePage(input: PageDeleteInput): Promise<PageDeleteResult> {
      return resolvePageDeleteResult(pageDeleteActionPath, input);
    }
  };
}
