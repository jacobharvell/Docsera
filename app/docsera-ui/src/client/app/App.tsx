import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DocseraHeader, type HeaderIdentity } from "../features/workspaces/DocseraHeader";
import { DirtyTransitionDialog } from "../features/workspaces/DirtyTransitionDialog";
import { MyWorkspacesScreen } from "../features/workspaces/MyWorkspacesScreen";
import { PageSettingsDeleteDialog } from "../features/workspaces/PageSettingsDeleteDialog";
import { PageSettingsOverlay } from "../features/workspaces/PageSettingsOverlay";
import type { InlinePageCreateState } from "../features/workspaces/PageTree";
import type { RecentWorkspaceItem } from "../features/workspaces/RecentWorkspacesMenu";
import { DEFAULT_WORKSPACE_NAV_WIDTH, readStoredWorkspaceNavWidth, WorkspaceShell } from "../features/workspaces/WorkspaceShell";
import { WorkspaceManageAccessOverlay } from "../features/workspaces/WorkspaceManageAccessOverlay";
import { WorkspaceSettingsOverlay, type WorkspaceSettingsSubmitInput } from "../features/workspaces/WorkspaceSettingsOverlay";
import type {
  PageEditorCanonicalHandoffResult,
  PageEditorHostFailure,
  PageEditorRecoverySnapshot,
  PageEditorStatusState
} from "../editor/PageEditorHost";
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
import type { WorkspaceAuthoringSurface } from "../features/workspaces/workspaceAuthoringSurface";
import { requestPageOwnershipHandoff } from "../pageOwnershipHandoff";
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
  WorkspaceDeleteResult,
  WorkspaceDiscardPageResult,
  WorkspaceListResult,
  WorkspaceIcon,
  WorkspaceEditLeaseHeld,
  WorkspaceDiscardAllResult,
  WorkspacePendingChangesResult,
  WorkspacePublishResult,
  WorkspacePageRecord,
  WorkspaceSettingsSaveResult,
  WorkspaceViewRecord
} from "../shared/types/docsera";
import type { EditorMediaAdapter } from "../editor/contracts";

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

type WorkspaceDiscardPageState =
  | { status: "idle" }
  | {
      contextKey: string;
      pageSysId: string;
      sourceChangeSetId: string;
      sourceChangeSetRevision: number;
      status: "discarding";
      workspaceSlug: string;
      workspaceSysId: string;
    }
  | {
      contextKey: string;
      errorMessage: string;
      pageSysId: string;
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

const WORKSPACE_COMMAND_AUTHORING_LOCK_MESSAGE = "Workspace authoring is locked while another command is in progress.";

type WorkspaceSwitcherState =
  | { status: "idle" }
  | { status: "loading" }
  | { items: WorkspaceViewRecord[]; status: "success" }
  | { status: "error" };

type RecentWorkspacesState =
  | { status: "idle"; userSysId: string }
  | { slugs: string[]; status: "loading"; userSysId: string }
  | { items: WorkspaceViewRecord[]; slugs: string[]; status: "success"; userSysId: string };

type WorkspaceSettingsPanelState =
  | { status: "closed" }
  | { errorMessage?: string; recoveryInput?: WorkspaceSettingsSubmitInput; status: "open" | "saving"; workspaceSlug: string; workspaceSysId: string };

type WorkspaceDeletionState =
  | { status: "idle" }
  | { status: "deleting"; workspaceSlug: string; workspaceSysId: string }
  | { errorMessage: string; status: "error"; workspaceSlug: string; workspaceSysId: string };

type PendingWorkspaceSettingsSave = {
  id: number;
  ownedPreviewObjectUrl: string;
  previewIdentity: WorkspaceSettingsPreviewIdentity;
  input: WorkspaceSettingsSubmitInput;
  workspaceSlug: string;
  workspaceSysId: string;
};
type PendingWorkspaceSettingsSaves = Record<string, PendingWorkspaceSettingsSave>;

type PendingWorkspaceIdentity = Pick<WorkspaceViewRecord, "icon" | "name" | "slug">;
type WorkspaceSettingsPreviewIdentity = Pick<WorkspaceViewRecord, "icon" | "name"> & { ownedPreviewObjectUrl?: string; workspaceSysId: string };
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

type PendingSelectionTarget = {
  fallbackAncestorPageSysIds: string[];
  mode: WorkspaceMode;
  pageSysId: string;
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
  requiresSourceDiscard?: boolean;
  href: string;
  replace: boolean;
  reason?: string;
  beforeCommit?: () => void;
};

type MarkdownSourceStatus = {
  errorMessage: string;
  isUnavailable: boolean;
  isInvalid: boolean;
  pageSysId: string;
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
const DOCSERA_RECENT_WORKSPACES_MAX_ITEMS = 10;
const DOCSERA_LOCAL_RECENT_WORKSPACES_USER_SCOPE = "__local__";
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
const SOURCE_TITLE_AUTOSAVE_DEBOUNCE_MS = 250;

type PageSettingsField = "title" | "slug";

type PageSettingsState = {
  activeField: PageSettingsField | "";
  activeFieldValueSnapshot: string;
  deleteError: string;
  deleteOpen: boolean;
  deletePending: boolean;
  generalError: string;
  noticeMessage: string;
  panelOpen: boolean;
  pageSysId: string;
  slug: string;
  slugSnapshot: string;
  slugError: string;
  title: string;
  titleError: string;
  titleSnapshot: string;
  open: boolean;
};

type SourceTitleAutosaveRequest = {
  interactionVersion: number;
  pageSysId: string;
  title: string;
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
    activeFieldValueSnapshot: "",
    deleteError: "",
    deleteOpen: false,
    deletePending: false,
    generalError: "",
    noticeMessage: "",
    panelOpen: false,
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
    !state.activeFieldValueSnapshot &&
    !state.deleteError &&
    !state.deleteOpen &&
    !state.deletePending &&
    !state.generalError &&
    !state.noticeMessage &&
    !state.panelOpen &&
    !state.pageSysId &&
    !state.slug &&
    !state.slugSnapshot &&
    !state.slugError &&
    !state.title &&
    !state.titleError &&
    !state.titleSnapshot
  );
}

function createPageSettingsStateFromPage(
  page: WorkspacePageRecord,
  options: {
    activeField?: PageSettingsField | "";
    panelOpen?: boolean;
  } = {}
): PageSettingsState {
  const title = cleanText(page.draftTitle || page.publishedTitle || "");
  const slug = cleanText(page.draftSlug || page.publishedSlug || "");

  return {
    ...createEmptyPageSettingsState(),
    activeField: options.activeField ?? "",
    activeFieldValueSnapshot: options.activeField === "slug" ? slug : options.activeField === "title" ? title : "",
    panelOpen: options.panelOpen ?? true,
    pageSysId: cleanText(page.sysId),
    title,
    titleSnapshot: title,
    slug,
    slugSnapshot: slug,
    open: true
  };
}

function rebasePageSettingsPersistedSnapshots(state: PageSettingsState, page: WorkspacePageRecord): PageSettingsState {
  return {
    ...state,
    titleSnapshot: cleanText(page.draftTitle || page.publishedTitle || ""),
    slugSnapshot: cleanText(page.draftSlug || page.publishedSlug || "")
  };
}

function hasPageSettingsUnsavedChanges(state: PageSettingsState): boolean {
  return (
    cleanText(state.title) !== cleanText(state.titleSnapshot) ||
    cleanText(state.slug).toLowerCase() !== cleanText(state.slugSnapshot).toLowerCase() ||
    Boolean(state.generalError) ||
    Boolean(state.titleError) ||
    Boolean(state.slugError)
  );
}

function resolveCurrentPageAuthoringReadiness(input: {
  activeWorkspaceMode: WorkspaceMode;
  canEditPageBody: boolean;
  editAccessLost: boolean;
  editorCanonicalHandoffReady: boolean;
  editorStatus: EditorTransitionState["status"];
  isEditorReady: boolean;
  markdownSourceStatus: MarkdownSourceStatus;
  pageSettingsState: PageSettingsState;
  selectedPageSysId: string;
  workspaceCommandBlocksCurrentWorkspaceWrites: boolean;
}): {
  canEditMarkdownSource: boolean;
  canSwitchSurface: boolean;
  blockedMessage: string;
  requiresNavigationGuard: boolean;
} {
  if (input.activeWorkspaceMode !== "edit") {
    return {
      blockedMessage: "",
      canEditMarkdownSource: false,
      canSwitchSurface: false,
      requiresNavigationGuard: false
    };
  }

  const selectedPageStatusApplies = cleanText(input.markdownSourceStatus.pageSysId) === cleanText(input.selectedPageSysId);
  const hasPageSettingsWork = input.pageSettingsState.open && (Boolean(input.pageSettingsState.activeField) || hasPageSettingsUnsavedChanges(input.pageSettingsState));
  const hasBodyWork = input.editorStatus !== "Saved";
  const hasSourceWork = selectedPageStatusApplies && (input.markdownSourceStatus.isInvalid || input.markdownSourceStatus.isUnavailable);
  const requiresNavigationGuard = hasBodyWork || hasPageSettingsWork || hasSourceWork;
  const visualEditorReady = input.canEditPageBody && !input.editAccessLost && input.isEditorReady && input.editorCanonicalHandoffReady;
  const sourceBlockedByRuntime = input.workspaceCommandBlocksCurrentWorkspaceWrites || !visualEditorReady;
  const blockedMessage =
    input.workspaceCommandBlocksCurrentWorkspaceWrites
      ? WORKSPACE_COMMAND_AUTHORING_LOCK_MESSAGE
      : !input.canEditPageBody || input.editAccessLost
        ? "Authoring access is no longer available."
        : !input.editorCanonicalHandoffReady || !input.isEditorReady
          ? "The visual editor is still getting ready."
          : selectedPageStatusApplies && input.markdownSourceStatus.isInvalid
            ? input.markdownSourceStatus.errorMessage || "Markdown source contains invalid content."
            : selectedPageStatusApplies && input.markdownSourceStatus.isUnavailable
              ? input.markdownSourceStatus.errorMessage || "Markdown source is waiting for the visual editor to become available."
              : input.editorStatus !== "Saved"
                ? `Current page is ${input.editorStatus.toLowerCase()}. Publish and discard actions stay disabled until local changes are saved.`
                : hasPageSettingsWork
                  ? "Page Settings has unsaved or blocked changes. Publish and discard actions stay disabled until settings are saved."
                  : "";
  const surfaceBlockedMessage =
    input.workspaceCommandBlocksCurrentWorkspaceWrites
      ? WORKSPACE_COMMAND_AUTHORING_LOCK_MESSAGE
      : !input.canEditPageBody || input.editAccessLost
        ? "Authoring access is no longer available."
        : !input.editorCanonicalHandoffReady || !input.isEditorReady
          ? "The visual editor is still getting ready."
          : selectedPageStatusApplies && input.markdownSourceStatus.isUnavailable
            ? input.markdownSourceStatus.errorMessage || "Markdown source is waiting for the visual editor to become available."
            : input.editorStatus !== "Saved"
              ? `Current page is ${input.editorStatus.toLowerCase()}. Publish and discard actions stay disabled until local changes are saved.`
              : hasPageSettingsWork
                ? "Page Settings has unsaved or blocked changes. Publish and discard actions stay disabled until settings are saved."
                : "";

  return {
    blockedMessage,
    canEditMarkdownSource: visualEditorReady && !input.markdownSourceStatus.isUnavailable,
    canSwitchSurface: !surfaceBlockedMessage && !sourceBlockedByRuntime,
    requiresNavigationGuard
  };
}

export function resolveDiscardRecoveryRetryAuthoringReadiness(input: Parameters<typeof resolveCurrentPageAuthoringReadiness>[0] & {
  workspaceDiscardAllInProgress: boolean;
  workspaceDiscardPageInProgress: boolean;
  workspacePublishInProgress: boolean;
}): ReturnType<typeof resolveCurrentPageAuthoringReadiness> {
  const workspaceCommandInProgress =
    input.workspacePublishInProgress || input.workspaceDiscardAllInProgress || input.workspaceDiscardPageInProgress;
  return resolveCurrentPageAuthoringReadiness({
    ...input,
    canEditPageBody: input.canEditPageBody && !workspaceCommandInProgress,
    workspaceCommandBlocksCurrentWorkspaceWrites: workspaceCommandInProgress
  });
}

function hasNonOverlayPageSettingsState(state: PageSettingsState): boolean {
  return state.open && !state.panelOpen;
}

function buildProjectedPageSettingsTitleDraft(
  mode: WorkspaceMode,
  state: PageSettingsState
): { pageSysId: string; title: string } | null {
  if (mode !== "edit" || !state.open) {
    return null;
  }

  const normalizedPageSysId = cleanText(state.pageSysId);
  if (!normalizedPageSysId) {
    return null;
  }

  const validation = validatePageSettingsTitle(state.title);
  if (!validation.valid) {
    return null;
  }

  return {
    pageSysId: normalizedPageSysId,
    title: validation.value
  };
}

function projectWorkspacePagesForPresentation(
  pages: WorkspacePageRecord[],
  projectedTitleDraft: { pageSysId: string; title: string } | null
): WorkspacePageRecord[] {
  if (!projectedTitleDraft) {
    return pages;
  }

  return pages.map((page) =>
    cleanText(page.sysId) === projectedTitleDraft.pageSysId
      ? {
          ...page,
          draftTitle: projectedTitleDraft.title
        }
      : page
  );
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

function recentWorkspaceStorageKey(userSysId: string): string {
  return `${DOCSERA_RECENT_WORKSPACES_STORAGE_KEY}:${cleanText(userSysId)}`;
}

function normalizeRecentWorkspaceSlugs(workspaceSlugs: string[]): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const candidate of workspaceSlugs) {
    const slug = cleanText(candidate);
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    slugs.push(slug);
    if (slugs.length >= DOCSERA_RECENT_WORKSPACES_MAX_ITEMS) {
      break;
    }
  }
  return slugs;
}

function readStoredRecentWorkspaceSlugs(userSysId: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const key = recentWorkspaceStorageKey(userSysId);
  if (!key.endsWith(cleanText(userSysId)) || !cleanText(userSysId)) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeRecentWorkspaceSlugs(parsed.map((value) => cleanText(value)).filter(Boolean));
  } catch {
    return [];
  }
}

function writeStoredRecentWorkspaceSlugs(userSysId: string, workspaceSlugs: string[]): string[] {
  const normalizedUserSysId = cleanText(userSysId);
  const normalizedSlugs = normalizeRecentWorkspaceSlugs(workspaceSlugs);
  if (typeof window === "undefined") {
    return normalizedSlugs;
  }

  if (!normalizedUserSysId) {
    return normalizedSlugs;
  }

  window.localStorage.setItem(recentWorkspaceStorageKey(normalizedUserSysId), JSON.stringify(normalizedSlugs));
  return normalizedSlugs;
}

function rememberRecentWorkspaceSlug(userSysId: string, workspaceSlug: string): string[] {
  const slug = cleanText(workspaceSlug);
  if (!cleanText(userSysId) || !slug) {
    return readStoredRecentWorkspaceSlugs(userSysId);
  }

  const nextSlugs = [slug, ...readStoredRecentWorkspaceSlugs(userSysId).filter((value) => value !== slug)];
  return writeStoredRecentWorkspaceSlugs(userSysId, nextSlugs);
}

