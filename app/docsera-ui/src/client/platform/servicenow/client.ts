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
  PagePublishFailed,
  PagePublishInput,
  PagePublishResult,
  PagePublishSucceeded,
  PageEditLockAcquireResult,
  PageEditLockFailed,
  PageEditLockHeartbeatResult,
  PageEditLockHeld,
  PageEditLockLocked,
  PageEditLockReferenceInput,
  PageEditLockReleaseResult,
  PageEditLockStatusResult,
  WorkspaceEditLeaseAcquireResult,
  WorkspaceEditLeaseFailed,
  WorkspaceEditLeaseHeld,
  WorkspaceEditLeaseLocked,
  WorkspaceEditLeaseLost,
  WorkspaceEditLeaseReferenceInput,
  WorkspaceEditLeaseReleaseResult,
  WorkspaceEditLeaseRenewResult,
  WorkspaceEditLeaseStatusResult,
  WorkspacePendingChangeCategory,
  WorkspacePendingChangesResult,
  WorkspaceDiscardPageFailed,
  WorkspaceDiscardPageInput,
  WorkspaceDiscardPageResult,
  WorkspaceDiscardPageSucceeded,
  WorkspaceDiscardAllFailed,
  WorkspaceDiscardAllInput,
  WorkspaceDiscardAllResult,
  WorkspaceDiscardAllSucceeded,
  WorkspacePublishFailed,
  WorkspacePublishInput,
  WorkspacePublishResult,
  WorkspacePublishSucceeded,
  PageDeleteFailed,
  PageDeleteInput,
  PageDeleteResult,
  PageDeleteSucceeded,
  PageMoveFailed,
  PageMoveInput,
  PageMoveResult,
  PageMoveSucceeded,
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
  WorkspaceSettingsSaveInput,
  WorkspaceSettingsSaveResult,
  WorkspaceMemberAccessLevel,
  WorkspaceMemberCallerCapabilities,
  WorkspaceMemberRecord,
  WorkspaceMemberMutationResult,
  WorkspaceMemberUserSearchRecord,
  WorkspaceMemberUserSearchResult,
  WorkspaceMembersResult,
  WorkspaceListResult,
  PageListResult,
  WorkspaceLookupResult,
  WorkspaceMode,
  WorkspaceViewRecord,
  WorkspaceMediaDescriptor,
  WorkspaceMediaFailure,
  WorkspaceMediaListResult,
  WorkspaceMediaUploadResult,
  WorkspaceIconUploadResult
} from "../../shared/types/docsera";
import { fingerprintDiagnosticSecret, recordDocseraDiagnosticEvent } from "../../diagnostics";
import { normalizeNumericSiblingOrder } from "../../../shared/pages/siblingOrder";

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
const DEFAULT_WORKSPACE_MEDIA_COLLECTION_PATH = "/api/x_82900_docsera/docsera_runtime/workspaces/media";
const DEFAULT_WORKSPACE_MEDIA_FILE_PATH = "/api/x_82900_docsera/docsera_runtime/workspaces/media/file";
const DEFAULT_WORKSPACE_ICON_COLLECTION_PATH = "/api/x_82900_docsera/docsera_runtime/workspaces/icons";
const DEFAULT_WORKSPACE_SETTINGS_PATH = "/api/x_82900_docsera/docsera_runtime/workspaces/settings";
const DEFAULT_WORKSPACE_MEMBERS_PATH = "/api/x_82900_docsera/docsera_runtime/workspaces/members";
const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";
const SAFE_PAGE_DELETE_ERROR_MESSAGE = "Something went wrong while deleting the page. The page was not deleted. Please try again.";
const SAFE_PAGE_MOVE_ERROR_MESSAGE = "Something went wrong while moving the page. The page was not moved. Please try again.";
const SAFE_WORKSPACE_DISCARD_PAGE_ERROR_MESSAGE = "Something went wrong while discarding changes to this page. No changes were discarded. Please try again.";
const SAFE_WORKSPACE_DISCARD_ALL_ERROR_MESSAGE = "Something went wrong while discarding changes. No changes were discarded. Please try again.";
const SAFE_WORKSPACE_PUBLISH_ERROR_MESSAGE = "Something went wrong while publishing. No changes were published. Please try again.";
const SAFE_WORKSPACE_MEDIA_LIST_ERROR_MESSAGE = "Unable to load workspace media. Please try again.";
const SAFE_WORKSPACE_MEDIA_UPLOAD_ERROR_MESSAGE = "Something went wrong while uploading media. The file was not saved. Please try again.";
const SAFE_WORKSPACE_ICON_UPLOAD_ERROR_MESSAGE = "Something went wrong while uploading the workspace icon. The file was not saved. Please try again.";
const SAFE_WORKSPACE_MEMBERS_ERROR_MESSAGE = "Unable to load workspace members. Please try again.";
const SAFE_WORKSPACE_MEMBER_MUTATION_ERROR_MESSAGE = "Unable to update workspace access. Please try again.";
const SAFE_WORKSPACE_MEMBER_SEARCH_ERROR_MESSAGE = "Unable to search users. Please try again.";

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

function readSafeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function readPositiveDuration(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
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

function resolvePageMovePath(pageCollectionPath: string): string {
  const normalizedPath = cleanText(pageCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/move`;
}

function resolvePageEditLockPath(pageCollectionPath: string, action: "acquire" | "heartbeat" | "release" | "status"): string {
  const normalizedPath = cleanText(pageCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/edit-lock/${action}`;
}

function resolvePagePublishPath(pageCollectionPath: string): string {
  const normalizedPath = cleanText(pageCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/publish`;
}

function resolveWorkspaceEditLeasePath(pageCollectionPath: string, action: "acquire" | "resume" | "renew" | "release" | "status"): string {
  const normalizedPath = cleanText(pageCollectionPath).replace(/\/pages$/i, "").replace(/\/+$/g, "");
  return `${normalizedPath}/workspaces/edit-lease/${action}`;
}

function resolveWorkspacePendingChangesPath(pageCollectionPath: string): string {
  const normalizedPath = cleanText(pageCollectionPath).replace(/\/pages$/i, "").replace(/\/+$/g, "");
  return `${normalizedPath}/workspaces/pending-changes`;
}

function resolveWorkspacePublishPath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/publish`;
}

function resolveWorkspaceDiscardAllPath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/discard-all`;
}

function resolveWorkspaceDiscardPagePath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return `${normalizedPath}/discard-page`;
}

function resolveWorkspaceMediaCollectionPath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return normalizedPath.endsWith("/workspaces") ? `${normalizedPath}/media` : DEFAULT_WORKSPACE_MEDIA_COLLECTION_PATH;
}

function resolveWorkspaceMediaFilePath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return normalizedPath.endsWith("/workspaces") ? `${normalizedPath}/media/file` : DEFAULT_WORKSPACE_MEDIA_FILE_PATH;
}

function resolveWorkspaceIconCollectionPath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return normalizedPath.endsWith("/workspaces") ? `${normalizedPath}/icons` : DEFAULT_WORKSPACE_ICON_COLLECTION_PATH;
}

function resolveWorkspaceSettingsPath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return normalizedPath.endsWith("/workspaces") ? `${normalizedPath}/settings` : DEFAULT_WORKSPACE_SETTINGS_PATH;
}

function resolveWorkspaceMembersPath(workspaceCollectionPath: string): string {
  const normalizedPath = cleanText(workspaceCollectionPath).replace(/\/+$/g, "");
  return normalizedPath.endsWith("/workspaces") ? `${normalizedPath}/members` : DEFAULT_WORKSPACE_MEMBERS_PATH;
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

async function requestRaw(path: string, init: RequestInit = {}): Promise<JsonResponse<unknown>> {
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

  let body: unknown = null;

  if (typeof response.text === "function") {
    const text = await response.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
    }
  } else if (typeof response.json === "function") {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  return {
    body,
    status: response.status
  };
}

async function requestBinary(path: string, init: RequestInit = {}): Promise<Blob | null> {
  const userToken = resolveUserToken();

  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        Accept: "image/*",
        ...(init.headers ?? {}),
        ...(userToken ? { "X-UserToken": userToken } : {})
      }
    });

    if (response.status !== 200 || typeof response.blob !== "function") {
      return null;
    }

    return await response.blob();
  } catch {
    return null;
  }
}

function normalizePingPayload(payload: PingEnvelope): PingResult {
  const normalizedPayload = unwrapServiceNowEnvelope(payload);
  const result: RawPingPayload = isPlainObject(normalizedPayload) ? (normalizedPayload as RawPingPayload) : (payload as RawPingPayload);

  return {
    authenticated: Boolean(result.authenticated),
    scope: result.scope ?? "unknown",
    status: result.status ?? "unknown",
    timestamp: result.timestamp ?? "unknown",
    userDisplayName: cleanText(result.userDisplayName ?? result.user_display_name) || "unknown",
    userName: result.userName ?? result.user_name ?? "unknown",
    userSysId: result.userSysId ?? result.user_sys_id ?? "unknown"
  };
}

function normalizeWorkspaceViewRecord(candidate: unknown): WorkspaceViewRecord {
  const workspace = candidate as Partial<WorkspaceViewRecord> & {
    icon?: WorkspaceViewRecord["icon"] | null;
    layout?: Partial<WorkspaceViewRecord["layout"]> | null;
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
    layout: {
      tocVisible:
        typeof workspace.layout?.tocVisible === "boolean" ? workspace.layout.tocVisible : true
    },
    status: workspace.status === "inactive" ? "inactive" : "active",
    roleLabel: workspace.roleLabel === "Admin" ? "Admin" : workspace.roleLabel === "Editor" ? "Editor" : null,
    canManageWorkspaceMembers: Boolean(workspace.canManageWorkspaceMembers),
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
    siblingOrder: normalizeNumericSiblingOrder(page.siblingOrder),
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
    publishedAt: cleanText(page.publishedAt) || null,
    publishedBySysId: cleanText(page.publishedBySysId) || null,
    publishedByDisplayName: cleanText(page.publishedByDisplayName) || null,
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
    canCreateWorkspaces: Boolean(result.canCreateWorkspaces),
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

function normalizeWorkspaceMember(candidate: unknown): WorkspaceMemberRecord {
  if (!isPlainObject(candidate)) {
    throw new Error("Workspace member payload was invalid.");
  }
  const accessLevel = cleanText(candidate.accessLevel) === "admin" ? "admin" : "editor";
  return {
    accessLevel,
    active: typeof candidate.active === "boolean" ? candidate.active : Boolean(candidate.active),
    displayName: cleanText(candidate.displayName),
    email: cleanText(candidate.email),
    userName: cleanText(candidate.userName),
    userSysId: cleanText(candidate.userSysId)
  };
}

function normalizeWorkspaceMemberUser(candidate: unknown): WorkspaceMemberUserSearchRecord {
  if (!isPlainObject(candidate)) {
    throw new Error("Workspace user payload was invalid.");
  }
  return {
    displayName: cleanText(candidate.displayName),
    email: cleanText(candidate.email),
    userName: cleanText(candidate.userName),
    userSysId: cleanText(candidate.userSysId)
  };
}

function normalizeMemberCapabilities(candidate: unknown): WorkspaceMemberCallerCapabilities {
  return {
    canManageWorkspaceMembers: isPlainObject(candidate) ? Boolean(candidate.canManageWorkspaceMembers) : false
  };
}

function normalizeWorkspaceMembersResult(body: unknown): Extract<WorkspaceMembersResult, { state: "succeeded" }> {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.members)) {
    throw new Error("Workspace members payload was invalid.");
  }
  return {
    callerCapabilities: normalizeMemberCapabilities(result.callerCapabilities),
    members: result.members.map((item) => normalizeWorkspaceMember(item)),
    state: "succeeded"
  };
}

function normalizeWorkspaceMemberMutationResult(body: unknown): Extract<WorkspaceMemberMutationResult, { state: "succeeded" }> {
  const result = normalizeWorkspaceMembersResult(body);
  const payload = unwrapServiceNowEnvelope(body);
  return {
    ...result,
    member: isPlainObject(payload) && payload.member ? normalizeWorkspaceMember(payload.member) : null
  };
}

function normalizeWorkspaceMemberUserSearchResult(body: unknown): Extract<WorkspaceMemberUserSearchResult, { state: "succeeded" }> {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.users)) {
    throw new Error("Workspace user search payload was invalid.");
  }
  return {
    callerCapabilities: normalizeMemberCapabilities(result.callerCapabilities),
    state: "succeeded",
    users: result.users.map((item) => normalizeWorkspaceMemberUser(item))
  };
}

function normalizeWorkspaceMembersFailedResult(body: unknown, status: number, fallback: string): WorkspaceMembersResult & { state: "failed" } {
  return {
    code: status === 403 ? "forbidden" : status === 400 ? "invalid" : status === 404 ? "not_found" : "transient",
    errorMessage: extractErrorMessage(body, fallback),
    retryable: status >= 500,
    state: "failed"
  };
}

function normalizeWorkspaceMediaDescriptor(candidate: unknown): WorkspaceMediaDescriptor {
  if (!isPlainObject(candidate)) {
    throw new Error("Workspace media payload was invalid.");
  }

  const contentType = cleanText(candidate.contentType) as WorkspaceMediaDescriptor["contentType"];
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)) {
    throw new Error("Workspace media payload was invalid.");
  }

  return {
    contentType,
    createdOn: cleanText(candidate.createdOn),
    fileName: cleanText(candidate.fileName),
    mediaId: cleanText(candidate.mediaId),
    sizeBytes: Number(candidate.sizeBytes) || 0,
    updatedOn: cleanText(candidate.updatedOn)
  };
}

function normalizeWorkspaceMediaFailedResult(body: unknown, fallback: string): WorkspaceMediaFailure {
  return {
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback)
  };
}

function normalizeWorkspaceMediaListResult(body: unknown): WorkspaceMediaListResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.items)) {
    throw new Error("Workspace media list payload was invalid.");
  }

  return {
    state: "succeeded",
    items: result.items.map((item) => normalizeWorkspaceMediaDescriptor(item))
  };
}

function normalizeWorkspaceMediaUploadResult(body: unknown): WorkspaceMediaUploadResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.media) {
    throw new Error("Workspace media upload payload was invalid.");
  }

  return {
    state: "succeeded",
    media: normalizeWorkspaceMediaDescriptor(result.media)
  };
}

function normalizeWorkspaceIconUploadResult(body: unknown): WorkspaceIconUploadResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !isPlainObject(result.asset)) {
    throw new Error("Workspace icon upload payload was invalid.");
  }

  const asset = result.asset;
  const key = cleanText(asset.assetKey);
  const label = cleanText(asset.fileName);
  const assetPath = cleanText(asset.url);
  const contentType = cleanText(asset.contentType);
  const sizeBytes = typeof asset.sizeBytes === "number" && Number.isFinite(asset.sizeBytes) ? asset.sizeBytes : null;
  const width = typeof asset.width === "number" && Number.isFinite(asset.width) ? asset.width : null;
  const height = typeof asset.height === "number" && Number.isFinite(asset.height) ? asset.height : null;
  if (!key || !label || !assetPath || !contentType || sizeBytes === null || width === null || height === null) {
    throw new Error("Workspace icon upload payload was invalid.");
  }

  return {
    state: "succeeded",
    icon: {
      type: "uploaded",
      key,
      label,
      assetPath
    }
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

function normalizeWorkspaceSettingsSaveSucceededResult(body: unknown): WorkspaceSettingsSaveResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.workspace) {
    throw new Error("Workspace settings payload was invalid.");
  }

  return {
    state: "succeeded",
    workspace: normalizeWorkspaceViewRecord(result.workspace)
  };
}

function normalizeWorkspaceSettingsSaveFailedResult(body: unknown, fallback: string): WorkspaceSettingsSaveResult {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);

  return {
    state: "failed",
    code:
      code === "workspace_settings_forbidden"
        ? "forbidden"
        : code === "workspace_not_found"
          ? "not_found"
          : code === "workspace_settings_invalid"
            ? "invalid"
            : undefined,
    errorMessage: extractErrorMessage(body, fallback)
  };
}

function normalizeWorkspaceLeaseHeldResult(
  body: unknown,
  action: "acquire" | "resume" | "renew" | "status"
): WorkspaceEditLeaseHeld | WorkspaceEditLeaseStatusResult | WorkspaceEditLeaseFailed {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || result.state !== "held") {
    return {
      state: "failed",
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal",
      retryable: false
    };
  }

  const changeSetId = cleanText(result.changeSetId);
  const changeSetRevision = readSafeInteger(result.changeSetRevision);
  const workspaceStateRevision =
    result.workspaceStateRevision === undefined || result.workspaceStateRevision === null
      ? undefined
      : readSafeInteger(result.workspaceStateRevision);
  const heartbeatIntervalMs = readPositiveDuration(result.heartbeatIntervalMs);
  const staleAfterMs = readPositiveDuration(result.staleAfterMs);
  const leaseToken = cleanText(result.leaseToken);
  const requiresLeaseToken = action !== "status";

  if (
    !changeSetId ||
    changeSetRevision === null ||
    heartbeatIntervalMs === null ||
    staleAfterMs === null ||
    (result.workspaceStateRevision !== undefined && result.workspaceStateRevision !== null && workspaceStateRevision === null) ||
    (requiresLeaseToken && !leaseToken) ||
    (!requiresLeaseToken && leaseToken)
  ) {
    return {
      state: "failed",
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal",
      retryable: false
    };
  }

  const held = {
    state: "held" as const,
    heartbeatIntervalMs,
    staleAfterMs,
    changeSetId,
    changeSetRevision,
    ...(typeof workspaceStateRevision === "number" ? { workspaceStateRevision } : {})
  };

  return requiresLeaseToken ? { ...held, leaseToken } : held;
}

function normalizePageCreateSucceededResult(body: unknown): PageCreateSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.page) {
    throw new Error("Page creation payload was invalid.");
  }

  return {
    state: "succeeded",
    page: normalizePageRecord(result.page),
    changeSetId: cleanText(result.changeSetId) || undefined,
    changeSetRevision: readSafeInteger(result.changeSetRevision) ?? undefined
  };
}

function normalizeWorkspaceLeaseLockedResult(candidate: unknown): WorkspaceEditLeaseLocked {
  const result = isPlainObject(candidate) ? candidate : {};

  return {
    state: "locked",
    holderDisplayName: cleanText(result.holderDisplayName) || null,
    sameUserDifferentSession: Boolean(result.sameUserDifferentSession)
  };
}

function normalizeWorkspaceLeaseLostResult(candidate: unknown): WorkspaceEditLeaseLost {
  const result = isPlainObject(candidate) ? candidate : {};

  return {
    state: "lost",
    errorMessage: cleanText(result.errorMessage) || "This workspace edit session ended and unsaved changes were not saved.",
    holderDisplayName: cleanText(result.holderDisplayName) || null,
    sameUserDifferentSession: Boolean(result.sameUserDifferentSession)
  };
}

function normalizeWorkspaceLeaseFailedResult(candidate: unknown): WorkspaceEditLeaseFailed {
  const result = isPlainObject(candidate) ? candidate : {};
  const nestedErrorMessage =
    result.error && typeof result.error === "object" ? cleanText((result.error as Record<string, unknown>).message) : "";

  return {
    state: "failed",
    errorMessage: cleanText(result.errorMessage) || cleanText(result.message) || nestedErrorMessage || "Workspace editing is unavailable.",
    failure: "terminal",
    retryable: false
  };
}

function normalizePendingChangeCategory(value: unknown): WorkspacePendingChangeCategory | null {
  const category = cleanText(value);
  return category === "Added" || category === "Modified" || category === "Moved" || category === "Modified Ã‚Â· Moved" || category === "Removed"
    ? category
    : null;
}

function normalizeWorkspacePendingChangesSucceededResult(body: unknown): WorkspacePendingChangesResult {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.rows)) {
    throw new Error("Pending changes payload was invalid.");
  }
  const rows = result.rows.map((candidate) => {
    if (!isPlainObject(candidate)) {
      throw new Error("Pending changes row was invalid.");
    }
    const category = normalizePendingChangeCategory(candidate.category);
    const pageSysId = cleanText(candidate.pageSysId);
    if (!category || !pageSysId) {
      throw new Error("Pending changes row was invalid.");
    }
    const attribution = isPlainObject(candidate.attribution) ? candidate.attribution : {};
    return {
      attribution: {
        accessibleLabel: cleanText(attribution.accessibleLabel) || "Last changed by Unknown user",
        displayName: cleanText(attribution.displayName) || "Unknown user",
        fullDisplayName: cleanText(attribution.fullDisplayName) || cleanText(attribution.displayName) || "Unknown user"
      },
      category,
      firstPendingSequence: readSafeInteger(candidate.firstPendingSequence) ?? 0,
      lastChangedOn: cleanText(candidate.lastChangedOn),
      navigable: Boolean(candidate.navigable) && category !== "Removed",
      pageSysId,
      title: cleanText(candidate.title) || "Untitled page"
    };
  });
  const changeSetId = cleanText(result.changeSetId);
  const changeSetRevision = readSafeInteger(result.changeSetRevision);
  if (!changeSetId || changeSetRevision === null) {
    throw new Error("Pending changes generation pair was invalid.");
  }
  return {
    affectedPageCount: readSafeInteger(result.affectedPageCount) ?? rows.length,
    changeSetId,
    changeSetRevision,
    rows,
    state: "succeeded",
    workspaceSysId: cleanText(result.workspaceSysId)
  };
}

function normalizeWorkspacePublishSucceededResult(body: unknown): WorkspacePublishSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.pages) || !isPlainObject(result.pendingChanges)) {
    throw new Error("Workspace publish payload was invalid.");
  }
  const changeSetId = cleanText(result.changeSetId);
  const changeSetRevision = readSafeInteger(result.changeSetRevision);
  const workspaceStateRevision = readSafeInteger(result.workspaceStateRevision);
  if (!changeSetId || changeSetRevision === null || workspaceStateRevision === null) {
    throw new Error("Workspace publish authority payload was invalid.");
  }
  const pendingChanges = normalizeWorkspacePendingChangesSucceededResult({ result: result.pendingChanges });
  if (pendingChanges.state !== "succeeded") {
    throw new Error("Workspace publish pending payload was invalid.");
  }
  return {
    state: "succeeded",
    changeSetId,
    changeSetRevision,
    pages: result.pages.map((page) => normalizePageRecord(page)),
    pendingChanges,
    publishedSnapshotSetId: cleanText(result.publishedSnapshotSetId),
    workspaceStateRevision
  };
}

function normalizeWorkspaceDiscardAllSucceededResult(body: unknown): WorkspaceDiscardAllSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.pages) || !isPlainObject(result.pendingChanges)) {
    throw new Error("Workspace discard-all payload was invalid.");
  }
  const changeSetId = cleanText(result.changeSetId);
  const changeSetRevision = readSafeInteger(result.changeSetRevision);
  const workspaceStateRevision = readSafeInteger(result.workspaceStateRevision);
  if (!changeSetId || changeSetRevision === null || workspaceStateRevision === null) {
    throw new Error("Workspace discard-all authority payload was invalid.");
  }
  const pendingChanges = normalizeWorkspacePendingChangesSucceededResult({ result: result.pendingChanges });
  if (pendingChanges.state !== "succeeded") {
    throw new Error("Workspace discard-all pending payload was invalid.");
  }
  return {
    state: "succeeded",
    changeSetId,
    changeSetRevision,
    pages: result.pages.map((page) => normalizePageRecord(page)),
    pendingChanges,
    workspaceStateRevision
  };
}

function normalizeWorkspaceDiscardPageSucceededResult(body: unknown): WorkspaceDiscardPageSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.pages) || !isPlainObject(result.pendingChanges)) {
    throw new Error("Workspace discard-page payload was invalid.");
  }
  const changeSetId = cleanText(result.changeSetId);
  const changeSetRevision = readSafeInteger(result.changeSetRevision);
  const workspaceStateRevision = readSafeInteger(result.workspaceStateRevision);
  const discardedPageSysId = cleanText(result.discardedPageSysId);
  if (!changeSetId || changeSetRevision === null || workspaceStateRevision === null || !discardedPageSysId) {
    throw new Error("Workspace discard-page authority payload was invalid.");
  }
  const pendingChanges = normalizeWorkspacePendingChangesSucceededResult({ result: result.pendingChanges });
  if (pendingChanges.state !== "succeeded") {
    throw new Error("Workspace discard-page pending payload was invalid.");
  }
  return {
    state: "succeeded",
    changeSetId,
    changeSetRevision,
    discardedPageSysId,
    pages: result.pages.map((page) => normalizePageRecord(page)),
    pendingChanges,
    workspaceStateRevision
  };
}

function normalizeWorkspacePublishFailedResult(body: unknown, fallback: string): WorkspacePublishFailed {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);
  return {
    state: "failed",
    code:
      code === "workspace_lease_lost" || code === "workspace_locked"
        ? "lock_lost"
        : code === "forbidden"
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
          : code === "conflict" || code === "stale_generation"
            ? "conflict"
            : code === "invalid" || code === "validation"
              ? "invalid"
              : code === "publish_failed"
                ? "failed"
                : undefined,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    errorMessage: extractErrorMessage(body, fallback),
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined,
    retryable: code === "publish_failed"
  };
}

function normalizeWorkspaceDiscardAllFailedResult(body: unknown, fallback: string): WorkspaceDiscardAllFailed {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);
  return {
    affectedPageCount: readSafeInteger(errorObject?.affectedPageCount) ?? undefined,
    state: "failed",
    code:
      code === "workspace_lease_lost" || code === "workspace_locked"
        ? "lock_lost"
        : code === "forbidden"
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
          : code === "conflict" || code === "stale_generation"
            ? "conflict"
            : code === "invalid" || code === "validation"
              ? "invalid"
              : code === "discard_all_failed"
                ? "failed"
                : undefined,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    errorMessage: extractErrorMessage(body, fallback),
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined,
    retryable: code === "discard_all_failed" || code === "recovery_required"
  };
}

function normalizeWorkspaceDiscardPageFailedResult(body: unknown, fallback: string): WorkspaceDiscardPageFailed {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);
  return {
    state: "failed",
    code:
      code === "workspace_lease_lost" || code === "workspace_locked"
        ? "lock_lost"
        : code === "forbidden"
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
          : code === "conflict" || code === "stale_generation"
            ? "conflict"
            : code === "invalid" || code === "validation"
              ? "invalid"
              : code === "discard_page_failed"
                ? "failed"
                : undefined,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    errorMessage: extractErrorMessage(body, fallback),
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined,
    retryable: code === "discard_page_failed" || code === "recovery_required"
  };
}

function isWorkspaceEditLeaseStateAllowed(action: "acquire" | "resume" | "renew" | "release" | "status", state: string): boolean {
  switch (action) {
    case "acquire":
      return state === "held" || state === "locked" || state === "failed";
    case "resume":
    case "renew":
      return state === "held" || state === "lost" || state === "failed";
    case "release":
      return state === "released" || state === "lost" || state === "failed";
    case "status":
      return state === "held" || state === "unlocked" || state === "locked" || state === "failed";
  }
}

function resolveMutationAuthority(input: {
  workspaceAuthority?: { changeSetId: string; changeSetRevision: number };
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
  workspaceLeaseToken?: string;
}) {
  const authorityId = cleanText(input.workspaceAuthority?.changeSetId) || cleanText(input.expectedChangeSetId);
  const authorityRevision =
    readSafeInteger(input.workspaceAuthority?.changeSetRevision) ?? readSafeInteger(input.expectedChangeSetRevision);
  if (cleanText(input.workspaceLeaseToken) && (!authorityId || authorityRevision === null)) {
    throw new Error("A workspace mutation authority is required for persisted mutations.");
  }
  return authorityId && authorityRevision !== null
    ? { expectedChangeSetId: authorityId, expectedChangeSetRevision: authorityRevision }
    : null;
}

function normalizePageCreateFailedResult(body: unknown, fallback: string): PageCreateFailed {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);
  return {
    affectedPageCount: readSafeInteger(errorObject?.affectedPageCount) ?? undefined,
    state: "failed",
    code:
      code === "workspace_lease_lost" || code === "workspace_locked"
        ? "lock_lost"
        : code === "forbidden"
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
          : code === "conflict" || code === "stale_generation"
            ? "conflict"
            : code === "invalid" || code === "validation"
              ? "invalid"
              : undefined,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    errorMessage: extractErrorMessage(body, fallback),
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined
  };
}

function normalizePageBodySaveSucceededResult(body: unknown): PageBodySaveSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.page) {
    throw new Error("Page save payload was invalid.");
  }

  return {
    state: "succeeded",
    page: normalizePageRecord(result.page),
    changeSetId: cleanText(result.changeSetId) || undefined,
    changeSetRevision: readSafeInteger(result.changeSetRevision) ?? undefined
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

function normalizePagePublishSucceededResult(body: unknown): PagePublishSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !result.page) {
    throw new Error("Page publish payload was invalid.");
  }

  return {
    state: "succeeded",
    page: normalizePageRecord(result.page)
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
      : errorCode === "workspace_lease_lost" || errorCode === "workspace_locked"
        ? "lock_lost"
              : errorCode === "recovery_required"
                ? "recovery_required"
              : errorCode === "persistence_transient"
                ? "transient"
                : fallbackCode;

  return {
    affectedPageCount: readSafeInteger(errorObject?.affectedPageCount) ?? undefined,
    code: normalizedCode,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    currentRevision: Number.isSafeInteger(currentRevision) && currentRevision >= 0 ? currentRevision : undefined,
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined,
    retryable: normalizedCode === "transient" ? true : fallbackRetryable,
    state: "failed",
    errorMessage: extractErrorMessage(body, fallback)
  };
}

function normalizePagePublishFailedResult(
  body: unknown,
  fallback: string,
  fallbackCode: PagePublishFailed["code"],
  fallbackRetryable: boolean
): PagePublishFailed {
  const normalizedBody = unwrapServiceNowEnvelope(body);
  const errorObject =
    normalizedBody && typeof normalizedBody === "object" && "error" in normalizedBody
      ? ((normalizedBody as Record<string, unknown>).error as Record<string, unknown> | undefined)
      : undefined;
  const errorCode = cleanText(errorObject?.code);
  const currentRevision = Number(errorObject?.currentRevision);
  const normalizedCode: PagePublishFailed["code"] =
    errorCode === "draft_revision_conflict"
      ? "conflict"
      : errorCode === "forbidden"
        ? "forbidden"
        : errorCode === "invalid"
          ? "invalid"
          : errorCode === "persistence_invariant"
            ? "persistence_invariant"
            : errorCode === "workspace_lease_lost" || errorCode === "workspace_locked"
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
    page: normalizePageRecord(result.page),
    changeSetId: cleanText(result.changeSetId) || undefined,
    changeSetRevision: readSafeInteger(result.changeSetRevision) ?? undefined
  };
}

function normalizePageSettingsSaveFailedResult(body: unknown, fallback: string): PageSettingsSaveFailed {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);
  return {
    affectedPageCount: readSafeInteger(errorObject?.affectedPageCount) ?? undefined,
    state: "failed",
    code:
      code === "workspace_lease_lost" || code === "workspace_locked"
        ? "lock_lost"
        : code === "forbidden"
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
          : code === "conflict" || code === "stale_generation"
            ? "conflict"
            : code === "invalid" || code === "validation"
              ? "invalid"
              : undefined,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    errorMessage: extractErrorMessage(body, fallback),
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined
  };
}

function normalizePageDeleteSucceededResult(body: unknown): PageDeleteSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result)) {
    throw new Error("Page delete payload was invalid.");
  }

  return {
    state: "succeeded",
    nextPageSysId: cleanText(result.nextPageSysId),
    changeSetId: cleanText(result.changeSetId) || undefined,
    changeSetRevision: readSafeInteger(result.changeSetRevision) ?? undefined
  };
}

function normalizePageDeleteFailedResult(body: unknown, fallback: string): PageDeleteFailed {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);
  return {
    affectedPageCount: readSafeInteger(errorObject?.affectedPageCount) ?? undefined,
    state: "failed",
    code:
      code === "workspace_lease_lost" || code === "workspace_locked"
        ? "lock_lost"
        : code === "forbidden"
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
          : code === "conflict" || code === "stale_generation"
            ? "conflict"
            : code === "invalid" || code === "validation"
              ? "invalid"
              : undefined,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    errorMessage: extractErrorMessage(body, fallback),
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined
  };
}

function normalizePageMoveSucceededResult(body: unknown): PageMoveSucceeded {
  const result = unwrapServiceNowEnvelope(body);
  if (!isPlainObject(result) || !Array.isArray(result.pages)) {
    throw new Error("Page move payload was invalid.");
  }
  return {
    state: "succeeded",
    pages: result.pages.map((page) => normalizePageRecord(page)),
    changeSetId: cleanText(result.changeSetId) || undefined,
    changeSetRevision: readSafeInteger(result.changeSetRevision) ?? undefined
  };
}

function normalizePageMoveFailedResult(body: unknown, fallback: string): PageMoveFailed {
  const error = unwrapServiceNowEnvelope(body);
  const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : null;
  const code = cleanText(errorObject?.code);
  return {
    affectedPageCount: readSafeInteger(errorObject?.affectedPageCount) ?? undefined,
    state: "failed",
    code:
      code === "workspace_lease_lost" || code === "workspace_locked"
        ? "lock_lost"
        : code === "forbidden"
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
          : code === "conflict" || code === "stale_generation"
            ? "conflict"
            : code === "invalid" || code === "validation"
              ? "invalid"
              : undefined,
    currentChangeSetId: cleanText(errorObject?.currentChangeSetId) || undefined,
    currentChangeSetRevision: readSafeInteger(errorObject?.currentChangeSetRevision) ?? undefined,
    errorMessage: extractErrorMessage(body, fallback),
    recoveryCommandId: cleanText(errorObject?.recoveryCommandId) || undefined
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

  if (response.status === 400 || response.status === 403) {
    return normalizeWorkspaceCreateFailedResult(response.body, "Workspace creation failed.");
  }

  throw new Error(`HTTP ${response.status}`);
}

async function resolveWorkspaceSettingsSaveResult(
  path: string,
  input: WorkspaceSettingsSaveInput
): Promise<WorkspaceSettingsSaveResult> {
  const response = await requestJson<unknown>(path, {
    method: "PUT",
    body: JSON.stringify({
      workspaceSlug: cleanText(input.workspaceSlug),
      workspaceSysId: cleanText(input.workspaceSysId),
      name: cleanText(input.name),
      shortDescription: cleanText(input.shortDescription) || null,
      ...(input.icon ? { icon: input.icon } : {}),
      layout: {
        tocVisible: input.layout?.tocVisible ?? true
      }
    }),
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (response.status === 200) {
    return normalizeWorkspaceSettingsSaveSucceededResult(response.body);
  }

  if (response.status === 400 || response.status === 403 || response.status === 404) {
    return normalizeWorkspaceSettingsSaveFailedResult(
      response.body,
      "Something went wrong while saving workspace settings. Your changes were not saved. Please try again."
    );
  }

  return {
    state: "failed",
    code: "transient",
    errorMessage: "Something went wrong while saving workspace settings. Your changes were not saved. Please try again."
  };
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
  const authority = resolveMutationAuthority(input);
  const payload = {
    title: cleanText(input.title),
    workspaceSlug: cleanText(input.workspaceSlug),
    ...(cleanText(input.workspaceLeaseToken) ? { workspaceLeaseToken: cleanText(input.workspaceLeaseToken) } : {}),
    ...(authority ?? {}),
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

  if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409) {
    return normalizePageCreateFailedResult(response.body, "Page creation failed.");
  }

  throw new Error(`HTTP ${response.status}`);
}

async function resolvePageBodySaveResult(path: string, input: PageBodySaveInput): Promise<PageBodySaveResult> {
  const authority = resolveMutationAuthority(input);
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    pageSlug: cleanText(input.pageSlug),
    ...(cleanText(input.workspaceLeaseToken) ? { workspaceLeaseToken: cleanText(input.workspaceLeaseToken) } : {}),
    ...(authority ?? {}),
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

async function resolvePagePublishResult(path: string, input: PagePublishInput): Promise<PagePublishResult> {
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    pageSlug: cleanText(input.pageSlug),
    ...(cleanText(input.workspaceLeaseToken) ? { workspaceLeaseToken: cleanText(input.workspaceLeaseToken) } : {}),
    expectedRevision: Number.isSafeInteger(input.expectedRevision) ? input.expectedRevision : undefined
  };

  let response: JsonResponse<unknown>;
  try {
    response = await requestJson<unknown>(path, {
      method: "POST",
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
      errorMessage: "Something went wrong while publishing. Your changes were not published. Please try again."
    };
  }

  if (response.status === 200) {
    try {
      return normalizePagePublishSucceededResult(response.body);
    } catch {
      return {
        code: "persistence_invariant",
        retryable: false,
        state: "failed",
        errorMessage: "Something went wrong while publishing. Your changes were not published. Please try again."
      };
    }
  }

  if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 500) {
    const fallbackCode: PagePublishFailed["code"] =
      response.status === 403 ? "forbidden" : response.status === 409 ? "conflict" : response.status === 500 ? "persistence_invariant" : "invalid";
    return normalizePagePublishFailedResult(
      response.body,
      "Something went wrong while publishing. Your changes were not published. Please try again.",
      fallbackCode,
      false
    );
  }

  if ([408, 429, 502, 503, 504].includes(response.status)) {
    return {
      code: "transient",
      retryable: true,
      state: "failed",
      errorMessage: "Something went wrong while publishing. Your changes were not published. Please try again."
    };
  }

  return {
    code: "failed",
    retryable: false,
    state: "failed",
    errorMessage: "Something went wrong while publishing. Your changes were not published. Please try again."
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

    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 500) {
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
  const authority = resolveMutationAuthority(input);
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    title: cleanText(input.title),
    slug: cleanText(input.slug),
    ...(cleanText(input.workspaceLeaseToken) ? { workspaceLeaseToken: cleanText(input.workspaceLeaseToken) } : {}),
    ...(authority ?? {})
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

    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 500) {
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
  const authority = resolveMutationAuthority(input);
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    ...(cleanText(input.workspaceLeaseToken) ? { workspaceLeaseToken: cleanText(input.workspaceLeaseToken) } : {}),
    ...(authority ?? {})
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
      response.status === 404 || response.status === 409 ||
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

async function resolvePageMoveResult(path: string, input: PageMoveInput): Promise<PageMoveResult> {
  const authority = resolveMutationAuthority(input);
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    parentPageSysId: cleanText(input.parentPageSysId) || null,
    siblingOrder: String(input.siblingOrder),
    workspaceLeaseToken: cleanText(input.workspaceLeaseToken),
    ...(authority ?? {})
  };
  const response = await requestJson<unknown>(path, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" }
  });
  if (response.status === 200) {
    return normalizePageMoveSucceededResult(response.body);
  }
  if (response.status === 400 || response.status === 403 || response.status === 409 || response.status === 404) {
    return normalizePageMoveFailedResult(response.body, SAFE_PAGE_MOVE_ERROR_MESSAGE);
  }
  return { state: "failed", code: "transient", errorMessage: SAFE_PAGE_MOVE_ERROR_MESSAGE };
}

async function resolveWorkspaceEditLeaseResult(
  path: string,
  input: WorkspaceEditLeaseReferenceInput,
  action: "acquire" | "resume" | "renew" | "release" | "status"
): Promise<WorkspaceEditLeaseAcquireResult | WorkspaceEditLeaseRenewResult | WorkspaceEditLeaseReleaseResult | WorkspaceEditLeaseStatusResult> {
  const correlationId = createClientCorrelationId();
  const startedAt = new Date().toISOString();
  recordDocseraDiagnosticEvent("lease.network.start", {
    action,
    correlationId,
    startedAt,
    tokenFingerprint: fingerprintDiagnosticSecret(input.leaseToken),
    tokenPresent: Boolean(cleanText(input.leaseToken)),
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId)
  });
  const finish = (
    responseStatus: number | null,
    result: WorkspaceEditLeaseAcquireResult | WorkspaceEditLeaseRenewResult | WorkspaceEditLeaseReleaseResult | WorkspaceEditLeaseStatusResult,
    accepted = true
  ) => {
    recordDocseraDiagnosticEvent("lease.network.finish", {
      accepted,
      action,
      completedAt: new Date().toISOString(),
      correlationId,
      failure: result.state === "failed" ? result.failure : "",
      httpStatus: responseStatus,
      normalizedResultState: result.state,
      sameUserDifferentSession: result.state === "locked" || result.state === "lost" ? result.sameUserDifferentSession : false,
      startedAt,
      tokenFingerprint: fingerprintDiagnosticSecret(input.leaseToken),
      tokenPresent: Boolean(cleanText(input.leaseToken)),
      workspaceSlug: cleanText(input.workspaceSlug),
      workspaceSysId: cleanText(input.workspaceSysId)
    });
    return result;
  };
  try {
    const response = await requestJson<unknown>(path, { method: "POST", body: JSON.stringify({ workspaceSlug: cleanText(input.workspaceSlug), workspaceSysId: cleanText(input.workspaceSysId), ...(cleanText(input.leaseToken) ? { leaseToken: cleanText(input.leaseToken) } : {}) }), headers: { "Content-Type": "application/json" }, keepalive: action === "release" });
    const result = unwrapServiceNowEnvelope(response.body);
    const error = isPlainObject(result) && isPlainObject(result.error) ? result.error : null;
    const resultState = isPlainObject(result) ? cleanText(result.state) : "";
    if (response.status === 200 && resultState) {
      if (!isWorkspaceEditLeaseStateAllowed(action, resultState)) {
        return finish(response.status, normalizeWorkspaceLeaseFailedResult(result));
      }
      if (resultState === "held") {
        return finish(response.status, normalizeWorkspaceLeaseHeldResult(response.body, action === "status" ? "status" : action === "acquire" || action === "resume" || action === "renew" ? action : "renew"));
      }
      if (resultState === "locked") {
        return finish(response.status, normalizeWorkspaceLeaseLockedResult(result));
      }
      if (resultState === "lost") {
        return finish(response.status, normalizeWorkspaceLeaseLostResult(result));
      }
      if (resultState === "released") return finish(response.status, { state: "released" });
      if (resultState === "unlocked") return finish(response.status, { state: "unlocked" });
      if (resultState === "failed") return finish(response.status, normalizeWorkspaceLeaseFailedResult(result));
      return finish(response.status, normalizeWorkspaceLeaseFailedResult(result));
    }
    if (response.status === 409 && error && cleanText(error.code) === "workspace_locked") return finish(response.status, { state: "locked", holderDisplayName: cleanText(error.holderDisplayName) || null, sameUserDifferentSession: Boolean(error.sameUserDifferentSession) } satisfies WorkspaceEditLeaseLocked);
    if (response.status === 409 && error && cleanText(error.code) === "workspace_lease_lost") {
      return finish(response.status, {
        state: "lost",
        errorMessage: cleanText(error.message) || "This workspace edit session ended and unsaved changes were not saved.",
        holderDisplayName: cleanText(error.holderDisplayName) || null,
        sameUserDifferentSession: Boolean(error.sameUserDifferentSession)
      } satisfies WorkspaceEditLeaseLost);
    }
    if (response.status === 409) {
      return finish(response.status, {
        state: "failed",
        errorMessage: cleanText(error?.message) || "Workspace editing is unavailable.",
        failure: "terminal",
        retryable: false
      } satisfies WorkspaceEditLeaseFailed);
    }
    const failure = response.status === 403 ? "forbidden" : response.status >= 500 ? "transient" : "terminal";
    const fallback = failure === "transient"
      ? "Workspace editing is temporarily unavailable. Please try again."
      : "Workspace editing is unavailable.";
    return finish(response.status, { state: "failed", errorMessage: cleanText(error?.message) || fallback, failure, retryable: failure === "transient" } satisfies WorkspaceEditLeaseFailed);
  } catch {
    return finish(null, { state: "failed", errorMessage: "Workspace editing is temporarily unavailable. Please try again.", failure: "transient", retryable: true } satisfies WorkspaceEditLeaseFailed);
  }
}

function createClientCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function resolveWorkspacePendingChangesResult(path: string, input: WorkspaceEditLeaseReferenceInput): Promise<WorkspacePendingChangesResult> {
  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify({
        workspaceSlug: cleanText(input.workspaceSlug),
        workspaceSysId: cleanText(input.workspaceSysId),
        leaseToken: cleanText(input.leaseToken),
        workspaceLeaseToken: cleanText(input.leaseToken)
      }),
      headers: { "Content-Type": "application/json" }
    });
    if (response.status === 200) {
      return normalizeWorkspacePendingChangesSucceededResult(response.body);
    }
    const error = unwrapServiceNowEnvelope(response.body);
    const errorObject = isPlainObject(error) && isPlainObject(error.error) ? error.error : {};
    const code = cleanText(errorObject.code);
    return {
      affectedPageCount: readSafeInteger(errorObject.affectedPageCount) ?? undefined,
      code:
        response.status === 403
          ? "forbidden"
          : code === "recovery_required"
            ? "recovery_required"
            : code === "workspace_lease_lost" || response.status === 409
              ? "lock_lost"
              : response.status === 404
                ? "not_found"
                : "transient",
      currentChangeSetId: cleanText(errorObject.currentChangeSetId) || undefined,
      currentChangeSetRevision: readSafeInteger(errorObject.currentChangeSetRevision) ?? undefined,
      errorMessage: extractErrorMessage(response.body, "Unable to load pending changes. Please try again."),
      recoveryCommandId: cleanText(errorObject.recoveryCommandId) || undefined,
      retryable: response.status >= 500,
      state: "failed"
    };
  } catch {
    return {
      code: "transient",
      errorMessage: "Unable to load pending changes. Please try again.",
      retryable: true,
      state: "failed"
    };
  }
}

async function resolveWorkspacePublishResult(path: string, input: WorkspacePublishInput): Promise<WorkspacePublishResult> {
  const authority = resolveMutationAuthority(input);
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    commandId: cleanText(input.commandId),
    workspaceLeaseToken: cleanText(input.workspaceLeaseToken),
    ...(authority ?? {})
  };
  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
    if (response.status === 200) {
      return normalizeWorkspacePublishSucceededResult(response.body);
    }
    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 500) {
      return normalizeWorkspacePublishFailedResult(response.body, SAFE_WORKSPACE_PUBLISH_ERROR_MESSAGE);
    }
    return {
      state: "failed",
      code: "transient",
      errorMessage: SAFE_WORKSPACE_PUBLISH_ERROR_MESSAGE,
      retryable: true
    };
  } catch {
    return {
      state: "failed",
      code: "transient",
      errorMessage: SAFE_WORKSPACE_PUBLISH_ERROR_MESSAGE,
      retryable: true
    };
  }
}

async function resolveWorkspaceDiscardAllResult(path: string, input: WorkspaceDiscardAllInput): Promise<WorkspaceDiscardAllResult> {
  const authority = resolveMutationAuthority(input);
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    commandId: cleanText(input.commandId),
    workspaceLeaseToken: cleanText(input.workspaceLeaseToken),
    ...(authority ?? {})
  };
  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
    if (response.status === 200) {
      return normalizeWorkspaceDiscardAllSucceededResult(response.body);
    }
    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 500) {
      return normalizeWorkspaceDiscardAllFailedResult(response.body, SAFE_WORKSPACE_DISCARD_ALL_ERROR_MESSAGE);
    }
    return {
      state: "failed",
      code: "transient",
      errorMessage: SAFE_WORKSPACE_DISCARD_ALL_ERROR_MESSAGE,
      retryable: true
    };
  } catch {
    return {
      state: "failed",
      code: "transient",
      errorMessage: SAFE_WORKSPACE_DISCARD_ALL_ERROR_MESSAGE,
      retryable: true
    };
  }
}

async function resolveWorkspaceDiscardPageResult(path: string, input: WorkspaceDiscardPageInput): Promise<WorkspaceDiscardPageResult> {
  const authority = resolveMutationAuthority(input);
  const payload = {
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    pageSysId: cleanText(input.pageSysId),
    workspaceLeaseToken: cleanText(input.workspaceLeaseToken),
    ...(authority ?? {})
  };
  try {
    const response = await requestJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
    if (response.status === 200) {
      return normalizeWorkspaceDiscardPageSucceededResult(response.body);
    }
    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 500) {
      return normalizeWorkspaceDiscardPageFailedResult(response.body, SAFE_WORKSPACE_DISCARD_PAGE_ERROR_MESSAGE);
    }
    return {
      state: "failed",
      code: "transient",
      errorMessage: SAFE_WORKSPACE_DISCARD_PAGE_ERROR_MESSAGE,
      retryable: true
    };
  } catch {
    return {
      state: "failed",
      code: "transient",
      errorMessage: SAFE_WORKSPACE_DISCARD_PAGE_ERROR_MESSAGE,
      retryable: true
    };
  }
}

export function createServiceNowClient(runtime: DocseraRuntimeContext): ServiceNowClient {
  const collectionPath = resolvePath(runtime.config.workspaceCollectionPath, DEFAULT_WORKSPACE_COLLECTION_PATH);
  const pageCollectionPath = resolvePath(runtime.config.pageCollectionPath, DEFAULT_PAGE_COLLECTION_PATH);
  const workspaceMediaCollectionPath = resolveWorkspaceMediaCollectionPath(collectionPath);
  const workspaceMediaFilePath = resolveWorkspaceMediaFilePath(collectionPath);
  const workspaceIconCollectionPath = resolveWorkspaceIconCollectionPath(collectionPath);
  const workspaceSettingsPath = resolveWorkspaceSettingsPath(collectionPath);
  const workspaceMembersPath = resolveWorkspaceMembersPath(collectionPath);
  const pageDeleteActionPath = resolvePageDeleteActionPath(pageCollectionPath);
  const pageMovePath = resolvePageMovePath(pageCollectionPath);
  const pagePublishPath = resolvePagePublishPath(pageCollectionPath);
  const pageEditLockStatusPath = resolvePageEditLockPath(pageCollectionPath, "status");
  const pageEditLockAcquirePath = resolvePageEditLockPath(pageCollectionPath, "acquire");
  const pageEditLockHeartbeatPath = resolvePageEditLockPath(pageCollectionPath, "heartbeat");
  const pageEditLockReleasePath = resolvePageEditLockPath(pageCollectionPath, "release");
  const workspaceEditLeaseAcquirePath = resolveWorkspaceEditLeasePath(pageCollectionPath, "acquire");
  const workspaceEditLeaseResumePath = resolveWorkspaceEditLeasePath(pageCollectionPath, "resume");
  const workspaceEditLeaseRenewPath = resolveWorkspaceEditLeasePath(pageCollectionPath, "renew");
  const workspaceEditLeaseReleasePath = resolveWorkspaceEditLeasePath(pageCollectionPath, "release");
  const workspaceEditLeaseStatusPath = resolveWorkspaceEditLeasePath(pageCollectionPath, "status");
  const workspacePendingChangesPath = resolveWorkspacePendingChangesPath(pageCollectionPath);
  const workspaceDiscardAllPath = resolveWorkspaceDiscardAllPath(collectionPath);
  const workspaceDiscardPagePath = resolveWorkspaceDiscardPagePath(collectionPath);
  const workspacePublishPath = resolveWorkspacePublishPath(collectionPath);
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

    async saveWorkspaceSettings(input: WorkspaceSettingsSaveInput): Promise<WorkspaceSettingsSaveResult> {
      return resolveWorkspaceSettingsSaveResult(workspaceSettingsPath, input);
    },

    async listWorkspaceMembers(input: { workspaceSlug: string; workspaceSysId?: string }): Promise<WorkspaceMembersResult> {
      try {
        const path = new URL(workspaceMembersPath, window.location.origin);
        path.searchParams.set("workspaceSlug", cleanText(input.workspaceSlug));
        if (cleanText(input.workspaceSysId)) {
          path.searchParams.set("workspaceSysId", cleanText(input.workspaceSysId));
        }
        const response = await requestJson<unknown>(path.pathname + path.search);
        if (response.status === 200) {
          return normalizeWorkspaceMembersResult(response.body);
        }
        return normalizeWorkspaceMembersFailedResult(response.body, response.status, SAFE_WORKSPACE_MEMBERS_ERROR_MESSAGE);
      } catch {
        return { code: "transient", errorMessage: SAFE_WORKSPACE_MEMBERS_ERROR_MESSAGE, retryable: true, state: "failed" };
      }
    },

    async searchWorkspaceMemberUsers(input: { excludedUserSysIds?: string[]; term: string; workspaceSlug: string; workspaceSysId?: string }): Promise<WorkspaceMemberUserSearchResult> {
      try {
        const path = new URL(`${workspaceMembersPath.replace(/\/+$/g, "")}/search-users`, window.location.origin);
        path.searchParams.set("workspaceSlug", cleanText(input.workspaceSlug));
        path.searchParams.set("q", cleanText(input.term));
        path.searchParams.set("limit", "10");
        const excludedUserSysIds = (input.excludedUserSysIds ?? []).map(cleanText).filter(Boolean);
        if (excludedUserSysIds.length > 0) {
          path.searchParams.set("exclude", excludedUserSysIds.join(","));
        }
        if (cleanText(input.workspaceSysId)) {
          path.searchParams.set("workspaceSysId", cleanText(input.workspaceSysId));
        }
        const response = await requestJson<unknown>(path.pathname + path.search);
        if (response.status === 200) {
          return normalizeWorkspaceMemberUserSearchResult(response.body);
        }
        return normalizeWorkspaceMembersFailedResult(response.body, response.status, SAFE_WORKSPACE_MEMBER_SEARCH_ERROR_MESSAGE);
      } catch {
        return { code: "transient", errorMessage: SAFE_WORKSPACE_MEMBER_SEARCH_ERROR_MESSAGE, retryable: true, state: "failed" };
      }
    },

    async setWorkspaceMemberAccess(input: { accessLevel: WorkspaceMemberAccessLevel; userSysId: string; workspaceSlug: string; workspaceSysId?: string }): Promise<WorkspaceMemberMutationResult> {
      try {
        const response = await requestJson<unknown>(workspaceMembersPath, {
          method: "PUT",
          body: JSON.stringify({
            accessLevel: input.accessLevel,
            userSysId: cleanText(input.userSysId),
            workspaceSlug: cleanText(input.workspaceSlug),
            workspaceSysId: cleanText(input.workspaceSysId)
          }),
          headers: { "Content-Type": "application/json" }
        });
        if (response.status === 200) {
          return normalizeWorkspaceMemberMutationResult(response.body);
        }
        return normalizeWorkspaceMembersFailedResult(response.body, response.status, SAFE_WORKSPACE_MEMBER_MUTATION_ERROR_MESSAGE);
      } catch {
        return { code: "transient", errorMessage: SAFE_WORKSPACE_MEMBER_MUTATION_ERROR_MESSAGE, retryable: true, state: "failed" };
      }
    },

    async removeWorkspaceMemberAccess(input: { userSysId: string; workspaceSlug: string; workspaceSysId?: string }): Promise<WorkspaceMemberMutationResult> {
      try {
        const response = await requestJson<unknown>(`${workspaceMembersPath.replace(/\/+$/g, "")}/remove`, {
          method: "POST",
          body: JSON.stringify({
            userSysId: cleanText(input.userSysId),
            workspaceSlug: cleanText(input.workspaceSlug),
            workspaceSysId: cleanText(input.workspaceSysId)
          }),
          headers: { "Content-Type": "application/json" }
        });
        if (response.status === 200) {
          return normalizeWorkspaceMemberMutationResult(response.body);
        }
        return normalizeWorkspaceMembersFailedResult(response.body, response.status, SAFE_WORKSPACE_MEMBER_MUTATION_ERROR_MESSAGE);
      } catch {
        return { code: "transient", errorMessage: SAFE_WORKSPACE_MEMBER_MUTATION_ERROR_MESSAGE, retryable: true, state: "failed" };
      }
    },

    async createPage(input: PageCreateInput): Promise<PageCreateResult> {
      return resolvePageCreateResult(pageCollectionPath, input);
    },

    async listWorkspaceMedia(input: { workspaceSysId: string }): Promise<WorkspaceMediaListResult> {
      try {
        const path = new URL(workspaceMediaCollectionPath, window.location.origin);
        path.searchParams.set("workspaceSysId", cleanText(input.workspaceSysId));
        const response = await requestJson<unknown>(path.pathname + path.search);
        if (response.status === 200) {
          return normalizeWorkspaceMediaListResult(response.body);
        }
        if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 413 || response.status === 415 || response.status === 500) {
          return normalizeWorkspaceMediaFailedResult(response.body, SAFE_WORKSPACE_MEDIA_LIST_ERROR_MESSAGE);
        }
        return {
          state: "failed",
          errorMessage: SAFE_WORKSPACE_MEDIA_LIST_ERROR_MESSAGE,
          retryable: true
        };
      } catch {
        return {
          state: "failed",
          errorMessage: SAFE_WORKSPACE_MEDIA_LIST_ERROR_MESSAGE,
          retryable: true
        };
      }
    },

    async uploadWorkspaceMedia(input: { file: File; workspaceLeaseToken: string; workspaceSysId: string }): Promise<WorkspaceMediaUploadResult> {
      try {
        const path = new URL(workspaceMediaCollectionPath, window.location.origin);
        path.searchParams.set("workspaceSysId", cleanText(input.workspaceSysId));
        path.searchParams.set("fileName", cleanText(input.file?.name));
        const response = await requestRaw(path.pathname + path.search, {
          method: "POST",
          body: input.file,
          headers: {
            "Content-Type": cleanText(input.file?.type) || "application/octet-stream",
            "X-Docsera-Workspace-Lease-Token": cleanText(input.workspaceLeaseToken)
          }
        });
        if (response.status === 200 || response.status === 201) {
          return normalizeWorkspaceMediaUploadResult(response.body);
        }
        if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 413 || response.status === 415 || response.status === 500) {
          return normalizeWorkspaceMediaFailedResult(response.body, SAFE_WORKSPACE_MEDIA_UPLOAD_ERROR_MESSAGE);
        }
        return {
          state: "failed",
          errorMessage: SAFE_WORKSPACE_MEDIA_UPLOAD_ERROR_MESSAGE,
          retryable: true
        };
      } catch {
        return {
          state: "failed",
          errorMessage: SAFE_WORKSPACE_MEDIA_UPLOAD_ERROR_MESSAGE,
          retryable: true
        };
      }
    },

    async uploadWorkspaceIcon(input: { file: File; workspaceSysId?: string }): Promise<WorkspaceIconUploadResult> {
      try {
        const path = new URL(workspaceIconCollectionPath, window.location.origin);
        path.searchParams.set("fileName", cleanText(input.file?.name));
        const workspaceSysId = cleanText(input.workspaceSysId);
        if (workspaceSysId) {
          path.searchParams.set("workspaceSysId", workspaceSysId);
        }
        const response = await requestRaw(path.pathname + path.search, {
          method: "POST",
          body: input.file,
          headers: {
            "Content-Type": cleanText(input.file?.type) || "application/octet-stream"
          }
        });
        if (response.status === 200 || response.status === 201) {
          return normalizeWorkspaceIconUploadResult(response.body);
        }
        if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 413 || response.status === 415 || response.status === 500) {
          return normalizeWorkspaceMediaFailedResult(response.body, SAFE_WORKSPACE_ICON_UPLOAD_ERROR_MESSAGE);
        }
        return {
          state: "failed",
          errorMessage: SAFE_WORKSPACE_ICON_UPLOAD_ERROR_MESSAGE,
          retryable: true
        };
      } catch {
        return {
          state: "failed",
          errorMessage: SAFE_WORKSPACE_ICON_UPLOAD_ERROR_MESSAGE,
          retryable: true
        };
      }
    },

    async cleanupWorkspaceSettingsIcon(input: { assetKey: string; workspaceSysId: string }): Promise<void> {
      const path = new URL(workspaceIconCollectionPath, window.location.origin);
      path.searchParams.set("action", "cleanup-settings-staged");
      path.searchParams.set("assetKey", cleanText(input.assetKey));
      path.searchParams.set("workspaceSysId", cleanText(input.workspaceSysId));
      await requestJson<unknown>(path.pathname + path.search, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
    },

    async loadWorkspaceIcon(input: { assetPath: string; signal?: AbortSignal }): Promise<Blob | null> {
      const assetPath = cleanText(input.assetPath);
      if (!assetPath) {
        return null;
      }
      const path = new URL(assetPath, window.location.origin);
      return requestBinary(path.pathname + path.search + path.hash, {
        signal: input.signal
      });
    },

    async loadWorkspaceMedia(input: { mediaId: string; signal?: AbortSignal; workspaceSysId: string }): Promise<Blob | null> {
      const path = new URL(workspaceMediaFilePath, window.location.origin);
      path.searchParams.set("workspaceSysId", cleanText(input.workspaceSysId));
      path.searchParams.set("mediaId", cleanText(input.mediaId));
      return requestBinary(path.pathname + path.search + path.hash, {
        signal: input.signal
      });
    },

    async acquireWorkspaceEditLease(input: WorkspaceEditLeaseReferenceInput): Promise<WorkspaceEditLeaseAcquireResult> { return resolveWorkspaceEditLeaseResult(workspaceEditLeaseAcquirePath, input, "acquire") as Promise<WorkspaceEditLeaseAcquireResult>; },
    async resumeWorkspaceEditLease(input: WorkspaceEditLeaseReferenceInput): Promise<WorkspaceEditLeaseRenewResult> { return resolveWorkspaceEditLeaseResult(workspaceEditLeaseResumePath, input, "resume") as Promise<WorkspaceEditLeaseRenewResult>; },
    async renewWorkspaceEditLease(input: WorkspaceEditLeaseReferenceInput): Promise<WorkspaceEditLeaseRenewResult> { return resolveWorkspaceEditLeaseResult(workspaceEditLeaseRenewPath, input, "renew") as Promise<WorkspaceEditLeaseRenewResult>; },
    async releaseWorkspaceEditLease(input: WorkspaceEditLeaseReferenceInput & { keepalive?: boolean }): Promise<WorkspaceEditLeaseReleaseResult> { return resolveWorkspaceEditLeaseResult(workspaceEditLeaseReleasePath, input, "release") as Promise<WorkspaceEditLeaseReleaseResult>; },
    async getWorkspaceEditLeaseStatus(input: WorkspaceEditLeaseReferenceInput): Promise<WorkspaceEditLeaseStatusResult> { return resolveWorkspaceEditLeaseResult(workspaceEditLeaseStatusPath, input, "status") as Promise<WorkspaceEditLeaseStatusResult>; },
    async getWorkspacePendingChanges(input: WorkspaceEditLeaseReferenceInput): Promise<WorkspacePendingChangesResult> { return resolveWorkspacePendingChangesResult(workspacePendingChangesPath, input); },
    async discardPageWorkspace(input: WorkspaceDiscardPageInput): Promise<WorkspaceDiscardPageResult> { return resolveWorkspaceDiscardPageResult(workspaceDiscardPagePath, input); },
    async discardAllWorkspace(input: WorkspaceDiscardAllInput): Promise<WorkspaceDiscardAllResult> { return resolveWorkspaceDiscardAllResult(workspaceDiscardAllPath, input); },
    async publishWorkspace(input: WorkspacePublishInput): Promise<WorkspacePublishResult> { return resolveWorkspacePublishResult(workspacePublishPath, input); },

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

    async publishPage(input: PagePublishInput): Promise<PagePublishResult> {
      return resolvePagePublishResult(pagePublishPath, input);
    },

    async savePageSettings(input: PageSettingsSaveInput): Promise<PageSettingsSaveResult> {
      return resolvePageSettingsSaveResult(pageCollectionPath, input);
    },

    async deletePage(input: PageDeleteInput): Promise<PageDeleteResult> {
      return resolvePageDeleteResult(pageDeleteActionPath, input);
    },

    async movePage(input: PageMoveInput): Promise<PageMoveResult> {
      return resolvePageMoveResult(pageMovePath, input);
    }
  };
}
