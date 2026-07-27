import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DocseraHeader, type HeaderIdentity } from "../features/workspaces/DocseraHeader";
import { DirtyTransitionDialog } from "../features/workspaces/DirtyTransitionDialog";
import { MyWorkspacesScreen } from "../features/workspaces/MyWorkspacesScreen";
import { PageSettingsDeleteDialog } from "../features/workspaces/PageSettingsDeleteDialog";
import { PageSettingsOverlay } from "../features/workspaces/PageSettingsOverlay";
import type { InlinePageCreateState } from "../features/workspaces/PageTree";
import type { RecentWorkspaceItem } from "../features/workspaces/RecentWorkspacesMenu";
import { DEFAULT_WORKSPACE_NAV_WIDTH, readStoredWorkspaceNavWidth, WorkspaceShell } from "../features/workspaces/WorkspaceShell";
import type { PageEditorHostFailure, PageEditorRecoverySnapshot } from "../editor/PageEditorHost";
import { EditorSessionGeneration, type EditorSessionToken } from "../editor/session/editorSessionGeneration";
import { fingerprintDiagnosticSecret, recordDocseraDiagnosticEvent } from "../diagnostics";
import { WorkspaceLeaseCoordination, type StoredWorkspaceLease } from "./workspaceLeaseCoordination";
import { WorkspaceLeaseRecoveryCoordinator, type WorkspaceLeaseMutationRecoveryResult, type WorkspaceLeaseRecoveryResult } from "./workspaceLeaseRecovery";
import { isWorkspaceMutationCanceled, WorkspaceMutationQueue, type WorkspaceMutationType } from "./workspaceMutationQueue";
import {
  AuthoringRecoveryStore,
  type AuthoringRecoveryReason,
  type BodyRecoveryIdentity,
  type WorkspaceRecoveryIdentity,
  type WorkspaceRecoveryClearResult
} from "./authoringRecovery";
import {
  buildWorkspacePageTree,
  buildWorkspaceShellViewModel,
  type WorkspacePageOutlineItem,
  type WorkspacePageView
} from "../features/workspaces/workspaceViewModels";
import { buildLauncherHref, buildWorkspaceHref, readAppRoute, type DocseraAppRoute } from "../features/workspaces/workspaceRouting";
import {
  collectPageSubtreeSysIds,
  removePageSubtree,
  validatePageSettingsSlug,
  validatePageSettingsTitle
} from "../../shared/pages/domain";
import { normalizeNumericSiblingOrder } from "../../shared/pages/siblingOrder";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageCreateResult,
  PageDeleteResult,
  PageMoveResult,
  PageSettingsSaveResult,
  PageListResult,
  PingResult,
  RuntimeProbeState,
  ServiceNowClient,
  WorkspaceMode,
  WorkspaceCreatePending,
  WorkspaceCreateResult,
  WorkspaceListResult,
  WorkspaceEditLeaseHeld,
  WorkspaceDiscardAllResult,
  WorkspacePendingChangesResult,
  WorkspacePublishResult,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

type WorkspaceListState =
  | { status: "idle" }
  | { status: "loading" }
  | { data: WorkspaceListResult; status: "refreshing" }
  | { data: WorkspaceListResult; status: "success" }
  | { errorMessage: string; status: "error" };

type WorkspaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { errorMessage: string; status: "error" }
  | { data: WorkspaceViewRecord; status: "success" };

type WorkspacePagesState =
  | { status: "idle" }
  | { mode: WorkspaceMode; status: "loading"; workspaceSlug: string }
  | { errorMessage: string; mode: WorkspaceMode; status: "error"; workspaceSlug: string }
  | { data: WorkspacePageRecord[]; mode: WorkspaceMode; status: "success"; totalCount: number; workspaceSlug: string };

type StaleRefreshState =
  | { status: "idle" }
  | {
      authority: { changeSetId: string; changeSetRevision: number };
      contextKey: string;
      errorMessage?: string;
      mode: WorkspaceMode;
      status: "refresh_required" | "refreshing";
      workspaceSlug: string;
    };

type PendingChangesState =
  | { status: "idle" }
  | { status: "loading"; workspaceSlug: string; workspaceSysId: string; leaseToken: string }
  | { data: Extract<WorkspacePendingChangesResult, { state: "succeeded" }>; status: "success" | "refreshing"; workspaceSlug: string; workspaceSysId: string; leaseToken: string }
  | { errorMessage: string; previous?: Extract<WorkspacePendingChangesResult, { state: "succeeded" }>; status: "error"; workspaceSlug: string; workspaceSysId: string; leaseToken: string };

type WorkspacePublishState =
  | { status: "idle" }
  | {
      commandId: string;
      contextKey: string;
      sourceChangeSetId: string;
      sourceChangeSetRevision: number;
      status: "publishing";
      workspaceSlug: string;
      workspaceSysId: string;
    }
  | {
      commandId?: string;
      contextKey: string;
      errorMessage: string;
      retryable: boolean;
      sourceChangeSetId: string;
      sourceChangeSetRevision: number;
      status: "error";
      workspaceSlug: string;
      workspaceSysId: string;
    };

type WorkspaceDiscardAllState =
  | { status: "idle" }
  | {
      commandId: string;
      contextKey: string;
      sourceChangeSetId: string;
      sourceChangeSetRevision: number;
      status: "discarding";
      workspaceSlug: string;
      workspaceSysId: string;
    }
  | {
      commandId?: string;
      affectedPageCount?: number;
      contextKey: string;
      errorMessage: string;
      recoveryRequired: boolean;
      retryable: boolean;
      sourceChangeSetId: string;
      sourceChangeSetRevision: number;
      status: "error";
      workspaceSlug: string;
      workspaceSysId: string;
    };

type WorkspacePublishToastState = {
  id: number;
  message: string;
  workspaceSlug: string;
  workspaceSysId: string;
};

type WorkspaceSwitcherState =
  | { status: "idle" }
  | { status: "loading" }
  | { items: WorkspaceViewRecord[]; status: "success" }
  | { status: "error" };

type PendingWorkspaceIdentity = Pick<WorkspaceViewRecord, "icon" | "name" | "slug">;
type WorkspaceHeaderPresentation = {
  showEditModeToggle: boolean;
  showWorkspaceMode: WorkspaceMode;
  showWorkspaceSettings: boolean;
  showWorkspaceSwitcher: boolean;
};
type WorkspaceModeUiState = {
  collapsedPageIds: string[];
  searchQuery: string;
  selectedPageSysId: string;
};

type RetainedWorkspaceShellState = {
  mode: WorkspaceMode;
  outlinePage: WorkspacePageView | null;
  selectedPageId: string;
  selectedPagePath: WorkspacePageView[];
  selectedPageView: WorkspacePageView | null;
  treePages: WorkspacePageView[];
  workspaceSlug: string;
};

type EditorTransitionState = {
  isDirty: boolean;
  isSaving: boolean;
  status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
};

type EditorSessionState = {
  sessionKey: string;
  token: EditorSessionToken | null;
};

type RequestedRouteTransition = {
  discardRestoredBodyCapture?: {
    captureGeneration: number;
    pageSysId: string;
    sessionKey: string;
    workspaceSlug: string;
    workspaceSysId: string;
  } | null;
  href: string;
  replace: boolean;
  reason?: string;
  beforeCommit?: () => void;
};

type ShellNoticeState = {
  eyebrow: string;
  kind: "status" | "alert";
  message: string;
  pageSysId?: string;
  workspaceMode?: WorkspaceMode;
  workspaceSlug: string;
};

const DEFAULT_PAGE_SIZE = 10;
const TRANSITION_PROGRESS_DELAY_MS = 220;
const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";
const STALE_REFRESH_BLOCKED_MESSAGE = "Reloading the latest draft projection. Saving is temporarily unavailable.";
const DOCSERA_THEME_STORAGE_KEY = "docsera.theme";
const DOCSERA_RECENT_WORKSPACES_STORAGE_KEY = "docsera.recent-workspaces";
const DOCSERA_WORKSPACE_LEASE_STORAGE_PREFIX = "docsera.workspace-edit-lease.";
const DOCSERA_WORKSPACE_LEASE_RELOAD_MARKER_PREFIX = "docsera.workspace-edit-lease-reload.";
const DOCSERA_WORKSPACE_LEASE_TAB_SESSION_PREFIX = "docsera.workspace-edit-lease-tab:";
const DOCSERA_WORKSPACE_LEASE_CHANNEL_NAME = "docsera.workspace-edit-lease.v1";
const DOCSERA_WORKSPACE_LEASE_PROBE_TIMEOUT_MS = 250;
const DOCSERA_WORKSPACE_LEASE_RELOAD_MARKER_MAX_AGE_MS = 10_000;
const RESTORED_BODY_NOTICE = "Your unsaved changes were restored. Review them before saving.";
const RESTORED_BODY_MISMATCH_NOTICE = "Your earlier unsaved changes could not be restored because the shared draft changed.";
const RESTORED_PAGE_SETTINGS_NOTICE = "Your unsaved Page Settings changes were restored. Review them before saving.";
const RESTORED_PAGE_SETTINGS_MISSING_NOTICE = "Your earlier Page Settings changes could not be restored because that page is no longer available.";
const RESTORED_PAGE_SETTINGS_MISMATCH_NOTICE = "Your earlier Page Settings changes could not be restored because the shared page settings changed.";
const RESTORED_INLINE_CREATE_NOTICE = "Your unsaved new-page input was restored. Review it before creating the page.";
const RESTORED_INLINE_PARENT_MISSING_NOTICE = "The original parent is no longer available. Review the restored title before creating the page.";

type PageSettingsField = "title" | "slug";

type PageSettingsState = {
  activeField: PageSettingsField | "";
  deleteError: string;
  deleteOpen: boolean;
  deletePending: boolean;
  generalError: string;
  noticeMessage: string;
  pageSysId: string;
  slug: string;
  slugSnapshot: string;
  slugError: string;
  title: string;
  titleError: string;
  titleSnapshot: string;
  open: boolean;
};

type WorkspaceLeaseState =
  | { state: "idle" | "acquiring" | "uncertain" | "recovery_required" | "recovering" }
  | { state: "transient_failure"; message: string }
  | ({ state: "held" } & WorkspaceEditLeaseHeld)
  | { state: "blocked"; failure: "locked" | "lost" | "forbidden" | "transient" | "terminal"; holderDisplayName: string | null; message: string; sameUserDifferentSession: boolean };
type WorkspaceLeaseBinding = WorkspaceEditLeaseHeld & { bindingId: string; workspaceSlug: string; workspaceSysId: string };

function workspaceLeaseStorageKey(workspaceSysId: string): string { return `${DOCSERA_WORKSPACE_LEASE_STORAGE_PREFIX}${cleanText(workspaceSysId)}`; }
function workspaceLeaseReloadMarkerKey(workspaceSysId: string): string { return `${DOCSERA_WORKSPACE_LEASE_RELOAD_MARKER_PREFIX}${cleanText(workspaceSysId)}`; }
function getOrCreateWorkspaceLeaseTabSessionId(): string {
  const prefix = DOCSERA_WORKSPACE_LEASE_TAB_SESSION_PREFIX;
  try {
    const before = typeof window.name === "string" ? window.name : "";
    const beforeHadPrefix = before.startsWith(prefix);
    const beforeIdentity = beforeHadPrefix ? cleanText(before.slice(prefix.length)) : "";
    if (beforeHadPrefix && beforeIdentity) {
      recordDocseraDiagnosticEvent("lease.tabSessionIdentity", {
        afterFingerprint: fingerprintDiagnosticSecret(beforeIdentity),
        beforeFingerprint: fingerprintDiagnosticSecret(beforeIdentity),
        beforeHadDocseraPrefix: true,
        generated: false,
        identitiesMatch: true
      });
      return beforeIdentity;
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.name = `${prefix}${id}`;
    recordDocseraDiagnosticEvent("lease.tabSessionIdentity", {
      afterFingerprint: fingerprintDiagnosticSecret(id),
      beforeFingerprint: fingerprintDiagnosticSecret(beforeIdentity),
      beforeHadDocseraPrefix: beforeHadPrefix,
      generated: true,
      identitiesMatch: false
    });
    return id;
  } catch {
    recordDocseraDiagnosticEvent("lease.tabSessionIdentity", {
      beforeHadDocseraPrefix: false,
      error: "window_name_unavailable",
      generated: false,
      identitiesMatch: false
    });
    return "";
  }
}
function readStoredWorkspaceLease(workspaceSysId: string): StoredWorkspaceLease {
  const key = workspaceLeaseStorageKey(workspaceSysId);
  try {
    const raw = cleanText(window.sessionStorage.getItem(key));
    if (!raw) {
      recordDocseraDiagnosticEvent("lease.storage.read", {
        parseSucceeded: false,
        storageOrigin: window.location.origin,
        storageRecordExists: false,
        workspaceSysId
      });
      return { tabSessionId: "", token: "" };
    }
    try {
      const parsed = JSON.parse(raw) as { tabSessionId?: unknown; token?: unknown };
      const stored = { tabSessionId: cleanText(parsed.tabSessionId), token: cleanText(parsed.token) };
      recordDocseraDiagnosticEvent("lease.storage.read", {
        parseSucceeded: true,
        storageOrigin: window.location.origin,
        storageRecordExists: true,
        storedTabSessionFingerprint: fingerprintDiagnosticSecret(stored.tabSessionId),
        tokenExists: Boolean(stored.token),
        tokenFingerprint: fingerprintDiagnosticSecret(stored.token),
        workspaceSysId
      });
      return stored;
    } catch {
      recordDocseraDiagnosticEvent("lease.storage.read", {
        parseSucceeded: false,
        storageOrigin: window.location.origin,
        storageRecordExists: true,
        tokenExists: Boolean(raw),
        tokenFingerprint: fingerprintDiagnosticSecret(raw),
        workspaceSysId
      });
      return { tabSessionId: "", token: raw };
    }
  } catch {
    recordDocseraDiagnosticEvent("lease.storage.read", {
      storageInaccessible: true,
      storageRecordExists: false,
      workspaceSysId
    });
    return { tabSessionId: "", token: "" };
  }
}
function storeWorkspaceLease(workspaceSysId: string, token: string, tabSessionId: string) {
  try {
    window.sessionStorage.setItem(workspaceLeaseStorageKey(workspaceSysId), JSON.stringify({ tabSessionId, token }));
    recordDocseraDiagnosticEvent("lease.storage.write", {
      storageOrigin: window.location.origin,
      storedTabSessionFingerprint: fingerprintDiagnosticSecret(tabSessionId),
      tokenExists: Boolean(token),
      tokenFingerprint: fingerprintDiagnosticSecret(token),
      workspaceSysId
    });
  } catch {
    recordDocseraDiagnosticEvent("lease.storage.write", {
      storageInaccessible: true,
      workspaceSysId
    });
  }
}
function clearStoredWorkspaceLease(workspaceSysId: string, reason: string) {
  const prior = readStoredWorkspaceLease(workspaceSysId);
  try {
    window.sessionStorage.removeItem(workspaceLeaseStorageKey(workspaceSysId));
    window.sessionStorage.removeItem(workspaceLeaseReloadMarkerKey(workspaceSysId));
    recordDocseraDiagnosticEvent("lease.storage.clear", {
      reason,
      storageOrigin: window.location.origin,
      storedTabSessionFingerprint: fingerprintDiagnosticSecret(prior.tabSessionId),
      storedTokenCleared: Boolean(prior.token),
      tokenFingerprint: fingerprintDiagnosticSecret(prior.token),
      workspaceSysId
    });
  } catch {
    recordDocseraDiagnosticEvent("lease.storage.clear", {
      reason,
      storageInaccessible: true,
      workspaceSysId
    });
  }
}

function markWorkspaceLeaseReloadIntent(binding: WorkspaceLeaseBinding): void {
  const tabSessionId = getOrCreateWorkspaceLeaseTabSessionId();
  if (!tabSessionId || !binding.workspaceSysId) {
    return;
  }

  try {
    window.sessionStorage.setItem(workspaceLeaseReloadMarkerKey(binding.workspaceSysId), JSON.stringify({
      tabSessionId,
      timestamp: Date.now()
    }));
    recordDocseraDiagnosticEvent("lease.reloadMarker.write", {
      storedTabSessionFingerprint: fingerprintDiagnosticSecret(tabSessionId),
      workspaceSlug: binding.workspaceSlug,
      workspaceSysId: binding.workspaceSysId
    });
  } catch {
    recordDocseraDiagnosticEvent("lease.reloadMarker.write", {
      storageInaccessible: true,
      workspaceSlug: binding.workspaceSlug,
      workspaceSysId: binding.workspaceSysId
    });
  }
}

function consumeWorkspaceLeaseReloadIntent(workspaceSysId: string, tabSessionId: string): boolean {
  const key = workspaceLeaseReloadMarkerKey(workspaceSysId);
  try {
    const raw = cleanText(window.sessionStorage.getItem(key));
    if (raw) {
      window.sessionStorage.removeItem(key);
    }
    if (!raw || !tabSessionId) {
      return false;
    }

    const parsed = JSON.parse(raw) as { tabSessionId?: unknown; timestamp?: unknown };
    const markerTabSessionId = cleanText(parsed.tabSessionId);
    const timestamp = typeof parsed.timestamp === "number" ? parsed.timestamp : 0;
    const ageMs = Date.now() - timestamp;
    const canUse = markerTabSessionId === tabSessionId && ageMs >= 0 && ageMs <= DOCSERA_WORKSPACE_LEASE_RELOAD_MARKER_MAX_AGE_MS;
    recordDocseraDiagnosticEvent("lease.reloadMarker.consume", {
      ageMs,
      canUse,
      markerTabSessionFingerprint: fingerprintDiagnosticSecret(markerTabSessionId),
      tabSessionFingerprint: fingerprintDiagnosticSecret(tabSessionId),
      workspaceSysId
    });
    return canUse;
  } catch {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore cleanup failure; the diagnostic below is the actionable signal.
    }
    recordDocseraDiagnosticEvent("lease.reloadMarker.consume", {
      parseSucceeded: false,
      workspaceSysId
    });
    return false;
  }
}

function isCurrentDocumentReloadNavigation(): boolean {
  try {
    const entries = window.performance?.getEntriesByType?.("navigation") ?? [];
    const navigation = entries[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type) {
      return navigation.type === "reload";
    }
  } catch {
    return false;
  }

  return false;
}

function createWorkspaceLeaseHolderNotice(result: { holderDisplayName: string | null; sameUserDifferentSession: boolean }, failure: "locked" | "lost"): WorkspaceLeaseState {
  const holderDisplayName = cleanText(result.holderDisplayName) || null;
  const sameUserDifferentSession = Boolean(result.sameUserDifferentSession);
  return {
    state: "blocked",
    failure,
    holderDisplayName,
    sameUserDifferentSession,
    message: sameUserDifferentSession
      ? "This workspace is already being edited in another tab or window for your account."
      : holderDisplayName
        ? `This workspace is currently being edited by ${holderDisplayName}.`
        : "This workspace is currently being edited by another user."
  };
}

function createWorkspaceLeaseFailureNotice(
  result: { errorMessage: string; failure: "forbidden" | "transient" | "terminal" }
): Extract<WorkspaceLeaseState, { state: "blocked" }> {
  return {
    state: "blocked",
    failure: result.failure,
    holderDisplayName: null,
    sameUserDifferentSession: false,
    message: cleanText(result.errorMessage) || (result.failure === "transient"
      ? "Workspace editing is temporarily unavailable. Please try again."
      : "Workspace editing is unavailable.")
  };
}

function createWorkspaceLeaseTransientRecoveryState(errorMessage: string): WorkspaceLeaseState {
  return {
    state: "transient_failure",
    message: cleanText(errorMessage) || "Workspace editing is temporarily unavailable. Please try again."
  };
}

function createInlinePageCreateState(parentPageSysId = "", focusToken = 0): InlinePageCreateState {
  return {
    errorMessage: "",
    focusToken,
    noticeMessage: "",
    parentPageSysId: cleanText(parentPageSysId),
    pending: false,
    showInput: true,
    title: "untitled-page"
  };
}

function createEmptyPageSettingsState(): PageSettingsState {
  return {
    activeField: "",
    deleteError: "",
    deleteOpen: false,
    deletePending: false,
    generalError: "",
    noticeMessage: "",
    pageSysId: "",
    slug: "",
    slugSnapshot: "",
    slugError: "",
    title: "",
    titleError: "",
    titleSnapshot: "",
    open: false
  };
}

function isPageSettingsStateEmpty(state: PageSettingsState): boolean {
  return (
    !state.open &&
    !state.activeField &&
    !state.deleteError &&
    !state.deleteOpen &&
    !state.deletePending &&
    !state.generalError &&
    !state.noticeMessage &&
    !state.pageSysId &&
    !state.slug &&
    !state.slugSnapshot &&
    !state.slugError &&
    !state.title &&
    !state.titleError &&
    !state.titleSnapshot
  );
}

function createPageSettingsStateFromPage(page: WorkspacePageRecord): PageSettingsState {
  const title = cleanText(page.draftTitle || page.publishedTitle || "");
  const slug = cleanText(page.draftSlug || page.publishedSlug || "");

  return {
    ...createEmptyPageSettingsState(),
    pageSysId: cleanText(page.sysId),
    title,
    titleSnapshot: title,
    slug,
    slugSnapshot: slug,
    open: true
  };
}

function createInitialPingState(runtime: DocseraRuntimeContext): RuntimeProbeState {
  return runtime.config.backendPingPath ? { status: "loading" } : { status: "idle" };
}

function createInitialRoute(): DocseraAppRoute {
  return readAppRoute(window.location);
}

function createWorkspaceModeUiState(): WorkspaceModeUiState {
  return {
    collapsedPageIds: [],
    searchQuery: "",
    selectedPageSysId: ""
  };
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createWorkspaceCommandId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isObsoleteWorkspaceMutationOutcome(outcome: { errorMessage?: string; state: string }): boolean {
  return outcome.state === "transient_failure" && cleanText(outcome.errorMessage) === "The editing session changed.";
}

function readStoredTheme(): "dark" | "light" {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = cleanText(window.localStorage.getItem(DOCSERA_THEME_STORAGE_KEY));
  return storedTheme === "dark" ? "dark" : "light";
}

function readStoredRecentWorkspaceSlugs(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DOCSERA_RECENT_WORKSPACES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((value) => cleanText(value)).filter(Boolean);
  } catch {
    return [];
  }
}

function writeStoredRecentWorkspaceSlugs(workspaceSlugs: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DOCSERA_RECENT_WORKSPACES_STORAGE_KEY,
    JSON.stringify(workspaceSlugs.map((value) => cleanText(value)).filter(Boolean).slice(0, 10))
  );
}

function rememberRecentWorkspaceSlug(workspaceSlug: string): void {
  const slug = cleanText(workspaceSlug);
  if (!slug) {
    return;
  }

  const nextSlugs = [slug, ...readStoredRecentWorkspaceSlugs().filter((value) => value !== slug)];
  writeStoredRecentWorkspaceSlugs(nextSlugs);
}

function sortRecentWorkspaceItems(items: WorkspaceViewRecord[], currentWorkspaceSlug = ""): WorkspaceViewRecord[] {
  const orderedSlugs = [cleanText(currentWorkspaceSlug), ...readStoredRecentWorkspaceSlugs()].filter(Boolean);
  const rankBySlug = new Map<string, number>();

  orderedSlugs.forEach((slug, index) => {
    if (!rankBySlug.has(slug)) {
      rankBySlug.set(slug, index);
    }
  });

  return [...items].sort((left, right) => {
    const leftRank = rankBySlug.get(cleanText(left.slug));
    const rightRank = rankBySlug.get(cleanText(right.slug));

    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) {
        return 1;
      }

      if (rightRank === undefined) {
        return -1;
      }

      return leftRank - rightRank;
    }

    return cleanText(left.name).localeCompare(cleanText(right.name), undefined, { sensitivity: "base" });
  });
}

function buildModeStateKey(workspaceSlug: string, mode: WorkspaceMode): string {
  return `${cleanText(workspaceSlug)}::${mode}`;
}

function buildWorkspaceHeaderIdentity(input: {
  currentWorkspaceSlug: string;
  pendingWorkspaceIdentity: PendingWorkspaceIdentity | null;
  recentWorkspaceItems: RecentWorkspaceItem[];
  workspaceState: WorkspaceState;
}): HeaderIdentity {
  const { currentWorkspaceSlug, pendingWorkspaceIdentity, recentWorkspaceItems, workspaceState } = input;

  if (workspaceState.status === "success" && workspaceState.data.slug === currentWorkspaceSlug) {
    return {
      kind: "workspace",
      icon: workspaceState.data.icon,
      name: workspaceState.data.name
    };
  }

  const optimisticIdentity =
    (pendingWorkspaceIdentity && cleanText(pendingWorkspaceIdentity.slug) === currentWorkspaceSlug ? pendingWorkspaceIdentity : null) ??
    recentWorkspaceItems.find((item) => cleanText(item.slug) === currentWorkspaceSlug) ??
    null;

  if (optimisticIdentity) {
    return {
      kind: "workspace",
      icon: optimisticIdentity.icon,
      name: optimisticIdentity.name
    };
  }

  return { kind: "workspace-loading" };
}

function getFirstWorkspacePage(pages: WorkspacePageRecord[]): WorkspacePageRecord | null {
  return pages[0] ?? null;
}

function findWorkspacePageBySysId(pages: WorkspacePageRecord[], pageSysId: string): WorkspacePageRecord | null {
  const normalizedPageSysId = cleanText(pageSysId);
  if (!normalizedPageSysId) {
    return null;
  }

  return pages.find((page) => cleanText(page.sysId) === normalizedPageSysId) ?? null;
}

function findWorkspacePageBySlug(
  pages: WorkspacePageRecord[],
  pageSlug: string,
  mode: WorkspaceMode
): WorkspacePageRecord | null {
  const normalizedPageSlug = cleanText(pageSlug).toLowerCase();
  if (!normalizedPageSlug) {
    return null;
  }

  if (mode === "edit") {
    return (
      pages.find((page) => cleanText(page.draftSlugNormalized || page.draftSlug).toLowerCase() === normalizedPageSlug) ??
      pages.find((page) => cleanText(page.publishedSlugNormalized || page.publishedSlug).toLowerCase() === normalizedPageSlug) ??
      null
    );
  }

  return pages.find((page) => cleanText(page.draftSlugNormalized || page.draftSlug).toLowerCase() === normalizedPageSlug) ?? null;
}

function resolveWorkspacePageSelection(
  pages: WorkspacePageRecord[],
  input: {
    legacyPageId?: string;
    preferredPageSysId?: string;
    pageSlug?: string;
    mode: WorkspaceMode;
  }
): { page: WorkspacePageRecord | null; pageId: string; pageSlug: string } {
  const page =
    findWorkspacePageBySlug(pages, input.pageSlug ?? "", input.mode) ??
    findWorkspacePageBySysId(pages, input.preferredPageSysId ?? "") ??
    findWorkspacePageBySysId(pages, input.legacyPageId ?? "") ??
    getFirstWorkspacePage(pages);

  return {
    page,
    pageId: cleanText(page?.sysId),
    pageSlug: cleanText(page?.draftSlug)
  };
}

