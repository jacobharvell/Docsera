import type {
  DocseraRuntimeContext,
  PingEnvelope,
  PingResult,
  RawPingPayload,
  ServiceNowClient,
  WorkspaceCreateFailed,
  WorkspaceCreateInput,
  WorkspaceCreatePending,
  WorkspaceCreateResult,
  WorkspaceCreateSucceeded,
  WorkspaceListResult,
  WorkspaceLookupResult,
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

function resolvePath(value: string | undefined, fallback: string): string {
  return cleanText(value) || fallback;
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
  const result: RawPingPayload =
    "result" in payload && payload.result ? payload.result : (payload as RawPingPayload);

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

function extractErrorMessage(body: unknown, fallback: string): string {
  const result = body && typeof body === "object" ? (body as Record<string, unknown>).error : undefined;
  const nestedMessage =
    result && typeof result === "object" ? cleanText((result as Record<string, unknown>).message) : "";
  return nestedMessage || fallback;
}

function extractResult(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const candidate = (body as Record<string, unknown>).result;
  return candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : null;
}

function normalizeWorkspaceListResult(body: unknown): WorkspaceListResult {
  const result = extractResult(body);
  if (!result) {
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
  const result = extractResult(body);
  if (!result || !("workspace" in result)) {
    throw new Error("Workspace payload was invalid.");
  }

  const workspace = result.workspace ? normalizeWorkspaceViewRecord(result.workspace) : null;

  return {
    workspace
  };
}

function normalizeWorkspaceCreateSucceededResult(body: unknown): WorkspaceCreateSucceeded {
  const result = extractResult(body);
  if (!result || !result.workspace) {
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
  const result = extractResult(body);
  if (!result || !result.provisioning) {
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
  const result = extractResult(body);
  const provisioning = result?.provisioning && typeof result.provisioning === "object" ? (result.provisioning as Record<string, unknown>) : null;

  return {
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback),
    requestId: cleanText(provisioning?.requestId),
    statusPath: cleanText(provisioning?.statusPath)
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
    const result = extractResult(response.body);
    if (!result || !result.provisioning) {
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

export function createServiceNowClient(runtime: DocseraRuntimeContext): ServiceNowClient {
  const collectionPath = resolvePath(runtime.config.workspaceCollectionPath, DEFAULT_WORKSPACE_COLLECTION_PATH);
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

    async createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
      return resolveWorkspaceCreateResult(collectionPath, input);
    },

    async getWorkspaceProvisioningStatus(statusPath: string): Promise<WorkspaceCreateResult> {
      const targetPath = cleanText(statusPath) || provisioningStatusPath;
      return resolveWorkspaceProvisioningStatus(targetPath);
    }
  };
}