function forgetRecentWorkspaceSlug(userSysId: string, workspaceSlug: string): string[] {
  const slug = cleanText(workspaceSlug);
  if (!cleanText(userSysId) || !slug) {
    return readStoredRecentWorkspaceSlugs(userSysId);
  }

  return writeStoredRecentWorkspaceSlugs(userSysId, readStoredRecentWorkspaceSlugs(userSysId).filter((value) => value !== slug));
}

function applyRecentWorkspaceItemsBySlug(slugs: string[], items: WorkspaceViewRecord[]): WorkspaceViewRecord[] {
  const itemsBySlug = new Map(items.map((item) => [cleanText(item.slug), item]));
  return normalizeRecentWorkspaceSlugs(slugs)
    .map((slug) => itemsBySlug.get(slug))
    .filter((item): item is WorkspaceViewRecord => Boolean(item));
}

type RecentWorkspaceResolution =
  | { slug: string; status: "resolved"; workspace: WorkspaceViewRecord }
  | { slug: string; status: "missing" }
  | { slug: string; status: "unresolved" };

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

function getFirstVisibleTopLevelWorkspacePage(pages: WorkspacePageRecord[]): WorkspacePageRecord | null {
  return pages.find((page) => !cleanText(page.parentPageSysId)) ?? null;
}

function findWorkspacePageBySysId(pages: WorkspacePageRecord[], pageSysId: string): WorkspacePageRecord | null {
  const normalizedPageSysId = cleanText(pageSysId);
  if (!normalizedPageSysId) {
    return null;
  }

  return pages.find((page) => cleanText(page.sysId) === normalizedPageSysId) ?? null;
}