function findWorkspacePageRecordBySysId(pages: WorkspacePageRecord[], pageSysId: string): WorkspacePageRecord | null {
  const normalizedPageSysId = cleanText(pageSysId);
  if (!normalizedPageSysId) {
    return null;
  }

  return pages.find((page) => cleanText(page.sysId) === normalizedPageSysId) ?? null;
}

function findWorkspacePageViewBySysId(pages: WorkspacePageView[], pageSysId: string): WorkspacePageView | null {
  const normalizedPageSysId = cleanText(pageSysId);
  if (!normalizedPageSysId) {
    return null;
  }

  for (const page of pages) {
    if (cleanText(page.sysId) === normalizedPageSysId) {
      return page;
    }

    const childMatch = page.children ? findWorkspacePageViewBySysId(page.children, normalizedPageSysId) : null;
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return cleanText(error.message) || fallback;
  }

  return cleanText(error) || fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

function navigateTo(href: string, replace = false, reason = "application_route_change"): void {
  const before = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (replace) {
    window.history.replaceState({}, "", href);
  } else {
    window.history.pushState({}, "", href);
  }
  const after = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  recordDocseraDiagnosticEvent("route.historyChange", {
    after,
    before,
    method: replace ? "replaceState" : "pushState",
    reason,
    routeChangeType: classifyRouteChangeReason(reason)
  });
}

function classifyRouteChangeReason(reason: string): string {
  if (reason === "settings_intent_cleanup") return "settings-intent cleanup";
  if (reason === "route_canonicalization") return "canonicalization";
  if (reason === "access_loss_fallback") return "access-loss fallback";
  if (reason === "deliberate_edit_exit") return "deliberate Edit exit";
  if (reason === "workspace_switch") return "workspace switch";
  if (reason === "open_launcher") return "launcher navigation";
  if (reason === "popstate_guard_restore") return "startup fallback";
  return "user navigation";
}

function buildHrefFromRoute(route: DocseraAppRoute): string {
  if (route.mode === "workspace") {
    return buildWorkspaceHref(route.workspaceSlug, {
      mode: route.workspaceMode,
      pageSlug: route.pageSlug || undefined,
      settingsIntent: route.settingsIntent
    });
  }

  return buildLauncherHref();
}

function resolveWorkspaceLeaseReleaseReason(
  route: DocseraAppRoute,
  requestedWorkspaceMode: WorkspaceMode,
  currentWorkspaceSlug: string,
  binding: WorkspaceLeaseBinding
): string {
  if (route.mode !== "workspace") {
    return "open_launcher";
  }
  if (cleanText(currentWorkspaceSlug) !== cleanText(binding.workspaceSlug)) {
    return "workspace_switch";
  }
  if (requestedWorkspaceMode !== "edit") {
    return "edit_to_live";
  }
  return "deliberate_release";
}

export function App({ runtime, serviceNowClient }: { runtime: DocseraRuntimeContext; serviceNowClient: ServiceNowClient }) {
  const [theme, setTheme] = useState<"dark" | "light">(readStoredTheme);
  const initialRoute = createInitialRoute();
  const [route, setRoute] = useState<DocseraAppRoute>(initialRoute);
  const [workspaceNavWidth, setWorkspaceNavWidth] = useState(() =>
    initialRoute.mode === "workspace" ? readStoredWorkspaceNavWidth(initialRoute.workspaceSlug) : DEFAULT_WORKSPACE_NAV_WIDTH
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, setPingState] = useState<RuntimeProbeState>(() => createInitialPingState(runtime));
  const [launcherSearchText, setLauncherSearchText] = useState("");
  const [launcherPage, setLauncherPage] = useState(1);
  const [launcherRefreshToken, setLauncherRefreshToken] = useState(0);
  const [launcherState, setLauncherState] = useState<WorkspaceListState>({ status: "idle" });
  const [workspaceSwitcherState, setWorkspaceSwitcherState] = useState<WorkspaceSwitcherState>({ status: "idle" });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({ status: "idle" });
  const [pendingWorkspaceIdentity, setPendingWorkspaceIdentity] = useState<PendingWorkspaceIdentity | null>(null);
  const [workspacePagesState, setWorkspacePagesState] = useState<WorkspacePagesState>({ status: "idle" });
  const [pendingChangesState, setPendingChangesState] = useState<PendingChangesState>({ status: "idle" });
  const [workspacePublishState, setWorkspacePublishState] = useState<WorkspacePublishState>({ status: "idle" });
  const [workspaceDiscardAllState, setWorkspaceDiscardAllState] = useState<WorkspaceDiscardAllState>({ status: "idle" });
  const [workspacePublishToastState, setWorkspacePublishToastState] = useState<WorkspacePublishToastState | null>(null);
  const [staleRefreshState, setStaleRefreshState] = useState<StaleRefreshState>({ status: "idle" });
  const [workspaceSettingsNotice, setWorkspaceSettingsNotice] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalPhase, setCreateModalPhase] = useState<"idle" | "submitting" | "polling">("idle");
  const [createModalError, setCreateModalError] = useState<string | undefined>();
  const [editorFailure, setEditorFailure] = useState<PageEditorHostFailure | null>(null);
  const [editAccessLost, setEditAccessLost] = useState(false);
  const [recoveryVersion, setRecoveryVersion] = useState(0);
  const [shellNotice, setShellNotice] = useState<ShellNoticeState | null>(null);
  const [workspaceLeaseState, setWorkspaceLeaseState] = useState<WorkspaceLeaseState>({ state: "idle" });
  const [editorRetryNonce, setEditorRetryNonce] = useState(0);
  const [workspacePagesRetryNonce, setWorkspacePagesRetryNonce] = useState(0);
  const [editorTransitionState, setEditorTransitionState] = useState<EditorTransitionState>({ isDirty: false, isSaving: false, status: "Saved" });
  const editorFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const editorRecoverySnapshotRef = useRef<(() => PageEditorRecoverySnapshot | null) | null>(null);
  const editorReleaseRef = useRef<((options?: { keepalive?: boolean }) => Promise<void>) | null>(null);
  const routeTransitionGenerationRef = useRef(0);
  const [pendingRouteTransition, setPendingRouteTransition] = useState<RequestedRouteTransition | null>(null);
  const [inlinePageCreateState, setInlinePageCreateState] = useState<InlinePageCreateState | null>(null);
  const [modeUiState, setModeUiState] = useState<Record<string, WorkspaceModeUiState>>({});
  const [pageOutlineOverrides, setPageOutlineOverrides] = useState<Record<string, WorkspacePageOutlineItem[]>>({});
  const [pageSettingsState, setPageSettingsState] = useState<PageSettingsState>(createEmptyPageSettingsState);
  const [showTransitionProgress, setShowTransitionProgress] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [lastCommittedWorkspaceHeaderPresentation, setLastCommittedWorkspaceHeaderPresentation] =
    useState<WorkspaceHeaderPresentation | null>(null);
  const [lastReadyWorkspaceShell, setLastReadyWorkspaceShell] = useState<RetainedWorkspaceShellState | null>(null);
  const launcherRequestIdRef = useRef(0);
  const staleRefreshRequestIdRef = useRef(0);
  const pendingChangesRequestIdRef = useRef(0);
  const crossModeTargetPageSysIdRef = useRef("");
  const inlinePageCreateFocusTokenRef = useRef(0);
  const inlinePageCreateStateRef = useRef<InlinePageCreateState | null>(null);
  const lastWorkspaceModeKeyRef = useRef("");
  const pageSettingsStateRef = useRef<PageSettingsState>(createEmptyPageSettingsState());
  const pageSettingsPendingOpenPageIdRef = useRef("");
  const pageSettingsPanelRef = useRef<HTMLElement>(null);
  const pageSettingsCloseTargetRef = useRef("");
  const pageSettingsCloseTimerRef = useRef<number | null>(null);
  const workspacePublishToastTimerRef = useRef<number | null>(null);
  const workspacePublishToastSequenceRef = useRef(0);
  const editReentryRequestedRef = useRef(false);
  const recoveryCaptureSequenceRef = useRef(0);
  const recoveryRestoreNoticeKeyRef = useRef("");
  const restoredBodyCaptureRef = useRef<{ captureGeneration: number; pageSysId: string; sessionKey: string; workspaceSlug: string; workspaceSysId: string } | null>(null);
  const restoredPageSettingsCaptureRef = useRef<{ captureGeneration: number; pageSysId: string; workspaceSlug: string; workspaceSysId: string } | null>(null);
  const restoredInlineCreateCaptureRef = useRef<{ captureGeneration: number; workspaceSlug: string; workspaceSysId: string } | null>(null);
  const editorSessionGenerationRef = useRef(new EditorSessionGeneration());
  const editorSessionSeedRef = useRef("");
  const activeEditorSessionRef = useRef<EditorSessionToken | null>(null);
  const workspaceLeaseBindingRef = useRef<WorkspaceLeaseBinding | null>(null);
  const workspaceLeaseOperationGenerationRef = useRef(0);
  const workspaceLeaseRecoveryRef = useRef(new WorkspaceLeaseRecoveryCoordinator());
  const workspaceMutationQueueRef = useRef<WorkspaceMutationQueue | null>(null);
  const authoringRecoveryRef = useRef(new AuthoringRecoveryStore());
  const workspaceLeaseStateRef = useRef<WorkspaceLeaseState>({ state: "idle" });
  const workspaceLeaseCoordinationRef = useRef(new WorkspaceLeaseCoordination({
    channelName: DOCSERA_WORKSPACE_LEASE_CHANNEL_NAME,
    probeTimeoutMs: DOCSERA_WORKSPACE_LEASE_PROBE_TIMEOUT_MS
  }));
  const serviceNowClientRef = useRef(serviceNowClient);
  const editorSessionKeyRef = useRef("");
  const [editorSessionState, setEditorSessionState] = useState<EditorSessionState>({
    sessionKey: "",
    token: null
  });

  useEffect(() => {
    inlinePageCreateStateRef.current = inlinePageCreateState;
  }, [inlinePageCreateState]);

  useEffect(() => {
    pageSettingsStateRef.current = pageSettingsState;
  }, [pageSettingsState]);

  useEffect(() => { workspaceLeaseStateRef.current = workspaceLeaseState; }, [workspaceLeaseState]);

  useEffect(() => {
    editorSessionKeyRef.current = editorSessionState.sessionKey;
  }, [editorSessionState.sessionKey]);

  useEffect(() => {
    serviceNowClientRef.current = serviceNowClient;
  }, [serviceNowClient]);

  const workspaceMutationQueueOptions = {
    getAuthority: () => currentWorkspaceMutationAuthority(),
    installAuthority: (authority: { changeSetId?: string; changeSetRevision?: number }, source: "mutation" | "refresh") => installWorkspaceMutationAuthority(authority, source),
    isCurrentContext: isCurrentWorkspaceMutationContext,
    onStaleGeneration: requestStaleRefreshBlock
  };
  if (!workspaceMutationQueueRef.current) {
    workspaceMutationQueueRef.current = new WorkspaceMutationQueue(workspaceMutationQueueOptions);
  } else {
    workspaceMutationQueueRef.current.setOptions(workspaceMutationQueueOptions);
  }

  useEffect(() => {
    recordDocseraDiagnosticEvent("app.mount", {
      initialRoute,
      locationHref: window.location.href,
      locationSearch: window.location.search
    });
    return () => {
      recordDocseraDiagnosticEvent("app.unmount", {
        route
      });
    };
  }, []);

  useEffect(() => {
    recordDocseraDiagnosticEvent("route.state", {
      route
    });
  }, [route]);

  function bumpRecoveryVersion(): void {
    setRecoveryVersion((current) => current + 1);
  }

  function nextRecoveryCaptureId(): number {
    recoveryCaptureSequenceRef.current += 1;
    return recoveryCaptureSequenceRef.current;
  }

  function getWorkspaceRecoveryIdentity(): WorkspaceRecoveryIdentity | null {
    if (workspaceState.status !== "success") {
      return null;
    }

    return {
      workspaceSlug: workspaceState.data.slug,
      workspaceSysId: cleanText(workspaceState.data.sysId)
    };
  }

  function getPageRecoveryIdentity(pageSysId: string): BodyRecoveryIdentity | null {
    const workspaceIdentity = getWorkspaceRecoveryIdentity();
    const normalizedPageSysId = cleanText(pageSysId);
    if (!workspaceIdentity || !normalizedPageSysId) {
      return null;
    }

    return {
      ...workspaceIdentity,
      pageSysId: normalizedPageSysId
    };
  }

  function setScopedShellNotice(input: ShellNoticeState | null): void {
    recoveryRestoreNoticeKeyRef.current = input ? `${input.workspaceSlug}:${input.workspaceMode ?? ""}:${input.pageSysId ?? ""}:${input.message}` : "";
    setShellNotice(input);
  }

  function clearWorkspacePublishToast(): void {
    if (workspacePublishToastTimerRef.current !== null) {
      window.clearTimeout(workspacePublishToastTimerRef.current);
      workspacePublishToastTimerRef.current = null;
    }
    setWorkspacePublishToastState(null);
  }

  function showWorkspacePublishToast(input: { workspaceSlug: string; workspaceSysId: string }): void {
    clearWorkspacePublishToast();
    const id = workspacePublishToastSequenceRef.current + 1;
    workspacePublishToastSequenceRef.current = id;
    setWorkspacePublishToastState({
      id,
      message: "Workspace changes published.",
      workspaceSlug: input.workspaceSlug,
      workspaceSysId: input.workspaceSysId
    });
    const timeoutId = window.setTimeout(() => {
      setWorkspacePublishToastState((current) => (current?.id === id ? null : current));
      if (workspacePublishToastTimerRef.current === timeoutId) {
        workspacePublishToastTimerRef.current = null;
      }
    }, 3000);
    workspacePublishToastTimerRef.current = timeoutId;
  }

  function getRestoredBodyCaptureForSession(sessionKey: string): {
    captureGeneration: number;
    pageSysId: string;
    sessionKey: string;
    workspaceSlug: string;
    workspaceSysId: string;
  } | null {
    const restoredCapture = restoredBodyCaptureRef.current;
    return restoredCapture && restoredCapture.sessionKey === sessionKey ? restoredCapture : null;
  }

  function clearRestoredBodyCapture(target: {
    captureGeneration: number;
    pageSysId: string;
    sessionKey: string;
    workspaceSlug: string;
    workspaceSysId: string;
  }): boolean {
    const cleared = authoringRecoveryRef.current.clearBody({
      pageSysId: target.pageSysId,
      workspaceSlug: target.workspaceSlug,
      workspaceSysId: target.workspaceSysId
    }, target.captureGeneration);
    if (!cleared) {
      return false;
    }

    if (
      restoredBodyCaptureRef.current &&
      restoredBodyCaptureRef.current.captureGeneration === target.captureGeneration &&
      restoredBodyCaptureRef.current.pageSysId === target.pageSysId &&
      restoredBodyCaptureRef.current.sessionKey === target.sessionKey &&
      restoredBodyCaptureRef.current.workspaceSlug === target.workspaceSlug &&
      restoredBodyCaptureRef.current.workspaceSysId === target.workspaceSysId
    ) {
      restoredBodyCaptureRef.current = null;
    }

    if (
      recoveryRestoreNoticeKeyRef.current === `${target.workspaceSlug}:edit:${target.pageSysId}:${RESTORED_BODY_NOTICE}` ||
      recoveryRestoreNoticeKeyRef.current === `${target.workspaceSlug}:edit:${target.pageSysId}:${RESTORED_BODY_MISMATCH_NOTICE}`
    ) {
      setScopedShellNotice(null);
    }

    return true;
  }

  function hasRecoverablePageSettingsState(state: PageSettingsState): boolean {
    if (!state.open) {
      return false;
    }

    return state.activeField !== ""
      || cleanText(state.title) !== cleanText(state.titleSnapshot)
      || cleanText(state.slug).toLowerCase() !== cleanText(state.slugSnapshot).toLowerCase()
      || Boolean(cleanText(state.titleError))
      || Boolean(cleanText(state.slugError));
  }

  function hasRecoverableInlineCreateState(state: InlinePageCreateState | null): state is InlinePageCreateState {
    if (!state) {
      return false;
    }

    return state.showInput || state.pending || Boolean(cleanText(state.title)) || Boolean(cleanText(state.parentPageSysId));
  }

  function captureActiveAuthoringRecovery(input: { message: string; reason: AuthoringRecoveryReason }): void {
    if (input.reason !== "contention") {
      return;
    }

    const workspaceIdentity = getWorkspaceRecoveryIdentity();
    if (!workspaceIdentity) {
      return;
    }

    let captured = false;
    const bodySnapshot = editorRecoverySnapshotRef.current?.();
    if (
      bodySnapshot &&
      bodySnapshot.isDirty &&
      bodySnapshot.sessionKey === editorSessionKeyRef.current
    ) {
      authoringRecoveryRef.current.captureBody({
        captureGeneration: nextRecoveryCaptureId(),
        editorSessionGeneration: activeEditorSessionRef.current?.generation ?? 0,
        envelope: bodySnapshot.envelope,
        expectedRevision: bodySnapshot.savedRevision,
        failureMessage: input.message,
        pageSysId: bodySnapshot.pageSysId,
        workspaceSlug: workspaceIdentity.workspaceSlug,
        workspaceSysId: workspaceIdentity.workspaceSysId
      });
      captured = true;
    }

    const pageSettingsSnapshot = pageSettingsStateRef.current;
    if (hasRecoverablePageSettingsState(pageSettingsSnapshot)) {
      const pageIdentity = getPageRecoveryIdentity(pageSettingsSnapshot.pageSysId);
      if (pageIdentity) {
        authoringRecoveryRef.current.capturePageSettings({
          activeField: pageSettingsSnapshot.activeField,
          captureGeneration: nextRecoveryCaptureId(),
          generalError: input.message,
          pageSysId: pageIdentity.pageSysId,
          slug: pageSettingsSnapshot.slug,
          slugError: pageSettingsSnapshot.slugError,
          slugSnapshot: pageSettingsSnapshot.slugSnapshot,
          title: pageSettingsSnapshot.title,
          titleError: pageSettingsSnapshot.titleError,
          titleSnapshot: pageSettingsSnapshot.titleSnapshot,
          workspaceSlug: pageIdentity.workspaceSlug,
          workspaceSysId: pageIdentity.workspaceSysId
        });
        captured = true;
      }
    }

    const inlineCreateSnapshot = inlinePageCreateStateRef.current;
    if (hasRecoverableInlineCreateState(inlineCreateSnapshot)) {
      authoringRecoveryRef.current.captureInlineCreate({
        captureGeneration: nextRecoveryCaptureId(),
        focusToken: inlineCreateSnapshot.focusToken,
        parentPageSysId: inlineCreateSnapshot.parentPageSysId,
        title: inlineCreateSnapshot.title,
        workspaceSlug: workspaceIdentity.workspaceSlug,
        workspaceSysId: workspaceIdentity.workspaceSysId
      });
      captured = true;
    }

    if (captured) {
      bumpRecoveryVersion();
    }
  }

  function clearWorkspaceRecoveryState(workspaceIdentity: WorkspaceRecoveryIdentity): boolean {
    const clearedSnapshots: WorkspaceRecoveryClearResult = authoringRecoveryRef.current.clearWorkspace(workspaceIdentity);
    const cleared =
      clearedSnapshots.bodySnapshots.length > 0
      || clearedSnapshots.pageSettingsSnapshots.length > 0
      || clearedSnapshots.inlineCreateSnapshot !== null;

    if (
      restoredBodyCaptureRef.current &&
      restoredBodyCaptureRef.current.workspaceSlug === workspaceIdentity.workspaceSlug &&
      restoredBodyCaptureRef.current.workspaceSysId === workspaceIdentity.workspaceSysId
    ) {
      restoredBodyCaptureRef.current = null;
    }

    if (
      restoredPageSettingsCaptureRef.current &&
      restoredPageSettingsCaptureRef.current.workspaceSlug === workspaceIdentity.workspaceSlug &&
      restoredPageSettingsCaptureRef.current.workspaceSysId === workspaceIdentity.workspaceSysId
    ) {
      restoredPageSettingsCaptureRef.current = null;
    }

    if (
      restoredInlineCreateCaptureRef.current &&
      restoredInlineCreateCaptureRef.current.workspaceSlug === workspaceIdentity.workspaceSlug &&
      restoredInlineCreateCaptureRef.current.workspaceSysId === workspaceIdentity.workspaceSysId
    ) {
      restoredInlineCreateCaptureRef.current = null;
    }

    if (recoveryRestoreNoticeKeyRef.current.startsWith(`${workspaceIdentity.workspaceSlug}:`)) {
      setScopedShellNotice(null);
    }

    if (cleared) {
      bumpRecoveryVersion();
    }

    return cleared;
  }

  function clearDeletedPageRecoverySnapshots(
    workspaceIdentity: WorkspaceRecoveryIdentity,
    deletedPageIds: ReadonlySet<string>
  ): void {
    if (!deletedPageIds.size) {
      return;
    }

    let cleared = false;

    for (const snapshot of authoringRecoveryRef.current.listBodySnapshots(workspaceIdentity)) {
      if (!deletedPageIds.has(snapshot.pageSysId)) {
        continue;
      }
      const restoredSessionKey =
        restoredBodyCaptureRef.current &&
        restoredBodyCaptureRef.current.captureGeneration === snapshot.captureGeneration &&
        restoredBodyCaptureRef.current.pageSysId === snapshot.pageSysId
          ? restoredBodyCaptureRef.current.sessionKey
          : "";
      if (clearRestoredBodyCapture({
        captureGeneration: snapshot.captureGeneration,
        pageSysId: snapshot.pageSysId,
        sessionKey: restoredSessionKey,
        workspaceSlug: snapshot.workspaceSlug,
        workspaceSysId: snapshot.workspaceSysId
      })) {
        cleared = true;
      }
    }

    for (const snapshot of authoringRecoveryRef.current.listPageSettingsSnapshots(workspaceIdentity)) {
      if (!deletedPageIds.has(snapshot.pageSysId)) {
        continue;
      }
      if (authoringRecoveryRef.current.clearPageSettings(snapshot, snapshot.captureGeneration)) {
        cleared = true;
      }
      if (
        restoredPageSettingsCaptureRef.current &&
        restoredPageSettingsCaptureRef.current.captureGeneration === snapshot.captureGeneration &&
        restoredPageSettingsCaptureRef.current.pageSysId === snapshot.pageSysId
      ) {
        restoredPageSettingsCaptureRef.current = null;
      }
      if (recoveryRestoreNoticeKeyRef.current === `${snapshot.workspaceSlug}:edit::${RESTORED_PAGE_SETTINGS_NOTICE}`) {
        setScopedShellNotice(null);
      }
    }

    if (cleared) {
      bumpRecoveryVersion();
    }
  }

  function releaseWorkspaceLeaseBinding(binding: WorkspaceLeaseBinding, keepalive = true, reason = "deliberate_release"): void {
    const isCurrentBinding = workspaceLeaseBindingRef.current?.bindingId === binding.bindingId;
    if (isCurrentBinding) {
      workspaceLeaseBindingRef.current = null;
      workspaceLeaseCoordinationRef.current.stopResponder(binding.bindingId, reason);
      clearStoredWorkspaceLease(binding.workspaceSysId, reason);
    }
    recordDocseraDiagnosticEvent("lease.release.request", {
      reason,
      tokenFingerprint: fingerprintDiagnosticSecret(binding.leaseToken),
      tokenPresent: Boolean(binding.leaseToken),
      workspaceSlug: binding.workspaceSlug,
      workspaceSysId: binding.workspaceSysId
    });
    void serviceNowClientRef.current.releaseWorkspaceEditLease?.({ ...binding, keepalive });
  }

  function releaseObsoleteWorkspaceLeaseBinding(binding: WorkspaceLeaseBinding): void {
    const stored = readStoredWorkspaceLease(binding.workspaceSysId);
    if (stored.token && stored.token === binding.leaseToken) {
      return;
    }
    releaseWorkspaceLeaseBinding(binding, true, "obsolete_distinct_token");
  }

  function detachWorkspaceLeaseBindingForDocumentTeardown(): void {
    const binding = workspaceLeaseBindingRef.current;
    if (!binding) return;
    markWorkspaceLeaseReloadIntent(binding);
    workspaceLeaseBindingRef.current = null;
    workspaceLeaseCoordinationRef.current.stopResponder(binding.bindingId, "document_teardown");
    recordDocseraDiagnosticEvent("lease.documentTeardownDetach", {
      tokenFingerprint: fingerprintDiagnosticSecret(binding.leaseToken),
      workspaceSlug: binding.workspaceSlug,
      workspaceSysId: binding.workspaceSysId
    });
  }

  function workspaceLeaseRecoveryScope(): string {
    const workspace = workspaceState.status === "success" ? workspaceState.data : null;
    return `${route.mode}:${requestedWorkspaceMode}:${currentWorkspaceSlug}:${cleanText(workspace?.sysId)}:${workspaceLeaseOperationGenerationRef.current}`;
  }

  function currentWorkspaceMutationContextKey(input: { scope: "workspace" } | { scope: "body"; sessionToken: EditorSessionToken | null; pageSysId: string }): string {
    const workspace = workspaceState.status === "success" ? workspaceState.data : null;
    const base = [
      route.mode,
      requestedWorkspaceMode,
      currentWorkspaceSlug,
      cleanText(workspace?.sysId),
      workspaceLeaseOperationGenerationRef.current
    ];
    if (input.scope === "workspace") {
      return [...base, "workspace"].join(":");
    }
    return [
      ...base,
      "body",
      routeTransitionGenerationRef.current,
      cleanText(input.pageSysId),
      input.sessionToken?.generation ?? 0
    ].join(":");
  }

  function isCurrentWorkspaceMutationContext(contextKey: string): boolean {
    if (contextKey === currentWorkspaceMutationContextKey({ scope: "workspace" })) {
      return true;
    }
    const editorSession = activeEditorSessionRef.current;
    return contextKey === currentWorkspaceMutationContextKey({
      pageSysId: cleanText(editorSession?.pageSysId),
      scope: "body",
      sessionToken: editorSession
    });
  }

  async function runWorkspaceMutation<T extends { state: string; code?: string }>(input: {
    contextKey: string;
    dispatch: (workspaceLeaseToken: string, authority: ReturnType<typeof currentWorkspaceMutationAuthority>) => Promise<T>;
    safeRetry?: boolean;
    type: WorkspaceMutationType;
  }): Promise<T | WorkspaceLeaseMutationRecoveryResult> {
    const queue = workspaceMutationQueueRef.current;
    if (!queue) {
      return { state: "transient_failure", errorMessage: "Workspace editing is not ready." };
    }
    try {
      return await queue.enqueue<T | WorkspaceLeaseMutationRecoveryResult>({
        contextKey: input.contextKey,
        type: input.type,
        dispatch: async (authority) => {
          const outcome = await workspaceLeaseRecoveryRef.current.runMutation<T>({
            scope: workspaceLeaseRecoveryScope,
            ensure: ensureWorkspaceLeaseForMutation,
            invalidateLeaseRace: invalidateWorkspaceLeaseRace,
            isLeaseRace: (result) => input.safeRetry !== false && result.state === "failed" && result.code === "lock_lost",
            mutate: (workspaceLeaseToken) => input.dispatch(workspaceLeaseToken, authority)
          });
          return outcome;
        }
      });
    } catch (error) {
      if (isWorkspaceMutationCanceled(error)) {
        return { state: "transient_failure", errorMessage: "The editing session changed." };
      }
      throw error;
    }
  }

  function invalidateWorkspaceLeaseRace(): void {
    const binding = workspaceLeaseBindingRef.current;
    if (!binding) return;
    // A mutation response authoritatively rejected this token. Do not release it
    // again; remove all local authority before acquiring a replacement.
    workspaceLeaseCoordinationRef.current.stopResponder(binding.bindingId, "confirmed_lease_loss");
    workspaceLeaseBindingRef.current = null;
    clearStoredWorkspaceLease(binding.workspaceSysId, "confirmed_lease_loss");
    workspaceLeaseOperationGenerationRef.current += 1;
    workspaceLeaseRecoveryRef.current.reset();
    workspaceMutationQueueRef.current?.cancelObsolete("lease_generation_invalidated");
    setWorkspaceLeaseState({ state: "recovery_required" });
  }

  function clearActiveAuthoringUi(): void {
    const invalidatedPageSysId = cleanText(selectedWorkspacePage?.sysId);
    editorSessionGenerationRef.current.invalidate();
    editorSessionSeedRef.current = "";
    activeEditorSessionRef.current = null;
    editorFlushRef.current = null;
    editorRecoverySnapshotRef.current = null;
    editorReleaseRef.current = null;
    setEditorSessionState({
      sessionKey: "",
      token: null
    });
    setEditorTransitionState({ isDirty: false, isSaving: false, status: "Saved" });
    setPendingRouteTransition(null);
    setInlinePageCreateState(null);
    pageSettingsPendingOpenPageIdRef.current = "";
    if (pageSettingsStateRef.current.open) {
      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);
    }
    if (invalidatedPageSysId) {
      setPageOutlineOverrides((current) => {
        if (!(invalidatedPageSysId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[invalidatedPageSysId];
        return next;
      });
    }
  }

  function forceLiveAfterAuthoringAccessLoss(input: {
    expectedBinding?: WorkspaceLeaseBinding | null;
    expectedEditorSession?: EditorSessionToken | null;
    expectedWorkspaceLeaseGeneration: number;
    message: string;
    nextLeaseState: Extract<WorkspaceLeaseState, { state: "blocked" }>;
    reason: AuthoringRecoveryReason;
    workspaceSlug: string;
    workspaceSysId: string;
  }): boolean {
    if (
      route.mode !== "workspace" ||
      requestedWorkspaceMode !== "edit" ||
      currentWorkspaceSlug !== input.workspaceSlug ||
      workspaceState.status !== "success" ||
      workspaceState.data.slug !== input.workspaceSlug ||
      cleanText(workspaceState.data.sysId) !== input.workspaceSysId ||
      workspaceLeaseOperationGenerationRef.current !== input.expectedWorkspaceLeaseGeneration
    ) {
      return false;
    }

    if (input.expectedBinding && workspaceLeaseBindingRef.current !== input.expectedBinding) {
      return false;
    }

    if (input.expectedEditorSession && !isCurrentEditorSession(input.expectedEditorSession)) {
      return false;
    }

    if (input.reason === "contention") {
      captureActiveAuthoringRecovery({ message: input.message, reason: input.reason });
    } else {
      clearWorkspaceRecoveryState({
        workspaceSlug: input.workspaceSlug,
        workspaceSysId: input.workspaceSysId
      });
    }

    const binding = workspaceLeaseBindingRef.current;
    if (binding && (!input.expectedBinding || binding === input.expectedBinding)) {
      workspaceLeaseCoordinationRef.current.stopResponder(binding.bindingId, input.reason);
      workspaceLeaseBindingRef.current = null;
      clearStoredWorkspaceLease(binding.workspaceSysId, input.reason);
    }

    workspaceLeaseOperationGenerationRef.current += 1;
    workspaceLeaseRecoveryRef.current.reset();
    clearActiveAuthoringUi();
    setWorkspaceLeaseState(input.nextLeaseState);
    setEditAccessLost(true);
    commitRoute(buildWorkspaceHref(input.workspaceSlug, { mode: "live" }), true, "access_loss_fallback");
    return true;
  }

  useEffect(() => () => {
    detachWorkspaceLeaseBindingForDocumentTeardown();
  }, []);

  useEffect(() => {
    const detachForPageExit = () => {
      detachWorkspaceLeaseBindingForDocumentTeardown();
    };

    window.addEventListener("pagehide", detachForPageExit);
    window.addEventListener("beforeunload", detachForPageExit);
    return () => {
      window.removeEventListener("pagehide", detachForPageExit);
      window.removeEventListener("beforeunload", detachForPageExit);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pageSettingsCloseTimerRef.current !== null) {
        window.clearTimeout(pageSettingsCloseTimerRef.current);
        pageSettingsCloseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (workspacePublishToastTimerRef.current !== null) {
        window.clearTimeout(workspacePublishToastTimerRef.current);
        workspacePublishToastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-docsera-theme", theme);
    window.localStorage.setItem(DOCSERA_THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!pageSettingsState.open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const panel = pageSettingsPanelRef.current;
      if (!panel) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest("[data-docsera-page-settings-trigger='true']")) {
        return;
      }

      if (target instanceof Element && target.closest("[data-docsera-delete-dialog='true']")) {
        return;
      }

      if (target instanceof Node && panel.contains(target)) {
        return;
      }

      requestClosePageSettingsPanel(pageSettingsStateRef.current.pageSysId);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [pageSettingsState.open]);

  const currentWorkspaceSlug = route.mode === "workspace" ? route.workspaceSlug : "";
  const currentWorkspaceSettingsIntent = route.mode === "workspace" ? route.settingsIntent : false;
  const requestedWorkspaceMode = route.mode === "workspace" ? route.workspaceMode : "live";
  const currentWorkspacePageSlug = route.mode === "workspace" ? route.pageSlug : "";
  const currentWorkspaceLegacyPageId = route.mode === "workspace" ? route.legacyPageId : "";
  const loadedWorkspaceSlug = workspaceState.status === "success" ? workspaceState.data.slug : "";
  const recentWorkspaceItems = useMemo(
    () =>
      workspaceSwitcherState.status === "success"
        ? sortRecentWorkspaceItems(workspaceSwitcherState.items, currentWorkspaceSlug)
        : [],
    [currentWorkspaceSlug, workspaceSwitcherState]
  );
  const workspaceStateData = workspaceState.status === "success" ? workspaceState.data : null;
  const hasAuthoringCapability = Boolean(workspaceState.status === "success" && workspaceState.data.roleLabel);
  const workspaceEditLeasePending =
    route.mode === "workspace" &&
    requestedWorkspaceMode === "edit" &&
    workspaceState.status === "success" &&
    workspaceState.data.slug === currentWorkspaceSlug &&
    hasAuthoringCapability &&
    (
      workspaceLeaseState.state === "idle" ||
      workspaceLeaseState.state === "acquiring" ||
      workspaceLeaseState.state === "recovering" ||
      workspaceLeaseState.state === "recovery_required" ||
      workspaceLeaseState.state === "transient_failure" ||
      (
        workspaceLeaseState.state === "blocked" &&
        editReentryRequestedRef.current &&
        workspaceLeaseState.failure !== "terminal"
      )
    );
  const leaseKeepsAuthoringAvailable = ["held", "uncertain", "recovery_required", "recovering", "transient_failure"].includes(workspaceLeaseState.state);
  const activeWorkspaceMode: WorkspaceMode =
    route.mode === "workspace" && requestedWorkspaceMode === "edit" && hasAuthoringCapability && leaseKeepsAuthoringAvailable ? "edit" : "live";
  useEffect(() => {
    recordDocseraDiagnosticEvent("workspace.loadState", {
      status: workspaceState.status,
      workspaceSlug: workspaceState.status === "success" ? workspaceState.data.slug : currentWorkspaceSlug,
      workspaceSysId: workspaceState.status === "success" ? cleanText(workspaceState.data.sysId) : ""
    });
  }, [currentWorkspaceSlug, workspaceState]);

  useEffect(() => {
    recordDocseraDiagnosticEvent("workspace.modeState", {
      activeWorkspaceMode,
      requestedWorkspaceMode,
      workspaceSlug: currentWorkspaceSlug
    });
  }, [activeWorkspaceMode, currentWorkspaceSlug, requestedWorkspaceMode]);

  useEffect(() => {
    recordDocseraDiagnosticEvent("workspace.leaseState", {
      sameUserDifferentSession: workspaceLeaseState.state === "blocked" ? workspaceLeaseState.sameUserDifferentSession : false,
      state: workspaceLeaseState.state,
      tokenFingerprint: workspaceLeaseState.state === "held" ? fingerprintDiagnosticSecret(workspaceLeaseState.leaseToken) : "",
      workspaceSlug: currentWorkspaceSlug
    });
  }, [currentWorkspaceSlug, workspaceLeaseState]);

  useEffect(() => {
    recordDocseraDiagnosticEvent("workspace.editAccessLost", {
      editAccessLost,
      workspaceSlug: currentWorkspaceSlug
    });
  }, [currentWorkspaceSlug, editAccessLost]);

  useEffect(() => {
    recordDocseraDiagnosticEvent(route.mode === "launcher" ? "render.launcher" : "render.workspaceShell", {
      activeWorkspaceMode,
      requestedWorkspaceMode,
      route,
      workspaceSlug: currentWorkspaceSlug
    });
  }, [activeWorkspaceMode, currentWorkspaceSlug, requestedWorkspaceMode, route]);

  useEffect(() => {
    if (route.mode !== "workspace" || activeWorkspaceMode !== "edit" || workspaceLeaseState.state !== "held") {
      setPendingChangesState({ status: "idle" });
      pendingChangesRequestIdRef.current += 1;
      return;
    }
    void refreshPendingChanges({ keepPrevious: true });
  }, [
    activeWorkspaceMode,
    route.mode,
    workspaceLeaseState.state,
    workspaceLeaseState.state === "held" ? workspaceLeaseState.leaseToken : "",
    workspaceLeaseState.state === "held" ? workspaceLeaseState.changeSetId : "",
    workspaceLeaseState.state === "held" ? workspaceLeaseState.changeSetRevision : -1
  ]);
  const currentModeStateKey = buildModeStateKey(currentWorkspaceSlug, activeWorkspaceMode);
  const currentModeUiState = modeUiState[currentModeStateKey] ?? createWorkspaceModeUiState();
  const workspaceHeaderIdentity = useMemo(
    () =>
      buildWorkspaceHeaderIdentity({
        currentWorkspaceSlug,
        pendingWorkspaceIdentity,
        recentWorkspaceItems,
        workspaceState
      }),
    [currentWorkspaceSlug, pendingWorkspaceIdentity, recentWorkspaceItems, workspaceState]
  );
  const currentWorkspaceHeaderPresentation = useMemo(() => {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      return null;
    }

    return {
      showEditModeToggle: hasAuthoringCapability,
      showWorkspaceMode: activeWorkspaceMode,
      showWorkspaceSettings: Boolean(workspaceState.data.canManageSettings),
      showWorkspaceSwitcher: Boolean(workspaceState.data.roleLabel) || recentWorkspaceItems.length > 0
    };
  }, [
    activeWorkspaceMode,
    currentWorkspaceSlug,
    editAccessLost,
    hasAuthoringCapability,
    recentWorkspaceItems.length,
    route.mode,
    workspaceState
  ]);
  const isRetainingWorkspaceHeaderPresentation =
    route.mode === "workspace" &&
    lastCommittedWorkspaceHeaderPresentation !== null &&
    workspaceState.status !== "error" &&
    (workspaceState.status === "loading" || (workspaceState.status === "success" && workspaceState.data.slug !== currentWorkspaceSlug));
  const workspaceHeaderPresentation =
    currentWorkspaceHeaderPresentation ?? (isRetainingWorkspaceHeaderPresentation ? lastCommittedWorkspaceHeaderPresentation : null);
  useEffect(() => {
    if (currentWorkspaceHeaderPresentation) {
      setLastCommittedWorkspaceHeaderPresentation(currentWorkspaceHeaderPresentation);
    }
  }, [currentWorkspaceHeaderPresentation]);
  const workspacePagesLoaded =
    workspacePagesState.status === "success" &&
    workspacePagesState.workspaceSlug === currentWorkspaceSlug &&
    workspacePagesState.mode === activeWorkspaceMode;
  const workspacePagesLoading =
    workspacePagesState.status === "idle" ||
    workspacePagesState.status === "loading" ||
    (workspacePagesState.status === "success" && workspacePagesState.workspaceSlug !== currentWorkspaceSlug) ||
    (workspacePagesState.status === "success" && workspacePagesState.mode !== activeWorkspaceMode) ||
    (workspacePagesState.status === "error" && workspacePagesState.workspaceSlug !== currentWorkspaceSlug) ||
    (workspacePagesState.status === "error" && workspacePagesState.mode !== activeWorkspaceMode);
  const staleRefreshBlocksCurrentWorkspaceWrites =
    route.mode === "workspace" &&
    staleRefreshState.status !== "idle" &&
    staleRefreshState.workspaceSlug === currentWorkspaceSlug &&
    staleRefreshState.mode === activeWorkspaceMode &&
    isCurrentWorkspaceMutationContext(staleRefreshState.contextKey);
  const pendingChangesResult =
    pendingChangesState.status === "success" || pendingChangesState.status === "refreshing"
      ? pendingChangesState.data
      : pendingChangesState.status === "error" && pendingChangesState.previous
        ? pendingChangesState.previous
        : null;
  const currentWorkspaceCommandAuthority = currentWorkspaceMutationAuthority();
  const currentWorkspaceCommandSourceChangeSetId =
    currentWorkspaceCommandAuthority?.changeSetId ?? (pendingChangesResult?.state === "succeeded" ? pendingChangesResult.changeSetId : "");
  const currentWorkspaceCommandSourceChangeSetRevision =
    currentWorkspaceCommandAuthority?.changeSetRevision ?? (pendingChangesResult?.state === "succeeded" ? pendingChangesResult.changeSetRevision : -1);
  const currentWorkspaceCommandContextKey = currentWorkspaceMutationContextKey({ scope: "workspace" });
  const workspaceDiscardAllRecoveryRequired =
    route.mode === "workspace" &&
    workspaceDiscardAllState.status === "error" &&
    workspaceDiscardAllState.recoveryRequired &&
    workspaceDiscardAllState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardAllState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardAllState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardAllState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardAllState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision;
  const workspacePublishInProgress =
    route.mode === "workspace" &&
    workspacePublishState.status === "publishing" &&
    workspacePublishState.workspaceSlug === currentWorkspaceSlug &&
    workspacePublishState.workspaceSysId === cleanText(workspaceStateData?.sysId);
  const workspaceDiscardAllInProgress =
    route.mode === "workspace" &&
    workspaceDiscardAllState.status === "discarding" &&
    workspaceDiscardAllState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardAllState.workspaceSysId === cleanText(workspaceStateData?.sysId);
  const workspaceCommandBlocksCurrentWorkspaceWrites =
    workspacePublishInProgress || workspaceDiscardAllInProgress || workspaceDiscardAllRecoveryRequired;
  useEffect(() => {
    if (workspacePublishState.status === "idle") {
      return;
    }
    if (
      route.mode === "workspace" &&
      activeWorkspaceMode === "edit" &&
      workspacePublishState.workspaceSlug === currentWorkspaceSlug &&
      workspacePublishState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
      workspacePublishState.contextKey === currentWorkspaceCommandContextKey &&
      currentWorkspaceCommandSourceChangeSetId === workspacePublishState.sourceChangeSetId &&
      currentWorkspaceCommandSourceChangeSetRevision === workspacePublishState.sourceChangeSetRevision
    ) {
      return;
    }
    setWorkspacePublishState({ status: "idle" });
  }, [
    activeWorkspaceMode,
    currentWorkspaceCommandContextKey,
    currentWorkspaceCommandSourceChangeSetId,
    currentWorkspaceCommandSourceChangeSetRevision,
    currentWorkspaceSlug,
    route.mode,
    workspacePublishState,
    workspaceStateData?.sysId
  ]);
  useEffect(() => {
    if (workspaceDiscardAllState.status === "idle") {
      return;
    }
    if (
      route.mode === "workspace" &&
      activeWorkspaceMode === "edit" &&
      workspaceDiscardAllState.workspaceSlug === currentWorkspaceSlug &&
      workspaceDiscardAllState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
      workspaceDiscardAllState.contextKey === currentWorkspaceCommandContextKey &&
      currentWorkspaceCommandSourceChangeSetId === workspaceDiscardAllState.sourceChangeSetId &&
      currentWorkspaceCommandSourceChangeSetRevision === workspaceDiscardAllState.sourceChangeSetRevision
    ) {
      return;
    }
    setWorkspaceDiscardAllState({ status: "idle" });
  }, [
    activeWorkspaceMode,
    currentWorkspaceCommandContextKey,
    currentWorkspaceCommandSourceChangeSetId,
    currentWorkspaceCommandSourceChangeSetRevision,
    currentWorkspaceSlug,
    route.mode,
    workspaceDiscardAllState,
    workspaceStateData?.sysId
  ]);
  useEffect(() => {
    if (!workspacePublishToastState) {
      return;
    }
    if (
      route.mode !== "workspace" ||
      activeWorkspaceMode !== "edit" ||
      workspacePublishToastState.workspaceSlug !== currentWorkspaceSlug ||
      workspacePublishToastState.workspaceSysId !== cleanText(workspaceStateData?.sysId)
    ) {
      clearWorkspacePublishToast();
    }
  }, [activeWorkspaceMode, currentWorkspaceSlug, route.mode, workspacePublishToastState, workspaceStateData?.sysId]);
  const currentWorkspacePages = workspacePagesLoaded ? workspacePagesState.data : [];
  const treePages = useMemo(
    () => buildWorkspacePageTree(currentWorkspacePages, activeWorkspaceMode),
    [activeWorkspaceMode, currentWorkspacePages]
  );
  const workspaceShellViewModel =
    workspaceState.status === "success" ? buildWorkspaceShellViewModel(workspaceState.data) : null;
  const showCreatePageControls = activeWorkspaceMode === "edit" && hasAuthoringCapability && !editAccessLost;
  const canCreatePage = showCreatePageControls && workspacePagesLoaded && !staleRefreshBlocksCurrentWorkspaceWrites && !workspaceCommandBlocksCurrentWorkspaceWrites;
  const isCreatingPage = Boolean(inlinePageCreateState?.showInput || inlinePageCreateState?.pending);
  const createPageDisabledReason =
    staleRefreshBlocksCurrentWorkspaceWrites
      ? staleRefreshState.errorMessage || STALE_REFRESH_BLOCKED_MESSAGE
      : showCreatePageControls &&
          workspacePagesState.status === "error" &&
          workspacePagesState.workspaceSlug === currentWorkspaceSlug &&
          workspacePagesState.mode === activeWorkspaceMode
        ? "New page is unavailable because the workspace page list failed to load."
        : "";
  const selectedWorkspacePage =
    workspacePagesLoaded && currentWorkspacePages.length > 0
      ? resolveWorkspacePageSelection(currentWorkspacePages, {
          legacyPageId: currentWorkspaceLegacyPageId,
          mode: activeWorkspaceMode,
          pageSlug: currentWorkspacePageSlug,
          preferredPageSysId: crossModeTargetPageSysIdRef.current || currentModeUiState.selectedPageSysId
        }).page
      : null;
  const selectedWorkspacePageId = cleanText(selectedWorkspacePage?.sysId) || currentModeUiState.selectedPageSysId;
  const desiredEditorSessionSeed =
    route.mode === "workspace" && activeWorkspaceMode === "edit" && selectedWorkspacePageId
      ? `${currentWorkspaceSlug}:${selectedWorkspacePageId}:${editorRetryNonce}`
      : "";

  useLayoutEffect(() => {
    if (!desiredEditorSessionSeed) {
      if (!editorSessionSeedRef.current) {
        return;
      }

      editorSessionGenerationRef.current.invalidate();
      editorSessionSeedRef.current = "";
      activeEditorSessionRef.current = null;
      editorFlushRef.current = null;
      setEditorSessionState({
        sessionKey: "",
        token: null
      });
      return;
    }

    if (editorSessionSeedRef.current === desiredEditorSessionSeed) {
      return;
    }

    const nextSession = editorSessionGenerationRef.current.begin(selectedWorkspacePageId, selectedWorkspacePage?.draftRevision ?? 0);
    editorSessionSeedRef.current = desiredEditorSessionSeed;
    activeEditorSessionRef.current = nextSession;
    setEditorSessionState({
      sessionKey: `${nextSession.pageSysId}:${nextSession.generation}`,
      token: nextSession
    });
  }, [desiredEditorSessionSeed, selectedWorkspacePage?.draftRevision, selectedWorkspacePageId]);

  useLayoutEffect(() => {
    setIsEditorReady(false);
  }, [activeWorkspaceMode, editorSessionState.sessionKey, selectedWorkspacePageId]);

  const renderedEditorSession = editorSessionState.token;
  const editorSessionKey = editorSessionState.sessionKey;
  const selectedPageView = useMemo(
    () => findWorkspacePageViewBySysId(treePages, cleanText(selectedWorkspacePage?.sysId)),
    [selectedWorkspacePage?.sysId, treePages]
  );
  const workspaceRecoveryIdentity = useMemo(
    () => (workspaceState.status === "success" ? { workspaceSlug: workspaceState.data.slug, workspaceSysId: cleanText(workspaceState.data.sysId) } : null),
    [workspaceState]
  );
  const selectedPageRecoveryIdentity = useMemo(
    () => (workspaceRecoveryIdentity && selectedWorkspacePageId ? { ...workspaceRecoveryIdentity, pageSysId: selectedWorkspacePageId } : null),
    [selectedWorkspacePageId, workspaceRecoveryIdentity]
  );
  const bodyRecoverySnapshot = useMemo(
    () => (selectedPageRecoveryIdentity ? authoringRecoveryRef.current.readBody(selectedPageRecoveryIdentity) : null),
    [recoveryVersion, selectedPageRecoveryIdentity]
  );
  const pageSettingsRecoverySnapshot = useMemo(
    () => (selectedPageRecoveryIdentity ? authoringRecoveryRef.current.readPageSettings(selectedPageRecoveryIdentity) : null),
    [recoveryVersion, selectedPageRecoveryIdentity]
  );
  const selectedPagePath = useMemo(() => {
    const selectedPageSysId = cleanText(selectedWorkspacePage?.sysId);
    if (!selectedPageSysId) {
      return [];
    }

    const pathRecords: WorkspacePageRecord[] = [];
    const visitedPageIds = new Set<string>();
    let currentPage = findWorkspacePageRecordBySysId(currentWorkspacePages, selectedPageSysId);

    while (currentPage) {
      const currentPageSysId = cleanText(currentPage.sysId);
      if (!currentPageSysId || visitedPageIds.has(currentPageSysId)) {
        break;
      }

      visitedPageIds.add(currentPageSysId);
      pathRecords.unshift(currentPage);
      currentPage = findWorkspacePageRecordBySysId(currentWorkspacePages, cleanText(currentPage.parentPageSysId));
    }

    return pathRecords.map((page) => ({
      children: undefined,
      contentEnvelope: null,
      contentError: "",
      contentState: "missing" as const,
      id: cleanText(page.sysId),
      isDraftOnly: page.publicationState === "draft",
      page,
      parentPageSysId: cleanText(page.parentPageSysId) || null,
      publicationState: page.publicationState,
      siblingOrder: normalizeNumericSiblingOrder(page.siblingOrder),
      slug: cleanText(page.draftSlug),
      statusIndicator: null,
      sysId: cleanText(page.sysId),
      title: cleanText(page.draftTitle) || "Untitled page",
      tocItems: []
    }));
  }, [currentWorkspacePages, selectedWorkspacePage?.sysId]);
  const outlinePage = useMemo(() => {
    if (!selectedPageView) {
      return null;
    }

    const override = pageOutlineOverrides[cleanText(selectedPageView.sysId)];
    if (!override) {
      return selectedPageView;
    }

    return {
      ...selectedPageView,
      tocItems: override
    };
  }, [pageOutlineOverrides, selectedPageView]);
  const bodyRecoveryRevisionMatches =
    Boolean(
      route.mode === "workspace" &&
      activeWorkspaceMode === "edit" &&
      selectedPageView &&
      selectedPageView.contentState === "ready" &&
      selectedPageView.contentEnvelope &&
      bodyRecoverySnapshot &&
      selectedPageRecoveryIdentity &&
      bodyRecoverySnapshot.pageSysId === selectedPageRecoveryIdentity.pageSysId &&
      bodyRecoverySnapshot.workspaceSlug === selectedPageRecoveryIdentity.workspaceSlug &&
      bodyRecoverySnapshot.workspaceSysId === selectedPageRecoveryIdentity.workspaceSysId &&
      bodyRecoverySnapshot.expectedRevision === (selectedPageView.page.draftRevision ?? 0)
    );
  const pageSettingsRecoveryBaselineMatches =
    Boolean(
      route.mode === "workspace" &&
      activeWorkspaceMode === "edit" &&
      pageSettingsRecoverySnapshot &&
      selectedPageRecoveryIdentity &&
      pageSettingsRecoverySnapshot.pageSysId === selectedPageRecoveryIdentity.pageSysId &&
      pageSettingsRecoverySnapshot.workspaceSlug === selectedPageRecoveryIdentity.workspaceSlug &&
      pageSettingsRecoverySnapshot.workspaceSysId === selectedPageRecoveryIdentity.workspaceSysId &&
      cleanText(selectedWorkspacePage?.draftTitle) === cleanText(pageSettingsRecoverySnapshot.titleSnapshot) &&
      cleanText(selectedWorkspacePage?.draftSlug).toLowerCase() === cleanText(pageSettingsRecoverySnapshot.slugSnapshot).toLowerCase()
    );
  const restoredBodySnapshot = bodyRecoveryRevisionMatches ? bodyRecoverySnapshot : null;
  const selectedPageViewWithRecovery = useMemo(() => {
    if (!restoredBodySnapshot || !selectedPageView) {
      return selectedPageView;
    }

    return {
      ...selectedPageView,
      contentEnvelope: restoredBodySnapshot.envelope
    };
  }, [restoredBodySnapshot, selectedPageView]);
  const canManagePageSettings = activeWorkspaceMode === "edit" && hasAuthoringCapability && !editAccessLost && !workspaceCommandBlocksCurrentWorkspaceWrites;
  const inlineCreateRecoverySnapshot =
    route.mode === "workspace" &&
    activeWorkspaceMode === "edit" &&
    workspaceRecoveryIdentity
      ? authoringRecoveryRef.current.readInlineCreate(workspaceRecoveryIdentity)
      : null;
  const displayedInlinePageCreateState =
    inlinePageCreateState ??
    (
      inlineCreateRecoverySnapshot
        ? {
            errorMessage: "",
            focusToken: inlineCreateRecoverySnapshot.focusToken,
            noticeMessage:
              !workspacePagesLoaded
                ? RESTORED_INLINE_CREATE_NOTICE
                : !inlineCreateRecoverySnapshot.parentPageSysId ||
                    findWorkspacePageBySysId(currentWorkspacePages, inlineCreateRecoverySnapshot.parentPageSysId)
                  ? RESTORED_INLINE_CREATE_NOTICE
                  : RESTORED_INLINE_PARENT_MISSING_NOTICE,
            parentPageSysId:
              !workspacePagesLoaded
                ? ""
                : !inlineCreateRecoverySnapshot.parentPageSysId ||
                    findWorkspacePageBySysId(currentWorkspacePages, inlineCreateRecoverySnapshot.parentPageSysId)
                  ? inlineCreateRecoverySnapshot.parentPageSysId
                  : "",
            pending: false,
            showInput: true,
            title: inlineCreateRecoverySnapshot.title
          }
        : null
    );
  const editorRenderSessionKey =
    restoredBodySnapshot
      ? `${editorSessionKey}:recovery:${restoredBodySnapshot.captureGeneration}`
      : editorSessionKey;
  const pageSettingsPage =
    workspacePagesLoaded && pageSettingsState.open ? findWorkspacePageBySysId(currentWorkspacePages, pageSettingsState.pageSysId) : null;
  const pageSettingsHasDescendants = Boolean(
    pageSettingsPage && collectPageSubtreeSysIds(currentWorkspacePages, cleanText(pageSettingsPage.sysId)).length > 1
  );
  const workspacePagesErrorMessage = workspacePagesState.status === "error" ? workspacePagesState.errorMessage : "";
  const workspaceShellStatus: "loading" | "error" | "ready" =
    route.mode !== "workspace"
      ? "ready"
      : workspaceState.status === "error"
        ? "error"
        : workspaceState.status !== "success"
          ? "loading"
          : workspacePagesState.status === "error" &&
              workspacePagesState.workspaceSlug === currentWorkspaceSlug &&
              workspacePagesState.mode === activeWorkspaceMode
            ? "error"
            : workspacePagesLoading
              ? "loading"
              : workspaceShellViewModel
                ? "ready"
                : "error";
  const workspaceShellTitle =
    workspaceShellStatus === "error"
      ? workspaceState.status === "error"
        ? "Workspace unavailable"
        : "Pages unavailable"
      : workspaceState.status !== "success"
        ? "Loading workspace"
        : workspacePagesLoading
          ? "Loading pages"
          : workspaceShellViewModel
            ? ""
            : "Workspace unavailable";
  const workspaceShellCopy =
    workspaceShellStatus === "error"
      ? workspaceState.status === "error"
        ? workspaceState.errorMessage
        : workspacePagesErrorMessage || "Unable to load pages."
      : workspaceState.status !== "success"
        ? "Fetching the selected workspace from ServiceNow."
        : workspacePagesLoading
          ? "Fetching live page records from ServiceNow."
          : "";
  const shouldRetainWorkspaceShell =
    route.mode === "workspace" &&
    workspaceState.status === "success" &&
    workspaceState.data.slug === currentWorkspaceSlug &&
    workspacePagesLoading &&
    lastReadyWorkspaceShell !== null &&
    lastReadyWorkspaceShell.workspaceSlug === currentWorkspaceSlug;
  const displayedTreePages = shouldRetainWorkspaceShell ? lastReadyWorkspaceShell.treePages : treePages;
  const displayedSelectedPageView = shouldRetainWorkspaceShell ? lastReadyWorkspaceShell.selectedPageView : selectedPageViewWithRecovery;
  const displayedSelectedPageId = shouldRetainWorkspaceShell ? lastReadyWorkspaceShell.selectedPageId : selectedWorkspacePageId;
  const displayedSelectedPagePath = shouldRetainWorkspaceShell ? lastReadyWorkspaceShell.selectedPagePath : selectedPagePath;
  const displayedOutlinePage = shouldRetainWorkspaceShell ? lastReadyWorkspaceShell.outlinePage : outlinePage;
  const displayedWorkspaceShellStatus: "loading" | "error" | "ready" = shouldRetainWorkspaceShell ? "ready" : workspaceShellStatus;
  const showEditorBodyPending =
    route.mode === "workspace" &&
    activeWorkspaceMode === "edit" &&
    !editAccessLost &&
    !editorFailure &&
    displayedSelectedPageView?.contentState === "ready" &&
    Boolean(displayedSelectedPageView.contentEnvelope) &&
    (shouldRetainWorkspaceShell || !isEditorReady);
  const workspaceMainPaneBodyState: "loading" | "ready" = showEditorBodyPending ? "loading" : "ready";
  const isLauncherBusy = route.mode === "launcher" && (launcherState.status === "loading" || launcherState.status === "idle" || launcherState.status === "refreshing");
  const isWorkspaceBusy = route.mode === "workspace" && workspaceShellStatus === "loading";
  const showLoadingProgress = isLauncherBusy || isWorkspaceBusy;

  useEffect(() => {
    if (route.mode !== "workspace" || workspaceShellStatus !== "ready" || workspaceState.status !== "success") {
      return;
    }

    setLastReadyWorkspaceShell({
      mode: activeWorkspaceMode,
      outlinePage,
      selectedPageId: selectedWorkspacePageId,
      selectedPagePath,
      selectedPageView: selectedPageViewWithRecovery,
      treePages,
      workspaceSlug: currentWorkspaceSlug
    });
  }, [
    activeWorkspaceMode,
    currentWorkspaceSlug,
    outlinePage,
    route.mode,
    selectedPagePath,
    selectedPageViewWithRecovery,
    selectedWorkspacePageId,
    treePages,
    workspaceShellStatus,
    workspaceState
  ]);

  useEffect(() => {
    if (activeWorkspaceMode !== "edit" || !workspaceRecoveryIdentity || !workspacePagesLoaded) {
      return;
    }

    let cleared = false;
    let showSettingsMissingNotice = false;

    for (const snapshot of authoringRecoveryRef.current.listPageSettingsSnapshots(workspaceRecoveryIdentity)) {
      if (findWorkspacePageBySysId(currentWorkspacePages, snapshot.pageSysId)) {
        continue;
      }
      if (authoringRecoveryRef.current.clearPageSettings(snapshot, snapshot.captureGeneration)) {
        cleared = true;
      }
      if (restoredPageSettingsCaptureRef.current?.captureGeneration === snapshot.captureGeneration) {
        restoredPageSettingsCaptureRef.current = null;
        showSettingsMissingNotice = true;
      }
    }

    if (cleared) {
      bumpRecoveryVersion();
    }

    if (showSettingsMissingNotice) {
      setScopedShellNotice({
        eyebrow: "Recovery",
        kind: "status",
        message: RESTORED_PAGE_SETTINGS_MISSING_NOTICE,
        workspaceMode: "edit",
        workspaceSlug: workspaceRecoveryIdentity.workspaceSlug
      });
    }
  }, [activeWorkspaceMode, currentWorkspacePages, workspacePagesLoaded, workspaceRecoveryIdentity]);

  useEffect(() => {
    if (activeWorkspaceMode !== "edit" || !workspaceRecoveryIdentity || !workspacePagesLoaded) {
      return;
    }

    let cleared = false;

    for (const snapshot of authoringRecoveryRef.current.listBodySnapshots(workspaceRecoveryIdentity)) {
      if (findWorkspacePageBySysId(currentWorkspacePages, snapshot.pageSysId)) {
        continue;
      }

      if (clearRestoredBodyCapture({
        captureGeneration: snapshot.captureGeneration,
        pageSysId: snapshot.pageSysId,
        sessionKey:
          restoredBodyCaptureRef.current &&
          restoredBodyCaptureRef.current.captureGeneration === snapshot.captureGeneration &&
          restoredBodyCaptureRef.current.pageSysId === snapshot.pageSysId
            ? restoredBodyCaptureRef.current.sessionKey
            : "",
        workspaceSlug: snapshot.workspaceSlug,
        workspaceSysId: snapshot.workspaceSysId
      })) {
        cleared = true;
      }
    }

    if (cleared) {
      bumpRecoveryVersion();
    }
  }, [activeWorkspaceMode, currentWorkspacePages, workspacePagesLoaded, workspaceRecoveryIdentity]);

  useEffect(() => {
    if (
      route.mode !== "workspace" ||
      activeWorkspaceMode !== "edit" ||
      !selectedPageView ||
      selectedPageView.contentState !== "ready" ||
      !selectedPageView.contentEnvelope ||
      !selectedPageRecoveryIdentity ||
      !renderedEditorSession
    ) {
      restoredBodyCaptureRef.current = null;
      return;
    }

    if (!bodyRecoverySnapshot) {
      restoredBodyCaptureRef.current = null;
      return;
    }

    if (!bodyRecoveryRevisionMatches) {
      restoredBodyCaptureRef.current = null;
      if (
        authoringRecoveryRef.current.clearBody(selectedPageRecoveryIdentity, bodyRecoverySnapshot.captureGeneration)
      ) {
        bumpRecoveryVersion();
      }
      setScopedShellNotice({
        eyebrow: "Recovery",
        kind: "status",
        message: RESTORED_BODY_MISMATCH_NOTICE,
        pageSysId: selectedPageRecoveryIdentity.pageSysId,
        workspaceMode: "edit",
        workspaceSlug: selectedPageRecoveryIdentity.workspaceSlug
      });
      return;
    }

    restoredBodyCaptureRef.current = {
      captureGeneration: bodyRecoverySnapshot.captureGeneration,
      pageSysId: selectedPageRecoveryIdentity.pageSysId,
      sessionKey: editorSessionKey,
      workspaceSlug: selectedPageRecoveryIdentity.workspaceSlug,
      workspaceSysId: selectedPageRecoveryIdentity.workspaceSysId
    };
    setScopedShellNotice({
      eyebrow: "Recovery",
      kind: "status",
      message: RESTORED_BODY_NOTICE,
      pageSysId: selectedPageRecoveryIdentity.pageSysId,
      workspaceMode: "edit",
      workspaceSlug: selectedPageRecoveryIdentity.workspaceSlug
    });
  }, [
    activeWorkspaceMode,
    bodyRecoveryRevisionMatches,
    bodyRecoverySnapshot,
    editorSessionKey,
    renderedEditorSession,
    route.mode,
    selectedPageRecoveryIdentity,
    selectedPageView
  ]);

  useEffect(() => {
    if (
      route.mode !== "workspace" ||
      activeWorkspaceMode !== "edit" ||
      !canManagePageSettings ||
      !workspacePagesLoaded ||
      !selectedPageRecoveryIdentity ||
      pageSettingsState.open
    ) {
      return;
    }

    const snapshot = pageSettingsRecoverySnapshot;
    if (!snapshot) {
      return;
    }

    const page = findWorkspacePageBySysId(currentWorkspacePages, snapshot.pageSysId);
    if (!page) {
      if (authoringRecoveryRef.current.clearPageSettings(selectedPageRecoveryIdentity, snapshot.captureGeneration)) {
        bumpRecoveryVersion();
      }
      restoredPageSettingsCaptureRef.current = null;
      setScopedShellNotice({
        eyebrow: "Recovery",
        kind: "status",
        message: RESTORED_PAGE_SETTINGS_MISSING_NOTICE,
        workspaceMode: "edit",
        workspaceSlug: selectedPageRecoveryIdentity.workspaceSlug
      });
      return;
    }

    if (!pageSettingsRecoveryBaselineMatches) {
      if (authoringRecoveryRef.current.clearPageSettings(selectedPageRecoveryIdentity, snapshot.captureGeneration)) {
        bumpRecoveryVersion();
      }
      restoredPageSettingsCaptureRef.current = null;
      setScopedShellNotice({
        eyebrow: "Recovery",
        kind: "status",
        message: RESTORED_PAGE_SETTINGS_MISMATCH_NOTICE,
        workspaceMode: "edit",
        workspaceSlug: selectedPageRecoveryIdentity.workspaceSlug
      });
      return;
    }

    const titleValidation = validatePageSettingsTitle(snapshot.title);
    const slugValidation = validatePageSettingsSlug(snapshot.slug, currentWorkspacePages, page.workspaceSysId ?? "", page.sysId ?? snapshot.pageSysId);
    const nextState: PageSettingsState = {
      ...createEmptyPageSettingsState(),
      activeField: snapshot.activeField,
      generalError: "",
      noticeMessage: RESTORED_PAGE_SETTINGS_NOTICE,
      open: true,
      pageSysId: snapshot.pageSysId,
      slug: snapshot.slug,
      slugError: titleValidation.valid && !slugValidation.valid ? slugValidation.error : snapshot.slugError,
      slugSnapshot: snapshot.slugSnapshot,
      title: snapshot.title,
      titleError: !titleValidation.valid ? titleValidation.error : snapshot.titleError,
      titleSnapshot: snapshot.titleSnapshot
    };
    pageSettingsPendingOpenPageIdRef.current = "";
    pageSettingsStateRef.current = nextState;
    setPageSettingsState(nextState);
    restoredPageSettingsCaptureRef.current = {
      captureGeneration: snapshot.captureGeneration,
      pageSysId: snapshot.pageSysId,
      workspaceSlug: snapshot.workspaceSlug,
      workspaceSysId: snapshot.workspaceSysId
    };
  }, [
    activeWorkspaceMode,
    canManagePageSettings,
    currentWorkspacePages,
    pageSettingsState.open,
    pageSettingsRecoveryBaselineMatches,
    pageSettingsRecoverySnapshot,
    recoveryVersion,
    route.mode,
    selectedPageRecoveryIdentity,
    selectedWorkspacePage?.draftSlug,
    selectedWorkspacePage?.draftTitle,
    workspacePagesLoaded
  ]);

  useEffect(() => {
    if (
      route.mode !== "workspace" ||
      activeWorkspaceMode !== "edit" ||
      !workspaceRecoveryIdentity
    ) {
      return;
    }

    const snapshot = authoringRecoveryRef.current.readInlineCreate(workspaceRecoveryIdentity);
    if (!snapshot) {
      return;
    }

    restoredInlineCreateCaptureRef.current = {
      captureGeneration: snapshot.captureGeneration,
      workspaceSlug: snapshot.workspaceSlug,
      workspaceSysId: snapshot.workspaceSysId
    };
  }, [activeWorkspaceMode, currentWorkspacePages, recoveryVersion, route.mode, workspaceRecoveryIdentity]);

  useEffect(() => {
    if (
      route.mode !== "workspace" ||
      activeWorkspaceMode !== "edit" ||
      !workspacePagesLoaded ||
      !inlinePageCreateState ||
      !restoredInlineCreateCaptureRef.current ||
      !inlinePageCreateState.parentPageSysId ||
      findWorkspacePageBySysId(currentWorkspacePages, inlinePageCreateState.parentPageSysId)
    ) {
      return;
    }

    setInlinePageCreateState((current) =>
      current
        ? {
            ...current,
            noticeMessage: RESTORED_INLINE_PARENT_MISSING_NOTICE,
            parentPageSysId: ""
          }
        : current
    );
  }, [activeWorkspaceMode, currentWorkspacePages, inlinePageCreateState, route.mode, workspacePagesLoaded]);
  const visibleShellNotice =
    shellNotice &&
    shellNotice.workspaceSlug === currentWorkspaceSlug &&
    (shellNotice.workspaceMode === undefined || shellNotice.workspaceMode === activeWorkspaceMode) &&
    (!shellNotice.pageSysId || shellNotice.pageSysId === selectedWorkspacePageId)
      ? shellNotice
      : null;

  useEffect(() => {
    if (!showLoadingProgress) {
      setShowTransitionProgress(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowTransitionProgress(true);
    }, TRANSITION_PROGRESS_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [showLoadingProgress]);

  useEffect(() => {
    if (!runtime.config.backendPingPath) {
      setPingState({ status: "idle" });
      return;
    }

    let canceled = false;

    serviceNowClient
      .ping()
      .then((payload: PingResult) => {
        if (!canceled) {
          setPingState({ status: "success", payload });
        }
      })
      .catch((error: unknown) => {
        if (!canceled) {
          setPingState({ status: "error", message: getErrorMessage(error, "Unknown ping failure") });
        }
      });

    return () => {
      canceled = true;
    };
  }, [runtime.config.backendPingPath, serviceNowClient]);

  useEffect(() => {
    let canceled = false;
    setWorkspaceSwitcherState({ status: "loading" });

    serviceNowClient
      .listWorkspaces({
        page: 1,
        pageSize: 10
      })
      .then((result) => {
        if (!canceled) {
          setWorkspaceSwitcherState({
            items: result.items.slice(0, 10),
            status: "success"
          });
        }
      })
      .catch(() => {
        if (!canceled) {
          setWorkspaceSwitcherState({ status: "error" });
        }
      });

    return () => {
      canceled = true;
    };
  }, [launcherRefreshToken, serviceNowClient]);

  useEffect(() => {
    const handlePopState = () => {
      const targetHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (shouldGuardTransition(targetHref)) {
        navigateTo(buildHrefFromRoute(route), true, "popstate_guard_restore");
        requestRouteTransition({ href: targetHref, replace: false });
        return;
      }

      setRoute(readAppRoute(window.location));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [route, shouldGuardTransition]);

  useEffect(() => {
    if (route.mode !== "workspace") {
      setPendingWorkspaceIdentity(null);
      return;
    }

    if (workspaceState.status === "success" && workspaceState.data.slug === route.workspaceSlug) {
      setPendingWorkspaceIdentity((current) =>
        current && cleanText(current.slug) === route.workspaceSlug ? null : current
      );
    }
  }, [route, workspaceState]);

  useEffect(() => {
    if (route.mode === "workspace") {
      rememberRecentWorkspaceSlug(route.workspaceSlug);
    }
  }, [route]);

  useEffect(() => {
    if (route.mode !== "launcher") {
      return;
    }

    let canceled = false;
    const requestId = launcherRequestIdRef.current + 1;
    launcherRequestIdRef.current = requestId;

    setLauncherState((current) => {
      if (current.status === "success" || current.status === "refreshing") {
        return { status: "refreshing", data: current.data };
      }

      return { status: "loading" };
    });

    serviceNowClient
      .listWorkspaces({
        searchText: launcherSearchText,
        page: launcherPage,
        pageSize: DEFAULT_PAGE_SIZE
      })
      .then((data) => {
        if (!canceled && launcherRequestIdRef.current === requestId) {
          setLauncherState({ status: "success", data });
        }
      })
      .catch(() => {
        if (!canceled && launcherRequestIdRef.current === requestId) {
          setLauncherState({
            errorMessage: "Unable to load workspaces.",
            status: "error"
          });
        }
      });

    return () => {
      canceled = true;
    };
  }, [launcherPage, launcherRefreshToken, launcherSearchText, route.mode, serviceNowClient]);

  useEffect(() => {
    if (route.mode !== "workspace") {
      setWorkspaceSettingsNotice(false);
      return;
    }

    if (loadedWorkspaceSlug === currentWorkspaceSlug) {
      setWorkspaceSettingsNotice(currentWorkspaceSettingsIntent && Boolean(workspaceState.status === "success" && workspaceState.data.canManageSettings));

      if (currentWorkspaceSettingsIntent) {
        navigateTo(
          buildWorkspaceHref(currentWorkspaceSlug, {
            mode: requestedWorkspaceMode,
            pageSlug: currentWorkspacePageSlug
          }),
          true,
          "settings_intent_cleanup"
        );
        setRoute(readAppRoute(window.location));
      }

      return;
    }

    let canceled = false;
    setWorkspaceState({ status: "loading" });
    setWorkspaceSettingsNotice(false);
    setEditAccessLost(false);
    setEditorFailure(null);

    serviceNowClient
      .getWorkspace(currentWorkspaceSlug)
      .then((result) => {
        if (canceled) {
          return;
        }

        if (!result.workspace) {
          setWorkspaceState({
            errorMessage: "Workspace could not be found.",
            status: "error"
          });
          setWorkspaceSettingsNotice(false);
          return;
        }

        setWorkspaceState({ data: result.workspace, status: "success" });
        if (!cleanText(result.workspace.roleLabel)) {
          clearWorkspaceRecoveryState({
            workspaceSlug: result.workspace.slug,
            workspaceSysId: cleanText(result.workspace.sysId)
          });
        }
        setWorkspaceSettingsNotice(currentWorkspaceSettingsIntent && result.workspace.canManageSettings);

        if (currentWorkspaceSettingsIntent) {
          navigateTo(
            buildWorkspaceHref(currentWorkspaceSlug, {
              mode: requestedWorkspaceMode,
              pageSlug: currentWorkspacePageSlug
            }),
            true,
            "settings_intent_cleanup"
          );
          setRoute(readAppRoute(window.location));
        }
      })
      .catch(() => {
        if (!canceled) {
          setWorkspaceState({
            errorMessage: "Unable to load workspace.",
            status: "error"
          });
          setWorkspaceSettingsNotice(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [
    currentWorkspacePageSlug,
    currentWorkspaceSettingsIntent,
    currentWorkspaceSlug,
    loadedWorkspaceSlug,
    requestedWorkspaceMode,
    route.mode,
    serviceNowClient
  ]);

  useEffect(() => {
    const binding = workspaceLeaseBindingRef.current;
    const expectedWorkspaceSysId = workspaceState.status === "success" ? cleanText(workspaceState.data.sysId) : "";
    const stillEditingBoundWorkspace = route.mode === "workspace" && requestedWorkspaceMode === "edit" && binding && binding.workspaceSlug === currentWorkspaceSlug && binding.workspaceSysId === expectedWorkspaceSysId;
    if (binding && !stillEditingBoundWorkspace) {
      workspaceLeaseOperationGenerationRef.current += 1;
      releaseWorkspaceLeaseBinding(binding, true, resolveWorkspaceLeaseReleaseReason(route, requestedWorkspaceMode, currentWorkspaceSlug, binding));
      setWorkspaceLeaseState({ state: "idle" });
    } else if (!binding && workspaceLeaseState.state === "acquiring" && (route.mode !== "workspace" || requestedWorkspaceMode !== "edit")) {
      setWorkspaceLeaseState({ state: "idle" });
    }
    if (route.mode !== "workspace" || requestedWorkspaceMode !== "edit") {
      editReentryRequestedRef.current = false;
    }
  }, [currentWorkspaceSlug, requestedWorkspaceMode, route.mode, workspaceLeaseState.state, workspaceState]);

  useEffect(() => {
    recordDocseraDiagnosticEvent("lease.acquireEffect.start", {
      hasAuthoringCapability,
      requestedWorkspaceMode,
      routeMode: route.mode,
      workspaceLoaded: workspaceState.status === "success",
      workspaceSlug: currentWorkspaceSlug
    });
    if (route.mode !== "workspace" || requestedWorkspaceMode !== "edit" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug || !hasAuthoringCapability) return;
    const workspace = workspaceState.data;
    const workspaceSysId = cleanText(workspace.sysId);
    const existingBinding = workspaceLeaseBindingRef.current;
    if (existingBinding?.workspaceSysId === workspaceSysId || workspaceLeaseState.state === "acquiring") {
      recordDocseraDiagnosticEvent("lease.acquireEffect.skip", {
        reason: existingBinding?.workspaceSysId === workspaceSysId ? "binding_already_current" : "already_acquiring",
        workspaceSlug: workspace.slug,
        workspaceSysId
      });
      return;
    }
    let current = true;
    const operationGeneration = workspaceLeaseOperationGenerationRef.current + 1;
    workspaceLeaseOperationGenerationRef.current = operationGeneration;
    const tabSessionId = getOrCreateWorkspaceLeaseTabSessionId();
    setWorkspaceLeaseState({ state: "acquiring" });
    void (async () => {
      const stored = readStoredWorkspaceLease(workspaceSysId);
      const reloadResumeIntent = consumeWorkspaceLeaseReloadIntent(workspaceSysId, tabSessionId);
      const sameTabReloadNavigation = isCurrentDocumentReloadNavigation() && Boolean(stored.tabSessionId && stored.tabSessionId === tabSessionId);
      recordDocseraDiagnosticEvent("lease.resume.considered", {
        currentTabSessionFingerprint: fingerprintDiagnosticSecret(tabSessionId),
        reloadResumeIntent,
        sameTabReloadNavigation,
        storedAndCurrentTabMatch: Boolean(stored.tabSessionId && stored.tabSessionId === tabSessionId),
        storedTabSessionFingerprint: fingerprintDiagnosticSecret(stored.tabSessionId),
        tokenExists: Boolean(stored.token),
        tokenFingerprint: fingerprintDiagnosticSecret(stored.token),
        workspaceSlug: workspace.slug,
        workspaceSysId
      });
      const canResume = Boolean(stored.token) && (
        reloadResumeIntent ||
        sameTabReloadNavigation ||
        await workspaceLeaseCoordinationRef.current.canResume({ stored, tabSessionId, workspaceSysId })
      );
      if (stored.token && !canResume) {
        clearStoredWorkspaceLease(
          workspaceSysId,
          stored.tabSessionId !== tabSessionId ? "identity_mismatch" : "duplicate_runtime_probe_denial"
        );
      }
      recordDocseraDiagnosticEvent(canResume && stored.token ? "lease.resume.request" : "lease.acquire.request", {
        canResume,
        tokenFingerprint: fingerprintDiagnosticSecret(stored.token),
        tokenPresent: Boolean(stored.token),
        workspaceSlug: workspace.slug,
        workspaceSysId
      });
      const result = canResume && stored.token && serviceNowClient.resumeWorkspaceEditLease
        ? await serviceNowClient.resumeWorkspaceEditLease({ workspaceSlug: workspace.slug, workspaceSysId, leaseToken: stored.token })
        : serviceNowClient.acquireWorkspaceEditLease
          ? await serviceNowClient.acquireWorkspaceEditLease({ workspaceSlug: workspace.slug, workspaceSysId })
          : { state: "failed" as const, errorMessage: "Workspace editing is unavailable.", failure: "terminal" as const, retryable: false };
      if (!current || workspaceLeaseOperationGenerationRef.current !== operationGeneration) {
        recordDocseraDiagnosticEvent("lease.acquireResult.ignored", {
          cleanup: result.state === "held",
          resultState: result.state,
          workspaceSlug: workspace.slug,
          workspaceSysId
        });
        if (result.state === "held") releaseObsoleteWorkspaceLeaseBinding({ bindingId: `${operationGeneration}-${result.leaseToken}`, workspaceSlug: workspace.slug, workspaceSysId, ...result });
        return;
      }
      if (result.state === "held") {
        const binding = { bindingId: `${operationGeneration}-${result.leaseToken}`, workspaceSlug: workspace.slug, workspaceSysId, ...result };
        workspaceLeaseBindingRef.current = binding;
        storeWorkspaceLease(workspaceSysId, result.leaseToken, tabSessionId);
        workspaceLeaseCoordinationRef.current.startResponder({ bindingId: binding.bindingId, tabSessionId, workspaceSysId });
        editReentryRequestedRef.current = false;
        recordDocseraDiagnosticEvent("lease.acquireResult.accepted", {
          resultState: "held",
          tokenFingerprint: fingerprintDiagnosticSecret(result.leaseToken),
          workspaceSlug: workspace.slug,
          workspaceSysId
        });
        setWorkspaceLeaseState(result);
        setEditAccessLost(false);
        return;
      }
      clearStoredWorkspaceLease(workspaceSysId, result.state === "locked" || result.state === "lost" ? "resume_rejection" : "acquire_rejection");
      if (result.state === "failed" && result.failure === "forbidden") {
        clearWorkspaceRecoveryState({
          workspaceSlug: workspace.slug,
          workspaceSysId
        });
      }
      editReentryRequestedRef.current = false;
      recordDocseraDiagnosticEvent("lease.acquireResult.accepted", {
        failure: result.state === "failed" ? result.failure : "",
        resultState: result.state,
        sameUserDifferentSession: result.state === "locked" || result.state === "lost" ? result.sameUserDifferentSession : false,
        workspaceSlug: workspace.slug,
        workspaceSysId
      });
      setWorkspaceLeaseState(result.state === "locked" || result.state === "lost"
        ? createWorkspaceLeaseHolderNotice(result, result.state)
        : createWorkspaceLeaseFailureNotice(result));
      setEditAccessLost(true);
    })().catch(() => {
      if (current && workspaceLeaseOperationGenerationRef.current === operationGeneration) {
        clearStoredWorkspaceLease(workspaceSysId, "acquire_exception");
        editReentryRequestedRef.current = false;
        setWorkspaceLeaseState(createWorkspaceLeaseFailureNotice({ errorMessage: "Workspace editing is temporarily unavailable. Please try again.", failure: "transient" }));
        setEditAccessLost(true);
      }
    });
    return () => {
      current = false;
      recordDocseraDiagnosticEvent("lease.acquireEffect.cleanup", {
        reason: "effect_replaced",
        workspaceSlug: workspace.slug,
        workspaceSysId
      });
    };
  }, [currentWorkspaceSlug, hasAuthoringCapability, requestedWorkspaceMode, route.mode, serviceNowClient, workspaceState]);

  useEffect(() => {
    if (workspaceLeaseState.state !== "held") return;
    const workspace = workspaceState.status === "success" ? workspaceState.data : null;
    if (!workspace) return;
    const workspaceSysId = cleanText(workspace.sysId);
    const binding = workspaceLeaseBindingRef.current;
    if (!binding || binding.workspaceSysId !== workspaceSysId || binding.leaseToken !== workspaceLeaseState.leaseToken) return;
    const heartbeatGeneration = workspaceLeaseOperationGenerationRef.current;
    const renew = () => {
      if (!serviceNowClient.renewWorkspaceEditLease) return;
      recordDocseraDiagnosticEvent("lease.renew.request", {
        tokenFingerprint: fingerprintDiagnosticSecret(binding.leaseToken),
        workspaceSlug: workspace.slug,
        workspaceSysId
      });
      void serviceNowClient.renewWorkspaceEditLease({ workspaceSlug: workspace.slug, workspaceSysId, leaseToken: binding.leaseToken }).then((result) => {
        if (workspaceLeaseBindingRef.current !== binding || workspaceLeaseOperationGenerationRef.current !== heartbeatGeneration) {
          recordDocseraDiagnosticEvent("lease.renewResult.ignored", {
            resultState: result.state,
            workspaceSlug: workspace.slug,
            workspaceSysId
          });
          return;
        }
      if (result.state === "held") {
        workspaceLeaseBindingRef.current = { ...(workspaceLeaseBindingRef.current ?? binding), workspaceSlug: workspace.slug, workspaceSysId, bindingId: binding.bindingId, ...result };
        storeWorkspaceLease(workspaceSysId, result.leaseToken, getOrCreateWorkspaceLeaseTabSessionId());
        recordDocseraDiagnosticEvent("lease.renewResult.accepted", {
          resultState: "held",
          tokenFingerprint: fingerprintDiagnosticSecret(result.leaseToken),
          workspaceSlug: workspace.slug,
          workspaceSysId
        });
        setWorkspaceLeaseState(result);
        return;
      }
        if (result.state === "failed" && result.failure === "transient") {
          // A scheduled probe has not proved that another writer won. Keep the
          // credential and editor mounted; the mutation gate will verify it.
          setWorkspaceLeaseState({ state: "uncertain" });
          return;
        }
        if (result.state === "lost") {
          recordDocseraDiagnosticEvent("lease.renewResult.accepted", {
            resultState: "lost",
            sameUserDifferentSession: result.sameUserDifferentSession,
            workspaceSlug: workspace.slug,
            workspaceSysId
          });
          setWorkspaceLeaseState({ state: "recovery_required" }); return;
        }
        if (
          result.failure === "forbidden" &&
          forceLiveAfterAuthoringAccessLoss({
            expectedBinding: binding,
            expectedWorkspaceLeaseGeneration: heartbeatGeneration,
            message: result.errorMessage,
            nextLeaseState: createWorkspaceLeaseFailureNotice(result),
            reason: "forbidden",
            workspaceSlug: workspace.slug,
            workspaceSysId
          })
        ) {
          return;
        }
        workspaceLeaseCoordinationRef.current.stopResponder(binding.bindingId, "renew_rejection"); workspaceLeaseBindingRef.current = null; clearStoredWorkspaceLease(workspaceSysId, "renew_rejection");
        recordDocseraDiagnosticEvent("lease.renewResult.accepted", {
          failure: result.state === "failed" ? result.failure : "",
          resultState: result.state,
          workspaceSlug: workspace.slug,
          workspaceSysId
        });
        setWorkspaceLeaseState(createWorkspaceLeaseFailureNotice(result)); setEditAccessLost(true);
      });
    };
    const timer = window.setInterval(renew, workspaceLeaseState.heartbeatIntervalMs);
    const visible = () => { if (document.visibilityState === "visible") renew(); };
    window.addEventListener("online", renew); document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); window.removeEventListener("online", renew); document.removeEventListener("visibilitychange", visible); };
  }, [serviceNowClient, workspaceLeaseState, workspaceState]);

  async function ensureWorkspaceLeaseForMutation(): Promise<WorkspaceLeaseRecoveryResult> {
    const workspace = workspaceState.status === "success" ? workspaceState.data : null;
    const expectedRoute = route.mode === "workspace" && requestedWorkspaceMode === "edit" ? currentWorkspaceSlug : "";
    const workspaceSysId = cleanText(workspace?.sysId);
    if (!workspace || !expectedRoute || !workspaceSysId) return { state: "transient_failure", errorMessage: "Workspace editing is not ready." };
    const operationGeneration = workspaceLeaseOperationGenerationRef.current;
    const isCurrent = () => route.mode === "workspace" && requestedWorkspaceMode === "edit" && currentWorkspaceSlug === expectedRoute && workspaceLeaseOperationGenerationRef.current === operationGeneration;
    const binding = workspaceLeaseBindingRef.current;
    if (workspaceLeaseStateRef.current.state === "held" && binding?.workspaceSysId === workspaceSysId) {
      return { state: "held", lease: { state: "held", leaseToken: binding.leaseToken, heartbeatIntervalMs: binding.heartbeatIntervalMs, staleAfterMs: binding.staleAfterMs, changeSetId: binding.changeSetId, changeSetRevision: binding.changeSetRevision, ...(typeof binding.workspaceStateRevision === "number" ? { workspaceStateRevision: binding.workspaceStateRevision } : {}) } };
    }
    const scope = workspaceLeaseRecoveryScope();
    return workspaceLeaseRecoveryRef.current.ensure(scope, async () => {
      if (!isCurrent()) return { state: "transient_failure", errorMessage: "The editing session changed." };
      setWorkspaceLeaseState({ state: "recovering" });
      const prior = workspaceLeaseBindingRef.current;
      recordDocseraDiagnosticEvent(prior ? "lease.recovery.renew.request" : "lease.recovery.acquire.request", {
        priorTokenFingerprint: fingerprintDiagnosticSecret(prior?.leaseToken),
        workspaceSlug: workspace.slug,
        workspaceSysId
      });
      const result = prior && serviceNowClientRef.current.renewWorkspaceEditLease
        ? await serviceNowClientRef.current.renewWorkspaceEditLease({ workspaceSlug: workspace.slug, workspaceSysId, leaseToken: prior.leaseToken })
        : serviceNowClientRef.current.acquireWorkspaceEditLease
          ? await serviceNowClientRef.current.acquireWorkspaceEditLease({ workspaceSlug: workspace.slug, workspaceSysId })
          : { state: "failed" as const, failure: "terminal" as const, errorMessage: "Workspace editing is unavailable." };
      if (!isCurrent()) {
        recordDocseraDiagnosticEvent("lease.recoveryResult.ignored", {
          cleanup: result.state === "held",
          resultState: result.state,
          workspaceSlug: workspace.slug,
          workspaceSysId
        });
        if (result.state === "held") {
          recordDocseraDiagnosticEvent("lease.release.request", {
            reason: "obsolete_result_cleanup",
            tokenFingerprint: fingerprintDiagnosticSecret(result.leaseToken),
            tokenPresent: true,
            workspaceSlug: workspace.slug,
            workspaceSysId
          });
          void serviceNowClientRef.current.releaseWorkspaceEditLease?.({ workspaceSlug: workspace.slug, workspaceSysId, leaseToken: result.leaseToken, keepalive: true });
        }
        return { state: "transient_failure", errorMessage: "The editing session changed." };
      }
      if (result.state === "held") {
        const nextBinding = { bindingId: `${operationGeneration}-${result.leaseToken}`, workspaceSlug: workspace.slug, workspaceSysId, ...result };
        if (prior) workspaceLeaseCoordinationRef.current.stopResponder(prior.bindingId, "lease_recovery_replaced_binding");
        workspaceLeaseBindingRef.current = nextBinding; storeWorkspaceLease(workspaceSysId, result.leaseToken, getOrCreateWorkspaceLeaseTabSessionId());
        workspaceLeaseCoordinationRef.current.startResponder({ bindingId: nextBinding.bindingId, tabSessionId: getOrCreateWorkspaceLeaseTabSessionId(), workspaceSysId }); setWorkspaceLeaseState(result); setEditAccessLost(false);
        recordDocseraDiagnosticEvent("lease.recoveryResult.accepted", {
          resultState: "held",
          tokenFingerprint: fingerprintDiagnosticSecret(result.leaseToken),
          workspaceSlug: workspace.slug,
          workspaceSysId
        });
        return { state: "held", lease: result };
      }
      if (result.state === "locked" || result.state === "lost") {
        const blockedNotice = createWorkspaceLeaseHolderNotice(result, result.state) as Extract<WorkspaceLeaseState, { state: "blocked" }>;
        if (forceLiveAfterAuthoringAccessLoss({
          expectedBinding: prior,
          expectedWorkspaceLeaseGeneration: operationGeneration,
          message: blockedNotice.message,
          nextLeaseState: blockedNotice,
          reason: "contention",
          workspaceSlug: expectedRoute,
          workspaceSysId
        })) {
          return { state: "contention", holderDisplayName: result.holderDisplayName, sameUserDifferentSession: result.sameUserDifferentSession };
        }
        return { state: "contention", holderDisplayName: result.holderDisplayName, sameUserDifferentSession: result.sameUserDifferentSession };
      }
      if (result.failure === "forbidden") {
        if (forceLiveAfterAuthoringAccessLoss({
          expectedBinding: prior,
          expectedWorkspaceLeaseGeneration: operationGeneration,
          message: result.errorMessage,
          nextLeaseState: createWorkspaceLeaseFailureNotice(result),
          reason: "forbidden",
          workspaceSlug: expectedRoute,
          workspaceSysId
        })) {
          return { state: "forbidden", errorMessage: result.errorMessage };
        }
        return { state: "transient_failure", errorMessage: "The editing session changed." };
      }
      if (prior) { workspaceLeaseCoordinationRef.current.stopResponder(prior.bindingId, "recovery_failure"); workspaceLeaseBindingRef.current = null; clearStoredWorkspaceLease(workspaceSysId, "recovery_failure"); }
      setWorkspaceLeaseState(createWorkspaceLeaseTransientRecoveryState(result.errorMessage));
      return { state: "transient_failure", errorMessage: result.errorMessage };
    });
  }

  useEffect(() => {
    if (workspaceEditLeasePending) return;
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      setWorkspacePagesState({ status: "idle" });
      return;
    }

    let canceled = false;
    setWorkspacePagesState({ mode: activeWorkspaceMode, status: "loading", workspaceSlug: currentWorkspaceSlug });

    serviceNowClient
      .listPages({ mode: activeWorkspaceMode, workspaceSlug: currentWorkspaceSlug })
      .then((result: PageListResult) => {
        if (canceled) {
          return;
        }

        const pages = result.items;
        setWorkspacePagesState({
          data: pages,
          mode: activeWorkspaceMode,
          status: "success",
          totalCount: result.totalCount,
          workspaceSlug: result.workspaceSlug || currentWorkspaceSlug
        });

      })
      .catch((error: unknown) => {
        if (!canceled) {
          setWorkspacePagesState({
            errorMessage: getErrorMessage(error, "Unable to load pages."),
            mode: activeWorkspaceMode,
            status: "error",
            workspaceSlug: currentWorkspaceSlug
          });
        }
      });

    return () => {
      canceled = true;
    };
  }, [activeWorkspaceMode, currentWorkspaceSlug, loadedWorkspaceSlug, route.mode, serviceNowClient, workspaceEditLeasePending, workspacePagesRetryNonce, workspaceState.status]);

  useEffect(() => {
    if (route.mode !== "launcher") {
      setCreateModalOpen(false);
      setCreateModalPhase("idle");
      return;
    }
  }, [route.mode]);

  useEffect(() => {
    if (route.mode !== "workspace" || activeWorkspaceMode !== "edit") {
      setInlinePageCreateState(null);
      return;
    }
  }, [activeWorkspaceMode, route.mode]);

  useEffect(() => {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      pageSettingsPendingOpenPageIdRef.current = "";
      setPageSettingsState((current) => {
        if (isPageSettingsStateEmpty(current)) {
          return current;
        }

        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return;
    }

    if (activeWorkspaceMode !== "edit" || !canManagePageSettings) {
      pageSettingsPendingOpenPageIdRef.current = "";
      setPageSettingsState((current) => {
        if (isPageSettingsStateEmpty(current)) {
          return current;
        }

        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return;
    }

    if (!pageSettingsState.open) {
      return;
    }

    if (workspacePagesLoaded && !findWorkspacePageBySysId(currentWorkspacePages, pageSettingsState.pageSysId)) {
      setPageSettingsState((current) => {
        if (isPageSettingsStateEmpty(current)) {
          return current;
        }

        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
    }
  }, [
    activeWorkspaceMode,
    canManagePageSettings,
    currentWorkspacePages,
    currentWorkspaceSlug,
    pageSettingsState.open,
    pageSettingsState.pageSysId,
    route.mode,
    workspacePagesLoaded,
    workspaceStateData,
    workspaceState.status
  ]);

  useEffect(() => {
    if (!pageSettingsState.open || route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      return;
    }

    if (pageSettingsState.pageSysId && pageSettingsState.pageSysId !== selectedWorkspacePageId) {
      setPageSettingsState((current) => {
        if (isPageSettingsStateEmpty(current)) {
          return current;
        }

        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
    }
  }, [currentWorkspaceSlug, pageSettingsState.open, pageSettingsState.pageSysId, route.mode, selectedWorkspacePageId, workspaceStateData, workspaceState.status]);

  useEffect(() => {
    const pendingPageId = cleanText(pageSettingsPendingOpenPageIdRef.current);
    if (!pendingPageId || pageSettingsState.open || route.mode !== "workspace" || workspaceState.status !== "success") {
      return;
    }

    if (!workspacePagesLoaded || workspaceState.data.slug !== currentWorkspaceSlug || pendingPageId !== selectedWorkspacePageId) {
      return;
    }

    openPageSettings(pendingPageId);
  }, [
    currentWorkspaceSlug,
    pageSettingsState.open,
    route.mode,
    selectedWorkspacePageId,
    workspacePagesLoaded,
    workspaceStateData,
    workspaceState.status
  ]);

  useEffect(() => {
    if (route.mode !== "workspace") {
      lastWorkspaceModeKeyRef.current = "";
      return;
    }

    const nextModeKey = buildModeStateKey(currentWorkspaceSlug, activeWorkspaceMode);
    const previousModeKey = lastWorkspaceModeKeyRef.current;
    const sameWorkspaceMode =
      previousModeKey &&
      previousModeKey !== nextModeKey &&
      previousModeKey.startsWith(`${cleanText(currentWorkspaceSlug)}::`);

    if (sameWorkspaceMode) {
      setModeUiState((current) => {
        const nextState = current[nextModeKey] ?? createWorkspaceModeUiState();
        if (!nextState.searchQuery) {
          return current;
        }

        return {
          ...current,
          [nextModeKey]: {
            ...nextState,
            searchQuery: ""
          }
        };
      });
    }

    lastWorkspaceModeKeyRef.current = nextModeKey;
  }, [activeWorkspaceMode, currentWorkspaceSlug, route.mode]);

  useEffect(() => {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      return;
    }

    if (requestedWorkspaceMode !== "edit" || activeWorkspaceMode === "edit" || workspaceEditLeasePending) {
      return;
    }

        commitRoute(
          buildWorkspaceHref(currentWorkspaceSlug, {
            settingsIntent: currentWorkspaceSettingsIntent
          }),
          true,
          "deliberate_edit_exit"
        );
  }, [activeWorkspaceMode, currentWorkspaceSettingsIntent, currentWorkspaceSlug, requestedWorkspaceMode, route.mode, workspaceEditLeasePending, workspaceState]);

  useEffect(() => {
    if (route.mode !== "workspace" || workspaceEditLeasePending || !workspacePagesLoaded) {
      return;
    }

    const resolvedSelection = resolveWorkspacePageSelection(currentWorkspacePages, {
      legacyPageId: currentWorkspaceLegacyPageId,
      mode: activeWorkspaceMode,
      pageSlug: currentWorkspacePageSlug,
      preferredPageSysId: crossModeTargetPageSysIdRef.current || currentModeUiState.selectedPageSysId
    });
    const canonicalPageSlug = cleanText(resolvedSelection.pageSlug);
    const needsCanonicalRoute =
      currentWorkspaceLegacyPageId.length > 0 ||
      requestedWorkspaceMode !== activeWorkspaceMode ||
      cleanText(currentWorkspacePageSlug) !== canonicalPageSlug;

    if (!currentWorkspacePages.length) {
      if (currentWorkspaceLegacyPageId || currentWorkspacePageSlug || requestedWorkspaceMode !== activeWorkspaceMode) {
        commitRoute(
          buildWorkspaceHref(currentWorkspaceSlug, {
            mode: activeWorkspaceMode
          }),
          true,
          "route_canonicalization"
        );
      }
      return;
    }

    if (!needsCanonicalRoute) {
      return;
    }

    commitRoute(
      buildWorkspaceHref(currentWorkspaceSlug, {
        mode: activeWorkspaceMode,
        pageSlug: canonicalPageSlug || undefined
      }),
      true,
      "route_canonicalization"
    );
  }, [
    activeWorkspaceMode,
    currentModeUiState.selectedPageSysId,
    currentWorkspaceLegacyPageId,
    currentWorkspacePageSlug,
    currentWorkspacePages,
    currentWorkspaceSlug,
    requestedWorkspaceMode,
    route.mode,
    workspaceEditLeasePending,
    workspacePagesLoaded
  ]);

  useEffect(() => {
    if (route.mode !== "workspace") {
      return;
    }

    const nextSelectedPageSysId = cleanText(selectedWorkspacePageId);
    setModeUiState((current) => {
      const currentState = current[currentModeStateKey] ?? createWorkspaceModeUiState();
      if (currentState.selectedPageSysId === nextSelectedPageSysId) {
        return current;
      }

      return {
        ...current,
        [currentModeStateKey]: {
          ...currentState,
          selectedPageSysId: nextSelectedPageSysId
        }
      };
    });

    if (crossModeTargetPageSysIdRef.current && crossModeTargetPageSysIdRef.current === nextSelectedPageSysId) {
      crossModeTargetPageSysIdRef.current = "";
    }
  }, [currentModeStateKey, route.mode, selectedWorkspacePageId]);

  useEffect(() => {
    editorFlushRef.current = null;
    editorRecoverySnapshotRef.current = null;
    setEditorFailure(null);
    setEditorTransitionState({ isDirty: false, isSaving: false, status: "Saved" });
    setPendingRouteTransition(null);
  }, [activeWorkspaceMode, editorSessionKey, selectedWorkspacePageId]);

  function commitRoute(href: string, replace = false, reason = "application_route_change") {
    const beforeRoute = route;
    navigateTo(href, replace, reason);
    const nextRoute = readAppRoute(window.location);
    recordDocseraDiagnosticEvent("route.commit", {
      afterRoute: nextRoute,
      beforeRoute,
      reason,
      routeChangeType: classifyRouteChangeReason(reason)
    });
    setRoute(nextRoute);
  }

  function isCurrentEditorSession(token: EditorSessionToken | null): token is EditorSessionToken {
    return Boolean(token && editorSessionGenerationRef.current.isCurrent(token));
  }

  function resolveEditRoutePageSysId(targetRoute: DocseraAppRoute): string {
    if (targetRoute.mode !== "workspace" || targetRoute.workspaceMode !== "edit") {
      return "";
    }

    return cleanText(
      resolveWorkspacePageSelection(currentWorkspacePages, {
        legacyPageId: targetRoute.legacyPageId,
        mode: "edit",
        pageSlug: targetRoute.pageSlug
      }).pageId
    );
  }

  function transitionWouldDestroyEditor(targetRoute: DocseraAppRoute): boolean {
    if (route.mode !== "workspace" || activeWorkspaceMode !== "edit") {
      return false;
    }

    if (!isCurrentEditorSession(activeEditorSessionRef.current) || editAccessLost) {
      return false;
    }

    const currentPageSysId = cleanText(selectedWorkspacePageId);
    if (!currentPageSysId) {
      return false;
    }

    if (targetRoute.mode !== "workspace") {
      return true;
    }

    if (cleanText(targetRoute.workspaceSlug) !== currentWorkspaceSlug) {
      return true;
    }

    if (targetRoute.workspaceMode !== "edit") {
      return true;
    }

    return resolveEditRoutePageSysId(targetRoute) !== currentPageSysId;
  }

  function shouldGuardTransition(targetHref: string): boolean {
    if (!(editorTransitionState.isDirty || editorTransitionState.isSaving)) {
      return false;
    }

    return transitionWouldDestroyEditor(readAppRoute(new URL(targetHref, window.location.origin)));
  }

  function requestRouteTransition(transition: RequestedRouteTransition): void {
    const transitionGeneration = routeTransitionGenerationRef.current + 1;
    routeTransitionGenerationRef.current = transitionGeneration;
    if (transition.href === buildHrefFromRoute(route)) {
      return;
    }

    if (shouldGuardTransition(transition.href)) {
      const guardedTransition: RequestedRouteTransition = {
        ...transition,
        discardRestoredBodyCapture: getRestoredBodyCaptureForSession(editorSessionState.sessionKey)
      };
      const flush = editorFlushRef.current;
      if (!flush) {
        setPendingRouteTransition(guardedTransition);
        return;
      }
      const editorSession = activeEditorSessionRef.current;
      void flush().then(async (saved) => {
        if (routeTransitionGenerationRef.current !== transitionGeneration || !isCurrentEditorSession(editorSession)) {
          return;
        }
        if (!saved) {
          setPendingRouteTransition(guardedTransition);
          return;
        }
        guardedTransition.beforeCommit?.();
        const release = transitionWouldDestroyEditor(readAppRoute(new URL(guardedTransition.href, window.location.origin)))
          ? editorReleaseRef.current
          : null;
        if (release) {
          await release().catch(() => undefined);
        }
        commitRoute(guardedTransition.href, guardedTransition.replace, guardedTransition.reason ?? "user_navigation");
      });
      return;
    }

    transition.beforeCommit?.();
    const release = transitionWouldDestroyEditor(readAppRoute(new URL(transition.href, window.location.origin)))
      ? editorReleaseRef.current
      : null;
    if (release) {
      void release().finally(() => {
        commitRoute(transition.href, transition.replace, transition.reason ?? "user_navigation");
      });
      return;
    }

    commitRoute(transition.href, transition.replace, transition.reason ?? "user_navigation");
  }

  function updateCurrentModeUiState(updater: (state: WorkspaceModeUiState) => WorkspaceModeUiState) {
    setModeUiState((current) => {
      const nextState = updater(current[currentModeStateKey] ?? createWorkspaceModeUiState());
      return {
        ...current,
        [currentModeStateKey]: nextState
      };
    });
  }

  function buildWorkspaceRouteForPage(pageSysId: string, mode = activeWorkspaceMode): string {
    const page = findWorkspacePageBySysId(currentWorkspacePages, pageSysId);
    const pageSlug = cleanText(page?.draftSlug);
    return buildWorkspaceHref(currentWorkspaceSlug, {
      mode,
      pageSlug: pageSlug || undefined
    });
  }

  function openLauncher() {
    requestRouteTransition({
      href: buildLauncherHref(),
      reason: "open_launcher",
      replace: false,
      beforeCommit: () => {
        setWorkspaceSettingsNotice(false);
        setPendingWorkspaceIdentity(null);
        pageSettingsPendingOpenPageIdRef.current = "";
      }
    });
  }

  function openWorkspace(
    workspaceSlug: string,
    settingsIntentOrItem: boolean | PendingWorkspaceIdentity = false,
    item?: PendingWorkspaceIdentity
  ) {
    const settingsIntent = typeof settingsIntentOrItem === "boolean" ? settingsIntentOrItem : false;
    const optimisticIdentity = typeof settingsIntentOrItem === "boolean" ? item ?? null : settingsIntentOrItem;

    requestRouteTransition({
      href: buildWorkspaceHref(workspaceSlug, {
        settingsIntent
      }),
      reason: currentWorkspaceSlug && currentWorkspaceSlug !== workspaceSlug ? "workspace_switch" : "user_navigation",
      replace: false,
      beforeCommit: () => {
        rememberRecentWorkspaceSlug(workspaceSlug);
        setWorkspaceSettingsNotice(settingsIntent);
        setPendingWorkspaceIdentity(
          optimisticIdentity && cleanText(optimisticIdentity.slug) === cleanText(workspaceSlug) ? optimisticIdentity : null
        );
        pageSettingsPendingOpenPageIdRef.current = "";
        crossModeTargetPageSysIdRef.current = "";
      }
    });
  }

  function openWorkspacePage(pageId: string) {
    if (route.mode !== "workspace") {
      return;
    }

    const nextPageId = cleanText(pageId);
    const nextPage = findWorkspacePageBySysId(currentWorkspacePages, nextPageId);
    const nextPageSlug = cleanText(nextPage?.draftSlug);
    if (!nextPageId || !nextPageSlug || currentWorkspacePageSlug === nextPageSlug) {
      return;
    }

    if (pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId !== nextPageId) {
      requestClosePageSettingsPanel(nextPageId);
      return;
    }

    requestRouteTransition({
      href: buildWorkspaceHref(currentWorkspaceSlug, {
        mode: activeWorkspaceMode,
        pageSlug: nextPageSlug
      }),
      reason: "user_navigation",
      replace: false
    });
  }

  function changeWorkspaceMode(mode: WorkspaceMode) {
    if (route.mode !== "workspace") {
      return;
    }
    if (workspaceCommandBlocksCurrentWorkspaceWrites) {
      return;
    }

    const nextMode = mode === "edit" ? "edit" : "live";
    if (nextMode === activeWorkspaceMode && requestedWorkspaceMode === nextMode) {
      return;
    }
    const isDeliberateBlockedReentry =
      nextMode === "edit" &&
      activeWorkspaceMode === "live" &&
      requestedWorkspaceMode !== "edit" &&
      workspaceLeaseState.state === "blocked" &&
      workspaceLeaseState.failure !== "terminal";
    const currentPageSysId = cleanText(selectedWorkspacePage?.sysId);
    const nextModeStateKey = buildModeStateKey(currentWorkspaceSlug, nextMode);
    const nextModeState = modeUiState[nextModeStateKey] ?? createWorkspaceModeUiState();
    const rememberedNextPageSysId = cleanText(nextModeState.selectedPageSysId);
    const rememberedNextPage = rememberedNextPageSysId
      ? findWorkspacePageBySysId(currentWorkspacePages, rememberedNextPageSysId)
      : null;
    const nextPageSlug = nextMode === "live"
      ? rememberedNextPage
        ? cleanText(rememberedNextPage.draftSlug)
        : selectedWorkspacePage?.publicationState === "draft"
          ? cleanText(getFirstWorkspacePage(currentWorkspacePages.filter((page) => page.publicationState !== "draft"))?.draftSlug)
          : cleanText(selectedWorkspacePage?.draftSlug)
      : rememberedNextPageSysId
        ? cleanText(rememberedNextPage?.draftSlug)
        : cleanText(selectedWorkspacePage?.draftSlug);

    requestRouteTransition({
      href: buildWorkspaceHref(currentWorkspaceSlug, {
        mode: nextMode,
        pageSlug: nextPageSlug || undefined
      }),
      reason: nextMode === "live" ? "deliberate_edit_exit" : "user_navigation",
      replace: false,
      beforeCommit: () => {
        editReentryRequestedRef.current = isDeliberateBlockedReentry;
        crossModeTargetPageSysIdRef.current = rememberedNextPageSysId || currentPageSysId;
        pageSettingsPendingOpenPageIdRef.current = "";
        setInlinePageCreateState(null);
        setEditorFailure(null);

        if (pageSettingsStateRef.current.open) {
          const nextState = createEmptyPageSettingsState();
          pageSettingsStateRef.current = nextState;
          setPageSettingsState(nextState);
        }

        setModeUiState((current) => {
          const currentState = current[currentModeStateKey] ?? createWorkspaceModeUiState();
          const nextState = current[nextModeStateKey] ?? createWorkspaceModeUiState();

          return {
            ...current,
            [currentModeStateKey]: {
              ...currentState,
              searchQuery: ""
            },
            [nextModeStateKey]: {
              ...nextState,
              searchQuery: ""
            }
          };
        });
      }
    });
  }

  function openCreateModal() {
    if (route.mode !== "launcher") {
      openLauncher();
    }

    setCreateModalError(undefined);
    setCreateModalPhase("idle");
    setCreateModalOpen(true);
  }

  function openCreatePageModal(parentPageSysId = "", _parentPageTitle = "") {
    if (route.mode !== "workspace") {
      return;
    }
    if (workspaceCommandBlocksCurrentWorkspaceWrites) {
      return;
    }

    void _parentPageTitle;
    inlinePageCreateFocusTokenRef.current += 1;
    setInlinePageCreateState(createInlinePageCreateState(parentPageSysId, inlinePageCreateFocusTokenRef.current));
  }

  function openPageSettings(pageSysId: string) {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || !workspacePagesLoaded || !canManagePageSettings) {
      return;
    }

    if (pageSettingsCloseTimerRef.current !== null) {
      window.clearTimeout(pageSettingsCloseTimerRef.current);
      pageSettingsCloseTimerRef.current = null;
    }
    pageSettingsCloseTargetRef.current = "";

    const page = findWorkspacePageBySysId(currentWorkspacePages, pageSysId);
    if (!page) {
      return;
    }

    pageSettingsPendingOpenPageIdRef.current = "";
    const nextState = createPageSettingsStateFromPage(page);
    pageSettingsStateRef.current = nextState;
    setPageSettingsState(nextState);
  }

  function requestTogglePageSettings(pageSysId: string) {
    const nextPageId = cleanText(pageSysId);
    if (!nextPageId) {
      return;
    }

    if (pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId === nextPageId) {
      pageSettingsPendingOpenPageIdRef.current = "";
      requestClosePageSettingsPanel(nextPageId);
      return;
    }

    if (nextPageId !== selectedWorkspacePageId) {
      pageSettingsPendingOpenPageIdRef.current = nextPageId;
      openWorkspacePage(nextPageId);
      return;
    }

    openPageSettings(nextPageId);
  }

  function updatePageSettingsField(field: PageSettingsField, value: string) {
    setPageSettingsState((current) => {
      if (!current.open) {
        return current;
      }

      const nextErrorKey = field === "title" ? "titleError" : "slugError";
      const nextState: PageSettingsState = {
        ...current,
        [field]: value,
        [nextErrorKey]: "",
        generalError: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  function startPageSettingsField(field: PageSettingsField) {
    if (!pageSettingsState.open) {
      return;
    }

    if (pageSettingsState.activeField && pageSettingsState.activeField !== field) {
      if (!finishPageSettingsField(pageSettingsState.activeField)) {
        return;
      }
    }

    const currentValue = field === "title" ? pageSettingsState.title : pageSettingsState.slug;
    setPageSettingsState((current) => {
      const nextState = {
        ...current,
        activeField: field,
        titleSnapshot: field === "title" ? currentValue : current.titleSnapshot,
        slugSnapshot: field === "slug" ? currentValue : current.slugSnapshot,
        titleError: field === "title" ? "" : current.titleError,
        slugError: field === "slug" ? "" : current.slugError,
        generalError: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  function finishPageSettingsField(field: PageSettingsField): boolean {
    if (!pageSettingsState.open) {
      return true;
    }

    if (field === "title") {
      const validation = validatePageSettingsTitle(pageSettingsState.title);
      if (!validation.valid) {
        setPageSettingsState((current) => {
          const nextState: PageSettingsState = {
            ...current,
            titleError: validation.error,
            activeField: "title",
            generalError: ""
          };
          pageSettingsStateRef.current = nextState;
          return nextState;
        });
        return false;
      }

      setPageSettingsState((current) => {
        const nextState: PageSettingsState = {
          ...current,
          title: validation.value,
          titleError: "",
          activeField: ""
        };
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return true;
    }

    const validation = validatePageSettingsSlug(
      pageSettingsState.slug,
      currentWorkspacePages,
      workspaceState.status === "success" ? workspaceState.data.sysId ?? "" : "",
      pageSettingsState.pageSysId
    );

    if (!validation.valid) {
      setPageSettingsState((current) => {
        const nextState: PageSettingsState = {
          ...current,
          slugError: validation.error,
          activeField: "slug",
          generalError: ""
        };
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return false;
    }

    setPageSettingsState((current) => {
      const nextState: PageSettingsState = {
        ...current,
        slug: validation.value,
        slugError: "",
        activeField: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
    return true;
  }

  function cancelPageSettingsField(field: PageSettingsField) {
    if (!pageSettingsState.open) {
      return;
    }

    setPageSettingsState((current) => {
      const nextState: PageSettingsState = {
        ...current,
        title: field === "title" ? current.titleSnapshot : current.title,
        slug: field === "slug" ? current.slugSnapshot : current.slug,
        titleError: field === "title" ? "" : current.titleError,
        slugError: field === "slug" ? "" : current.slugError,
        activeField: "",
        generalError: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  async function closePageSettingsPanel(nextSelectedPageId = pageSettingsStateRef.current.pageSysId): Promise<boolean> {
    const currentPageSettingsState = pageSettingsStateRef.current;

    if (!currentPageSettingsState.open || workspaceState.status !== "success" || !workspacePagesLoaded) {
      return true;
    }

    const page = findWorkspacePageBySysId(currentWorkspacePages, currentPageSettingsState.pageSysId);
    if (!page) {
      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);
      return true;
    }

    const titleValidation = validatePageSettingsTitle(currentPageSettingsState.title);
    const slugValidation = validatePageSettingsSlug(
      currentPageSettingsState.slug,
      currentWorkspacePages,
      workspaceState.data.sysId ?? "",
      page.sysId ?? currentPageSettingsState.pageSysId
    );

    if (!titleValidation.valid || !slugValidation.valid) {
      setPageSettingsState((current) => ({
        ...current,
        titleError: titleValidation.valid ? "" : titleValidation.error,
        slugError: slugValidation.valid ? "" : slugValidation.error,
        activeField: !titleValidation.valid ? "title" : "slug",
        generalError: ""
      }));
      return false;
    }

    const normalizedTitle = titleValidation.value;
    const normalizedSlug = slugValidation.normalizedValue;
    const currentTitle = cleanText(currentPageSettingsState.titleSnapshot);
    const currentSlug = cleanText(currentPageSettingsState.slugSnapshot).toLowerCase();
    const hasChanges = normalizedTitle !== currentTitle || normalizedSlug !== currentSlug;

    if (!hasChanges) {
      const restoredCapture = restoredPageSettingsCaptureRef.current;
      const pageIdentity = getPageRecoveryIdentity(currentPageSettingsState.pageSysId);
      if (
        restoredCapture &&
        pageIdentity &&
        restoredCapture.captureGeneration > 0 &&
        restoredCapture.pageSysId === pageIdentity.pageSysId &&
        restoredCapture.workspaceSlug === pageIdentity.workspaceSlug &&
        restoredCapture.workspaceSysId === pageIdentity.workspaceSysId
      ) {
        if (authoringRecoveryRef.current.clearPageSettings(pageIdentity, restoredCapture.captureGeneration)) {
          bumpRecoveryVersion();
        }
        restoredPageSettingsCaptureRef.current = null;
      }
      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);
      const nextPageId = cleanText(nextSelectedPageId);
      if (nextPageId && nextPageId !== currentPageSettingsState.pageSysId) {
        requestRouteTransition({
          href: buildWorkspaceRouteForPage(nextPageId),
          replace: false
        });
      }
      return true;
    }

    setPageSettingsState((current) => ({
      ...current,
      titleError: "",
      slugError: "",
      generalError: "",
      noticeMessage: ""
    }));

    if (staleRefreshBlocksCurrentWorkspaceWrites || workspaceCommandBlocksCurrentWorkspaceWrites) {
      setPageSettingsState((current) => ({
        ...current,
        generalError: blockedWriteMessage()
      }));
      return false;
    }

    const mutationContextKey = currentWorkspaceMutationContextKey({ scope: "workspace" });
    try {
      const outcome = await runWorkspaceMutation<PageSettingsSaveResult>({
        contextKey: mutationContextKey,
        type: "page_settings",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.savePageSettings({
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: workspaceState.data.sysId ?? "",
          pageSysId: page.sysId ?? currentPageSettingsState.pageSysId,
          title: normalizedTitle,
          slug: normalizedSlug,
          workspaceLeaseToken,
          workspaceAuthority
        })
      });
      if (isObsoleteWorkspaceMutationOutcome(outcome) && !isCurrentWorkspaceMutationContext(mutationContextKey)) return false;
      if (outcome.state === "contention" || outcome.state === "forbidden" || outcome.state === "transient_failure") {
        setPageSettingsState((current) => ({ ...current, generalError: outcome.state === "contention" ? "This workspace is currently being edited by another user." : outcome.errorMessage }));
        return false;
      }
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return false;
      const result = outcome;

      if (result.state === "failed" && result.code === "forbidden") {
        forceLiveAfterAuthoringAccessLoss({
          expectedBinding: workspaceLeaseBindingRef.current,
          expectedWorkspaceLeaseGeneration: workspaceLeaseOperationGenerationRef.current,
          message: result.errorMessage,
          nextLeaseState: createWorkspaceLeaseFailureNotice({ errorMessage: result.errorMessage, failure: "forbidden" }),
          reason: "forbidden",
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: cleanText(workspaceState.data.sysId)
        });
        return false;
      }

      if (result.state === "failed") {
        if (result.code === "recovery_required") {
          enterDiscardRecoveryRequiredState({
            affectedPageCount: result.affectedPageCount,
            commandId: result.recoveryCommandId,
            contextKey: currentWorkspaceMutationContextKey({ scope: "workspace" }),
            errorMessage: result.errorMessage,
            source: "mutation",
            workspaceSlug: workspaceState.data.slug,
            workspaceSysId: cleanText(workspaceState.data.sysId),
            changeSetId: result.currentChangeSetId,
            changeSetRevision: result.currentChangeSetRevision
          });
        }
        setPageSettingsState((current) => ({
          ...current,
          generalError: result.errorMessage
        }));
        return false;
      }
      requestPendingChangesRefresh();

      setWorkspacePagesState((current) => {
        if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug || current.mode !== activeWorkspaceMode) {
          return current;
        }

        return {
          ...current,
          data: current.data.map((pageRecord) =>
            cleanText(pageRecord.sysId) === cleanText(result.page.sysId) ? result.page : pageRecord
          )
        };
      });

      const restoredCapture = restoredPageSettingsCaptureRef.current;
      const restoredIdentity = getPageRecoveryIdentity(result.page.sysId ?? currentPageSettingsState.pageSysId);
      if (
        restoredCapture &&
        restoredIdentity &&
        restoredCapture.pageSysId === restoredIdentity.pageSysId &&
        restoredCapture.workspaceSlug === restoredIdentity.workspaceSlug &&
        restoredCapture.workspaceSysId === restoredIdentity.workspaceSysId
      ) {
        if (authoringRecoveryRef.current.clearPageSettings(restoredIdentity, restoredCapture.captureGeneration)) {
          bumpRecoveryVersion();
        }
        restoredPageSettingsCaptureRef.current = null;
      }

      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);
      const nextPageId = cleanText(nextSelectedPageId);
      if (nextPageId && nextPageId !== cleanText(result.page.sysId)) {
        requestRouteTransition({
          href: buildWorkspaceRouteForPage(nextPageId),
          replace: false
        });
      }
      return true;
    } catch {
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return false;
      setPageSettingsState((current) => ({
        ...current,
        generalError: "Something went wrong while saving page settings. Your changes were not saved. Please try again."
      }));
      return false;
    }
  }

  function requestClosePageSettingsPanel(nextSelectedPageId = pageSettingsStateRef.current.pageSysId) {
    pageSettingsCloseTargetRef.current = cleanText(nextSelectedPageId) || pageSettingsStateRef.current.pageSysId;

    if (pageSettingsCloseTimerRef.current !== null) {
      return;
    }

    pageSettingsCloseTimerRef.current = window.setTimeout(() => {
      pageSettingsCloseTimerRef.current = null;
      void closePageSettingsPanel(pageSettingsCloseTargetRef.current);
    }, 0);
  }

  function requestOpenDeletePageSettings() {
    if (!pageSettingsStateRef.current.open || !canManagePageSettings || !pageSettingsPage) {
      return;
    }

    setPageSettingsState((current) => ({
      ...current,
      deleteOpen: true,
      deletePending: false,
      deleteError: ""
    }));
  }

  function requestCloseDeletePageSettings() {
    setPageSettingsState((current) => {
      if (current.deletePending) {
        return current;
      }

      return {
        ...current,
        deleteOpen: false,
        deleteError: ""
      };
    });
  }

  async function confirmDeletePageSettings() {
    const currentPageSettingsState = pageSettingsStateRef.current;
    if (!currentPageSettingsState.open || !currentPageSettingsState.deleteOpen) {
      return;
    }

    if (!canManagePageSettings || !workspacePagesLoaded || workspaceState.status !== "success") {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Unable to delete this page right now. Please reopen Page Settings and try again."
      }));
      return;
    }

    const currentPage = findWorkspacePageBySysId(currentWorkspacePages, currentPageSettingsState.pageSysId);
    if (!currentPage) {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Unable to delete this page right now. Please reopen Page Settings and try again."
      }));
      return;
    }

    const deletedPageSysId = cleanText(currentPage.sysId) || currentPageSettingsState.pageSysId;
    const deletedSubtreeIds = new Set(collectPageSubtreeSysIds(currentWorkspacePages, deletedPageSysId));
    const nextPages = removePageSubtree(currentWorkspacePages, deletedPageSysId) as WorkspacePageRecord[];
    const nextSelection = deletedSubtreeIds.has(selectedWorkspacePageId)
      ? resolveWorkspacePageSelection(nextPages, {
          mode: activeWorkspaceMode
        })
      : resolveWorkspacePageSelection(nextPages, {
          mode: activeWorkspaceMode,
          preferredPageSysId: selectedWorkspacePageId
        });
    const nextPageId = cleanText(nextSelection.pageId);

    setPageSettingsState((current) => ({
      ...current,
      deletePending: true,
      deleteError: ""
    }));

    if (staleRefreshBlocksCurrentWorkspaceWrites || workspaceCommandBlocksCurrentWorkspaceWrites) {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: blockedWriteMessage()
      }));
      return;
    }

    const mutationContextKey = currentWorkspaceMutationContextKey({ scope: "workspace" });
    try {
      const outcome = await runWorkspaceMutation<PageDeleteResult>({
        contextKey: mutationContextKey,
        type: "page_delete",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.deletePage({
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: workspaceState.data.sysId ?? "",
          pageSysId: deletedPageSysId,
          workspaceLeaseToken,
          workspaceAuthority
        })
      });
      if (isObsoleteWorkspaceMutationOutcome(outcome) && !isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      if (outcome.state === "contention" || outcome.state === "forbidden" || outcome.state === "transient_failure") {
        setPageSettingsState((current) => ({ ...current, deletePending: false, deleteError: outcome.state === "contention" ? "This workspace is currently being edited by another user." : outcome.errorMessage }));
        return;
      }
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      const result = outcome;

      if (result.state === "failed" && result.code === "forbidden") {
        forceLiveAfterAuthoringAccessLoss({
          expectedBinding: workspaceLeaseBindingRef.current,
          expectedWorkspaceLeaseGeneration: workspaceLeaseOperationGenerationRef.current,
          message: result.errorMessage,
          nextLeaseState: createWorkspaceLeaseFailureNotice({ errorMessage: result.errorMessage, failure: "forbidden" }),
          reason: "forbidden",
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: cleanText(workspaceState.data.sysId)
        });
        return;
      }

      if (result.state === "failed") {
        if (result.code === "recovery_required") {
          enterDiscardRecoveryRequiredState({
            affectedPageCount: result.affectedPageCount,
            commandId: result.recoveryCommandId,
            contextKey: currentWorkspaceMutationContextKey({ scope: "workspace" }),
            errorMessage: result.errorMessage,
            source: "mutation",
            workspaceSlug: workspaceState.data.slug,
            workspaceSysId: cleanText(workspaceState.data.sysId),
            changeSetId: result.currentChangeSetId,
            changeSetRevision: result.currentChangeSetRevision
          });
        }
        setPageSettingsState((current) => ({
          ...current,
          deletePending: false,
          deleteError: result.errorMessage
        }));
        return;
      }
      requestPendingChangesRefresh();

      setWorkspacePagesState((current) => {
        if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug || current.mode !== activeWorkspaceMode) {
          return current;
        }

        return {
          ...current,
          data: nextPages,
          totalCount: nextPages.length
        };
      });
      clearDeletedPageRecoverySnapshots({
        workspaceSlug: workspaceState.data.slug,
        workspaceSysId: cleanText(workspaceState.data.sysId)
      }, deletedSubtreeIds);

      try {
        const refreshedPages = await serviceNowClient.listPages({
          mode: activeWorkspaceMode,
          workspaceSlug: workspaceState.data.slug
        });

        if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return;
        setWorkspacePagesState((current) => {
          if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug || current.mode !== activeWorkspaceMode) {
            return current;
          }

          return {
            ...current,
            data: refreshedPages.items,
            totalCount: refreshedPages.totalCount
          };
        });
      } catch {
        // Keep the optimistic subtree removal if the refresh fails.
      }

      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);

      commitRoute(
        buildWorkspaceHref(currentWorkspaceSlug, {
          mode: activeWorkspaceMode,
          pageSlug: cleanText(nextSelection.pageSlug) || undefined
        }),
        false,
        "user_navigation"
      );
    } catch {
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Something went wrong while deleting the page. The page was not deleted. Please try again."
      }));
    }
  }

  async function submitWorkspaceCreation(input: { name: string; shortDescription: string }) {
    setCreateModalError(undefined);
    setCreateModalPhase("submitting");

    try {
      const result = await serviceNowClient.createWorkspace({
        name: input.name,
        shortDescription: input.shortDescription || null
      });

      if (result.state === "failed") {
        setCreateModalError(result.errorMessage);
        setCreateModalPhase("idle");
        return;
      }

      if (result.state === "pending") {
        await resolvePendingProvisioning(result);
        return;
      }

      await finalizeWorkspaceCreation(result.workspace);
    } catch {
      setCreateModalError("Something went wrong while creating the workspace. The workspace was not created. Please try again.");
      setCreateModalPhase("idle");
    }
  }

  async function resolvePendingProvisioning(initialResult: WorkspaceCreatePending) {
    let currentResult: WorkspaceCreateResult = initialResult;
    let currentStatusPath = initialResult.statusPath;

    setCreateModalPhase("polling");

    while (currentResult.state === "pending") {
      await delay(currentResult.pollAfterMs);
      currentResult = await serviceNowClient.getWorkspaceProvisioningStatus(currentStatusPath);

      if (currentResult.state === "pending" && currentResult.statusPath) {
        currentStatusPath = currentResult.statusPath;
      }
    }

    if (currentResult.state === "failed") {
      setCreateModalError(currentResult.errorMessage);
      setCreateModalPhase("idle");
      return;
    }

    await finalizeWorkspaceCreation(currentResult.workspace);
  }

  async function finalizeWorkspaceCreation(workspace: WorkspaceViewRecord) {
    setCreateModalOpen(false);
    setCreateModalError(undefined);
    setCreateModalPhase("idle");
    setLauncherRefreshToken((value) => value + 1);
    setWorkspaceState({ data: workspace, status: "success" });
    openWorkspace(workspace.slug);
  }

  function updateInlinePageCreateTitle(value: string) {
    setInlinePageCreateState((current) => {
      const baseState = current ?? displayedInlinePageCreateState;
      if (!baseState || baseState.pending) {
        return current;
      }

      return {
        ...baseState,
        errorMessage: "",
        noticeMessage: "",
        title: value
      };
    });
  }

  async function submitInlinePageCreation() {
    const activeInlineCreateState = inlinePageCreateState ?? displayedInlinePageCreateState;
    if (!activeInlineCreateState || activeInlineCreateState.pending) {
      return;
    }

    if (workspaceState.status !== "success") {
      setInlinePageCreateState((current) => {
        const baseState = current ?? activeInlineCreateState;
        if (!baseState) {
          return current;
        }

        return {
          ...baseState,
          errorMessage: "The selected workspace is not ready yet."
        };
      });
      return;
    }

    const title = cleanText(activeInlineCreateState.title);
    const parentPageSysId = cleanText(activeInlineCreateState.parentPageSysId);

    if (!title) {
      if (
        restoredInlineCreateCaptureRef.current &&
        workspaceRecoveryIdentity &&
        authoringRecoveryRef.current.clearInlineCreate(workspaceRecoveryIdentity, restoredInlineCreateCaptureRef.current.captureGeneration)
      ) {
        bumpRecoveryVersion();
      }
      restoredInlineCreateCaptureRef.current = null;
      setInlinePageCreateState(null);
      return;
    }

    setInlinePageCreateState((current) => {
      const baseState = current ?? activeInlineCreateState;
      if (!baseState) {
        return current;
      }

      return {
        ...baseState,
        errorMessage: "",
        noticeMessage: "",
        pending: true,
        title
      };
    });

    if (staleRefreshBlocksCurrentWorkspaceWrites || workspaceCommandBlocksCurrentWorkspaceWrites) {
      setInlinePageCreateState((current) =>
        current
          ? {
              ...current,
              errorMessage: blockedWriteMessage(),
              pending: false,
              showInput: true,
              title,
              parentPageSysId
            }
          : current
      );
      return;
    }

    const mutationContextKey = currentWorkspaceMutationContextKey({ scope: "workspace" });
    try {
      const outcome = await runWorkspaceMutation<PageCreateResult>({
        contextKey: mutationContextKey,
        type: "page_create",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.createPage({
          ...(parentPageSysId ? { parentPageSysId } : {}),
          title,
          workspaceSlug: workspaceState.data.slug,
          workspaceLeaseToken,
          workspaceAuthority
        })
      });
      if (isObsoleteWorkspaceMutationOutcome(outcome) && !isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      if (outcome.state === "contention" || outcome.state === "forbidden" || outcome.state === "transient_failure") {
        setInlinePageCreateState((current) => current ? { ...current, errorMessage: outcome.state === "contention" ? "This workspace is currently being edited by another user." : outcome.errorMessage, pending: false, showInput: true, title, parentPageSysId } : current);
        return;
      }
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      const result = outcome;

      if (result.state === "failed" && result.code === "forbidden") {
        forceLiveAfterAuthoringAccessLoss({
          expectedBinding: workspaceLeaseBindingRef.current,
          expectedWorkspaceLeaseGeneration: workspaceLeaseOperationGenerationRef.current,
          message: result.errorMessage,
          nextLeaseState: createWorkspaceLeaseFailureNotice({ errorMessage: result.errorMessage, failure: "forbidden" }),
          reason: "forbidden",
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: cleanText(workspaceState.data.sysId)
        });
        return;
      }

      if (result.state === "failed") {
        if (result.code === "recovery_required") {
          enterDiscardRecoveryRequiredState({
            affectedPageCount: result.affectedPageCount,
            commandId: result.recoveryCommandId,
            contextKey: currentWorkspaceMutationContextKey({ scope: "workspace" }),
            errorMessage: result.errorMessage,
            source: "mutation",
            workspaceSlug: workspaceState.data.slug,
            workspaceSysId: cleanText(workspaceState.data.sysId),
            changeSetId: result.currentChangeSetId,
            changeSetRevision: result.currentChangeSetRevision
          });
        }
        setInlinePageCreateState((current) =>
          current
            ? {
                ...current,
                errorMessage: result.errorMessage,
                pending: false,
                showInput: true,
                title,
                parentPageSysId
              }
            : current
        );
        return;
      }
      requestPendingChangesRefresh();

      finalizePageCreation(result.page);
    } catch {
        if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return;
        setInlinePageCreateState((current) =>
          current
            ? {
                ...current,
                errorMessage: "Something went wrong while creating the page. The page was not created. Please try again.",
                pending: false,
                showInput: true,
                title,
                parentPageSysId
              }
            : current
        );
    }
  }

  function finalizePageCreation(page: WorkspacePageRecord) {
    const currentWorkspace = workspaceState.status === "success" ? workspaceState.data.slug : currentWorkspaceSlug;
    const workspaceIdentity = getWorkspaceRecoveryIdentity();

    if (
      restoredInlineCreateCaptureRef.current &&
      workspaceIdentity &&
      authoringRecoveryRef.current.clearInlineCreate(workspaceIdentity, restoredInlineCreateCaptureRef.current.captureGeneration)
    ) {
      bumpRecoveryVersion();
    }
    restoredInlineCreateCaptureRef.current = null;

    setInlinePageCreateState(null);
    setWorkspacePagesState((current) => {
      if (current.status !== "success" || current.workspaceSlug !== currentWorkspace || current.mode !== activeWorkspaceMode) {
        return current;
      }

      return {
        ...current,
        data: [...current.data, page],
        totalCount: current.totalCount + 1
      };
    });
    requestRouteTransition({
      href: buildWorkspaceHref(currentWorkspace, {
        mode: "edit",
        pageSlug: cleanText(page.draftSlug) || undefined
      }),
      replace: false,
      beforeCommit: () => {
        crossModeTargetPageSysIdRef.current = cleanText(page.sysId);
      }
    });
  }

  async function moveWorkspacePage(input: { pageSysId: string; parentPageSysId: string | null; siblingOrder: string | number }) {
    if (!serviceNowClient.movePage || !canManagePageSettings || !workspacePagesLoaded || workspaceState.status !== "success") {
      return;
    }
    if (workspaceCommandBlocksCurrentWorkspaceWrites) {
      return;
    }
    if (staleRefreshBlocksCurrentWorkspaceWrites) {
      requestStaleRefreshBlock(currentWorkspaceMutationAuthority() ?? {});
      return;
    }
    const pageSysId = cleanText(input.pageSysId);
    const siblingOrder = String(input.siblingOrder);
    const parentPageSysId = cleanText(input.parentPageSysId) || null;
    const movingPage = findWorkspacePageBySysId(currentWorkspacePages, pageSysId);
    if (!movingPage || ((cleanText(movingPage.parentPageSysId) || null) === parentPageSysId && String(movingPage.siblingOrder) === siblingOrder)) {
      return;
    }
    const previousPages = currentWorkspacePages;
    const optimisticPages = previousPages.map((page) =>
      cleanText(page.sysId) === pageSysId
        ? { ...page, parentPageSysId, siblingOrder: normalizeNumericSiblingOrder(siblingOrder, page.siblingOrder) }
        : page
    );
    setWorkspacePagesState((current) =>
      current.status === "success" && current.workspaceSlug === workspaceState.data.slug && current.mode === activeWorkspaceMode
        ? { ...current, data: optimisticPages }
        : current
    );
    const mutationContextKey = currentWorkspaceMutationContextKey({ scope: "workspace" });
    try {
      const outcome = await runWorkspaceMutation<PageMoveResult>({
        contextKey: mutationContextKey,
        type: "page_move",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.movePage!({
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: workspaceState.data.sysId ?? "",
          pageSysId,
          parentPageSysId,
          siblingOrder,
          workspaceLeaseToken,
          workspaceAuthority
        })
      });
      if (isObsoleteWorkspaceMutationOutcome(outcome) && !isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      if (outcome.state === "contention" || outcome.state === "forbidden" || outcome.state === "transient_failure") {
        setWorkspacePagesState((current) =>
          current.status === "success" && current.workspaceSlug === workspaceState.data.slug && current.mode === activeWorkspaceMode
            ? { ...current, data: previousPages }
            : current
        );
        return;
      }
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      const result = outcome;
      if (result.state === "failed" && result.code === "forbidden") {
        setWorkspacePagesState((current) =>
          current.status === "success" && current.workspaceSlug === workspaceState.data.slug && current.mode === activeWorkspaceMode
            ? { ...current, data: previousPages }
            : current
        );
        forceLiveAfterAuthoringAccessLoss({
          expectedBinding: workspaceLeaseBindingRef.current,
          expectedWorkspaceLeaseGeneration: workspaceLeaseOperationGenerationRef.current,
          message: result.errorMessage,
          nextLeaseState: createWorkspaceLeaseFailureNotice({ errorMessage: result.errorMessage, failure: "forbidden" }),
          reason: "forbidden",
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: cleanText(workspaceState.data.sysId)
        });
        return;
      }
      if (result.state === "failed") {
        if (result.code === "recovery_required") {
          enterDiscardRecoveryRequiredState({
            affectedPageCount: result.affectedPageCount,
            commandId: result.recoveryCommandId,
            contextKey: currentWorkspaceMutationContextKey({ scope: "workspace" }),
            errorMessage: result.errorMessage,
            source: "mutation",
            workspaceSlug: workspaceState.data.slug,
            workspaceSysId: cleanText(workspaceState.data.sysId),
            changeSetId: result.currentChangeSetId,
            changeSetRevision: result.currentChangeSetRevision
          });
        }
        setWorkspacePagesState((current) =>
          current.status === "success" && current.workspaceSlug === workspaceState.data.slug && current.mode === activeWorkspaceMode
            ? { ...current, data: previousPages }
            : current
        );
        return;
      }
      requestPendingChangesRefresh();
      setWorkspacePagesState((current) =>
        current.status === "success" && current.workspaceSlug === workspaceState.data.slug && current.mode === activeWorkspaceMode
          ? { ...current, data: result.pages, totalCount: result.pages.length }
          : current
      );
    } catch {
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return;
      setWorkspacePagesState((current) =>
        current.status === "success" && current.workspaceSlug === workspaceState.data.slug && current.mode === activeWorkspaceMode
          ? { ...current, data: previousPages }
          : current
      );
    }
  }

  const launcherList = launcherState.status === "success" || launcherState.status === "refreshing" ? launcherState.data : null;

  function handleStayOnDirtyTransition() {
    setPendingRouteTransition(null);
  }

  function handleDiscardDirtyTransition() {
    const transition = pendingRouteTransition;
    if (!transition) {
      return;
    }

    setPendingRouteTransition(null);
    const restoredCapture = transition.discardRestoredBodyCapture;
    if (restoredCapture && clearRestoredBodyCapture(restoredCapture)) {
      bumpRecoveryVersion();
    }
    transition.beforeCommit?.();
    const release = editorReleaseRef.current;
    if (release) {
      void release().finally(() => {
        commitRoute(transition.href, transition.replace, transition.reason ?? "user_navigation");
      });
      return;
    }

    commitRoute(transition.href, transition.replace, transition.reason ?? "user_navigation");
  }

  function handleOutlineChange(pageSysId: string, outline: WorkspacePageOutlineItem[]) {
    const sessionToken = renderedEditorSession;
    const normalizedPageSysId = cleanText(pageSysId);
    if (!normalizedPageSysId || !isCurrentEditorSession(sessionToken)) {
      return;
    }

    if (sessionToken.pageSysId !== normalizedPageSysId) {
      return;
    }

    setPageOutlineOverrides((current) => ({
      ...current,
      [normalizedPageSysId]: outline
    }));
  }

  function handleEditorStatusChange(pageSysId: string, state: { flush?: () => Promise<boolean>; getRecoverySnapshot?: () => PageEditorRecoverySnapshot | null; release?: (options?: { keepalive?: boolean }) => Promise<void>; isDirty: boolean; isSaving: boolean; status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved" }) {
    const sessionToken = renderedEditorSession;
    if (!isCurrentEditorSession(sessionToken)) {
      return;
    }

    if (sessionToken.pageSysId !== cleanText(pageSysId)) {
      return;
    }

    editorFlushRef.current = state.flush ?? null;
    editorRecoverySnapshotRef.current = state.getRecoverySnapshot ?? null;
    editorReleaseRef.current = state.release ?? null;

    setEditorTransitionState((current) =>
      current.isDirty === state.isDirty && current.isSaving === state.isSaving && current.status === state.status ? current : state
    );
  }

  function handleEditorFailureChangeForSession(sessionToken: EditorSessionToken | null, failure: PageEditorHostFailure | null) {
    if (!isCurrentEditorSession(sessionToken)) {
      return;
    }

    setEditorFailure(failure);
  }

  function handleEditorAccessLostForSession(sessionToken: EditorSessionToken | null) {
    if (!isCurrentEditorSession(sessionToken)) {
      return;
    }

    handleEditorAccessLost();
  }

  function handleEditorAccessLost() {
    clearActiveAuthoringUi();
    setEditAccessLost(true);
  }

  function handleReturnToLive() {
    if (route.mode !== "workspace") {
      return;
    }

    const liveTargetSlug =
      selectedWorkspacePage?.publicationState === "draft"
        ? cleanText(getFirstWorkspacePage(currentWorkspacePages.filter((page) => page.publicationState !== "draft"))?.draftSlug)
        : cleanText(selectedWorkspacePage?.draftSlug);

    requestRouteTransition({
      href: buildWorkspaceHref(currentWorkspaceSlug, {
        mode: "live",
        pageSlug: liveTargetSlug || undefined
      }),
      replace: false
    });
  }

  function applySavedPage(page: WorkspacePageRecord) {
    if (workspaceState.status !== "success") {
      return;
    }

    setWorkspacePagesState((current) => {
      if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug || current.mode !== activeWorkspaceMode) {
        return current;
      }

      return {
        ...current,
        data: current.data.map((currentPage) => (cleanText(currentPage.sysId) === cleanText(page.sysId) ? page : currentPage))
      };
    });
  }

  function currentWorkspaceMutationAuthority() {
    const binding = workspaceLeaseBindingRef.current;
    if (!binding) {
      return undefined;
    }
    return {
      changeSetId: binding.changeSetId,
      changeSetRevision: binding.changeSetRevision,
      ...(typeof binding.workspaceStateRevision === "number" ? { workspaceStateRevision: binding.workspaceStateRevision } : {})
    };
  }

  function installWorkspaceMutationAuthority(input: { changeSetId?: string; changeSetRevision?: number; workspaceStateRevision?: number }, source: "mutation" | "refresh" = "refresh"): boolean {
    const binding = workspaceLeaseBindingRef.current;
    const changeSetId = cleanText(input.changeSetId);
    const changeSetRevision =
      typeof input.changeSetRevision === "number" && Number.isSafeInteger(input.changeSetRevision) && input.changeSetRevision >= 0
        ? input.changeSetRevision
        : null;
    if (!binding || !changeSetId || changeSetRevision === null) {
      return false;
    }
    if (binding.changeSetId === changeSetId && binding.changeSetRevision > changeSetRevision) {
      recordDocseraDiagnosticEvent("workspaceMutation.authorityIgnored", {
        currentAuthority: currentWorkspaceMutationAuthority(),
        returnedAuthority: { changeSetId, changeSetRevision },
        source
      });
      return false;
    }
    workspaceLeaseBindingRef.current = {
      ...binding,
      changeSetId,
      changeSetRevision,
      ...(typeof input.workspaceStateRevision === "number" ? { workspaceStateRevision: input.workspaceStateRevision } : {})
    };
    if (workspaceLeaseStateRef.current.state === "held" && workspaceLeaseStateRef.current.leaseToken === binding.leaseToken) {
      const nextState = {
        ...workspaceLeaseStateRef.current,
        changeSetId,
        changeSetRevision,
        ...(typeof input.workspaceStateRevision === "number" ? { workspaceStateRevision: input.workspaceStateRevision } : {})
      };
      workspaceLeaseStateRef.current = nextState;
      setWorkspaceLeaseState(nextState);
    }
    recordDocseraDiagnosticEvent("workspaceMutation.authorityInstalled", {
      currentAuthority: currentWorkspaceMutationAuthority(),
      source
    });
    return true;
  }

  function enterDiscardRecoveryRequiredState(input: {
    affectedPageCount?: number;
    commandId?: string;
    contextKey?: string;
    errorMessage: string;
    source: "mutation" | "refresh";
    workspaceSlug: string;
    workspaceSysId: string;
    changeSetId?: string;
    changeSetRevision?: number;
  }) {
    const returnedChangeSetId = cleanText(input.changeSetId);
    const returnedChangeSetRevision =
      typeof input.changeSetRevision === "number" && Number.isSafeInteger(input.changeSetRevision) && input.changeSetRevision >= 0
        ? input.changeSetRevision
        : null;
    if (returnedChangeSetId && returnedChangeSetRevision !== null) {
      installWorkspaceMutationAuthority({
        changeSetId: returnedChangeSetId,
        changeSetRevision: returnedChangeSetRevision
      }, input.source);
    }
    const currentAuthority = currentWorkspaceMutationAuthority();
    const sourceChangeSetId = cleanText(currentAuthority?.changeSetId) || returnedChangeSetId;
    const sourceChangeSetRevision =
      typeof currentAuthority?.changeSetRevision === "number" && Number.isSafeInteger(currentAuthority.changeSetRevision) && currentAuthority.changeSetRevision >= 0
        ? currentAuthority.changeSetRevision
        : returnedChangeSetRevision ?? -1;
    const binding = workspaceLeaseBindingRef.current;
    setPendingChangesState({
      errorMessage: input.errorMessage,
      leaseToken:
        binding && binding.workspaceSlug === input.workspaceSlug && binding.workspaceSysId === input.workspaceSysId
          ? binding.leaseToken
          : "",
      status: "error",
      workspaceSlug: input.workspaceSlug,
      workspaceSysId: input.workspaceSysId
    });
    setWorkspaceDiscardAllState({
      affectedPageCount:
        typeof input.affectedPageCount === "number" && Number.isSafeInteger(input.affectedPageCount) && input.affectedPageCount > 0
          ? input.affectedPageCount
          : undefined,
      commandId: cleanText(input.commandId) || undefined,
      contextKey: input.contextKey ?? currentWorkspaceMutationContextKey({ scope: "workspace" }),
      errorMessage: input.errorMessage,
      recoveryRequired: true,
      retryable: Boolean(cleanText(input.commandId)),
      sourceChangeSetId,
      sourceChangeSetRevision,
      status: "error",
      workspaceSlug: input.workspaceSlug,
      workspaceSysId: input.workspaceSysId
    });
  }

  async function refreshPendingChanges(options: { keepPrevious?: boolean } = {}) {
    const binding = workspaceLeaseBindingRef.current;
    if (!serviceNowClientRef.current.getWorkspacePendingChanges || !binding || activeWorkspaceMode !== "edit") {
      setPendingChangesState({ status: "idle" });
      return;
    }
    const requestId = pendingChangesRequestIdRef.current + 1;
    pendingChangesRequestIdRef.current = requestId;
    const previous = pendingChangesState.status === "success" || pendingChangesState.status === "refreshing" ? pendingChangesState.data : pendingChangesState.status === "error" ? pendingChangesState.previous : undefined;
    const workspaceSlug = binding.workspaceSlug;
    const workspaceSysId = binding.workspaceSysId;
    const leaseToken = binding.leaseToken;
    if (options.keepPrevious && previous) {
      setPendingChangesState({ data: previous, leaseToken, status: "refreshing", workspaceSlug, workspaceSysId });
    } else {
      setPendingChangesState({ leaseToken, status: "loading", workspaceSlug, workspaceSysId });
    }
    const result = await serviceNowClientRef.current.getWorkspacePendingChanges({
      workspaceSlug,
      workspaceSysId,
      leaseToken
    });
    const currentBinding = workspaceLeaseBindingRef.current;
    if (
      pendingChangesRequestIdRef.current !== requestId ||
      activeWorkspaceMode !== "edit" ||
      !currentBinding ||
      currentBinding.workspaceSlug !== workspaceSlug ||
      currentBinding.workspaceSysId !== workspaceSysId ||
      currentBinding.leaseToken !== leaseToken
    ) {
      return;
    }
    if (result.state === "succeeded") {
      installWorkspaceMutationAuthority({
        changeSetId: result.changeSetId,
        changeSetRevision: result.changeSetRevision
      }, "refresh");
      setWorkspaceDiscardAllState((current) =>
        current.status === "error" &&
        current.recoveryRequired &&
        current.workspaceSlug === workspaceSlug &&
        current.workspaceSysId === workspaceSysId
          ? { status: "idle" }
          : current
      );
      setPendingChangesState({ data: result, leaseToken, status: "success", workspaceSlug, workspaceSysId });
      return;
    }
    if (result.code === "recovery_required") {
      enterDiscardRecoveryRequiredState({
        affectedPageCount: result.affectedPageCount,
        commandId: result.recoveryCommandId,
        contextKey: currentWorkspaceMutationContextKey({ scope: "workspace" }),
        errorMessage: result.errorMessage,
        source: "refresh",
        workspaceSlug,
        workspaceSysId,
        changeSetId: result.currentChangeSetId,
        changeSetRevision: result.currentChangeSetRevision
      });
      return;
    }
    setPendingChangesState({ errorMessage: result.errorMessage, previous, leaseToken, status: "error", workspaceSlug, workspaceSysId });
  }

  function requestPendingChangesRefresh() {
    void refreshPendingChanges({ keepPrevious: true });
  }

  async function requestStaleRefreshBlock(input: { changeSetId?: string; changeSetRevision?: number }, contextKey = currentWorkspaceMutationContextKey({ scope: "workspace" })): Promise<boolean> {
    const changeSetId = cleanText(input.changeSetId);
    const changeSetRevision =
      typeof input.changeSetRevision === "number" && Number.isSafeInteger(input.changeSetRevision) && input.changeSetRevision >= 0
        ? input.changeSetRevision
        : null;
    if (workspaceState.status !== "success" || !changeSetId || changeSetRevision === null || !isCurrentWorkspaceMutationContext(contextKey)) {
      return false;
    }
    const nextState: StaleRefreshState = {
      authority: { changeSetId, changeSetRevision },
      contextKey,
      mode: activeWorkspaceMode,
      status: "refresh_required",
      workspaceSlug: workspaceState.data.slug
    };
    setStaleRefreshState(nextState);
    return refreshWorkspacePagesAfterStaleGeneration(nextState.authority, contextKey);
  }

  function blockedWriteMessage() {
    if (workspaceDiscardAllRecoveryRequired) {
      return workspaceDiscardAllState.errorMessage || "Discard recovery is incomplete. Retry discard all before making other changes.";
    }
    if (workspaceCommandBlocksCurrentWorkspaceWrites) {
      return "Publishing is in progress. Authoring actions are temporarily unavailable.";
    }
    if (
      staleRefreshState.status !== "idle" &&
      staleRefreshState.workspaceSlug === currentWorkspaceSlug &&
      staleRefreshState.mode === activeWorkspaceMode &&
      isCurrentWorkspaceMutationContext(staleRefreshState.contextKey)
    ) {
      return staleRefreshState.errorMessage || STALE_REFRESH_BLOCKED_MESSAGE;
    }
    return STALE_REFRESH_BLOCKED_MESSAGE;
  }

  function retryWorkspaceProjectionLoad() {
    if (
      staleRefreshState.status !== "idle" &&
      staleRefreshState.workspaceSlug === currentWorkspaceSlug &&
      staleRefreshState.mode === activeWorkspaceMode &&
      isCurrentWorkspaceMutationContext(staleRefreshState.contextKey)
    ) {
      void refreshWorkspacePagesAfterStaleGeneration(staleRefreshState.authority, staleRefreshState.contextKey);
      return;
    }
    setWorkspacePagesRetryNonce((value) => value + 1);
  }

  async function refreshWorkspacePagesAfterStaleGeneration(input: { changeSetId?: string; changeSetRevision?: number }, contextKey = currentWorkspaceMutationContextKey({ scope: "workspace" })) {
    if (workspaceState.status !== "success") {
      return false;
    }
    if (!isCurrentWorkspaceMutationContext(contextKey)) {
      return false;
    }
    const changeSetId = cleanText(input.changeSetId);
    const changeSetRevision =
      typeof input.changeSetRevision === "number" && Number.isSafeInteger(input.changeSetRevision) && input.changeSetRevision >= 0
        ? input.changeSetRevision
        : null;
    if (!changeSetId || changeSetRevision === null) {
      return false;
    }
    const workspaceSlug = workspaceState.data.slug;
    const mode = activeWorkspaceMode;
    const requestId = staleRefreshRequestIdRef.current + 1;
    staleRefreshRequestIdRef.current = requestId;
    setStaleRefreshState({
      authority: { changeSetId, changeSetRevision },
      contextKey,
      mode,
      status: "refreshing",
      workspaceSlug
    });
    try {
      const refreshedPages = await serviceNowClient.listPages({
        mode,
        workspaceSlug
      });
      if (staleRefreshRequestIdRef.current !== requestId) {
        return false;
      }
      if (!isCurrentWorkspaceMutationContext(contextKey)) {
        return false;
      }
      setWorkspacePagesState({
        data: refreshedPages.items,
        mode,
        status: "success",
        totalCount: refreshedPages.totalCount,
        workspaceSlug: refreshedPages.workspaceSlug || workspaceSlug
      });
      installWorkspaceMutationAuthority({ changeSetId, changeSetRevision }, "refresh");
      requestPendingChangesRefresh();
      setStaleRefreshState({ status: "idle" });
      return true;
    } catch (error) {
      if (staleRefreshRequestIdRef.current !== requestId) {
        return false;
      }
      if (!isCurrentWorkspaceMutationContext(contextKey)) {
        return false;
      }
      const errorMessage = getErrorMessage(error, "Unable to load pages.");
      setWorkspacePagesState({
        errorMessage,
        mode,
        status: "error",
        workspaceSlug
      });
      setStaleRefreshState({
        authority: { changeSetId, changeSetRevision },
        contextKey,
        errorMessage,
        mode,
        status: "refresh_required",
        workspaceSlug
      });
      return false;
    }
  }

  async function savePageDraft(
    input: {
      pageSysId: string;
      draftContentJson: DocseraDocumentEnvelope;
      expectedRevision: number;
      readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
    },
    sessionToken: EditorSessionToken | null
  ): Promise<PageBodySaveResult> {
    if (workspaceState.status !== "success") {
      return {
        errorMessage: SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE,
        state: "failed"
      };
    }
    if (staleRefreshBlocksCurrentWorkspaceWrites || workspaceCommandBlocksCurrentWorkspaceWrites) {
      return {
        errorMessage: blockedWriteMessage(),
        state: "failed"
      };
    }

    try {
      const mutationContextKey = currentWorkspaceMutationContextKey({
        pageSysId: input.pageSysId,
        scope: "body",
        sessionToken
      });
      const outcome = await runWorkspaceMutation<PageBodySaveResult>({
        contextKey: mutationContextKey,
        type: "body_save",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.savePageBody({
          draftContentJson: input.readLatestDraftContentJson?.() ?? input.draftContentJson,
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: workspaceState.data.sysId,
          pageSysId: input.pageSysId,
          workspaceLeaseToken,
          expectedRevision: input.expectedRevision,
          workspaceAuthority
        })
      });
      if (outcome.state === "contention") return { errorMessage: "This workspace is currently being edited by another user.", state: "failed" };
      if (outcome.state === "forbidden" || outcome.state === "transient_failure") return { errorMessage: outcome.errorMessage, state: "failed" };
      const result = outcome as PageBodySaveResult;
      if (result.state === "failed" && result.code === "recovery_required") {
        enterDiscardRecoveryRequiredState({
          affectedPageCount: result.affectedPageCount,
          commandId: result.recoveryCommandId,
          contextKey: currentWorkspaceMutationContextKey({ scope: "workspace" }),
          errorMessage: result.errorMessage,
          source: "mutation",
          workspaceSlug: workspaceState.data.slug,
          workspaceSysId: cleanText(workspaceState.data.sysId),
          changeSetId: result.currentChangeSetId,
          changeSetRevision: result.currentChangeSetRevision
        });
      }
      if (result.state === "failed" && result.code === "conflict") {
        return result;
      }
      return result;
    } catch {
      return {
        errorMessage: SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE,
        state: "failed"
      };
    }

  }

  async function savePageDraftForSession(
    sessionToken: EditorSessionToken | null,
    input: {
      pageSysId: string;
      draftContentJson: DocseraDocumentEnvelope;
      expectedRevision: number;
      readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
    }
  ): Promise<PageBodySaveResult> {
    const workspaceSysId = workspaceState.status === "success" ? cleanText(workspaceState.data.sysId) : "";
    const workspaceSlug = workspaceState.status === "success" ? workspaceState.data.slug : "";
    const result = await savePageDraft(input, sessionToken);

    if (
      result.state === "failed" &&
      result.code === "forbidden" &&
      sessionToken &&
      isCurrentEditorSession(sessionToken) &&
      forceLiveAfterAuthoringAccessLoss({
        expectedBinding: workspaceLeaseBindingRef.current,
        expectedEditorSession: sessionToken,
        expectedWorkspaceLeaseGeneration: workspaceLeaseOperationGenerationRef.current,
        message: result.errorMessage,
        nextLeaseState: createWorkspaceLeaseFailureNotice({ errorMessage: result.errorMessage, failure: "forbidden" }),
        reason: "forbidden",
        workspaceSlug,
        workspaceSysId
      })
    ) {
      return {
        errorMessage: result.errorMessage,
        state: "failed"
      };
    }

    if (result.state !== "succeeded" || !sessionToken || !isCurrentEditorSession(sessionToken)) {
      return result;
    }

    applySavedPage(result.page);
    requestPendingChangesRefresh();
    const activeRestore = restoredBodyCaptureRef.current;
    if (activeRestore && activeRestore.sessionKey === sessionToken.pageSysId + ":" + sessionToken.generation) {
      if (authoringRecoveryRef.current.clearBody({ pageSysId: input.pageSysId, workspaceSlug, workspaceSysId }, activeRestore.captureGeneration)) {
        bumpRecoveryVersion();
      }
      restoredBodyCaptureRef.current = null;
      setScopedShellNotice(shellNotice?.message === RESTORED_BODY_NOTICE ? null : shellNotice);
    }

    return result;
  }

  const listState = {
    hasError: launcherState.status === "error",
    isEmptyState: launcherState.status === "success" && launcherList !== null && launcherList.totalCount === 0 && !launcherList.searchText,
    isLoading: launcherState.status === "loading" || launcherState.status === "idle",
    isNoResultsState:
      launcherState.status === "success" && launcherList !== null && launcherList.totalCount === 0 && Boolean(launcherList.searchText),
    isRefreshing: launcherState.status === "refreshing",
    items: launcherList?.items ?? [],
    page: launcherList?.page ?? launcherPage,
    pageSize: launcherList?.pageSize ?? DEFAULT_PAGE_SIZE,
    totalCount: launcherList?.totalCount ?? 0,
    workspaceListErrorMessage: launcherState.status === "error" ? launcherState.errorMessage : undefined
  };

  const launcherHeaderIdentity: HeaderIdentity = {
    kind: "docsera",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    name: "Docsera"
  };
  const appHeaderIdentity = route.mode === "workspace" ? workspaceHeaderIdentity : launcherHeaderIdentity;
  const appHeaderMode = route.mode === "workspace" ? "workspace" : "launcher";
  const appHeaderWorkspaceSlug = route.mode === "workspace" ? currentWorkspaceSlug : "";
  const appHeaderWorkspaceMode =
    route.mode === "workspace" ? workspaceHeaderPresentation?.showWorkspaceMode ?? activeWorkspaceMode : "live";
  const appHeaderSidebarCollapsed = route.mode === "workspace" ? sidebarCollapsed : false;
  const appHeaderWorkspaceNavWidth = route.mode === "workspace" ? workspaceNavWidth : undefined;
  const appHeaderShowWorkspaceSettings =
    route.mode === "workspace" ? Boolean(workspaceHeaderPresentation?.showWorkspaceSettings) : false;
  const appHeaderShowEditToggle = route.mode === "workspace" ? Boolean(workspaceHeaderPresentation?.showEditModeToggle) : false;
  const appHeaderShowWorkspaceSwitcher =
    route.mode === "workspace"
      ? Boolean(workspaceHeaderPresentation?.showWorkspaceSwitcher)
      : recentWorkspaceItems.length > 0;
  const appHeaderWorkspaceControlsLocked = isRetainingWorkspaceHeaderPresentation || workspaceCommandBlocksCurrentWorkspaceWrites;
  const editorStatusLabel = cleanText(editorTransitionState.status) || "Saved";
  const pendingChangesSaveBlockedMessage =
    appHeaderWorkspaceMode === "edit" && renderedEditorSession && editorStatusLabel !== "Saved"
      ? `Current page is ${editorStatusLabel.toLowerCase()}. Publish and discard actions stay disabled until local changes are saved.`
      : pageSettingsState.open && (
          cleanText(pageSettingsState.title) !== cleanText(pageSettingsState.titleSnapshot) ||
          cleanText(pageSettingsState.slug).toLowerCase() !== cleanText(pageSettingsState.slugSnapshot).toLowerCase() ||
          Boolean(pageSettingsState.generalError) ||
          Boolean(pageSettingsState.titleError) ||
          Boolean(pageSettingsState.slugError)
        )
        ? "Page Settings has unsaved or blocked changes. Publish and discard actions stay disabled until settings are saved."
        : "";
  const workspacePublishErrorMessage =
    workspacePublishState.status === "error" &&
    workspacePublishState.workspaceSlug === currentWorkspaceSlug &&
    workspacePublishState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspacePublishState.contextKey === currentWorkspaceCommandContextKey &&
    workspacePublishState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspacePublishState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision
      ? workspacePublishState.errorMessage
      : "";
  const workspacePublishRetryable =
    workspacePublishState.status === "error" &&
    workspacePublishState.workspaceSlug === currentWorkspaceSlug &&
    workspacePublishState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspacePublishState.contextKey === currentWorkspaceCommandContextKey &&
    workspacePublishState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspacePublishState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision &&
    workspacePublishState.retryable &&
    Boolean(workspacePublishState.commandId);
  const workspaceDiscardAllErrorMessage =
    workspaceDiscardAllState.status === "error" &&
    workspaceDiscardAllState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardAllState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardAllState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardAllState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardAllState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision
      ? workspaceDiscardAllState.errorMessage
      : "";
  const workspaceDiscardAllRetryable =
    workspaceDiscardAllState.status === "error" &&
    workspaceDiscardAllState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardAllState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardAllState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardAllState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardAllState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision &&
    workspaceDiscardAllState.retryable &&
    Boolean(workspaceDiscardAllState.commandId);
  const workspaceDiscardAllAffectedPageCount =
    workspaceDiscardAllState.status === "error" &&
    workspaceDiscardAllState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardAllState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardAllState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardAllState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardAllState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision
      ? workspaceDiscardAllState.affectedPageCount
      : undefined;
  const workspacePublishToastMessage =
    workspacePublishToastState &&
    route.mode === "workspace" &&
    activeWorkspaceMode === "edit" &&
    workspacePublishToastState.workspaceSlug === currentWorkspaceSlug &&
    workspacePublishToastState.workspaceSysId === cleanText(workspaceStateData?.sysId)
      ? workspacePublishToastState.message
      : "";

  async function publishWorkspacePendingChanges() {
    if (
      !serviceNowClient.publishWorkspace ||
      route.mode !== "workspace" ||
      workspaceState.status !== "success" ||
      workspaceState.data.slug !== currentWorkspaceSlug ||
      activeWorkspaceMode !== "edit" ||
      workspaceCommandBlocksCurrentWorkspaceWrites ||
      pendingChangesSaveBlockedMessage ||
      pendingChangesResult?.state !== "succeeded" ||
      pendingChangesResult.affectedPageCount <= 0
    ) {
      return;
    }

    const workspaceSysId = cleanText(workspaceState.data.sysId);
    if (!workspaceSysId) {
      setWorkspacePublishState({
        contextKey: currentWorkspaceMutationContextKey({ scope: "workspace" }),
        errorMessage: "Unable to publish this workspace right now. Reload and try again.",
        retryable: false,
        sourceChangeSetId: "",
        sourceChangeSetRevision: -1,
        status: "error",
        workspaceSlug: workspaceState.data.slug,
        workspaceSysId: ""
      });
      return;
    }

    if (staleRefreshBlocksCurrentWorkspaceWrites) {
      await requestStaleRefreshBlock(currentWorkspaceMutationAuthority() ?? {});
      return;
    }

    const workspaceSlug = workspaceState.data.slug;
    const mutationContextKey = currentWorkspaceCommandContextKey;
    const sourceChangeSetId = currentWorkspaceCommandSourceChangeSetId;
    const sourceChangeSetRevision = currentWorkspaceCommandSourceChangeSetRevision;
    const canReuseCommandId =
      workspacePublishState.status === "error" &&
      workspacePublishState.retryable &&
      Boolean(workspacePublishState.commandId) &&
      workspacePublishState.workspaceSlug === workspaceSlug &&
      workspacePublishState.workspaceSysId === workspaceSysId &&
      workspacePublishState.contextKey === mutationContextKey &&
      workspacePublishState.sourceChangeSetId === sourceChangeSetId &&
      workspacePublishState.sourceChangeSetRevision === sourceChangeSetRevision;
    let commandId = createWorkspaceCommandId();
    if (canReuseCommandId && workspacePublishState.commandId) {
      commandId = workspacePublishState.commandId;
    }
    clearWorkspacePublishToast();
    setWorkspacePublishState({
      commandId,
      contextKey: mutationContextKey,
      sourceChangeSetId,
      sourceChangeSetRevision,
      status: "publishing",
      workspaceSlug,
      workspaceSysId
    });
    try {
      const outcome = await runWorkspaceMutation<WorkspacePublishResult>({
        contextKey: mutationContextKey,
        safeRetry: false,
        type: "workspace_publish",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.publishWorkspace!({
          commandId,
          workspaceAuthority,
          workspaceLeaseToken,
          workspaceSlug,
          workspaceSysId
        })
      });
      if (isObsoleteWorkspaceMutationOutcome(outcome) && !isCurrentWorkspaceMutationContext(mutationContextKey)) {
        return;
      }
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) {
        return;
      }
      if (outcome.state === "contention" || outcome.state === "forbidden" || outcome.state === "transient_failure") {
        setWorkspacePublishState({
          contextKey: mutationContextKey,
          errorMessage: outcome.state === "contention" ? "This workspace is currently being edited by another user." : outcome.errorMessage,
          retryable: false,
          sourceChangeSetId,
          sourceChangeSetRevision,
          status: "error",
          workspaceSlug,
          workspaceSysId
        });
        return;
      }

      const result = outcome as WorkspacePublishResult;
      if (result.state === "failed") {
        if (result.code === "recovery_required") {
          enterDiscardRecoveryRequiredState({
            affectedPageCount: result.affectedPageCount,
            commandId: result.recoveryCommandId,
            contextKey: mutationContextKey,
            errorMessage: result.errorMessage,
            source: "mutation",
            workspaceSlug,
            workspaceSysId,
            changeSetId: result.currentChangeSetId,
            changeSetRevision: result.currentChangeSetRevision
          });
          setWorkspacePublishState({ status: "idle" });
          return;
        }
        setWorkspacePublishState({
          commandId: result.retryable ? commandId : undefined,
          contextKey: mutationContextKey,
          errorMessage: result.errorMessage,
          retryable: Boolean(result.retryable),
          sourceChangeSetId,
          sourceChangeSetRevision,
          status: "error",
          workspaceSlug,
          workspaceSysId
        });
        return;
      }

      installWorkspaceMutationAuthority({
        changeSetId: result.changeSetId,
        changeSetRevision: result.changeSetRevision,
        workspaceStateRevision: result.workspaceStateRevision
      }, "mutation");
      setWorkspacePagesState({
        data: result.pages,
        mode: "edit",
        status: "success",
        totalCount: result.pages.length,
        workspaceSlug
      });
      const binding = workspaceLeaseBindingRef.current;
      if (binding && binding.workspaceSlug === workspaceSlug && binding.workspaceSysId === workspaceSysId) {
        setPendingChangesState({
          data: result.pendingChanges,
          leaseToken: binding.leaseToken,
          status: "success",
          workspaceSlug,
          workspaceSysId
        });
      } else {
        setPendingChangesState({
          data: result.pendingChanges,
          leaseToken: "",
          status: "success",
          workspaceSlug,
          workspaceSysId
        });
      }
      setWorkspacePublishState({ status: "idle" });
      showWorkspacePublishToast({ workspaceSlug, workspaceSysId });
    } catch {
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) {
        return;
      }
      setWorkspacePublishState({
        commandId,
        contextKey: mutationContextKey,
        errorMessage: "Unable to publish this workspace right now. Please try again.",
        retryable: true,
        sourceChangeSetId,
        sourceChangeSetRevision,
        status: "error",
        workspaceSlug,
        workspaceSysId
      });
    }
  }

  async function discardAllWorkspacePendingChanges() {
    if (
      !serviceNowClient.discardAllWorkspace ||
      route.mode !== "workspace" ||
      workspaceState.status !== "success" ||
      workspaceState.data.slug !== currentWorkspaceSlug ||
      activeWorkspaceMode !== "edit" ||
      (workspaceCommandBlocksCurrentWorkspaceWrites && !workspaceDiscardAllRetryable) ||
      pendingChangesSaveBlockedMessage ||
      ((pendingChangesResult?.state !== "succeeded" || pendingChangesResult.affectedPageCount <= 0) && !workspaceDiscardAllRetryable)
    ) {
      return;
    }

    const workspaceSysId = cleanText(workspaceState.data.sysId);
    if (!workspaceSysId) {
      setWorkspaceDiscardAllState({
        contextKey: currentWorkspaceCommandContextKey,
        errorMessage: "Unable to discard changes for this workspace right now. Reload and try again.",
        recoveryRequired: false,
        retryable: false,
        sourceChangeSetId: "",
        sourceChangeSetRevision: -1,
        status: "error",
        workspaceSlug: workspaceState.data.slug,
        workspaceSysId: ""
      });
      return;
    }

    if (staleRefreshBlocksCurrentWorkspaceWrites) {
      await requestStaleRefreshBlock(currentWorkspaceMutationAuthority() ?? {});
      return;
    }

    const workspaceSlug = workspaceState.data.slug;
    const mutationContextKey = currentWorkspaceCommandContextKey;
    const sourceChangeSetId = currentWorkspaceCommandSourceChangeSetId;
    const sourceChangeSetRevision = currentWorkspaceCommandSourceChangeSetRevision;
    const canReuseCommandId =
      workspaceDiscardAllState.status === "error" &&
      workspaceDiscardAllState.retryable &&
      Boolean(workspaceDiscardAllState.commandId) &&
      workspaceDiscardAllState.workspaceSlug === workspaceSlug &&
      workspaceDiscardAllState.workspaceSysId === workspaceSysId &&
      workspaceDiscardAllState.contextKey === mutationContextKey &&
      workspaceDiscardAllState.sourceChangeSetId === sourceChangeSetId &&
      workspaceDiscardAllState.sourceChangeSetRevision === sourceChangeSetRevision;
    let commandId = createWorkspaceCommandId();
    if (canReuseCommandId && workspaceDiscardAllState.commandId) {
      commandId = workspaceDiscardAllState.commandId;
    }
    setWorkspaceDiscardAllState({
      commandId,
      contextKey: mutationContextKey,
      sourceChangeSetId,
      sourceChangeSetRevision,
      status: "discarding",
      workspaceSlug,
      workspaceSysId
    });
    try {
      const outcome = await runWorkspaceMutation<WorkspaceDiscardAllResult>({
        contextKey: mutationContextKey,
        safeRetry: false,
        type: "workspace_discard_all",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.discardAllWorkspace!({
          commandId,
          workspaceAuthority,
          workspaceLeaseToken,
          workspaceSlug,
          workspaceSysId
        })
      });
      if (isObsoleteWorkspaceMutationOutcome(outcome) && !isCurrentWorkspaceMutationContext(mutationContextKey)) {
        return;
      }
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) {
        return;
      }
      if (outcome.state === "contention" || outcome.state === "forbidden" || outcome.state === "transient_failure") {
        setWorkspaceDiscardAllState({
          contextKey: mutationContextKey,
          errorMessage: outcome.state === "contention" ? "This workspace is currently being edited by another user." : outcome.errorMessage,
          recoveryRequired: false,
          retryable: false,
          sourceChangeSetId,
          sourceChangeSetRevision,
          status: "error",
          workspaceSlug,
          workspaceSysId
        });
        return;
      }

      const result = outcome as WorkspaceDiscardAllResult;
      if (result.state === "failed") {
        if (result.code === "recovery_required") {
          enterDiscardRecoveryRequiredState({
            affectedPageCount: result.affectedPageCount,
            commandId: result.recoveryCommandId ?? commandId,
            contextKey: mutationContextKey,
            errorMessage: result.errorMessage,
            source: "mutation",
            workspaceSlug,
            workspaceSysId,
            changeSetId: result.currentChangeSetId,
            changeSetRevision: result.currentChangeSetRevision
          });
          return;
        }
        setWorkspaceDiscardAllState({
          commandId: result.retryable ? commandId : undefined,
          contextKey: mutationContextKey,
          errorMessage: result.errorMessage,
          recoveryRequired: false,
          retryable: Boolean(result.retryable),
          sourceChangeSetId,
          sourceChangeSetRevision,
          status: "error",
          workspaceSlug,
          workspaceSysId
        });
        return;
      }

      installWorkspaceMutationAuthority({
        changeSetId: result.changeSetId,
        changeSetRevision: result.changeSetRevision,
        workspaceStateRevision: result.workspaceStateRevision
      }, "mutation");
      setWorkspacePagesState({
        data: result.pages,
        mode: "edit",
        status: "success",
        totalCount: result.pages.length,
        workspaceSlug
      });
      const binding = workspaceLeaseBindingRef.current;
      if (binding && binding.workspaceSlug === workspaceSlug && binding.workspaceSysId === workspaceSysId) {
        setPendingChangesState({
          data: result.pendingChanges,
          leaseToken: binding.leaseToken,
          status: "success",
          workspaceSlug,
          workspaceSysId
        });
      } else {
        setPendingChangesState({
          data: result.pendingChanges,
          leaseToken: "",
          status: "success",
          workspaceSlug,
          workspaceSysId
        });
      }
      setWorkspaceDiscardAllState({ status: "idle" });
    } catch {
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) {
        return;
      }
      setWorkspaceDiscardAllState({
        commandId,
        contextKey: mutationContextKey,
        errorMessage: "Unable to discard changes for this workspace right now. Please try again.",
        recoveryRequired: false,
        retryable: true,
        sourceChangeSetId,
        sourceChangeSetRevision,
        status: "error",
        workspaceSlug,
        workspaceSysId
      });
    }
  }

  return (
    <div className={`docsera-app${route.mode === "launcher" ? " docsera-app--launcher" : ""}`}>
      <DocseraHeader
        breadcrumbs={displayedSelectedPagePath}
        currentWorkspaceSlug={appHeaderWorkspaceSlug}
        identity={appHeaderIdentity}
        mode={appHeaderMode}
        onDismissPendingChangesPublishToast={clearWorkspacePublishToast}
        onOpenMyWorkspaces={openLauncher}
        onOpenWorkspace={openWorkspace}
        onOpenWorkspaceSettings={route.mode === "workspace" ? () => openWorkspace(route.workspaceSlug, true) : undefined}
        onOpenPendingPage={route.mode === "workspace" ? openWorkspacePage : undefined}
        onSelectBreadcrumb={route.mode === "workspace" ? openWorkspacePage : undefined}
        onToggleSidebar={route.mode === "workspace" ? () => setSidebarCollapsed((collapsed) => !collapsed) : undefined}
        recentWorkspaces={recentWorkspaceItems}
        pendingChanges={pendingChangesResult}
        pendingChangesDiscardAllErrorMessage={workspaceDiscardAllErrorMessage}
        pendingChangesDiscardAllAffectedPageCount={workspaceDiscardAllAffectedPageCount}
        pendingChangesDiscardAllRetryable={workspaceDiscardAllRetryable}
        pendingChangesDiscarding={workspaceDiscardAllInProgress}
        pendingChangesErrorMessage={pendingChangesState.status === "error" ? pendingChangesState.errorMessage : ""}
        pendingChangesLoading={pendingChangesState.status === "loading"}
        pendingChangesPublishErrorMessage={workspacePublishErrorMessage}
        pendingChangesPublishRetryable={workspacePublishRetryable}
        pendingChangesPublishing={workspacePublishInProgress}
        pendingChangesReadinessMessage={pendingChangesSaveBlockedMessage}
        pendingChangesRefreshing={pendingChangesState.status === "refreshing"}
        onDiscardAllPendingChanges={discardAllWorkspacePendingChanges}
        onPublishPendingChanges={publishWorkspacePendingChanges}
        onRetryPendingChanges={requestPendingChangesRefresh}
        pendingChangesPublishToastMessage={workspacePublishToastMessage}
        showEditModeToggle={appHeaderShowEditToggle}
        showWorkspaceMode={appHeaderWorkspaceMode}
        workspaceControlsLocked={appHeaderWorkspaceControlsLocked}
        onWorkspaceModeChange={route.mode === "workspace" ? changeWorkspaceMode : undefined}
        showWorkspaceSwitcher={appHeaderShowWorkspaceSwitcher}
        showWorkspaceSettings={appHeaderShowWorkspaceSettings}
        sidebarCollapsed={appHeaderSidebarCollapsed}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        workspaceNavWidth={appHeaderWorkspaceNavWidth}
      />

      <div className="docsera-app__body" aria-busy={showLoadingProgress}>
        {route.mode === "workspace" ? (
          <>
            <WorkspaceShell
              bodyNotice={visibleShellNotice ? { eyebrow: visibleShellNotice.eyebrow, kind: visibleShellNotice.kind, message: visibleShellNotice.message } : null}
              bodyState={workspaceMainPaneBodyState}
              canCreatePage={canCreatePage}
              createPageDisabledReason={createPageDisabledReason}
              canEditPageBody={hasAuthoringCapability && !editAccessLost && !workspaceCommandBlocksCurrentWorkspaceWrites}
              accessLossMessage={workspaceLeaseState.state === "blocked" ? workspaceLeaseState.message : undefined}
              canManagePageSettings={canManagePageSettings}
              collapsedPageIds={currentModeUiState.collapsedPageIds}
              currentWorkspaceSlug={workspaceState.status === "success" ? workspaceState.data.slug : currentWorkspaceSlug}
              editorInitialSavedEnvelope={restoredBodySnapshot && selectedPageView?.contentEnvelope ? selectedPageView.contentEnvelope : undefined}
              editAccessLost={editAccessLost}
              editorFailure={editorFailure}
              inlineCreateState={displayedInlinePageCreateState}
              isCreatingPage={isCreatingPage}
              mode={activeWorkspaceMode}
              onAccessLost={() => handleEditorAccessLostForSession(renderedEditorSession)}
              onCollapsedPageIdsChange={(pageIds) => {
                const normalizedPageIds = [...new Set(pageIds.map((pageId) => cleanText(pageId)).filter(Boolean))];
                updateCurrentModeUiState((current) => ({
                  ...current,
                  collapsedPageIds: normalizedPageIds
                }));
              }}
              onCommitInlineCreate={submitInlinePageCreation}
              onEditorFailureChange={(failure) => handleEditorFailureChangeForSession(renderedEditorSession, failure)}
              onEditorReadyStateChange={setIsEditorReady}
              onInlineCreateTitleChange={updateInlinePageCreateTitle}
              onModeChange={changeWorkspaceMode}
              onOutlineChange={handleOutlineChange}
              onReturnToMyWorkspaces={openLauncher}
              onReturnToLive={handleReturnToLive}
              onRetryWorkspace={retryWorkspaceProjectionLoad}
              onRetryEditor={() => {
                setEditorFailure(null);
                setEditorRetryNonce((value) => value + 1);
              }}
              onSavePageDraft={(input) => savePageDraftForSession(renderedEditorSession, input)}
              onStatusChange={(state) => handleEditorStatusChange(selectedWorkspacePageId, state)}
              saveStatus={activeWorkspaceMode === "edit" && renderedEditorSession ? editorStatusLabel as EditorTransitionState["status"] : undefined}
              onSelectPage={openWorkspacePage}
              onMovePage={moveWorkspacePage}
              onShowChildPageCreate={openCreatePageModal}
              onShowCreatePage={openCreatePageModal}
              onTogglePageSettings={requestTogglePageSettings}
              onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              outlinePage={displayedOutlinePage}
              pageSettingsOpenPageId={pageSettingsState.open ? pageSettingsState.pageSysId : ""}
              pageSettingsOverlay={
                <PageSettingsOverlay
                  activeField={pageSettingsState.activeField}
                  canManagePageSettings={canManagePageSettings}
                  generalError={pageSettingsState.generalError}
                  noticeMessage={pageSettingsState.noticeMessage}
                  open={pageSettingsState.open}
                  panelRef={pageSettingsPanelRef}
                  pageSlug={pageSettingsState.slug}
                  pageTitle={pageSettingsState.title}
                  slugError={pageSettingsState.slugError}
                  titleError={pageSettingsState.titleError}
                  onCancelField={cancelPageSettingsField}
                  onChangeField={updatePageSettingsField}
                  onFinishField={finishPageSettingsField}
                  onRequestClose={() => {
                    requestClosePageSettingsPanel(pageSettingsStateRef.current.pageSysId);
                  }}
                  onRequestDelete={requestOpenDeletePageSettings}
                  onStartField={startPageSettingsField}
                />
              }
              selectedPage={displayedSelectedPageView}
              selectedPageId={displayedSelectedPageId}
              sessionKey={editorRenderSessionKey}
              shellStatus={displayedWorkspaceShellStatus}
              shellTitle={workspaceShellTitle}
              shellCopy={workspaceShellCopy}
              showPendingState={showTransitionProgress}
              sidebarCollapsed={appHeaderSidebarCollapsed}
              showEditModeToggle={appHeaderShowEditToggle}
              showCreatePageControls={showCreatePageControls}
              treeFilter={currentModeUiState.searchQuery}
              treePages={displayedTreePages}
              workspaceNavWidth={workspaceNavWidth}
              onSidebarCollapsedChange={setSidebarCollapsed}
              onWorkspaceNavWidthChange={setWorkspaceNavWidth}
              theme={theme}
              workspaceSettingsNotice={workspaceSettingsNotice}
              onTreeFilterChange={(value) => {
                updateCurrentModeUiState((current) => ({
                  ...current,
                  searchQuery: value
                }));
              }}
            />
            <PageSettingsDeleteDialog
              errorMessage={pageSettingsState.deleteError}
              hasDescendants={pageSettingsHasDescendants}
              open={pageSettingsState.deleteOpen}
              pageTitle={pageSettingsState.title || pageSettingsPage?.draftTitle || "page"}
              pending={pageSettingsState.deletePending}
              onConfirm={confirmDeletePageSettings}
              onRequestClose={requestCloseDeletePageSettings}
            />
            <DirtyTransitionDialog
              open={pendingRouteTransition !== null}
              onDiscard={handleDiscardDirtyTransition}
              onStay={handleStayOnDirtyTransition}
            />
          </>
        ) : (
          <MyWorkspacesScreen
            createModal={{
              errorMessage: createModalError,
              onClose: () => {
                setCreateModalOpen(false);
                setCreateModalError(undefined);
                setCreateModalPhase("idle");
              },
              onSubmit: submitWorkspaceCreation,
              open: createModalOpen,
              phase: createModalPhase
            }}
            onNextPage={() => setLauncherPage((value) => value + 1)}
            onOpenWorkspace={(workspaceSlug) => openWorkspace(workspaceSlug)}
            onOpenWorkspaceSettings={(workspaceSlug) => openWorkspace(workspaceSlug, true)}
            onPreviousPage={() => setLauncherPage((value) => Math.max(1, value - 1))}
            onRefresh={() => setLauncherRefreshToken((value) => value + 1)}
            onSearchTextChange={(value) => {
              setLauncherSearchText(value);
              setLauncherPage(1);
            }}
            onShowCreateModal={openCreateModal}
            hasError={listState.hasError}
            isEmptyState={listState.isEmptyState}
            isLoading={listState.isLoading}
            isNoResultsState={listState.isNoResultsState}
            isRefreshing={listState.isRefreshing}
            items={listState.items}
            showLoadingState={showTransitionProgress}
            page={listState.page}
            pageSize={listState.pageSize}
            searchText={launcherSearchText}
            totalCount={listState.totalCount}
            workspaceListErrorMessage={listState.workspaceListErrorMessage}
          />
        )}
      </div>
    </div>
  );
}