function collectWorkspaceAncestorPageSysIds(pages: WorkspacePageRecord[], pageSysId: string): string[] {
  const ancestorPageSysIds: string[] = [];
  const visitedPageIds = new Set<string>();
  let currentPage = findWorkspacePageBySysId(pages, pageSysId);

  while (currentPage) {
    const parentPageSysId = cleanText(currentPage.parentPageSysId);
    if (!parentPageSysId || visitedPageIds.has(parentPageSysId)) {
      break;
    }

    ancestorPageSysIds.push(parentPageSysId);
    visitedPageIds.add(parentPageSysId);
    currentPage = findWorkspacePageBySysId(pages, parentPageSysId);
  }

  return ancestorPageSysIds;
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

function resolvePendingSelectionTargetPage(
  pages: WorkspacePageRecord[],
  pendingSelectionTarget: PendingSelectionTarget | null | undefined
): WorkspacePageRecord | null {
  if (!pendingSelectionTarget) {
    return null;
  }

  return (
    findWorkspacePageBySysId(pages, pendingSelectionTarget.pageSysId) ??
    pendingSelectionTarget.fallbackAncestorPageSysIds
      .map((pageSysId) => findWorkspacePageBySysId(pages, pageSysId))
      .find((page): page is WorkspacePageRecord => Boolean(page)) ??
    getFirstVisibleTopLevelWorkspacePage(pages) ??
    getFirstWorkspacePage(pages)
  );
}

function resolveWorkspacePageSelection(
  pages: WorkspacePageRecord[],
  input: {
    legacyPageId?: string;
    pendingSelectionTarget?: PendingSelectionTarget | null;
    preferredPageSysId?: string;
    pageSlug?: string;
    mode: WorkspaceMode;
  }
): { page: WorkspacePageRecord | null; pageId: string; pageSlug: string } {
  const matchingPendingSelectionTarget = input.pendingSelectionTarget?.mode === input.mode ? input.pendingSelectionTarget : null;
  const page =
    resolvePendingSelectionTargetPage(pages, matchingPendingSelectionTarget) ??
    findWorkspacePageBySlug(pages, input.pageSlug ?? "", input.mode) ??
    findWorkspacePageBySysId(pages, input.preferredPageSysId ?? "") ??
    findWorkspacePageBySysId(pages, input.legacyPageId ?? "") ??
    getFirstVisibleTopLevelWorkspacePage(pages) ??
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
  const [pingState, setPingState] = useState<RuntimeProbeState>(() => createInitialPingState(runtime));
  const [launcherSearchText, setLauncherSearchText] = useState("");
  const [launcherPage, setLauncherPage] = useState(1);
  const [launcherRefreshToken, setLauncherRefreshToken] = useState(0);
  const [launcherState, setLauncherState] = useState<WorkspaceListState>({ status: "idle" });
  const [workspaceSwitcherState, setWorkspaceSwitcherState] = useState<WorkspaceSwitcherState>({ status: "idle" });
  const [recentWorkspacesState, setRecentWorkspacesState] = useState<RecentWorkspacesState>({ status: "idle", userSysId: "" });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({ status: "idle" });
  const [pendingWorkspaceIdentity, setPendingWorkspaceIdentity] = useState<PendingWorkspaceIdentity | null>(null);
  const [workspacePagesState, setWorkspacePagesState] = useState<WorkspacePagesState>({ status: "idle" });
  const [pendingChangesState, setPendingChangesState] = useState<PendingChangesState>({ status: "idle" });
  const [workspacePublishState, setWorkspacePublishState] = useState<WorkspacePublishState>({ status: "idle" });
  const [workspaceDiscardAllState, setWorkspaceDiscardAllState] = useState<WorkspaceDiscardAllState>({ status: "idle" });
  const [workspaceDiscardPageState, setWorkspaceDiscardPageState] = useState<WorkspaceDiscardPageState>({ status: "idle" });
  const [workspacePublishToastState, setWorkspacePublishToastState] = useState<WorkspacePublishToastState | null>(null);
  const [staleRefreshState, setStaleRefreshState] = useState<StaleRefreshState>({ status: "idle" });
  const [workspaceAuthoringSurfaceState, setWorkspaceAuthoringSurfaceState] = useState<Record<string, WorkspaceAuthoringSurface>>({});
  const [workspaceMarkdownSourceSessionPageSysIdState, setWorkspaceMarkdownSourceSessionPageSysIdState] = useState<Record<string, string>>({});
  const [workspaceMarkdownSourceDiscardNonceState, setWorkspaceMarkdownSourceDiscardNonceState] = useState<Record<string, number>>({});
  const [markdownSourceStatus, setMarkdownSourceStatus] = useState<MarkdownSourceStatus>({
    errorMessage: "",
    isUnavailable: false,
    isInvalid: false,
    pageSysId: ""
  });
  const [workspaceSettingsPanelState, setWorkspaceSettingsPanelState] = useState<WorkspaceSettingsPanelState>({ status: "closed" });
  const [workspaceDeletionState, setWorkspaceDeletionState] = useState<WorkspaceDeletionState>({ status: "idle" });
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const [workspaceSettingsPreviewIdentity, setWorkspaceSettingsPreviewIdentity] = useState<WorkspaceSettingsPreviewIdentity | null>(null);
  const workspaceSettingsRecoveryRef = useRef<Record<string, { errorMessage: string; input: WorkspaceSettingsSubmitInput }>>({});
  const workspaceSettingsSaveGenerationRef = useRef(0);
  const openManageAccessAfterSettingsSaveRef = useRef("");
  const activeWorkspaceSysIdRef = useRef("");
  const pendingWorkspaceSettingsSaveRef = useRef<PendingWorkspaceSettingsSaves>({});
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
  const markdownSourceTitleInvalidRef = useRef(false);
  const markdownSourceTitleAutosaveTimerRef = useRef<number | null>(null);
  const markdownSourceTitleAutosaveRequestRef = useRef<SourceTitleAutosaveRequest | null>(null);
  const markdownSourceTitleAutosaveDrainRef = useRef<Promise<boolean> | null>(null);
  const markdownSourceDiscardTransitionRef = useRef<RequestedRouteTransition | null>(null);
  const editorFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const editorApplyCanonicalEnvelopeRef = useRef<((envelope: DocseraDocumentEnvelope) => PageEditorCanonicalHandoffResult) | null>(null);
  const editorGetCanonicalEnvelopeRef = useRef<(() => DocseraDocumentEnvelope | null) | null>(null);
  const editorRecoverySnapshotRef = useRef<(() => PageEditorRecoverySnapshot | null) | null>(null);
  const editorReleaseRef = useRef<((options?: { keepalive?: boolean }) => Promise<void>) | null>(null);
  const routeTransitionGenerationRef = useRef(0);
  const [pendingRouteTransition, setPendingRouteTransition] = useState<RequestedRouteTransition | null>(null);
  const [invalidMarkdownSurfaceSwitchOpen, setInvalidMarkdownSurfaceSwitchOpen] = useState(false);
  const [inlinePageCreateState, setInlinePageCreateState] = useState<InlinePageCreateState | null>(null);
  const [modeUiState, setModeUiState] = useState<Record<string, WorkspaceModeUiState>>({});
  const [pageOutlineOverrides, setPageOutlineOverrides] = useState<Record<string, WorkspacePageOutlineItem[]>>({});
  const [pageSettingsState, setPageSettingsState] = useState<PageSettingsState>(createEmptyPageSettingsState);
  const [inlineRenamePageId, setInlineRenamePageId] = useState("");
  const [showTransitionProgress, setShowTransitionProgress] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editorCanonicalHandoffReady, setEditorCanonicalHandoffReady] = useState(false);
  const [markdownSourceRetryNonce, setMarkdownSourceRetryNonce] = useState(0);
  const [lastCommittedWorkspaceHeaderPresentation, setLastCommittedWorkspaceHeaderPresentation] =
    useState<WorkspaceHeaderPresentation | null>(null);
  const [lastReadyWorkspaceShell, setLastReadyWorkspaceShell] = useState<RetainedWorkspaceShellState | null>(null);
  const launcherRequestIdRef = useRef(0);
  const staleRefreshRequestIdRef = useRef(0);
  const pendingChangesRequestIdRef = useRef(0);
  const pendingSelectionTargetRef = useRef<PendingSelectionTarget | null>(null);
  const inlinePageCreateFocusTokenRef = useRef(0);
  const inlinePageCreateStateRef = useRef<InlinePageCreateState | null>(null);
  const lastWorkspaceModeKeyRef = useRef("");
  const pageSettingsStateRef = useRef<PageSettingsState>(createEmptyPageSettingsState());
  const pageSettingsInteractionVersionRef = useRef(0);
  const pageSettingsPendingOpenPageIdRef = useRef("");
  const pageSettingsPanelRef = useRef<HTMLElement>(null);
  const pageSettingsCloseTargetRef = useRef("");
  const pageSettingsCloseTimerRef = useRef<number | null>(null);
  const pageSettingsClosePromiseRef = useRef<Promise<boolean> | null>(null);
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
  const isEditorReadyRef = useRef(isEditorReady);
  const editorCanonicalHandoffReadyRef = useRef(editorCanonicalHandoffReady);
  const markdownSourceUnavailableRef = useRef(false);
  const markdownSourceRetryIssuedRef = useRef(false);

  function markPageSettingsInteraction(): number {
    pageSettingsInteractionVersionRef.current += 1;
    return pageSettingsInteractionVersionRef.current;
  }
  const workspaceSysIdForMedia = workspaceState.status === "success" ? cleanText(workspaceState.data.sysId) : "";
  const workspaceLeaseTokenForMedia = workspaceLeaseState.state === "held" ? workspaceLeaseState.leaseToken : "";
  const workspaceMediaAdapter = useMemo<EditorMediaAdapter | undefined>(() => {
    const listWorkspaceMedia = serviceNowClient.listWorkspaceMedia;
    const uploadWorkspaceMedia = serviceNowClient.uploadWorkspaceMedia;
    const loadWorkspaceMedia = serviceNowClient.loadWorkspaceMedia;

    if (!workspaceSysIdForMedia || !listWorkspaceMedia || !uploadWorkspaceMedia || !loadWorkspaceMedia) {
      return undefined;
    }

    return {
      async list({ signal }: { signal?: AbortSignal }) {
        void signal;
        const result = await listWorkspaceMedia({ workspaceSysId: workspaceSysIdForMedia });
        if (result.state !== "succeeded") {
          throw new Error(result.errorMessage);
        }
        return result.items;
      },
      async upload({ file, signal }: { file: File; signal?: AbortSignal }) {
        void signal;
        if (!workspaceLeaseTokenForMedia) {
          throw new Error("Workspace edit lease is unavailable.");
        }

        const result = await uploadWorkspaceMedia({
          file,
          workspaceLeaseToken: workspaceLeaseTokenForMedia,
          workspaceSysId: workspaceSysIdForMedia
        });
        if (result.state !== "succeeded") {
          throw new Error(result.errorMessage);
        }
        return result.media;
      },
      async load({ mediaId, signal }: { mediaId: string; signal?: AbortSignal }) {
        return loadWorkspaceMedia({
          mediaId,
          signal,
          workspaceSysId: workspaceSysIdForMedia
        });
      }
    };
  }, [serviceNowClient, workspaceLeaseTokenForMedia, workspaceSysIdForMedia]);

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
  useEffect(() => {
    isEditorReadyRef.current = isEditorReady;
  }, [isEditorReady]);
  useEffect(() => {
    editorCanonicalHandoffReadyRef.current = editorCanonicalHandoffReady;
  }, [editorCanonicalHandoffReady]);

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

  function clearPageOutlineOverrides(pageIds: Iterable<string>): void {
    const normalizedPageIds = [...new Set([...pageIds].map((pageId) => cleanText(pageId)).filter(Boolean))];
    if (normalizedPageIds.length === 0) {
      return;
    }
    setPageOutlineOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const pageId of normalizedPageIds) {
        if (!(pageId in next)) {
          continue;
        }
        delete next[pageId];
        changed = true;
      }
      return changed ? next : current;
    });
  }

  function clearPageSettingsRecoverySnapshot(pageSysId: string): void {
    const pageIdentity = getPageRecoveryIdentity(pageSysId);
    if (!pageIdentity) {
      return;
    }
    let cleared = false;
    const restoredCapture = restoredPageSettingsCaptureRef.current;
    if (
      restoredCapture &&
      restoredCapture.pageSysId === pageIdentity.pageSysId &&
      restoredCapture.workspaceSlug === pageIdentity.workspaceSlug &&
      restoredCapture.workspaceSysId === pageIdentity.workspaceSysId &&
      authoringRecoveryRef.current.clearPageSettings(pageIdentity, restoredCapture.captureGeneration)
    ) {
      restoredPageSettingsCaptureRef.current = null;
      cleared = true;
    }
    if (cleared) {
      bumpRecoveryVersion();
    }
  }

  function clearEditorCapabilities(): void {
    editorApplyCanonicalEnvelopeRef.current = null;
    editorFlushRef.current = null;
    editorGetCanonicalEnvelopeRef.current = null;
    editorRecoverySnapshotRef.current = null;
    editorReleaseRef.current = null;
    editorCanonicalHandoffReadyRef.current = false;
    markdownSourceRetryIssuedRef.current = false;
    setEditorCanonicalHandoffReady(false);
  }

  function invalidateEditorSessionForAuthoritativeRebind(): void {
    editorSessionGenerationRef.current.invalidate();
    editorSessionSeedRef.current = "";
    activeEditorSessionRef.current = null;
    isEditorReadyRef.current = false;
    markdownSourceRetryIssuedRef.current = false;
    clearEditorCapabilities();
    setEditorFailure(null);
    setEditorSessionState({
      sessionKey: "",
      token: null
    });
    setEditorTransitionState({ isDirty: false, isSaving: false, status: "Saved" });
    setPendingRouteTransition(null);
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
    clearEditorCapabilities();
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
    if (!pageSettingsState.panelOpen) {
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

      if (target instanceof Element && target.closest("[data-docsera-changes-center='true']")) {
        return;
      }

      if (target instanceof Element && target.closest("[data-docsera-changes-center-trigger='true']")) {
        return;
      }

      if (target instanceof Element && target.closest("[data-docsera-pending-change-dialog='true']")) {
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
  }, [pageSettingsState.panelOpen]);

  const currentWorkspaceSlug = route.mode === "workspace" ? route.workspaceSlug : "";
  const currentWorkspaceSettingsIntent = route.mode === "workspace" ? route.settingsIntent : false;
  const requestedWorkspaceMode = route.mode === "workspace" ? route.workspaceMode : "live";
  const currentWorkspacePageSlug = route.mode === "workspace" ? route.pageSlug : "";
  const currentWorkspaceLegacyPageId = route.mode === "workspace" ? route.legacyPageId : "";
  const loadedWorkspaceSlug = workspaceState.status === "success" ? workspaceState.data.slug : "";
  const currentUserSysId =
    pingState.status === "success"
      ? cleanText(pingState.payload.userSysId)
      : pingState.status === "idle"
        ? DOCSERA_LOCAL_RECENT_WORKSPACES_USER_SCOPE
        : "";
  const recentWorkspaceItems = useMemo(
    () => (recentWorkspacesState.status === "success" ? recentWorkspacesState.items : []),
    [recentWorkspacesState]
  );
  const workspaceStateData = workspaceState.status === "success" ? workspaceState.data : null;
  activeWorkspaceSysIdRef.current = route.mode === "workspace" ? cleanText(workspaceStateData?.sysId) : "";
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
    if (
      route.mode !== "workspace" ||
      !currentUserSysId ||
      workspaceState.status !== "success" ||
      cleanText(workspaceState.data.slug) !== currentWorkspaceSlug
    ) {
      return;
    }

    const nextSlugs = rememberRecentWorkspaceSlug(currentUserSysId, workspaceState.data.slug);
    setRecentWorkspacesState((current) => {
      if (current.userSysId && current.userSysId !== currentUserSysId) {
        return current;
      }

      const currentItems = current.status === "success" ? current.items : [];
      const items = applyRecentWorkspaceItemsBySlug(nextSlugs, [workspaceState.data, ...currentItems]);
      return {
        items,
        slugs: nextSlugs,
        status: "success",
        userSysId: currentUserSysId
      };
    });
  }, [currentUserSysId, currentWorkspaceSlug, route.mode, workspaceState]);

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
    () => {
      const canonicalIdentity = buildWorkspaceHeaderIdentity({
        currentWorkspaceSlug,
        pendingWorkspaceIdentity,
        recentWorkspaceItems,
        workspaceState
      });
      if (
        canonicalIdentity.kind === "workspace" &&
        workspaceState.status === "success" &&
        workspaceSettingsPreviewIdentity &&
        cleanText(workspaceSettingsPreviewIdentity.workspaceSysId) === cleanText(workspaceState.data.sysId)
      ) {
        return {
          ...canonicalIdentity,
          icon: workspaceSettingsPreviewIdentity.icon,
          name: cleanText(workspaceSettingsPreviewIdentity.name) || canonicalIdentity.name,
          ownedPreviewObjectUrl: workspaceSettingsPreviewIdentity.ownedPreviewObjectUrl
        };
      }
      return canonicalIdentity;
    },
    [currentWorkspaceSlug, pendingWorkspaceIdentity, recentWorkspaceItems, workspaceSettingsPreviewIdentity, workspaceState]
  );
  const currentWorkspaceHeaderPresentation = useMemo(() => {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      return null;
    }

    return {
      showEditModeToggle: hasAuthoringCapability,
      showWorkspaceMode: activeWorkspaceMode,
      showWorkspaceSettings: activeWorkspaceMode === "edit" && Boolean(workspaceState.data.canManageSettings),
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

  useEffect(() => {
    if (workspaceState.status === "success" && !workspaceState.data.canManageWorkspaceMembers) {
      setManageAccessOpen(false);
    }
  }, [workspaceState]);
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
  const workspaceDiscardPageInProgress =
    route.mode === "workspace" &&
    workspaceDiscardPageState.status === "discarding" &&
    workspaceDiscardPageState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardPageState.workspaceSysId === cleanText(workspaceStateData?.sysId);
  const workspaceCommandBlocksCurrentWorkspaceWrites =
    workspacePublishInProgress || workspaceDiscardAllInProgress || workspaceDiscardPageInProgress || workspaceDiscardAllRecoveryRequired;
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
    if (workspaceDiscardPageState.status === "idle") {
      return;
    }
    if (
      route.mode === "workspace" &&
      activeWorkspaceMode === "edit" &&
      workspaceDiscardPageState.workspaceSlug === currentWorkspaceSlug &&
      workspaceDiscardPageState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
      workspaceDiscardPageState.contextKey === currentWorkspaceCommandContextKey &&
      currentWorkspaceCommandSourceChangeSetId === workspaceDiscardPageState.sourceChangeSetId &&
      currentWorkspaceCommandSourceChangeSetRevision === workspaceDiscardPageState.sourceChangeSetRevision
    ) {
      return;
    }
    setWorkspaceDiscardPageState({ status: "idle" });
  }, [
    activeWorkspaceMode,
    currentWorkspaceCommandContextKey,
    currentWorkspaceCommandSourceChangeSetId,
    currentWorkspaceCommandSourceChangeSetRevision,
    currentWorkspaceSlug,
    route.mode,
    workspaceDiscardPageState,
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
  const projectedPageSettingsTitleDraft = useMemo(
    () => buildProjectedPageSettingsTitleDraft(activeWorkspaceMode, pageSettingsState),
    [activeWorkspaceMode, pageSettingsState]
  );
  const presentedWorkspacePages = useMemo(
    () => projectWorkspacePagesForPresentation(currentWorkspacePages, projectedPageSettingsTitleDraft),
    [currentWorkspacePages, projectedPageSettingsTitleDraft]
  );
  const treePages = useMemo(
    () => buildWorkspacePageTree(presentedWorkspacePages, activeWorkspaceMode),
    [activeWorkspaceMode, presentedWorkspacePages]
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
  const pendingSelectionTarget = pendingSelectionTargetRef.current?.mode === activeWorkspaceMode ? pendingSelectionTargetRef.current : null;
  const selectedWorkspacePage =
    workspacePagesLoaded && currentWorkspacePages.length > 0
      ? resolveWorkspacePageSelection(currentWorkspacePages, {
          legacyPageId: currentWorkspaceLegacyPageId,
          mode: activeWorkspaceMode,
          pendingSelectionTarget,
          pageSlug: currentWorkspacePageSlug,
          preferredPageSysId: pendingSelectionTarget?.pageSysId || currentModeUiState.selectedPageSysId
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
      clearEditorCapabilities();
      setEditorSessionState({
        sessionKey: "",
        token: null
      });
      return;
    }

    if (editorSessionSeedRef.current === desiredEditorSessionSeed) {
      return;
    }

    isEditorReadyRef.current = false;
    markdownSourceRetryIssuedRef.current = false;
    const nextSession = editorSessionGenerationRef.current.begin(selectedWorkspacePageId, selectedWorkspacePage?.draftRevision ?? 0);
    editorSessionSeedRef.current = desiredEditorSessionSeed;
    activeEditorSessionRef.current = nextSession;
    setEditorSessionState({
      sessionKey: `${nextSession.pageSysId}:${nextSession.generation}`,
      token: nextSession
    });
  }, [desiredEditorSessionSeed, selectedWorkspacePage?.draftRevision, selectedWorkspacePageId]);

  useEffect(() => {
    if (route.mode !== "workspace" || activeWorkspaceMode !== "edit" || !selectedWorkspacePageId) {
      return;
    }

    const currentSurface = workspaceAuthoringSurfaceState[currentWorkspaceSlug] ?? "visual";
    const currentSourcePageSysId = workspaceMarkdownSourceSessionPageSysIdState[currentWorkspaceSlug] ?? "";
    if (!currentSourcePageSysId && currentSurface !== "markdown") {
      return;
    }

    if (currentSourcePageSysId === selectedWorkspacePageId) {
      return;
    }

    setWorkspaceMarkdownSourceSessionPageSysIdState((current) => ({
      ...current,
      [currentWorkspaceSlug]: selectedWorkspacePageId
    }));
  }, [
    activeWorkspaceMode,
    currentWorkspaceSlug,
    route.mode,
    selectedWorkspacePageId,
    workspaceAuthoringSurfaceState,
    workspaceMarkdownSourceSessionPageSysIdState
  ]);

  useLayoutEffect(() => {
    isEditorReadyRef.current = false;
    markdownSourceRetryIssuedRef.current = false;
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
    let currentPage = findWorkspacePageRecordBySysId(presentedWorkspacePages, selectedPageSysId);

    while (currentPage) {
      const currentPageSysId = cleanText(currentPage.sysId);
      if (!currentPageSysId || visitedPageIds.has(currentPageSysId)) {
        break;
      }

      visitedPageIds.add(currentPageSysId);
      pathRecords.unshift(currentPage);
      currentPage = findWorkspacePageRecordBySysId(presentedWorkspacePages, cleanText(currentPage.parentPageSysId));
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
  }, [presentedWorkspacePages, selectedWorkspacePage?.sysId]);
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
  const canRetainWorkspaceShell =
    route.mode === "workspace" &&
    workspaceState.status === "success" &&
    workspaceState.data.slug === currentWorkspaceSlug &&
    workspacePagesLoading &&
    lastReadyWorkspaceShell !== null &&
    lastReadyWorkspaceShell.workspaceSlug === currentWorkspaceSlug;
  const shouldRetainWorkspaceShell = canRetainWorkspaceShell && lastReadyWorkspaceShell.mode === activeWorkspaceMode;
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
      activeFieldValueSnapshot: snapshot.activeField === "slug" ? snapshot.slug : snapshot.activeField === "title" ? snapshot.title : "",
      generalError: "",
      noticeMessage: RESTORED_PAGE_SETTINGS_NOTICE,
      open: true,
      panelOpen: true,
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
    if (!currentUserSysId) {
      setRecentWorkspacesState({ status: "idle", userSysId: "" });
      return;
    }

    const storedSlugs = readStoredRecentWorkspaceSlugs(currentUserSysId);
    if (storedSlugs.length === 0) {
      setRecentWorkspacesState({ items: [], slugs: [], status: "success", userSysId: currentUserSysId });
      return;
    }

    let canceled = false;
    setRecentWorkspacesState({ slugs: storedSlugs, status: "loading", userSysId: currentUserSysId });

    Promise.all(
      storedSlugs.map(async (slug): Promise<RecentWorkspaceResolution> => {
        try {
          const result = await serviceNowClient.getWorkspace(slug);
          return result.workspace
            ? { slug, status: "resolved", workspace: result.workspace }
            : { slug, status: "missing" };
        } catch {
          return { slug, status: "unresolved" };
        }
      })
    ).then((resolutions) => {
      if (canceled) {
        return;
      }

      const items = resolutions
        .filter((resolution): resolution is Extract<RecentWorkspaceResolution, { status: "resolved" }> => resolution.status === "resolved")
        .map((resolution) => resolution.workspace);
      const resolvedItemsBySlug = new Map(items.map((workspace) => [cleanText(workspace.slug), workspace]));
      const confirmedMissingSlugs = new Set(
        resolutions
          .filter((resolution) => resolution.status === "missing")
          .map((resolution) => cleanText(resolution.slug))
      );
      const originalStoredSlugSet = new Set(storedSlugs);
      const latestStoredSlugs = readStoredRecentWorkspaceSlugs(currentUserSysId);
      const validSlugs = latestStoredSlugs.filter(
        (slug) => !originalStoredSlugSet.has(slug) || resolvedItemsBySlug.has(slug) || !confirmedMissingSlugs.has(slug)
      );
      writeStoredRecentWorkspaceSlugs(currentUserSysId, validSlugs);
      setRecentWorkspacesState((current) => {
        const currentItems = current.status === "success" ? current.items : [];
        return {
          items: applyRecentWorkspaceItemsBySlug(validSlugs, [...items, ...currentItems]),
          slugs: validSlugs,
          status: "success",
          userSysId: currentUserSysId
        };
      });
    });

    return () => {
      canceled = true;
    };
  }, [currentUserSysId, serviceNowClient]);

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
      setWorkspaceSettingsPanelState({ status: "closed" });
      setManageAccessOpen(false);
      return;
    }

    if (loadedWorkspaceSlug === currentWorkspaceSlug) {
      if (currentWorkspaceSettingsIntent && workspaceState.status === "success" && workspaceState.data.canManageSettings) {
        const workspaceSysId = cleanText(workspaceState.data.sysId);
        if (!pendingWorkspaceSettingsSaveRef.current[workspaceSysId]) {
          const recovered = workspaceSettingsRecoveryRef.current[workspaceSysId];
          setWorkspaceSettingsPanelState({
            errorMessage: recovered?.errorMessage,
            recoveryInput: recovered?.input,
            status: "open",
            workspaceSlug: workspaceState.data.slug,
            workspaceSysId
          });
        }
      } else if (currentWorkspaceSettingsIntent) {
        setWorkspaceSettingsPanelState({ status: "closed" });
      }

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
    setWorkspaceSettingsPanelState({ status: "closed" });
    setManageAccessOpen(false);
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
          setWorkspaceSettingsPanelState({ status: "closed" });
          return;
        }

        setWorkspaceState({ data: result.workspace, status: "success" });
        if (!cleanText(result.workspace.roleLabel)) {
          clearWorkspaceRecoveryState({
            workspaceSlug: result.workspace.slug,
            workspaceSysId: cleanText(result.workspace.sysId)
          });
        }
        if (currentWorkspaceSettingsIntent && result.workspace.canManageSettings) {
          const workspaceSysId = cleanText(result.workspace.sysId);
          if (!pendingWorkspaceSettingsSaveRef.current[workspaceSysId]) {
            const recovered = workspaceSettingsRecoveryRef.current[workspaceSysId];
            setWorkspaceSettingsPanelState({
              errorMessage: recovered?.errorMessage,
              recoveryInput: recovered?.input,
              status: "open",
              workspaceSlug: result.workspace.slug,
              workspaceSysId
            });
          }
        } else {
          setWorkspaceSettingsPanelState({ status: "closed" });
        }

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
          setWorkspaceSettingsPanelState({ status: "closed" });
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
    serviceNowClient,
    workspaceSettingsPanelState.status
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

    const pendingPageId = cleanText(pageSettingsPendingOpenPageIdRef.current);
    if (pendingPageId && pendingPageId === pageSettingsState.pageSysId) {
      if (pendingPageId === selectedWorkspacePageId) {
        pageSettingsPendingOpenPageIdRef.current = "";
      }
      return;
    }

    if (!pageSettingsState.deleteOpen && pageSettingsState.pageSysId && pageSettingsState.pageSysId !== selectedWorkspacePageId) {
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
    currentWorkspaceSlug,
    pageSettingsState.deleteOpen,
    pageSettingsState.open,
    pageSettingsState.pageSysId,
    route.mode,
    selectedWorkspacePageId,
    workspaceStateData,
    workspaceState.status
  ]);

  useEffect(() => {
    const pendingPageId = cleanText(pageSettingsPendingOpenPageIdRef.current);
    if (!pendingPageId || pageSettingsState.panelOpen || route.mode !== "workspace" || workspaceState.status !== "success") {
      return;
    }

    if (!workspacePagesLoaded || workspaceState.data.slug !== currentWorkspaceSlug || pendingPageId !== selectedWorkspacePageId) {
      return;
    }

    openPageSettings(pendingPageId);
  }, [
    currentWorkspaceSlug,
    pageSettingsState.panelOpen,
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

    const pendingSelectionTarget = pendingSelectionTargetRef.current?.mode === activeWorkspaceMode ? pendingSelectionTargetRef.current : null;
    const resolvedSelection = resolveWorkspacePageSelection(currentWorkspacePages, {
      legacyPageId: currentWorkspaceLegacyPageId,
      mode: activeWorkspaceMode,
      pendingSelectionTarget,
      pageSlug: currentWorkspacePageSlug,
      preferredPageSysId: pendingSelectionTarget?.pageSysId || currentModeUiState.selectedPageSysId
    });
    if (pendingSelectionTarget) {
      pendingSelectionTargetRef.current = null;
    }
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

  }, [currentModeStateKey, route.mode, selectedWorkspacePageId]);

  useEffect(() => {
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
        pendingSelectionTarget: pendingSelectionTargetRef.current,
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
    if (!currentPageAuthoringReadiness.requiresNavigationGuard) {
      return false;
    }

    return transitionWouldDestroyEditor(readAppRoute(new URL(targetHref, window.location.origin)));
  }

  async function flushCurrentPageAuthoringState(): Promise<boolean> {
    const flush = editorFlushRef.current;
    if (flush && !(await flush())) {
      return false;
    }

    return flushMarkdownSourceTitleAutosave();
  }

  function requestRouteTransition(transition: RequestedRouteTransition): void {
    const transitionGeneration = routeTransitionGenerationRef.current + 1;
    routeTransitionGenerationRef.current = transitionGeneration;
    if (transition.href === buildHrefFromRoute(route)) {
      return;
    }

    const guarded = shouldGuardTransition(transition.href);

    if (guarded) {
      const guardedTransition: RequestedRouteTransition = {
        ...transition,
        discardRestoredBodyCapture: getRestoredBodyCaptureForSession(editorSessionState.sessionKey),
        requiresSourceDiscard: activeMarkdownSourceIsInvalid || activeMarkdownSourceIsUnavailable
      };
      const editorSession = activeEditorSessionRef.current;
      void flushCurrentPageAuthoringState().then(async (saved) => {
        if (routeTransitionGenerationRef.current !== transitionGeneration || !isCurrentEditorSession(editorSession)) {
          return;
        }
        if (!saved) {
          setPendingRouteTransition(guardedTransition);
          return;
        }
        if (activeMarkdownSourceIsInvalid && transitionWouldDestroyEditor(readAppRoute(new URL(guardedTransition.href, window.location.origin)))) {
          setPendingRouteTransition(guardedTransition);
          return;
        }
        if (activeMarkdownSourceIsUnavailable && transitionWouldDestroyEditor(readAppRoute(new URL(guardedTransition.href, window.location.origin)))) {
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
    return buildWorkspaceRouteForPageFromPages(currentWorkspacePages, pageSysId, mode);
  }

  function buildWorkspaceRouteForPageFromPages(
    pages: WorkspacePageRecord[],
    pageSysId: string,
    mode = activeWorkspaceMode
  ): string {
    const page = findWorkspacePageBySysId(pages, pageSysId);
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
        setWorkspaceSettingsPanelState({ status: "closed" });
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
        if (!settingsIntent) {
          setWorkspaceSettingsPanelState({ status: "closed" });
        }
        setPendingWorkspaceIdentity(
          optimisticIdentity && cleanText(optimisticIdentity.slug) === cleanText(workspaceSlug) ? optimisticIdentity : null
        );
        pageSettingsPendingOpenPageIdRef.current = "";
        pendingSelectionTargetRef.current = null;
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
    const nextPageSlug = cleanText(selectedWorkspacePage?.draftSlug);

    requestRouteTransition({
      href: buildWorkspaceHref(currentWorkspaceSlug, {
        mode: nextMode,
        pageSlug: nextPageSlug || undefined
      }),
      reason: nextMode === "live" ? "deliberate_edit_exit" : "user_navigation",
      replace: false,
      beforeCommit: () => {
        editReentryRequestedRef.current = isDeliberateBlockedReentry;
        pendingSelectionTargetRef.current = currentPageSysId
          ? {
              fallbackAncestorPageSysIds: collectWorkspaceAncestorPageSysIds(currentWorkspacePages, currentPageSysId),
              mode: nextMode,
              pageSysId: currentPageSysId
            }
          : null;
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
    if (!canCreateWorkspaces) {
      setCreateModalOpen(false);
      setCreateModalError(undefined);
      setCreateModalPhase("idle");
      return;
    }

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

    void _parentPageTitle;
    requestPageOwnershipHandoff({
      pageSysId: cleanText(selectedWorkspacePageId),
      reason: "page-create-inline-title"
    });
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
    const nextState =
      pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId === cleanText(pageSysId)
        ? {
            ...pageSettingsStateRef.current,
            panelOpen: true
          }
        : createPageSettingsStateFromPage(page, { panelOpen: true });
    markPageSettingsInteraction();
    pageSettingsStateRef.current = nextState;
    setPageSettingsState(nextState);
  }

  function requestTogglePageSettings(pageSysId: string) {
    const nextPageId = cleanText(pageSysId);
    if (!nextPageId) {
      return;
    }

    if (pageSettingsStateRef.current.panelOpen && pageSettingsStateRef.current.pageSysId === nextPageId) {
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
      markPageSettingsInteraction();
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  function startPageSettingsField(field: PageSettingsField, options?: { panelOpen?: boolean }) {
    const currentState = pageSettingsStateRef.current;
    if (!currentState.open) {
      return;
    }

    if (currentState.activeField && currentState.activeField !== field) {
      if (!finishPageSettingsField(currentState.activeField)) {
        return;
      }
    }

    const nextCurrentState = pageSettingsStateRef.current;
    const currentValue = field === "title" ? nextCurrentState.title : nextCurrentState.slug;
    setPageSettingsState((current) => {
      const nextState = {
        ...current,
        activeField: field,
        activeFieldValueSnapshot: currentValue,
        panelOpen: options?.panelOpen ?? current.panelOpen,
        titleError: field === "title" ? "" : current.titleError,
        slugError: field === "slug" ? "" : current.slugError,
        generalError: ""
      };
      markPageSettingsInteraction();
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  function finishPageSettingsField(field: PageSettingsField): boolean {
    const currentState = pageSettingsStateRef.current;
    if (!currentState.open) {
      return true;
    }

    if (field === "title") {
      const validation = validatePageSettingsTitle(currentState.title);
      if (!validation.valid) {
        setPageSettingsState((current) => {
          const nextState: PageSettingsState = {
            ...current,
            titleError: validation.error,
            activeField: "title",
            generalError: ""
          };
          markPageSettingsInteraction();
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
          activeField: "",
          activeFieldValueSnapshot: ""
        };
        markPageSettingsInteraction();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return true;
    }

    const validation = validatePageSettingsSlug(
      currentState.slug,
      currentWorkspacePages,
      workspaceState.status === "success" ? workspaceState.data.sysId ?? "" : "",
      currentState.pageSysId
    );

    if (!validation.valid) {
      setPageSettingsState((current) => {
          const nextState: PageSettingsState = {
            ...current,
            slugError: validation.error,
            activeField: "slug",
            generalError: ""
          };
          markPageSettingsInteraction();
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
          activeField: "",
          activeFieldValueSnapshot: ""
        };
        markPageSettingsInteraction();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
    return true;
  }

  function cancelPageSettingsField(field: PageSettingsField) {
    const currentState = pageSettingsStateRef.current;
    if (!currentState.open) {
      return;
    }

    setPageSettingsState((current) => {
      const nextState: PageSettingsState = {
        ...current,
        title: field === "title" ? current.activeFieldValueSnapshot : current.title,
        slug: field === "slug" ? current.activeFieldValueSnapshot : current.slug,
        titleError: field === "title" ? "" : current.titleError,
        slugError: field === "slug" ? "" : current.slugError,
        activeField: "",
        activeFieldValueSnapshot: "",
        generalError: ""
      };
      markPageSettingsInteraction();
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  function startDirectPageTitleEdit(pageSysId: string) {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || !workspacePagesLoaded || !canManagePageSettings) {
      return;
    }

    const normalizedPageSysId = cleanText(pageSysId);
    if (!normalizedPageSysId) {
      return;
    }

    if (pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId === normalizedPageSysId) {
      startPageSettingsField("title", { panelOpen: false });
      return;
    }

    const page = findWorkspacePageBySysId(currentWorkspacePages, normalizedPageSysId);
    if (!page) {
      return;
    }

    const nextState = createPageSettingsStateFromPage(page, {
      activeField: "title",
      panelOpen: false
    });
    markPageSettingsInteraction();
    pageSettingsStateRef.current = nextState;
    setPageSettingsState(nextState);
  }

  async function commitDirectPageTitleEdit(): Promise<boolean> {
    const currentState = pageSettingsStateRef.current;
    if (!hasNonOverlayPageSettingsState(currentState) || currentState.activeField !== "title") {
      return true;
    }

    if (!finishPageSettingsField("title")) {
      return false;
    }

    return closePageSettingsPanel(currentState.pageSysId);
  }

  function cancelDirectPageTitleEdit() {
    const currentState = pageSettingsStateRef.current;
    if (!hasNonOverlayPageSettingsState(currentState) || currentState.activeField !== "title") {
      return;
    }

    cancelPageSettingsField("title");
    const nextState = pageSettingsStateRef.current;
    if (!hasPageSettingsUnsavedChanges(nextState) && !nextState.activeField && !nextState.panelOpen) {
      const emptyState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = emptyState;
      setPageSettingsState(emptyState);
    }
  }

  async function startInlinePageTreeRename(pageSysId: string) {
    const normalizedPageSysId = cleanText(pageSysId);
    if (!normalizedPageSysId) {
      return;
    }

    const currentState = pageSettingsStateRef.current;
    if (currentState.open && currentState.pageSysId && currentState.pageSysId !== normalizedPageSysId) {
      if (pageSettingsCloseTimerRef.current !== null) {
        window.clearTimeout(pageSettingsCloseTimerRef.current);
        pageSettingsCloseTimerRef.current = null;
      }
      pageSettingsCloseTargetRef.current = "";

      const pendingClose = pageSettingsClosePromiseRef.current;
      const closed = pendingClose
        ? await pendingClose
        : await closePageSettingsPanel(currentState.pageSysId, { keepProjectionOnSuccess: true });
      if (!closed) {
        return;
      }
    }

    pageSettingsPendingOpenPageIdRef.current = normalizedPageSysId;
    setInlineRenamePageId(normalizedPageSysId);
    startDirectPageTitleEdit(normalizedPageSysId);
  }

  function clearInlineRenamePendingOpenMarker(pageSysId: string) {
    const normalizedPageSysId = cleanText(pageSysId);
    if (normalizedPageSysId && pageSettingsPendingOpenPageIdRef.current === normalizedPageSysId) {
      pageSettingsPendingOpenPageIdRef.current = "";
    }
  }

  async function commitInlinePageTreeRename(): Promise<boolean> {
    const renamePageSysId = cleanText(inlineRenamePageId);
    const committed = await commitDirectPageTitleEdit();
    if (committed) {
      clearInlineRenamePendingOpenMarker(renamePageSysId);
      setInlineRenamePageId("");
    }
    return committed;
  }

  function cancelInlinePageTreeRename() {
    const renamePageSysId = cleanText(inlineRenamePageId);
    setInlineRenamePageId("");
    cancelDirectPageTitleEdit();
    clearInlineRenamePendingOpenMarker(renamePageSysId);
  }

  async function closePageSettingsPanel(
    nextSelectedPageId = pageSettingsStateRef.current.pageSysId,
    options: { keepProjectionOnSuccess?: boolean } = {}
  ): Promise<boolean> {
    const currentPageSettingsState = pageSettingsStateRef.current;
    const keepProjectionOnSuccess = Boolean(options.keepProjectionOnSuccess);

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
    const saveInteractionVersion = pageSettingsInteractionVersionRef.current;

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
      if (!keepProjectionOnSuccess) {
        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        setPageSettingsState(nextState);
      }
      const nextPageId = cleanText(nextSelectedPageId);
      if (nextPageId && nextPageId !== currentPageSettingsState.pageSysId) {
        requestRouteTransition({
          href: buildWorkspaceRouteForPage(nextPageId),
          replace: false
        });
      }
      return true;
    }

    const nextDraftState: PageSettingsState = {
      ...currentPageSettingsState,
      activeField: "",
      activeFieldValueSnapshot: "",
      generalError: "",
      noticeMessage: "",
      panelOpen: false,
      slug: normalizedSlug,
      slugError: "",
      title: normalizedTitle,
      titleError: ""
    };

    pageSettingsStateRef.current = nextDraftState;
    setPageSettingsState(nextDraftState);

    if (staleRefreshBlocksCurrentWorkspaceWrites || workspaceCommandBlocksCurrentWorkspaceWrites) {
      const blockedDraftState: PageSettingsState = {
        ...nextDraftState,
        generalError: blockedWriteMessage()
      };
      pageSettingsStateRef.current = blockedDraftState;
      setPageSettingsState(blockedDraftState);
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
      const sameDraftInteraction =
        pageSettingsInteractionVersionRef.current === saveInteractionVersion &&
        pageSettingsStateRef.current.open &&
        pageSettingsStateRef.current.pageSysId === currentPageSettingsState.pageSysId;
      if (outcome.state === "contention" || outcome.state === "forbidden" || outcome.state === "transient_failure") {
        if (sameDraftInteraction) {
          setPageSettingsState((current) => ({ ...current, generalError: outcome.state === "contention" ? "This workspace is currently being edited by another user." : outcome.errorMessage }));
        }
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
        if (sameDraftInteraction) {
          setPageSettingsState((current) => ({
            ...current,
            generalError: result.errorMessage
          }));
        }
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

      if (sameDraftInteraction) {
        if (keepProjectionOnSuccess) {
          const nextState = rebasePageSettingsPersistedSnapshots(
            {
              ...currentPageSettingsState,
              activeField: "",
              activeFieldValueSnapshot: "",
              generalError: "",
              noticeMessage: "",
              panelOpen: false,
              slug: normalizedSlug,
              slugError: "",
              title: normalizedTitle,
              titleError: ""
            },
            result.page
          );
          pageSettingsStateRef.current = nextState;
          setPageSettingsState(nextState);
        } else {
          const nextState = createEmptyPageSettingsState();
          pageSettingsStateRef.current = nextState;
          setPageSettingsState(nextState);
        }
      } else if (
        pageSettingsInteractionVersionRef.current !== saveInteractionVersion &&
        cleanText(pageSettingsStateRef.current.pageSysId) === cleanText(result.page.sysId) &&
        pageSettingsStateRef.current.open
      ) {
        setPageSettingsState((current) => {
          if (!current.open || cleanText(current.pageSysId) !== cleanText(result.page.sysId)) {
            return current;
          }

          const nextState = rebasePageSettingsPersistedSnapshots(current, result.page);
          pageSettingsStateRef.current = nextState;
          return nextState;
        });
      }
      const nextPageId = cleanText(nextSelectedPageId);
      if (sameDraftInteraction && nextPageId && nextPageId !== cleanText(result.page.sysId)) {
        requestRouteTransition({
          href: buildWorkspaceRouteForPage(nextPageId),
          replace: false
        });
      }
      return true;
    } catch {
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) return false;
      if (
        pageSettingsInteractionVersionRef.current === saveInteractionVersion &&
        pageSettingsStateRef.current.open &&
        pageSettingsStateRef.current.pageSysId === currentPageSettingsState.pageSysId
      ) {
        setPageSettingsState((current) => ({
          ...current,
          generalError: "Something went wrong while saving page settings. Your changes were not saved. Please try again."
        }));
      }
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
      const closePromise = closePageSettingsPanel(pageSettingsCloseTargetRef.current);
      pageSettingsClosePromiseRef.current = closePromise;
      void closePromise.finally(() => {
        if (pageSettingsClosePromiseRef.current === closePromise) {
          pageSettingsClosePromiseRef.current = null;
        }
      });
    }, 0);
  }

  function requestOpenDeletePageSettings(pageSysId = pageSettingsStateRef.current.pageSysId) {
    if (!canManagePageSettings || !workspacePagesLoaded || workspaceState.status !== "success") {
      return;
    }

    const targetPageSysId = cleanText(pageSysId);
    const targetPage = targetPageSysId ? findWorkspacePageBySysId(currentWorkspacePages, targetPageSysId) : null;
    if (!targetPage) {
      return;
    }

    const baseState =
      pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId === targetPageSysId
        ? pageSettingsStateRef.current
        : createPageSettingsStateFromPage(targetPage, { panelOpen: false });
    const nextState: PageSettingsState = {
      ...baseState,
      deleteOpen: true,
      deletePending: false,
      deleteError: ""
    };
    pageSettingsStateRef.current = nextState;
    setPageSettingsState(nextState);
  }

  function requestCloseDeletePageSettings() {
    setPageSettingsState((current) => {
      if (current.deletePending) {
        return current;
      }

      const nextState = {
        ...current,
        deleteOpen: false,
        deleteError: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  async function confirmDeletePageSettings() {
    const currentPageSettingsState = pageSettingsStateRef.current;
    if (!currentPageSettingsState.deleteOpen) {
      return;
    }

    if (!canManagePageSettings || !workspacePagesLoaded || workspaceState.status !== "success") {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Unable to delete this page right now. Please try again."
      }));
      return;
    }

    const currentPage = findWorkspacePageBySysId(currentWorkspacePages, currentPageSettingsState.pageSysId);
    if (!currentPage) {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Unable to delete this page right now. Please try again."
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

  async function submitWorkspaceCreation(input: { name: string; shortDescription: string; icon: WorkspaceIcon }) {
    if (!canCreateWorkspaces) {
      setCreateModalError("You do not have permission to create workspaces.");
      setCreateModalPhase("idle");
      return;
    }

    setCreateModalError(undefined);
    setCreateModalPhase("submitting");

    try {
      const result = await serviceNowClient.createWorkspace({
        name: input.name,
        shortDescription: input.shortDescription || null,
        icon: input.icon
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

  function openCurrentWorkspaceSettingsPanel() {
    if (
      route.mode !== "workspace" ||
      workspaceState.status !== "success" ||
      cleanText(workspaceState.data.slug) !== currentWorkspaceSlug ||
      !workspaceState.data.canManageSettings
    ) {
      return;
    }
    const workspaceSysId = cleanText(workspaceState.data.sysId);
    if (pendingWorkspaceSettingsSaveRef.current[workspaceSysId]) {
      return;
    }
    const recovered = workspaceSettingsRecoveryRef.current[workspaceSysId];
    setWorkspaceDeletionState({ status: "idle" });
    setWorkspaceSettingsPanelState({
      errorMessage: recovered?.errorMessage,
      recoveryInput: recovered?.input,
      status: "open",
      workspaceSlug: workspaceState.data.slug,
      workspaceSysId
    });
  }

  async function refreshCurrentWorkspaceCapabilityState() {
    if (route.mode !== "workspace" || workspaceState.status !== "success") {
      return;
    }
    try {
      const result = await serviceNowClient.getWorkspace(workspaceState.data.slug);
      if (result.workspace) {
        setWorkspaceState({ data: result.workspace, status: "success" });
        reconcileWorkspaceIdentity(result.workspace);
      }
    } catch {
      // Capability refresh failure should not fabricate access state.
    }
  }

  function openManageAccessFromSettings(input: { waitForSettingsSave: boolean; workspaceSysId: string }) {
    if (!workspaceStateData?.canManageWorkspaceMembers) {
      return;
    }
    if (input.waitForSettingsSave) {
      openManageAccessAfterSettingsSaveRef.current = cleanText(input.workspaceSysId);
      return;
    }
    setManageAccessOpen(true);
  }

  function clearDeferredManageAccessIntent(workspaceSysId: string) {
    if (openManageAccessAfterSettingsSaveRef.current === workspaceSysId) {
      openManageAccessAfterSettingsSaveRef.current = "";
    }
  }

  async function loadManageAccessMembers(workspace: WorkspaceViewRecord) {
    if (!serviceNowClient.listWorkspaceMembers) {
      return { errorMessage: "Workspace member management is unavailable.", retryable: false, status: "error" as const };
    }
    const result = await serviceNowClient.listWorkspaceMembers({ workspaceSlug: workspace.slug, workspaceSysId: cleanText(workspace.sysId) });
    if (result.state === "failed") {
      return { errorMessage: result.errorMessage, retryable: Boolean(result.retryable), status: "error" as const };
    }
    return { callerCapabilities: result.callerCapabilities, members: result.members, status: "success" as const };
  }

  async function searchManageAccessUsers(workspace: WorkspaceViewRecord, term: string, excludedUserSysIds: string[] = []) {
    if (!serviceNowClient.searchWorkspaceMemberUsers) {
      return { errorMessage: "Workspace member search is unavailable.", status: "error" as const, users: [] };
    }
    const result = await serviceNowClient.searchWorkspaceMemberUsers({ excludedUserSysIds, term, workspaceSlug: workspace.slug, workspaceSysId: cleanText(workspace.sysId) });
    if (result.state === "failed") {
      return { errorMessage: result.errorMessage, status: "error" as const, users: [] };
    }
    return { status: "success" as const, users: result.users };
  }

  async function setManageAccessMember(workspace: WorkspaceViewRecord, userSysId: string, accessLevel: "admin" | "editor") {
    if (!serviceNowClient.setWorkspaceMemberAccess) {
      return { errorMessage: "Workspace member management is unavailable.", ok: false };
    }
    const result = await serviceNowClient.setWorkspaceMemberAccess({ accessLevel, userSysId, workspaceSlug: workspace.slug, workspaceSysId: cleanText(workspace.sysId) });
    return result.state === "succeeded" ? { ok: true } : { errorMessage: result.errorMessage, ok: false };
  }

  async function removeManageAccessMember(workspace: WorkspaceViewRecord, userSysId: string) {
    if (!serviceNowClient.removeWorkspaceMemberAccess) {
      return { errorMessage: "Workspace member management is unavailable.", ok: false };
    }
    const result = await serviceNowClient.removeWorkspaceMemberAccess({ userSysId, workspaceSlug: workspace.slug, workspaceSysId: cleanText(workspace.sysId) });
    return result.state === "succeeded" ? { ok: true } : { errorMessage: result.errorMessage, ok: false };
  }

  function reconcileWorkspaceIdentity(workspace: WorkspaceViewRecord) {
    setWorkspaceState((current) => {
      if (current.status !== "success" || cleanText(current.data.sysId) !== cleanText(workspace.sysId)) {
        return current;
      }
      return { data: workspace, status: "success" };
    });
    setPendingWorkspaceIdentity({ icon: workspace.icon, name: workspace.name, slug: workspace.slug });
    setWorkspaceSwitcherState((current) => {
      if (current.status !== "success") {
        return current;
      }
      return {
        ...current,
        items: current.items.map((item) => cleanText(item.sysId) === cleanText(workspace.sysId) || cleanText(item.slug) === cleanText(workspace.slug) ? workspace : item)
      };
    });
    setRecentWorkspacesState((current) => {
      if (current.status !== "success") {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) => cleanText(item.sysId) === cleanText(workspace.sysId) || cleanText(item.slug) === cleanText(workspace.slug) ? workspace : item)
      };
    });
    setLauncherState((current) => {
      if (current.status !== "success" && current.status !== "refreshing") {
        return current;
      }
      return {
        ...current,
        data: {
          ...current.data,
          items: current.data.items.map((item) => cleanText(item.sysId) === cleanText(workspace.sysId) || cleanText(item.slug) === cleanText(workspace.slug) ? workspace : item)
        }
      };
    });
  }

  function releaseWorkspaceSettingsPreviewIdentity(workspaceSysId: string) {
    setWorkspaceSettingsPreviewIdentity((current) => {
      if (cleanText(current?.workspaceSysId) !== workspaceSysId) {
        return current;
      }
      return null;
    });
  }

  const releaseWorkspaceSettingsOwnedPreviewObjectUrl = useCallback((objectUrl: string) => {
    const normalizedObjectUrl = cleanText(objectUrl);
    if (!normalizedObjectUrl) return;
    setWorkspaceSettingsPreviewIdentity((current) => {
      if (current?.ownedPreviewObjectUrl === normalizedObjectUrl) {
        return { ...current, ownedPreviewObjectUrl: undefined };
      }
      return current;
    });
    Object.values(pendingWorkspaceSettingsSaveRef.current).forEach((pendingSave) => {
      if (pendingSave.ownedPreviewObjectUrl === normalizedObjectUrl) {
        pendingSave.ownedPreviewObjectUrl = "";
      }
    });
    URL.revokeObjectURL(normalizedObjectUrl);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pendingWorkspaceSettingsSaveRef.current).forEach((pendingSave) => {
        if (pendingSave.ownedPreviewObjectUrl) {
          URL.revokeObjectURL(pendingSave.ownedPreviewObjectUrl);
          pendingSave.ownedPreviewObjectUrl = "";
        }
      });
    };
  }, []);

  useEffect(() => {
    const activeWorkspaceSysId = route.mode === "workspace" && workspaceState.status === "success" ? cleanText(workspaceState.data.sysId) : "";
    Object.values(pendingWorkspaceSettingsSaveRef.current).forEach((pendingSave) => {
      if (pendingSave.ownedPreviewObjectUrl && cleanText(pendingSave.workspaceSysId) !== activeWorkspaceSysId) {
        releaseWorkspaceSettingsOwnedPreviewObjectUrl(pendingSave.ownedPreviewObjectUrl);
      }
    });
  }, [releaseWorkspaceSettingsOwnedPreviewObjectUrl, route.mode, workspaceState]);

  async function submitWorkspaceSettings(input: WorkspaceSettingsSubmitInput) {
    if (
      workspaceSettingsPanelState.status !== "open" ||
      route.mode !== "workspace" ||
      workspaceState.status !== "success" ||
      !workspaceState.data.canManageSettings ||
      !serviceNowClient.saveWorkspaceSettings
    ) {
      return;
    }

    const workspaceSlug = workspaceState.data.slug;
    const workspaceSysId = cleanText(workspaceState.data.sysId);
    const requestGeneration = workspaceSettingsSaveGenerationRef.current + 1;
    workspaceSettingsSaveGenerationRef.current = requestGeneration;
    const previewIdentity: WorkspaceSettingsPreviewIdentity = {
      icon: input.previewIdentity?.icon ?? input.icon ?? workspaceState.data.icon,
      name: input.previewIdentity?.name ?? input.name,
      ownedPreviewObjectUrl: cleanText(input.ownedPreviewObjectUrl) || undefined,
      workspaceSysId
    };
    const priorPendingSave = pendingWorkspaceSettingsSaveRef.current[workspaceSysId];
    if (priorPendingSave?.ownedPreviewObjectUrl && priorPendingSave.ownedPreviewObjectUrl !== previewIdentity.ownedPreviewObjectUrl) {
      releaseWorkspaceSettingsOwnedPreviewObjectUrl(priorPendingSave.ownedPreviewObjectUrl);
    }
    setWorkspaceSettingsPreviewIdentity(previewIdentity);
    pendingWorkspaceSettingsSaveRef.current = {
      ...pendingWorkspaceSettingsSaveRef.current,
      [workspaceSysId]: { id: requestGeneration, input, ownedPreviewObjectUrl: cleanText(input.ownedPreviewObjectUrl), previewIdentity, workspaceSlug, workspaceSysId }
    };
    setWorkspaceSettingsPanelState({ status: "closed" });

    let result: WorkspaceSettingsSaveResult;
    try {
      const saveInput = {
        workspaceSlug,
        workspaceSysId,
        name: input.name,
        shortDescription: input.shortDescription,
        layout: input.layout
      };
      result = await serviceNowClient.saveWorkspaceSettings(input.icon ? { ...saveInput, icon: input.icon } : saveInput);
    } catch {
      result = {
        errorMessage: "Something went wrong while saving workspace settings. Your changes were not saved. Please try again.",
        state: "failed"
      };
    }

    const pendingSave = pendingWorkspaceSettingsSaveRef.current[workspaceSysId];
    if (!pendingSave || pendingSave.id !== requestGeneration || pendingSave.workspaceSysId !== workspaceSysId) {
      return;
    }
    const nextPendingSaves = { ...pendingWorkspaceSettingsSaveRef.current };
    delete nextPendingSaves[workspaceSysId];
    pendingWorkspaceSettingsSaveRef.current = nextPendingSaves;

    if (!result || result.state === "failed") {
      if (openManageAccessAfterSettingsSaveRef.current === workspaceSysId) {
        openManageAccessAfterSettingsSaveRef.current = "";
      }
      if (pendingSave.ownedPreviewObjectUrl) {
        releaseWorkspaceSettingsOwnedPreviewObjectUrl(pendingSave.ownedPreviewObjectUrl);
      }
      releaseWorkspaceSettingsPreviewIdentity(workspaceSysId);
      workspaceSettingsRecoveryRef.current = {
        ...workspaceSettingsRecoveryRef.current,
        [workspaceSysId]: {
          errorMessage: result?.errorMessage ?? "Something went wrong while saving workspace settings. Your changes were not saved. Please try again.",
          input
        }
      };
      return;
    }

    reconcileWorkspaceIdentity(result.workspace);
    const savedWorkspaceStillActive = activeWorkspaceSysIdRef.current === workspaceSysId;
    if (openManageAccessAfterSettingsSaveRef.current === workspaceSysId && savedWorkspaceStillActive && result.workspace.canManageWorkspaceMembers) {
      clearDeferredManageAccessIntent(workspaceSysId);
      setManageAccessOpen(true);
    } else if (openManageAccessAfterSettingsSaveRef.current === workspaceSysId) {
      clearDeferredManageAccessIntent(workspaceSysId);
    }
    if (
      pendingSave.ownedPreviewObjectUrl &&
      (route.mode !== "workspace" || workspaceState.status !== "success" || cleanText(workspaceState.data.sysId) !== workspaceSysId)
    ) {
      releaseWorkspaceSettingsOwnedPreviewObjectUrl(pendingSave.ownedPreviewObjectUrl);
    } else if (pendingSave.ownedPreviewObjectUrl) {
      setWorkspaceSettingsPreviewIdentity((current) => {
        if (!current || cleanText(current.workspaceSysId) !== workspaceSysId || current.ownedPreviewObjectUrl !== pendingSave.ownedPreviewObjectUrl) {
          return current;
        }
        return {
          icon: result.workspace.icon,
          name: result.workspace.name,
          ownedPreviewObjectUrl: pendingSave.ownedPreviewObjectUrl,
          workspaceSysId
        };
      });
    } else if (!pendingSave.ownedPreviewObjectUrl) {
      releaseWorkspaceSettingsPreviewIdentity(workspaceSysId);
    }
    const nextRecovery = { ...workspaceSettingsRecoveryRef.current };
    delete nextRecovery[workspaceSysId];
    workspaceSettingsRecoveryRef.current = nextRecovery;
  }

  async function confirmDeleteCurrentWorkspace() {
    if (
      route.mode !== "workspace" ||
      workspaceState.status !== "success" ||
      !workspaceState.data.canManageSettings ||
      !serviceNowClient.deleteWorkspace ||
      workspaceDeletionState.status === "deleting"
    ) {
      return;
    }

    const workspaceSlug = workspaceState.data.slug;
    const workspaceSysId = cleanText(workspaceState.data.sysId);
    setWorkspaceDeletionState({ status: "deleting", workspaceSlug, workspaceSysId });

    let result: WorkspaceDeleteResult;
    try {
      result = await serviceNowClient.deleteWorkspace({ workspaceSlug, workspaceSysId });
    } catch {
      result = {
        code: "transient",
        errorMessage: "Something went wrong while deleting the workspace. Nothing was deleted. Please try again.",
        retryable: true,
        state: "failed"
      };
    }

    if (result.state === "failed") {
      if (result.deletionCommitted) {
        const userSysId = pingState.status === "success" ? pingState.payload.userSysId : recentWorkspacesState.userSysId;
        const nextRecentSlugs = forgetRecentWorkspaceSlug(userSysId, workspaceSlug);
        setRecentWorkspacesState((current) => {
          if (current.status === "success") {
            return {
              ...current,
              slugs: nextRecentSlugs,
              items: current.items.filter((item) => cleanText(item.slug) !== cleanText(workspaceSlug))
            };
          }
          if (current.status === "loading") {
            return {
              ...current,
              slugs: nextRecentSlugs
            };
          }
          return current;
        });
        clearStoredWorkspaceLease(workspaceSysId, "workspace_delete_committed");
        setManageAccessOpen(false);
        setWorkspaceSettingsPanelState({ status: "closed" });
        setWorkspaceDeletionState({ status: "idle" });
        setWorkspaceSettingsPreviewIdentity(null);
        setWorkspaceState({ status: "idle" });
        setWorkspacePagesState({ status: "idle" });
        setPendingChangesState({ status: "idle" });
        setWorkspaceSwitcherState((current) =>
          current.status === "success"
            ? { ...current, items: current.items.filter((item) => cleanText(item.slug) !== cleanText(workspaceSlug)) }
            : current
        );
        setLauncherState((current) => {
          if (current.status !== "success" && current.status !== "refreshing") return current;
          return {
            ...current,
            data: {
              ...current.data,
              items: current.data.items.filter((item) => cleanText(item.slug) !== cleanText(workspaceSlug)),
              totalCount: Math.max(0, current.data.totalCount - 1)
            }
          };
        });
        setLauncherRefreshToken((value) => value + 1);
        commitRoute(buildLauncherHref(), true, "workspace_delete_committed");
        return;
      }
      setWorkspaceDeletionState({
        errorMessage: result.errorMessage,
        status: "error",
        workspaceSlug,
        workspaceSysId
      });
      setWorkspaceSettingsPanelState((current) =>
        current.status === "closed"
          ? { status: "open", workspaceSlug, workspaceSysId }
          : current
      );
      return;
    }

    const userSysId = pingState.status === "success" ? pingState.payload.userSysId : recentWorkspacesState.userSysId;
    const nextRecentSlugs = forgetRecentWorkspaceSlug(userSysId, workspaceSlug);
    setRecentWorkspacesState((current) => {
      if (current.status === "success") {
        return {
          ...current,
          slugs: nextRecentSlugs,
          items: current.items.filter((item) => cleanText(item.slug) !== cleanText(workspaceSlug))
        };
      }
      if (current.status === "loading") {
        return {
          ...current,
          slugs: nextRecentSlugs
        };
      }
      return current;
    });
    clearStoredWorkspaceLease(workspaceSysId, "workspace_deleted");
    setManageAccessOpen(false);
    setWorkspaceSettingsPanelState({ status: "closed" });
    setWorkspaceDeletionState({ status: "idle" });
    setWorkspaceSettingsPreviewIdentity(null);
    setWorkspaceState({ status: "idle" });
    setWorkspacePagesState({ status: "idle" });
    setPendingChangesState({ status: "idle" });
    setWorkspaceSwitcherState((current) =>
      current.status === "success"
        ? { ...current, items: current.items.filter((item) => cleanText(item.slug) !== cleanText(workspaceSlug)) }
        : current
    );
    setLauncherState((current) => {
      if (current.status !== "success" && current.status !== "refreshing") return current;
      return {
        ...current,
        data: {
          ...current.data,
          items: current.data.items.filter((item) => cleanText(item.slug) !== cleanText(workspaceSlug)),
          totalCount: Math.max(0, current.data.totalCount - 1)
        }
      };
    });
    setLauncherRefreshToken((value) => value + 1);
    commitRoute(buildLauncherHref(), true, "workspace_deleted");
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
    const nextPageSysId = cleanText(page.sysId);
    const nextPageSlug = cleanText(page.draftSlug);

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
        pageSlug: nextPageSlug || undefined
      }),
      replace: false,
      beforeCommit: () => {
        pendingSelectionTargetRef.current = {
          fallbackAncestorPageSysIds: [],
          mode: "edit",
          pageSysId: nextPageSysId
        };
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
  const canCreateWorkspaces = Boolean(launcherList?.canCreateWorkspaces);

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
    if (transition.requiresSourceDiscard) {
      markdownSourceDiscardTransitionRef.current = transition;
      discardInvalidMarkdownSourceDraft({ resetSurface: false });
      return;
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

  function handleEditorStatusChange(pageSysId: string, state: PageEditorStatusState & { release?: (options?: { keepalive?: boolean }) => Promise<void> }) {
    const sessionToken = renderedEditorSession;
    if (!isCurrentEditorSession(sessionToken)) {
      return;
    }

    if (sessionToken.pageSysId !== cleanText(pageSysId)) {
      return;
    }

    editorApplyCanonicalEnvelopeRef.current = state.applyCanonicalEnvelope ?? null;
    editorFlushRef.current = state.flush ?? null;
    editorGetCanonicalEnvelopeRef.current = state.getCanonicalEnvelope ?? null;
    editorRecoverySnapshotRef.current = state.getRecoverySnapshot ?? null;
    editorReleaseRef.current = state.release ?? null;
    editorCanonicalHandoffReadyRef.current = Boolean(state.applyCanonicalEnvelope && state.getCanonicalEnvelope && state.flush);
    if (!editorCanonicalHandoffReadyRef.current) {
      markdownSourceRetryIssuedRef.current = false;
    }
    setEditorCanonicalHandoffReady(editorCanonicalHandoffReadyRef.current);

    setEditorTransitionState((current) =>
      current.isDirty === state.isDirty && current.isSaving === state.isSaving && current.status === state.status ? current : state
    );
    maybeRequestMarkdownSourceRetry();
  }

  function handleEditorReadyStateChange(ready: boolean) {
    isEditorReadyRef.current = ready;
    if (!ready) {
      markdownSourceRetryIssuedRef.current = false;
    }
    setIsEditorReady(ready);
    maybeRequestMarkdownSourceRetry();
  }

  function projectMarkdownSourceTitle(title: string): boolean {
    const page = findWorkspacePageBySysId(currentWorkspacePages, selectedWorkspacePageId);
    if (!page) {
      return false;
    }

    const currentState = pageSettingsStateRef.current;
    const nextState =
      cleanText(currentState.pageSysId) === cleanText(page.sysId)
        ? {
            ...currentState,
            title,
            titleError: "",
            generalError: "",
            noticeMessage: ""
          }
        : {
            ...createPageSettingsStateFromPage(page, { panelOpen: false }),
            title,
            titleError: "",
            generalError: "",
            noticeMessage: "",
            open: true,
            panelOpen: false
          };
    nextState.title = title;
    pageSettingsStateRef.current = nextState;
    setPageSettingsState(nextState);
    return true;
  }

  function queueMarkdownSourceTitleAutosave(title: string): boolean {
    const page = findWorkspacePageBySysId(currentWorkspacePages, selectedWorkspacePageId);
    if (!page || !projectMarkdownSourceTitle(title)) {
      return false;
    }

    markdownSourceTitleAutosaveRequestRef.current = {
      interactionVersion: markPageSettingsInteraction(),
      pageSysId: cleanText(page.sysId),
      title
    };

    if (markdownSourceTitleAutosaveTimerRef.current !== null) {
      window.clearTimeout(markdownSourceTitleAutosaveTimerRef.current);
    }

    markdownSourceTitleAutosaveTimerRef.current = window.setTimeout(() => {
      markdownSourceTitleAutosaveTimerRef.current = null;
      void drainMarkdownSourceTitleAutosave();
    }, SOURCE_TITLE_AUTOSAVE_DEBOUNCE_MS);
    return true;
  }

  async function drainMarkdownSourceTitleAutosave(): Promise<boolean> {
    if (markdownSourceTitleAutosaveDrainRef.current) {
      return markdownSourceTitleAutosaveDrainRef.current;
    }

    const drain = (async () => {
      while (true) {
        const request = markdownSourceTitleAutosaveRequestRef.current;
        if (!request) {
          return true;
        }

        const currentState = pageSettingsStateRef.current;
        if (
          !currentState.open ||
          cleanText(currentState.pageSysId) !== cleanText(request.pageSysId) ||
          cleanText(currentState.title) !== cleanText(request.title)
        ) {
          if (markdownSourceTitleAutosaveRequestRef.current !== request) {
            continue;
          }

          markdownSourceTitleAutosaveRequestRef.current = null;
          return true;
        }

        const saved = await closePageSettingsPanel(request.pageSysId, { keepProjectionOnSuccess: true });
        if (markdownSourceTitleAutosaveRequestRef.current !== request) {
          continue;
        }

        if (!saved) {
          return false;
        }

        markdownSourceTitleAutosaveRequestRef.current = null;
        return true;
      }
    })().finally(() => {
      markdownSourceTitleAutosaveDrainRef.current = null;
    });

    markdownSourceTitleAutosaveDrainRef.current = drain;
    return drain;
  }

  async function flushMarkdownSourceTitleAutosave(): Promise<boolean> {
    if (markdownSourceTitleAutosaveTimerRef.current !== null) {
      window.clearTimeout(markdownSourceTitleAutosaveTimerRef.current);
      markdownSourceTitleAutosaveTimerRef.current = null;
    }

    return drainMarkdownSourceTitleAutosave();
  }

  function handleSourceBodyChange(envelope: DocseraDocumentEnvelope): PageEditorCanonicalHandoffResult {
    if (markdownSourceTitleInvalidRef.current) {
      return { kind: "unavailable" };
    }

    const applyCanonicalEnvelope = editorApplyCanonicalEnvelopeRef.current;
    if (!applyCanonicalEnvelope) {
      return { kind: "unavailable" };
    }

    return applyCanonicalEnvelope(envelope);
  }

  function maybeRequestMarkdownSourceRetry() {
    if (!markdownSourceUnavailableRef.current) {
      markdownSourceRetryIssuedRef.current = false;
      return;
    }

    if (markdownSourceRetryIssuedRef.current) {
      return;
    }

    if (!hasAuthoringCapability || editAccessLost || workspaceCommandBlocksCurrentWorkspaceWrites) {
      return;
    }

    if (!isEditorReadyRef.current || !editorCanonicalHandoffReadyRef.current) {
      return;
    }

    markdownSourceRetryIssuedRef.current = true;
    setMarkdownSourceRetryNonce((current) => current + 1);
  }

  function handleSourceTitleChange(title: string) {
    const validation = validatePageSettingsTitle(title);
    if (!validation.valid) {
      if (markdownSourceTitleAutosaveTimerRef.current !== null) {
        window.clearTimeout(markdownSourceTitleAutosaveTimerRef.current);
        markdownSourceTitleAutosaveTimerRef.current = null;
      }
      markdownSourceTitleAutosaveRequestRef.current = null;
      markdownSourceTitleInvalidRef.current = true;
      setMarkdownSourceStatus({
        errorMessage: validation.error,
        isUnavailable: false,
        isInvalid: true,
        pageSysId: selectedWorkspacePageId
      });
      return;
    }

    markdownSourceTitleInvalidRef.current = false;
    setMarkdownSourceStatus({
      errorMessage: "",
      isUnavailable: false,
      isInvalid: false,
      pageSysId: selectedWorkspacePageId
    });
    void queueMarkdownSourceTitleAutosave(validation.value);
  }

  function handleSourceInvalidChange(state: MarkdownSourceStatus) {
    markdownSourceTitleInvalidRef.current = state.isInvalid;
    markdownSourceUnavailableRef.current = state.isUnavailable && cleanText(state.pageSysId) === cleanText(selectedWorkspacePageId);
    setMarkdownSourceStatus(state);
    maybeRequestMarkdownSourceRetry();
  }

  function handleSourceDiscardComplete() {
    markdownSourceTitleInvalidRef.current = false;
    markdownSourceUnavailableRef.current = false;
    markdownSourceRetryIssuedRef.current = false;
    if (markdownSourceTitleAutosaveTimerRef.current !== null) {
      window.clearTimeout(markdownSourceTitleAutosaveTimerRef.current);
      markdownSourceTitleAutosaveTimerRef.current = null;
    }
    markdownSourceTitleAutosaveRequestRef.current = null;
    setMarkdownSourceStatus({
      errorMessage: "",
      isUnavailable: false,
      isInvalid: false,
      pageSysId: ""
    });
  }

  function discardInvalidMarkdownSourceDraft(options: { resetSurface?: boolean } = {}) {
    if (markdownSourceTitleAutosaveTimerRef.current !== null) {
      window.clearTimeout(markdownSourceTitleAutosaveTimerRef.current);
      markdownSourceTitleAutosaveTimerRef.current = null;
    }
    markdownSourceTitleAutosaveRequestRef.current = null;
    setWorkspaceMarkdownSourceDiscardNonceState((current) => ({
      ...current,
      [currentWorkspaceSlug]: (current[currentWorkspaceSlug] ?? 0) + 1
    }));
    if (options.resetSurface !== false) {
      setWorkspaceAuthoringSurfaceState((current) => ({
        ...current,
        [currentWorkspaceSlug]: "visual"
      }));
    }
    markdownSourceTitleInvalidRef.current = false;
    markdownSourceUnavailableRef.current = false;
    markdownSourceRetryIssuedRef.current = false;
    setMarkdownSourceStatus({
      errorMessage: "",
      isUnavailable: false,
      isInvalid: false,
      pageSysId: ""
    });
  }

  function handleSourceDiscardInvalidDraft() {
    discardInvalidMarkdownSourceDraft({ resetSurface: true });
  }

  function handleStayInInvalidMarkdownSource() {
    setInvalidMarkdownSurfaceSwitchOpen(false);
  }

  function handleDiscardInvalidMarkdownAndSwitchToVisual() {
    setInvalidMarkdownSurfaceSwitchOpen(false);
    discardInvalidMarkdownSourceDraft({ resetSurface: true });
  }

  function changeAuthoringSurface(nextSurface: WorkspaceAuthoringSurface) {
    if (route.mode !== "workspace" || activeWorkspaceMode !== "edit") {
      return;
    }

    if (!currentPageAuthoringReadiness.canSwitchSurface) {
      if (activeMarkdownSourceIsInvalid || activeMarkdownSourceIsUnavailable) {
        setShellNotice({
          eyebrow: "Markdown",
          kind: "alert",
          message: markdownSourceReadinessMessage || "Discard the Markdown draft before switching back to Visual.",
          pageSysId: selectedWorkspacePageId,
          workspaceMode: "edit",
          workspaceSlug: currentWorkspaceSlug
        });
      }
      return;
    }

    if (nextSurface === "visual" && activeMarkdownSourceIsInvalid) {
      setInvalidMarkdownSurfaceSwitchOpen(true);
      return;
    }

    setWorkspaceAuthoringSurfaceState((current) => ({
      ...current,
      [currentWorkspaceSlug]: nextSurface
    }));

    if (nextSurface === "markdown" && selectedWorkspacePageId) {
      setWorkspaceMarkdownSourceSessionPageSysIdState((current) => ({
        ...current,
        [currentWorkspaceSlug]: selectedWorkspacePageId
      }));
    }
  }

  useEffect(() => {
    if (markdownSourceStatus.isInvalid) {
      return;
    }

    const transition = markdownSourceDiscardTransitionRef.current;
    if (!transition) {
      return;
    }

    markdownSourceDiscardTransitionRef.current = null;
    requestRouteTransition(transition);
  }, [markdownSourceStatus.isInvalid]);

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
    if (sessionToken && !isCurrentEditorSession(sessionToken)) {
      return {
        errorMessage: "The editing session changed.",
        state: "failed"
      };
    }
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
  const currentWorkspaceAuthoringSurface = route.mode === "workspace" && activeWorkspaceMode === "edit" ? workspaceAuthoringSurfaceState[currentWorkspaceSlug] ?? "visual" : "visual";
  const currentWorkspaceMarkdownSourceSessionPageSysId =
    route.mode === "workspace" && activeWorkspaceMode === "edit"
      ? workspaceMarkdownSourceSessionPageSysIdState[currentWorkspaceSlug] ?? ""
      : "";
  const currentWorkspaceMarkdownSourceDiscardNonce =
    route.mode === "workspace" && activeWorkspaceMode === "edit"
      ? workspaceMarkdownSourceDiscardNonceState[currentWorkspaceSlug] ?? 0
      : 0;
  const activeMarkdownSourceIsInvalid = markdownSourceStatus.isInvalid && markdownSourceStatus.pageSysId === selectedWorkspacePageId;
  const activeMarkdownSourceIsUnavailable = markdownSourceStatus.isUnavailable && markdownSourceStatus.pageSysId === selectedWorkspacePageId;
  const markdownSourceReadinessMessage = activeMarkdownSourceIsInvalid
    ? markdownSourceStatus.errorMessage || "Markdown source has invalid content. Fix it or discard it before publishing."
    : activeMarkdownSourceIsUnavailable
      ? markdownSourceStatus.errorMessage || "Markdown source is waiting for the visual editor to become available."
      : "";
  const appHeaderIdentity = route.mode === "workspace" ? workspaceHeaderIdentity : launcherHeaderIdentity;
  const appHeaderMode = route.mode === "workspace" ? "workspace" : "launcher";
  const appHeaderWorkspaceSlug = route.mode === "workspace" ? currentWorkspaceSlug : "";
  const appHeaderWorkspaceMode =
    route.mode === "workspace" ? workspaceHeaderPresentation?.showWorkspaceMode ?? activeWorkspaceMode : "live";
  const appHeaderSidebarCollapsed = route.mode === "workspace" ? sidebarCollapsed : false;
  const appHeaderWorkspaceNavWidth = route.mode === "workspace" ? workspaceNavWidth : undefined;
  const appHeaderShowWorkspaceSettings =
    route.mode === "workspace" && appHeaderWorkspaceMode === "edit" ? Boolean(workspaceHeaderPresentation?.showWorkspaceSettings) : false;
  const appHeaderShowEditToggle = route.mode === "workspace" ? Boolean(workspaceHeaderPresentation?.showEditModeToggle) : false;
  const appHeaderShowAuthoringSurfaceToggle = route.mode === "workspace" && appHeaderWorkspaceMode === "edit" && hasAuthoringCapability;
  const appHeaderAuthoringSurface = route.mode === "workspace" ? currentWorkspaceAuthoringSurface : "visual";
  const appHeaderShowWorkspaceSwitcher =
    route.mode === "workspace"
      ? Boolean(workspaceHeaderPresentation?.showWorkspaceSwitcher)
      : recentWorkspaceItems.length > 0;
  const workspaceSettingsPanelWorkspace =
    route.mode === "workspace" &&
    workspaceState.status === "success" &&
    workspaceSettingsPanelState.status !== "closed" &&
    cleanText(workspaceState.data.sysId) === cleanText(workspaceSettingsPanelState.workspaceSysId)
      ? workspaceState.data
      : null;
  const handleWorkspaceSettingsDraftIdentityChange = useCallback((identity: Pick<WorkspaceViewRecord, "icon" | "name"> | null) => {
    setWorkspaceSettingsPreviewIdentity((current) => {
      if (!identity || !workspaceSettingsPanelWorkspace) {
        if (current && pendingWorkspaceSettingsSaveRef.current[cleanText(current.workspaceSysId)]?.previewIdentity === current) {
          return current;
        }
        return current ? null : current;
      }
      const next = { ...identity, workspaceSysId: cleanText(workspaceSettingsPanelWorkspace.sysId) };
      if (
        current &&
        cleanText(current.workspaceSysId) === cleanText(next.workspaceSysId) &&
        cleanText(current.name) === cleanText(next.name) &&
        JSON.stringify(current.icon) === JSON.stringify(next.icon)
      ) {
        return current;
      }
      return next;
    });
  }, [workspaceSettingsPanelWorkspace]);
  const appHeaderWorkspaceControlsLocked = isRetainingWorkspaceHeaderPresentation || workspaceCommandBlocksCurrentWorkspaceWrites;
  const editorStatusLabel = cleanText(editorTransitionState.status) || "Saved";
  const currentPageAuthoringReadiness = resolveCurrentPageAuthoringReadiness({
    activeWorkspaceMode,
    canEditPageBody: hasAuthoringCapability && !editAccessLost && !workspaceCommandBlocksCurrentWorkspaceWrites,
    editAccessLost,
    editorCanonicalHandoffReady: Boolean(renderedEditorSession && isEditorReady && editorCanonicalHandoffReady),
    editorStatus: editorTransitionState.status,
    isEditorReady,
    markdownSourceStatus,
    pageSettingsState,
    selectedPageSysId: selectedWorkspacePageId,
    workspaceCommandBlocksCurrentWorkspaceWrites
  });
  const appHeaderAuthoringSurfaceLocked = !currentPageAuthoringReadiness.canSwitchSurface;
  const appHeaderMarkdownSourceEditable = currentPageAuthoringReadiness.canEditMarkdownSource;
  const pendingChangesSaveBlockedMessage = currentPageAuthoringReadiness.blockedMessage;
  const suppressActiveWorkspaceCommandReadinessMessage =
    (workspacePublishInProgress || workspaceDiscardAllInProgress || workspaceDiscardPageInProgress) &&
    pendingChangesSaveBlockedMessage === WORKSPACE_COMMAND_AUTHORING_LOCK_MESSAGE;
  const pendingChangesReadinessMessage = suppressActiveWorkspaceCommandReadinessMessage ? "" : pendingChangesSaveBlockedMessage;
  const pendingChangesUndoBlockedPageSysId = pendingChangesSaveBlockedMessage ? selectedWorkspacePageId : "";
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
  const workspaceDiscardAllRecoveryRetryReady = workspaceDiscardAllRetryable && workspaceDiscardAllRecoveryRequired;
  const workspaceDiscardAllRecoveryRetryAuthoringReadiness = workspaceDiscardAllRecoveryRetryReady
    ? resolveDiscardRecoveryRetryAuthoringReadiness({
      activeWorkspaceMode,
      canEditPageBody: hasAuthoringCapability && !editAccessLost,
      editAccessLost,
      editorCanonicalHandoffReady: Boolean(renderedEditorSession && isEditorReady && editorCanonicalHandoffReady),
      editorStatus: editorTransitionState.status,
      isEditorReady,
      markdownSourceStatus,
      pageSettingsState,
      selectedPageSysId: selectedWorkspacePageId,
      workspaceCommandBlocksCurrentWorkspaceWrites,
      workspaceDiscardAllInProgress,
      workspaceDiscardPageInProgress,
      workspacePublishInProgress
    })
    : currentPageAuthoringReadiness;
  const workspaceDiscardAllAffectedPageCount =
    workspaceDiscardAllState.status === "error" &&
    workspaceDiscardAllState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardAllState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardAllState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardAllState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardAllState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision
      ? workspaceDiscardAllState.affectedPageCount
      : undefined;
  const workspaceDiscardPageErrorMessage =
    workspaceDiscardPageState.status === "error" &&
    workspaceDiscardPageState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardPageState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardPageState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardPageState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardPageState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision
      ? workspaceDiscardPageState.errorMessage
      : "";
  const workspaceDiscardPageRetryable =
    workspaceDiscardPageState.status === "error" &&
    workspaceDiscardPageState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardPageState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardPageState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardPageState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardPageState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision &&
    workspaceDiscardPageState.retryable;
  const workspaceDiscardPageTargetPageSysId =
    workspaceDiscardPageState.status !== "idle" &&
    workspaceDiscardPageState.workspaceSlug === currentWorkspaceSlug &&
    workspaceDiscardPageState.workspaceSysId === cleanText(workspaceStateData?.sysId) &&
    workspaceDiscardPageState.contextKey === currentWorkspaceCommandContextKey &&
    workspaceDiscardPageState.sourceChangeSetId === currentWorkspaceCommandSourceChangeSetId &&
    workspaceDiscardPageState.sourceChangeSetRevision === currentWorkspaceCommandSourceChangeSetRevision
      ? workspaceDiscardPageState.pageSysId
      : "";
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
      (workspaceDiscardAllRecoveryRetryReady
        ? workspaceDiscardAllRecoveryRetryAuthoringReadiness.blockedMessage
        : pendingChangesSaveBlockedMessage) ||
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

  async function discardPendingWorkspacePage(pageSysId: string) {
    if (
      !serviceNowClient.discardPageWorkspace ||
      route.mode !== "workspace" ||
      workspaceState.status !== "success" ||
      workspaceState.data.slug !== currentWorkspaceSlug ||
      activeWorkspaceMode !== "edit" ||
      workspaceCommandBlocksCurrentWorkspaceWrites ||
      pendingChangesResult?.state !== "succeeded"
    ) {
      return;
    }

    const normalizedPageSysId = cleanText(pageSysId);
    const workspaceSysId = cleanText(workspaceState.data.sysId);
    const workspaceSlug = workspaceState.data.slug;
    const mutationContextKey = currentWorkspaceCommandContextKey;
    const sourceChangeSetId = currentWorkspaceCommandSourceChangeSetId;
    const sourceChangeSetRevision = currentWorkspaceCommandSourceChangeSetRevision;
    const pageSettingsWasOpenForUndoTarget =
      pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId === normalizedPageSysId;
    const pendingRow = pendingChangesResult.rows.find((row) => row.pageSysId === normalizedPageSysId);
    if (!normalizedPageSysId || !workspaceSysId || !pendingRow) {
      return;
    }
    if (pendingChangesUndoBlockedPageSysId && pendingChangesUndoBlockedPageSysId === normalizedPageSysId) {
      return;
    }
    if (staleRefreshBlocksCurrentWorkspaceWrites) {
      await requestStaleRefreshBlock(currentWorkspaceMutationAuthority() ?? {});
      return;
    }

    setWorkspaceDiscardPageState({
      contextKey: mutationContextKey,
      pageSysId: normalizedPageSysId,
      sourceChangeSetId,
      sourceChangeSetRevision,
      status: "discarding",
      workspaceSlug,
      workspaceSysId
    });
    try {
      const outcome = await runWorkspaceMutation<WorkspaceDiscardPageResult>({
        contextKey: mutationContextKey,
        safeRetry: false,
        type: "workspace_discard_page",
        dispatch: (workspaceLeaseToken, workspaceAuthority) => serviceNowClient.discardPageWorkspace!({
          pageSysId: normalizedPageSysId,
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
        setWorkspaceDiscardPageState({
          contextKey: mutationContextKey,
          errorMessage: outcome.state === "contention" ? "This workspace is currently being edited by another user." : outcome.errorMessage,
          pageSysId: normalizedPageSysId,
          retryable: false,
          sourceChangeSetId,
          sourceChangeSetRevision,
          status: "error",
          workspaceSlug,
          workspaceSysId
        });
        return;
      }

      const result = outcome as WorkspaceDiscardPageResult;
      if (result.state === "failed") {
        setWorkspaceDiscardPageState({
          contextKey: mutationContextKey,
          errorMessage: result.errorMessage,
          pageSysId: normalizedPageSysId,
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
      const selectedPageIdBeforeDiscard = cleanText(selectedWorkspacePageId);
      const discardedAddedPageIds =
        pendingRow.category === "Added"
          ? new Set(collectPageSubtreeSysIds(currentWorkspacePages, normalizedPageSysId).map((pageId) => cleanText(pageId)).filter(Boolean))
          : new Set<string>();
      const selectedPageIsDiscardedAddedDescendant =
        discardedAddedPageIds.size > 0 && discardedAddedPageIds.has(selectedPageIdBeforeDiscard);
      const restoredUndoTargetPage = findWorkspacePageBySysId(result.pages, normalizedPageSysId);
      const selectedUndoTargetWasReplaced =
        Boolean(restoredUndoTargetPage) && selectedPageIdBeforeDiscard === normalizedPageSysId;
      if (selectedUndoTargetWasReplaced || selectedPageIsDiscardedAddedDescendant) {
        invalidateEditorSessionForAuthoritativeRebind();
      }
      clearPageOutlineOverrides(
        discardedAddedPageIds.size > 0 ? discardedAddedPageIds : [normalizedPageSysId]
      );
      if (
        pageSettingsWasOpenForUndoTarget &&
        restoredUndoTargetPage
      ) {
        clearPageSettingsRecoverySnapshot(normalizedPageSysId);
        const nextState = createPageSettingsStateFromPage(restoredUndoTargetPage);
        pageSettingsPendingOpenPageIdRef.current = normalizedPageSysId;
        pageSettingsStateRef.current = nextState;
        setPageSettingsState(nextState);
      } else if (
        pageSettingsStateRef.current.open &&
        discardedAddedPageIds.has(pageSettingsStateRef.current.pageSysId)
      ) {
        pageSettingsPendingOpenPageIdRef.current = "";
        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        setPageSettingsState(nextState);
      }
      if (workspaceState.status === "success" && discardedAddedPageIds.size > 0) {
        clearDeletedPageRecoverySnapshots({
          workspaceSlug,
          workspaceSysId
        }, discardedAddedPageIds);
      }
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
      if (selectedUndoTargetWasReplaced && restoredUndoTargetPage) {
        const restoredRouteSlug = cleanText(restoredUndoTargetPage.draftSlug);
        if (cleanText(currentWorkspacePageSlug) !== restoredRouteSlug) {
          commitRoute(
            buildWorkspaceHref(workspaceSlug, {
              mode: "edit",
              pageSlug: restoredRouteSlug || undefined
            }),
            true,
            "workspace_discard_page_route_normalization"
          );
        }
      } else if (selectedPageIsDiscardedAddedDescendant) {
        const fallbackSelection = resolveWorkspacePageSelection(result.pages, {
          mode: "edit"
        });
        commitRoute(
          buildWorkspaceHref(workspaceSlug, {
            mode: "edit",
            pageSlug: cleanText(fallbackSelection.pageSlug) || undefined
          }),
          true,
          "workspace_discard_page_selection_fallback"
        );
      }
      setWorkspaceDiscardPageState({ status: "idle" });
    } catch {
      if (!isCurrentWorkspaceMutationContext(mutationContextKey)) {
        return;
      }
      setWorkspaceDiscardPageState({
        contextKey: mutationContextKey,
        errorMessage: "Something went wrong while discarding changes to this page. No changes were discarded. Please try again.",
        pageSysId: normalizedPageSysId,
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
        currentUser={pingState.status === "success" ? pingState.payload : null}
        loadUploadedIcon={serviceNowClient.loadWorkspaceIcon}
        onReleaseWorkspaceSettingsPreviewObjectUrl={releaseWorkspaceSettingsOwnedPreviewObjectUrl}
        mode={appHeaderMode}
        onDismissPendingChangesPublishToast={clearWorkspacePublishToast}
        onOpenMyWorkspaces={openLauncher}
        onOpenWorkspace={openWorkspace}
        onOpenWorkspaceSettings={route.mode === "workspace" ? openCurrentWorkspaceSettingsPanel : undefined}
        onOpenPendingPage={route.mode === "workspace" ? openWorkspacePage : undefined}
        onSelectBreadcrumb={route.mode === "workspace" ? openWorkspacePage : undefined}
        onToggleSidebar={route.mode === "workspace" ? () => setSidebarCollapsed((collapsed) => !collapsed) : undefined}
        recentWorkspaces={recentWorkspaceItems}
        saveStatus={appHeaderWorkspaceMode === "edit" && renderedEditorSession ? editorStatusLabel as EditorTransitionState["status"] : undefined}
        pendingChanges={pendingChangesResult}
        pendingChangesDiscardAllErrorMessage={workspaceDiscardAllErrorMessage}
        pendingChangesDiscardAllAffectedPageCount={workspaceDiscardAllAffectedPageCount}
        pendingChangesDiscardAllRetryable={workspaceDiscardAllRetryable}
        pendingChangesDiscarding={workspaceDiscardAllInProgress}
        pendingChangesDiscardPageErrorMessage={workspaceDiscardPageErrorMessage}
        pendingChangesDiscardPagePendingPageSysId={workspaceDiscardPageInProgress ? workspaceDiscardPageTargetPageSysId : ""}
        pendingChangesDiscardPageRetryable={workspaceDiscardPageRetryable}
        pendingChangesDiscardPageTargetPageSysId={workspaceDiscardPageTargetPageSysId}
        pendingChangesErrorMessage={pendingChangesState.status === "error" ? pendingChangesState.errorMessage : ""}
        pendingChangesLoading={pendingChangesState.status === "loading"}
        pendingChangesPublishErrorMessage={workspacePublishErrorMessage}
        pendingChangesPublishRetryable={workspacePublishRetryable}
        pendingChangesPublishing={workspacePublishInProgress}
        pendingChangesReadinessMessage={pendingChangesReadinessMessage}
        pendingChangesRefreshing={pendingChangesState.status === "refreshing"}
        onDiscardAllPendingChanges={discardAllWorkspacePendingChanges}
        onDiscardPendingPage={discardPendingWorkspacePage}
        onPublishPendingChanges={publishWorkspacePendingChanges}
        onRetryPendingChanges={requestPendingChangesRefresh}
        pendingChangesPublishToastMessage={workspacePublishToastMessage}
        pendingChangesUndoBlockedPageSysId={pendingChangesUndoBlockedPageSysId}
        showEditModeToggle={appHeaderShowEditToggle}
        showAuthoringSurfaceToggle={appHeaderShowAuthoringSurfaceToggle}
        authoringSurface={appHeaderAuthoringSurface}
        authoringSurfaceLocked={appHeaderAuthoringSurfaceLocked}
        onAuthoringSurfaceChange={changeAuthoringSurface}
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
              editorCanonicalEnvelope={editorGetCanonicalEnvelopeRef.current?.() ?? null}
              authoringSurface={currentWorkspaceAuthoringSurface}
              markdownSourceEditable={appHeaderMarkdownSourceEditable}
              markdownSourceRetryNonce={markdownSourceRetryNonce}
              sourceDiscardNonce={currentWorkspaceMarkdownSourceDiscardNonce}
              sourceSessionPageSysId={currentWorkspaceMarkdownSourceSessionPageSysId}
              onSourceBodyChange={handleSourceBodyChange}
              onSourceDiscardComplete={handleSourceDiscardComplete}
              onSourceDiscardInvalidDraft={handleSourceDiscardInvalidDraft}
              onSourceInvalidChange={handleSourceInvalidChange}
              onSourceTitleChange={handleSourceTitleChange}
              editAccessLost={editAccessLost}
              editorFailure={editorFailure}
              mediaAdapter={workspaceMediaAdapter}
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
              onEditorReadyStateChange={handleEditorReadyStateChange}
              inlineRenameErrorMessage={
                inlineRenamePageId && hasNonOverlayPageSettingsState(pageSettingsState) && pageSettingsState.activeField === "title"
                  ? pageSettingsState.titleError
                  : ""
              }
              inlineRenamePageId={
                inlineRenamePageId &&
                hasNonOverlayPageSettingsState(pageSettingsState) &&
                pageSettingsState.activeField === "title" &&
                cleanText(pageSettingsState.pageSysId) === cleanText(inlineRenamePageId)
                  ? inlineRenamePageId
                  : ""
              }
              inlineRenameValue={
                inlineRenamePageId &&
                hasNonOverlayPageSettingsState(pageSettingsState) &&
                pageSettingsState.activeField === "title" &&
                cleanText(pageSettingsState.pageSysId) === cleanText(inlineRenamePageId)
                  ? pageSettingsState.title
                  : ""
              }
              onInlineCreateTitleChange={updateInlinePageCreateTitle}
              onInlineRenameTitleChange={(value) => updatePageSettingsField("title", value)}
              onModeChange={changeWorkspaceMode}
              onOutlineChange={handleOutlineChange}
              onPageTitleCancel={cancelDirectPageTitleEdit}
              onPageTitleChange={(value) => updatePageSettingsField("title", value)}
              onPageTitleCommit={() => void commitDirectPageTitleEdit()}
              onPageTitleStart={startDirectPageTitleEdit}
              onCancelInlineRename={cancelInlinePageTreeRename}
              onCommitInlineRename={commitInlinePageTreeRename}
              onReturnToMyWorkspaces={openLauncher}
              onReturnToLive={handleReturnToLive}
              onRetryWorkspace={retryWorkspaceProjectionLoad}
              onRetryEditor={() => {
                setEditorFailure(null);
                setEditorRetryNonce((value) => value + 1);
              }}
              onSavePageDraft={(input) => savePageDraftForSession(renderedEditorSession, input)}
              onStatusChange={(state) => handleEditorStatusChange(selectedWorkspacePageId, state)}
              onSelectPage={openWorkspacePage}
              onMovePage={moveWorkspacePage}
              onRequestDeletePage={requestOpenDeletePageSettings}
              onStartInlineRename={startInlinePageTreeRename}
              onShowChildPageCreate={openCreatePageModal}
              onShowCreatePage={() => openCreatePageModal()}
              onTogglePageSettings={requestTogglePageSettings}
              onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              outlinePage={displayedOutlinePage}
              pageSettingsOpenPageId={pageSettingsState.panelOpen ? pageSettingsState.pageSysId : ""}
              pageSettingsOverlay={
                <PageSettingsOverlay
                  activeField={pageSettingsState.activeField}
                  canManagePageSettings={canManagePageSettings}
                  generalError={pageSettingsState.generalError}
                  noticeMessage={pageSettingsState.noticeMessage}
                  open={pageSettingsState.panelOpen}
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
                  onRequestDelete={() => requestOpenDeletePageSettings(pageSettingsStateRef.current.pageSysId)}
                  onStartField={startPageSettingsField}
                />
              }
              workspaceSettingsOverlay={
                <>
                  <WorkspaceSettingsOverlay
                    deleteErrorMessage={workspaceDeletionState.status === "error" ? workspaceDeletionState.errorMessage : ""}
                    deletePending={workspaceDeletionState.status === "deleting"}
                    errorMessage={workspaceSettingsPanelState.status === "open" ? workspaceSettingsPanelState.errorMessage : undefined}
                    loadUploadedIcon={serviceNowClient.loadWorkspaceIcon}
                    open={workspaceSettingsPanelState.status !== "closed"}
                    pending={workspaceSettingsPanelState.status === "saving"}
                    recoveryInput={workspaceSettingsPanelState.status === "open" ? workspaceSettingsPanelState.recoveryInput : undefined}
                    workspace={workspaceSettingsPanelWorkspace}
                    onCancel={() => {
                      setWorkspaceSettingsPanelState({ status: "closed" });
                      setWorkspaceSettingsPreviewIdentity(null);
                      setWorkspaceDeletionState({ status: "idle" });
                    }}
                    onConfirmDelete={confirmDeleteCurrentWorkspace}
                    onDraftIdentityChange={handleWorkspaceSettingsDraftIdentityChange}
                    onManageAccess={openManageAccessFromSettings}
                    onCleanupStagedIcon={(input) => {
                      void serviceNowClient.cleanupWorkspaceSettingsIcon?.(input).catch(() => {
                        // Staged-icon cleanup is intentionally best effort.
                      });
                    }}
                    onUploadIcon={serviceNowClient.uploadWorkspaceIcon}
                    onSubmit={submitWorkspaceSettings}
                  />
                  <WorkspaceManageAccessOverlay
                    loadMembers={loadManageAccessMembers}
                    onBack={() => {
                      setManageAccessOpen(false);
                      openCurrentWorkspaceSettingsPanel();
                    }}
                    onClose={() => {
                      setManageAccessOpen(false);
                      setWorkspaceSettingsPanelState({ status: "closed" });
                      setWorkspaceSettingsPreviewIdentity(null);
                      setWorkspaceDeletionState({ status: "idle" });
                    }}
                    onMutationCommitted={refreshCurrentWorkspaceCapabilityState}
                    open={manageAccessOpen && Boolean(workspaceStateData?.canManageWorkspaceMembers)}
                    removeMemberAccess={removeManageAccessMember}
                    searchUsers={searchManageAccessUsers}
                    setMemberAccess={setManageAccessMember}
                    workspace={workspaceStateData}
                  />
                </>
              }
              pageTitleActive={
                !inlineRenamePageId &&
                pageSettingsState.open &&
                pageSettingsState.pageSysId === displayedSelectedPageId &&
                pageSettingsState.activeField === "title" &&
                currentWorkspaceAuthoringSurface === "visual"
              }
              pageTitleSaveError={
                pageSettingsState.open &&
                !pageSettingsState.panelOpen &&
                pageSettingsState.pageSysId === displayedSelectedPageId
                  ? pageSettingsState.generalError
                  : ""
              }
              pageTitleValidationError={
                pageSettingsState.open && pageSettingsState.pageSysId === displayedSelectedPageId ? pageSettingsState.titleError : ""
              }
              pageTitleValue={
                pageSettingsState.open && pageSettingsState.pageSysId === displayedSelectedPageId
                  ? pageSettingsState.title
                  : displayedSelectedPageView?.title
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
              loadMedia={workspaceMediaAdapter?.load}
              workspaceNavWidth={workspaceNavWidth}
              workspaceTocAvailable={workspaceState.status === "success" ? workspaceState.data.layout?.tocVisible ?? true : true}
              onSidebarCollapsedChange={setSidebarCollapsed}
              onWorkspaceNavWidthChange={setWorkspaceNavWidth}
              theme={theme}
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
            <DirtyTransitionDialog
              destructiveActionLabel="Discard and switch"
              message="Returning to Visual will discard the invalid Markdown draft and restore the last valid document."
              open={invalidMarkdownSurfaceSwitchOpen}
              secondaryActionLabel="Stay in Markdown"
              title="Invalid Markdown"
              onDiscard={handleDiscardInvalidMarkdownAndSwitchToVisual}
              onStay={handleStayInInvalidMarkdownSource}
            />
          </>
        ) : (
          <MyWorkspacesScreen
            canCreateWorkspaces={canCreateWorkspaces}
            createModal={{
              errorMessage: createModalError,
              onClose: () => {
                setCreateModalOpen(false);
                setCreateModalError(undefined);
                setCreateModalPhase("idle");
              },
              onSubmit: submitWorkspaceCreation,
              onUploadIcon: serviceNowClient.uploadWorkspaceIcon,
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
            loadUploadedIcon={serviceNowClient.loadWorkspaceIcon}
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




