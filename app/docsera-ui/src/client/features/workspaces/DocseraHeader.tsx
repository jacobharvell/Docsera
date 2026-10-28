import { useDropdownExitPresence } from "./useDropdownExitPresence";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Code2, Eye } from "lucide-react";
import type { PingResult, WorkspaceMode, WorkspacePendingChangesResult, WorkspaceViewRecord } from "../../shared/types/docsera";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import {
  DocseraBrandIcon,
  DoubleChevronIcon,
  GearIcon,
  MoonIcon,
  SidebarToggleIcon,
  UndoIcon,
  SunIcon
} from "./DocseraHeaderIcons";
import { RecentWorkspacesMenu, type RecentWorkspaceItem } from "./RecentWorkspacesMenu";
import { WorkspaceIconBadge, type WorkspaceUploadedIconLoader } from "./WorkspacePrimitives";
import type { WorkspacePageView } from "./workspaceViewModels";
import type { WorkspaceAuthoringSurface } from "./workspaceAuthoringSurface";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";
import type { ContentRevealState } from "./contentReveal";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type CurrentPageSaveStatus = "Unsaved" | "Saving…" | "Saved" | "Changes not saved";

function listFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) {
    return [];
  }
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((candidate) => !candidate.hasAttribute("disabled") && candidate.getAttribute("aria-hidden") !== "true");
}

export type HeaderIdentity =
  | (Pick<WorkspaceViewRecord, "icon" | "name"> & {
      kind: "docsera" | "workspace";
      ownedPreviewObjectUrl?: string;
    })
  | {
      kind: "workspace-loading";
    };

type DocseraHeaderProps = {
  breadcrumbs?: WorkspacePageView[];
  currentWorkspaceSlug?: string;
  currentUser?: (Pick<PingResult, "userDisplayName" | "userName"> & Partial<Pick<PingResult, "userAvatarPath">>) | null;
  identity: HeaderIdentity;
  mode: "launcher" | "workspace";
  onOpenMyWorkspaces: () => void;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings?: () => void;
  onReleaseWorkspaceSettingsPreviewObjectUrl?: (objectUrl: string) => void;
  onSelectBreadcrumb?: (pageId: string) => void;
  onToggleSidebar?: () => void;
  recentWorkspaces: RecentWorkspaceItem[];
  pendingChanges?: WorkspacePendingChangesResult | null;
  pendingChangesLoading?: boolean;
  pendingChangesDiscardAllAffectedPageCount?: number;
  pendingChangesDiscardAllErrorMessage?: string;
  pendingChangesDiscardAllRetryable?: boolean;
  pendingChangesDiscarding?: boolean;
  pendingChangesDiscardPageErrorMessage?: string;
  pendingChangesDiscardPagePendingPageSysId?: string;
  pendingChangesDiscardPageRetryable?: boolean;
  pendingChangesDiscardPageTargetPageSysId?: string;
  pendingChangesPublishErrorMessage?: string;
  pendingChangesPublishRetryable?: boolean;
  pendingChangesPublishToastMessage?: string;
  pendingChangesPublishing?: boolean;
  pendingChangesReadinessMessage?: string;
  pendingChangesRefreshing?: boolean;
  pendingChangesErrorMessage?: string;
  saveStatus?: CurrentPageSaveStatus;
  onRetryCurrentPageSave?: () => void;
  onDiscardCurrentPageEdits?: () => void;
  onDismissPendingChangesPublishToast?: () => void;
  onOpenPendingPage?: (pageSysId: string) => void;
  onDiscardAllPendingChanges?: () => void;
  onDiscardPendingPage?: (pageSysId: string) => void;
  onPublishPendingChanges?: () => void;
  onRetryPendingChanges?: () => void;
  pendingChangesUndoBlockedPageSysId?: string;
  showEditModeToggle?: boolean;
  showAuthoringSurfaceToggle?: boolean;
  showWorkspaceMode?: WorkspaceMode;
  authoringSurface?: WorkspaceAuthoringSurface;
  authoringSurfaceLocked?: boolean;
  onAuthoringSurfaceChange?: (surface: WorkspaceAuthoringSurface) => void;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  showWorkspaceSwitcher?: boolean;
  showMyWorkspacesFooter?: boolean;
  showWorkspaceSettings?: boolean;
  workspaceControlsLocked?: boolean;
  sidebarCollapsed?: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  workspaceNavWidth?: number;
  contentRevealState?: ContentRevealState;
};

function getCurrentUserInitials(currentUser: Pick<PingResult, "userDisplayName" | "userName">): string {
  const source = cleanText(currentUser.userDisplayName) || cleanText(currentUser.userName);
  if (!source) {
    return "";
  }

  const words = source
    .replace(/[_@.]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const initials = words.length > 1 ? `${words[0]![0]}${words[words.length - 1]![0]}` : words[0]!.slice(0, 2);
  return initials.toUpperCase();
}

function navigateToNativeLogout(): void {
  window.location.assign("/logout.do");
}

function PublishChevron({ open }: { open: boolean }) {
  return (
    <span className={`docsera-header__publish-chevron${open ? " docsera-header__publish-chevron--open" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    </span>
  );
}

function PublishSuccessIcon() {
  return (
    <span className="docsera-header__publish-toast-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" focusable="false">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6.5 10.2l2.2 2.3 4.8-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    </span>
  );
}

function SavingCloudSyncIcon() {
  return (
    <svg
      className="docsera-header__save-status-icon docsera-header__save-status-icon--saving"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      focusable="false"
      aria-hidden="true"
    >
      {/* Split from Lucide CloudSync so the cloud stays fixed while only the sync arrows animate. */}
      <path
        className="docsera-header__save-status-cloud"
        d="M20.996 15.251A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <g className="docsera-header__save-status-sync">
        <path d="m17 18-1.535 1.605a5 5 0 0 1-8-1.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M17 22v-4h-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M7 10v4h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="m7 14 1.535-1.605a5 5 0 0 1 8 1.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </g>
    </svg>
  );
}

function CurrentPageSaveStatusIndicator({
  status,
  onRetry,
  onDiscard
}: {
  status: CurrentPageSaveStatus;
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const [failedSavePopoverOpen, setFailedSavePopoverOpen] = useState(false);
  const label =
    status === "Unsaved"
      ? "Current page has unsaved changes"
      : status === "Saving…"
        ? "Saving current page"
        : status === "Changes not saved"
          ? "Current page changes could not be saved"
          : "Current page changes saved";

  const statusClass =
    status === "Unsaved"
      ? "unsaved"
      : status === "Saving…"
        ? "saving"
        : status === "Changes not saved"
          ? "failed"
          : "saved";

  useEffect(() => {
    setFailedSavePopoverOpen(status === "Changes not saved");
  }, [status]);

  if (status === "Changes not saved") {
    return (
      <span className="docsera-header__save-status-anchor">
        <DocseraCompactTooltip label={label}>
          <button
            type="button"
            className={`docsera-header__save-status docsera-header__save-status--${statusClass} docsera-header__save-status-trigger`}
            aria-expanded={failedSavePopoverOpen}
            aria-haspopup="dialog"
            aria-label={label}
            onClick={() => setFailedSavePopoverOpen((open) => !open)}
          >
            <span className="docsera-header__save-status-icon-slot" aria-hidden="true">
              <DocseraIcon className="docsera-header__save-status-icon" icon={docseraIcons.cloudAlert} size={20} strokeWidth={2} />
            </span>
          </button>
        </DocseraCompactTooltip>
        {failedSavePopoverOpen ? (
          <span className="docsera-header__save-failure-popover" role="dialog" aria-label="Save failed">
            <span>Failed to save changes.</span>
            <span className="docsera-header__save-failure-actions">
              <button type="button" onClick={onRetry}>Retry</button>
              <button type="button" className="docsera-header__save-failure-discard" onClick={onDiscard}>Discard edits</button>
            </span>
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <DocseraCompactTooltip label={label}>
      <span
        className={`docsera-header__save-status docsera-header__save-status--${statusClass}`}
        role="status"
        aria-atomic="true"
        aria-live="polite"
        aria-label={label}
        tabIndex={0}
      >
        <span className="docsera-header__save-status-icon-slot" aria-hidden="true">
          {status === "Saving…" ? (
            <SavingCloudSyncIcon />
          ) : (
            <DocseraIcon
              className="docsera-header__save-status-icon"
              icon={
                status === "Unsaved"
                  ? docseraIcons.cloudOff
                    : docseraIcons.cloudCheck
              }
              size={20}
              strokeWidth={2}
            />
          )}
        </span>
        <span className="docsera-header__save-status-sr-only">{label}</span>
      </span>
    </DocseraCompactTooltip>
  );
}

function HeaderIdentityIcon({
  identity,
  loadUploadedIcon,
  onReleaseWorkspaceSettingsPreviewObjectUrl
}: {
  identity: HeaderIdentity;
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  onReleaseWorkspaceSettingsPreviewObjectUrl?: (objectUrl: string) => void;
}) {
  if (identity.kind === "workspace-loading") {
    return <span className="docsera-header__workspace-icon docsera-header__workspace-icon--empty" aria-hidden="true" />;
  }

  if (identity.kind === "docsera") {
    return (
      <span className="docsera-header__workspace-icon docsera-header__workspace-icon--brand docsera-header__workspace-icon--artwork" aria-hidden="true">
        <DocseraBrandIcon />
      </span>
    );
  }

  return (
    <WorkspaceIconBadge
      workspace={identity}
      className="docsera-header__workspace-icon"
      loadUploadedIcon={loadUploadedIcon}
      ownedExternalObjectUrl={"ownedPreviewObjectUrl" in identity ? identity.ownedPreviewObjectUrl : undefined}
      onReleaseOwnedExternalObjectUrl={onReleaseWorkspaceSettingsPreviewObjectUrl}
    />
  );
}

export function DocseraHeader({
  breadcrumbs = [],
  currentWorkspaceSlug = "",
  currentUser = null,
  identity,
  loadUploadedIcon,
  mode,
  onOpenMyWorkspaces,
  onOpenWorkspace,
  onOpenWorkspaceSettings,
  onReleaseWorkspaceSettingsPreviewObjectUrl,
  onDismissPendingChangesPublishToast,
  onDiscardCurrentPageEdits,
  onOpenPendingPage,
  onDiscardAllPendingChanges,
  onSelectBreadcrumb,
  onToggleSidebar,
  onRetryPendingChanges,
  onRetryCurrentPageSave,
  pendingChanges = null,
  pendingChangesDiscardAllAffectedPageCount,
  pendingChangesDiscardAllErrorMessage = "",
  pendingChangesDiscardAllRetryable = false,
  pendingChangesDiscarding = false,
  pendingChangesDiscardPageErrorMessage = "",
  pendingChangesDiscardPagePendingPageSysId = "",
  pendingChangesDiscardPageRetryable = false,
  pendingChangesDiscardPageTargetPageSysId = "",
  pendingChangesErrorMessage = "",
  pendingChangesLoading = false,
  pendingChangesPublishErrorMessage = "",
  pendingChangesPublishRetryable = false,
  pendingChangesPublishToastMessage = "",
  pendingChangesPublishing = false,
  pendingChangesReadinessMessage = "",
  pendingChangesRefreshing = false,
  recentWorkspaces,
  saveStatus,
  onDiscardPendingPage,
  onPublishPendingChanges,
  pendingChangesUndoBlockedPageSysId = "",
  showEditModeToggle = false,
  showAuthoringSurfaceToggle = false,
  showWorkspaceMode = "live",
  authoringSurface = "visual",
  authoringSurfaceLocked = false,
  onAuthoringSurfaceChange,
  onWorkspaceModeChange,
  showWorkspaceSwitcher = recentWorkspaces.length > 0,
  showMyWorkspacesFooter = true,
  showWorkspaceSettings = false,
  workspaceControlsLocked = false,
  sidebarCollapsed = false,
  theme,
  onToggleTheme,
  workspaceNavWidth,
  contentRevealState = "idle"
}: DocseraHeaderProps) {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const workspacePresence = useDropdownExitPresence(workspaceMenuOpen ? true : null);
  const accountPresence = useDropdownExitPresence(accountMenuOpen ? true : null);
  const changesPresence = useDropdownExitPresence(changesOpen ? true : null);
  const [discardAllModalOpen, setDiscardAllModalOpen] = useState(false);
  const [discardPageTarget, setDiscardPageTarget] = useState<{ pageSysId: string; title: string } | null>(null);
  const [failedProfileAvatarPath, setFailedProfileAvatarPath] = useState("");
  const [changesCenterStyle, setChangesCenterStyle] = useState<CSSProperties | undefined>(undefined);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const publishPanelRef = useRef<HTMLDivElement>(null);
  const changesCenterRef = useRef<HTMLElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const discardActionRef = useRef<HTMLButtonElement>(null);
  const discardPrimaryButtonRef = useRef<HTMLButtonElement>(null);
  const discardModalPanelRef = useRef<HTMLDivElement>(null);
  const discardModalOriginRef = useRef<HTMLElement | null>(null);
  const discardModalReturnFocusRef = useRef(false);
  const canSwitchWorkspaces = showWorkspaceSwitcher;
  const workspaceButtonLabel =
    identity.kind === "workspace-loading"
      ? canSwitchWorkspaces
        ? "Workspace switcher loading"
        : "Loading workspace"
      : canSwitchWorkspaces
        ? `Workspace switcher: ${identity.name}`
        : mode === "launcher"
          ? "Docsera"
          : identity.name;
  const currentPage = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;
  const parentPages = currentPage ? breadcrumbs.slice(0, -1) : [];
  const pendingRows = pendingChanges?.state === "succeeded" ? pendingChanges.rows : [];
  const pendingCount = pendingChanges?.state === "succeeded"
    ? pendingChanges.affectedPageCount
    : pendingChangesDiscardAllAffectedPageCount ?? pendingRows.length;
  const discardModalOpen = discardAllModalOpen || discardPageTarget !== null;
  const pendingChangesDiscardPagePending = Boolean(pendingChangesDiscardPagePendingPageSysId);
  const pendingChangesAnyDiscarding = pendingChangesDiscarding || pendingChangesDiscardPagePending;
  const hasPendingChanges = pendingChanges?.state === "succeeded" && pendingCount > 0;
  const showPublishControl = mode === "workspace" && showWorkspaceMode === "edit" && showEditModeToggle;
  const countText = `${pendingCount} ${pendingCount === 1 ? "page" : "pages"}`;
  const hasPendingError = Boolean(pendingChangesErrorMessage) || pendingChanges?.state === "failed";
  const hasDiscardAllError = Boolean(pendingChangesDiscardAllErrorMessage);
  const hasDiscardPageError = Boolean(pendingChangesDiscardPageErrorMessage);
  const hasPublishError = Boolean(pendingChangesPublishErrorMessage);
  const workspaceModeChange = onWorkspaceModeChange;
  const authoringSurfaceChange = onAuthoringSurfaceChange;
  const showWorkspaceModeToggle = mode === "workspace" && showEditModeToggle && Boolean(onWorkspaceModeChange);
  const showAuthoringSurfaceToggleControl = mode === "workspace" && showAuthoringSurfaceToggle && Boolean(onAuthoringSurfaceChange);
  const reserveAuthoringControlFootprint = showWorkspaceModeToggle;
  const canOpenChanges =
    (hasPendingChanges || hasPendingError || hasDiscardAllError || hasDiscardPageError || hasPublishError || pendingChangesPublishing || pendingChangesAnyDiscarding) &&
    (!workspaceControlsLocked || pendingChangesPublishing || pendingChangesAnyDiscarding || pendingChangesDiscardAllRetryable || pendingChangesDiscardPageRetryable);
  const canPublishChanges =
    hasPendingChanges &&
    !hasPendingError &&
    !pendingChangesLoading &&
    !pendingChangesRefreshing &&
    !pendingChangesPublishing &&
    !pendingChangesAnyDiscarding &&
    (!hasPublishError || pendingChangesPublishRetryable) &&
    !pendingChangesReadinessMessage &&
    Boolean(onPublishPendingChanges);
  const canDiscardChanges =
    hasPendingChanges &&
    !hasPendingError &&
    !pendingChangesLoading &&
    !pendingChangesRefreshing &&
    !pendingChangesPublishing &&
    !pendingChangesAnyDiscarding &&
    !pendingChangesReadinessMessage &&
    Boolean(onDiscardAllPendingChanges);
  const canOpenDiscardAllModal =
    !pendingChangesPublishing &&
    !pendingChangesAnyDiscarding &&
    Boolean(onDiscardAllPendingChanges) &&
    (canDiscardChanges || pendingChangesDiscardAllRetryable);
  const discardPageModalTitle = discardPageTarget?.title || "this page";
  const discardPageBody = `Are you sure you want to discard changes to “${discardPageModalTitle}”? This action cannot be undone.`;
  const discardAllBody = pendingCount === 1
    ? "Are you sure you want to discard 1 change? This action cannot be undone."
    : `Are you sure you want to discard ${pendingCount} changes? This action cannot be undone.`;

  const showCurrentPageSaveStatus = showPublishControl && Boolean(saveStatus);
  const currentUserDisplayName = currentUser ? cleanText(currentUser.userDisplayName) : "";
  const currentUserName = currentUser ? cleanText(currentUser.userName) : "";
  const currentUserInitials = currentUser ? getCurrentUserInitials(currentUser) : "";
  const currentUserAvatarPath = currentUser ? cleanText(currentUser.userAvatarPath) : "";
  const showCurrentUserAvatar = Boolean(currentUserAvatarPath) && currentUserAvatarPath !== failedProfileAvatarPath;
  const currentUserAvailable = Boolean(currentUserDisplayName || currentUserName);

  useLayoutEffect(() => {
    if (!changesOpen || typeof window === "undefined") {
      if (!changesPresence.item) setChangesCenterStyle(undefined);
      return;
    }

    const updateChangesCenterStyle = () => {
      const publishButton = publishButtonRef.current;
      if (!publishButton) {
        setChangesCenterStyle(undefined);
        return;
      }

      const buttonRect = publishButton.getBoundingClientRect();
      const right = Math.max(16, window.innerWidth - buttonRect.right);
      setChangesCenterStyle({
        position: "fixed",
        right: `${right}px`,
        top: `${Math.max(0, buttonRect.bottom + 8)}px`
      });
    };

    updateChangesCenterStyle();
    window.addEventListener("resize", updateChangesCenterStyle);
    window.addEventListener("scroll", updateChangesCenterStyle, true);
    return () => {
      window.removeEventListener("resize", updateChangesCenterStyle);
      window.removeEventListener("scroll", updateChangesCenterStyle, true);
    };
  }, [changesOpen, changesPresence.item, pendingChangesPublishToastMessage, showCurrentPageSaveStatus]);

  useEffect(() => {
    if (!workspaceMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (workspaceMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setWorkspaceMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [workspaceMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setAccountMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!changesOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-docsera-changes-center-trigger='true']")) {
        return;
      }
      if (publishPanelRef.current?.contains(event.target as Node)) {
        return;
      }
      if (changesCenterRef.current?.contains(event.target as Node)) {
        return;
      }
      if (pendingChangesPublishing || pendingChangesAnyDiscarding || discardModalOpen) {
        return;
      }

      setChangesOpen(false);
      publishButtonRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingChangesPublishing || pendingChangesAnyDiscarding) {
          return;
        }
        if (discardModalOpen) {
          return;
        }
        setChangesOpen(false);
        publishButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [changesOpen, discardModalOpen, pendingChangesAnyDiscarding, pendingChangesPublishing]);

  useEffect(() => {
    setChangesOpen(false);
    setDiscardAllModalOpen(false);
    setDiscardPageTarget(null);
  }, [currentWorkspaceSlug, showWorkspaceMode]);

  useEffect(() => {
    if (!changesOpen || pendingChangesPublishing || pendingChangesAnyDiscarding || pendingChangesLoading || pendingChangesRefreshing || hasPendingError || hasPublishError) {
      return;
    }
    if (pendingChanges?.state === "succeeded" && pendingChanges.affectedPageCount === 0) {
      setDiscardAllModalOpen(false);
      setDiscardPageTarget(null);
      setChangesOpen(false);
      publishButtonRef.current?.focus();
    }
  }, [changesOpen, hasPendingError, hasPublishError, pendingChanges, pendingChangesAnyDiscarding, pendingChangesLoading, pendingChangesPublishing, pendingChangesRefreshing]);

  useEffect(() => {
    if (!discardModalOpen) {
      if (discardModalReturnFocusRef.current) {
        discardModalReturnFocusRef.current = false;
        if (discardModalOriginRef.current?.isConnected) {
          discardModalOriginRef.current.focus();
        } else {
          discardActionRef.current?.focus();
        }
      }
      return;
    }
    discardPrimaryButtonRef.current?.focus();
  }, [discardModalOpen]);

  useEffect(() => {
    if (!discardModalOpen) {
      return;
    }

    const focusFirstModalElement = () => {
      const [firstFocusable] = listFocusableElements(discardModalPanelRef.current);
      firstFocusable?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingChangesAnyDiscarding) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        discardModalReturnFocusRef.current = true;
        setDiscardAllModalOpen(false);
        setDiscardPageTarget(null);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusable = listFocusableElements(discardModalPanelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1]?.focus();
        }
        return;
      }

      if (currentIndex === -1 || currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (discardModalPanelRef.current?.contains(event.target as Node)) {
        return;
      }
      focusFirstModalElement();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [discardModalOpen, pendingChangesAnyDiscarding]);

  useEffect(() => {
    if (!discardPageTarget || pendingChangesDiscardPagePending || pendingChangesDiscardPageErrorMessage) {
      return;
    }
    if (pendingRows.some((row) => row.pageSysId === discardPageTarget.pageSysId)) {
      return;
    }
    discardModalReturnFocusRef.current = true;
    setDiscardPageTarget(null);
  }, [discardPageTarget, pendingChangesDiscardPageErrorMessage, pendingChangesDiscardPagePending, pendingRows]);

  const headerClassName = `docsera-header${mode === "launcher" ? " docsera-header--launcher" : ""}${mode === "workspace" && showWorkspaceMode === "live" ? " docsera-header--live" : ""}${mode === "workspace" && sidebarCollapsed ? " docsera-header--sidebar-collapsed" : ""}`;

  return (
    <header
      className={headerClassName}
      style={
        mode === "workspace" && workspaceNavWidth
          ? ({
              "--docsera-workspace-nav-track-width": sidebarCollapsed ? "0px" : `${workspaceNavWidth}px`,
              "--docsera-workspace-nav-width": `${workspaceNavWidth}px`
            } as CSSProperties)
          : undefined
      }
    >
      <div className="docsera-header__workspace">
        {mode === "workspace" && sidebarCollapsed ? null : (
          <div className="docsera-header__workspace-panel" ref={workspaceMenuRef}>
            <button
              type="button"
              className={`docsera-header__workspace-button${canSwitchWorkspaces ? "" : " docsera-header__workspace-button--static"}`}
              aria-expanded={canSwitchWorkspaces ? workspaceMenuOpen : undefined}
              aria-haspopup={canSwitchWorkspaces ? "menu" : undefined}
              aria-label={workspaceButtonLabel}
              disabled={!canSwitchWorkspaces}
              onClick={() => {
                if (!canSwitchWorkspaces) {
                  return;
                }

                setAccountMenuOpen(false);
                setWorkspaceMenuOpen((current) => !current);
              }}
            >
              <HeaderIdentityIcon identity={identity} loadUploadedIcon={loadUploadedIcon} onReleaseWorkspaceSettingsPreviewObjectUrl={onReleaseWorkspaceSettingsPreviewObjectUrl} />
              <div className="docsera-header__workspace-copy">
                {identity.kind === "workspace-loading" ? (
                  <span className="docsera-header__workspace-name-skeleton" aria-hidden="true" />
                ) : (
                  <span className="docsera-header__workspace-name" title={identity.name}>
                    {identity.name}
                  </span>
                )}
              </div>
              {canSwitchWorkspaces ? <DoubleChevronIcon /> : null}
            </button>

            {workspacePresence.item ? (
              <RecentWorkspacesMenu
                open={workspacePresence.open}
                currentWorkspaceSlug={currentWorkspaceSlug}
                items={recentWorkspaces}
                loadUploadedIcon={loadUploadedIcon}
                showMyWorkspacesFooter={showMyWorkspacesFooter}
                onOpenMyWorkspaces={() => {
                  setWorkspaceMenuOpen(false);
                  onOpenMyWorkspaces();
                }}
                onOpenWorkspace={(workspaceSlug) => {
                  setWorkspaceMenuOpen(false);
                  onOpenWorkspace(workspaceSlug);
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="docsera-header__bar">
        <div className="docsera-header__leading">
          {mode === "workspace" && onToggleSidebar ? (
            <DocseraCompactTooltip label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>
              <button
                type="button"
                className="docsera-header__ghost-button docsera-header__ghost-button--sidebar-toggle"
                onClick={onToggleSidebar}
                aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              >
                <SidebarToggleIcon collapsed={sidebarCollapsed} />
              </button>
            </DocseraCompactTooltip>
          ) : null}

          {mode === "workspace" && currentPage ? (
            <nav className="docsera-breadcrumbs" aria-label="Page breadcrumbs">
              {parentPages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  className="docsera-breadcrumbs__item"
                  onClick={() => onSelectBreadcrumb?.(page.id)}
                >
                  {page.title}
                </button>
              ))}
              <span className="docsera-breadcrumbs__current" aria-current="page">
                {currentPage.title}
              </span>
            </nav>
          ) : null}
        </div>

        <div className="docsera-header__actions" aria-label="Header controls">
          <div className="docsera-header__action-slot docsera-header__action-slot--mode">
            {showWorkspaceModeToggle ? (
              <div
                className={`docsera-header__mode-toggle docsera-header__mode-toggle--${showWorkspaceMode}`}
                role="group"
                aria-label="Workspace mode"
              >
                <span className="docsera-header__segmented-indicator" aria-hidden="true" />
                <button
                  type="button"
                  className={`docsera-header__mode-segment${showWorkspaceMode === "live" ? " docsera-header__mode-segment--active" : ""}`}
                  aria-pressed={showWorkspaceMode === "live"}
                  disabled={workspaceControlsLocked}
                  onClick={() => workspaceModeChange?.("live")}
                >
                  Live
                </button>
                <button
                  type="button"
                  className={`docsera-header__mode-segment${showWorkspaceMode === "edit" ? " docsera-header__mode-segment--active" : ""}`}
                  aria-pressed={showWorkspaceMode === "edit"}
                  disabled={workspaceControlsLocked}
                  onClick={() => workspaceModeChange?.("edit")}
                >
                  Edit
                </button>
              </div>
            ) : (
              <span className="docsera-header__action-slot-placeholder" aria-hidden="true" />
            )}
          </div>
          {showWorkspaceModeToggle ? (
            <span
              className={`docsera-header__action-divider docsera-header__action-divider--mode-surface${showAuthoringSurfaceToggleControl ? "" : " docsera-header__action-divider--hidden"}`}
              aria-hidden="true"
            />
          ) : null}
          <div className="docsera-header__action-slot docsera-header__action-slot--surface">
            {reserveAuthoringControlFootprint ? (
              <div
                className={`docsera-header__surface-toggle docsera-header__surface-toggle--${authoringSurface}${showAuthoringSurfaceToggleControl ? "" : " docsera-header__surface-toggle--hidden"}`}
                role="group"
                aria-label="Authoring surface"
                aria-hidden={showAuthoringSurfaceToggleControl ? undefined : "true"}
                {...(!showAuthoringSurfaceToggleControl ? { inert: "" } : {})}
              >
                <span className="docsera-header__segmented-indicator" aria-hidden="true" />
                <DocseraCompactTooltip label="Visual">
                  <button
                    type="button"
                    className={`docsera-header__surface-segment${authoringSurface === "visual" ? " docsera-header__surface-segment--active" : ""}`}
                    aria-pressed={authoringSurface === "visual"}
                    aria-label="Visual"
                    disabled={authoringSurfaceLocked || !showAuthoringSurfaceToggleControl}
                    onClick={() => authoringSurfaceChange?.("visual")}
                  >
                    <Eye aria-hidden="true" focusable="false" size={16} strokeWidth={2} />
                  </button>
                </DocseraCompactTooltip>
                <DocseraCompactTooltip label="Markdown">
                  <button
                    type="button"
                    className={`docsera-header__surface-segment${authoringSurface === "markdown" ? " docsera-header__surface-segment--active" : ""}`}
                    aria-pressed={authoringSurface === "markdown"}
                    aria-label="Markdown"
                    disabled={authoringSurfaceLocked || !showAuthoringSurfaceToggleControl}
                    onClick={() => authoringSurfaceChange?.("markdown")}
                  >
                    <Code2 aria-hidden="true" focusable="false" size={16} strokeWidth={2} />
                  </button>
                </DocseraCompactTooltip>
              </div>
            ) : (
              <span className="docsera-header__action-slot-placeholder" aria-hidden="true" />
            )}
          </div>
          {reserveAuthoringControlFootprint ? (
            <div
              className={`docsera-header__publish-panel${showPublishControl ? "" : " docsera-header__publish-panel--hidden"}`}
              ref={publishPanelRef}
              aria-hidden={showPublishControl ? undefined : "true"}
              {...(!showPublishControl ? { inert: "" } : {})}
            >
              {showCurrentPageSaveStatus ? (
                <>
                  <CurrentPageSaveStatusIndicator
                    status={saveStatus as CurrentPageSaveStatus}
                    onDiscard={onDiscardCurrentPageEdits}
                    onRetry={onRetryCurrentPageSave}
                  />
                  <span className="docsera-header__publish-divider" aria-hidden="true" />
                </>
              ) : (
                <>
                  <span className="docsera-header__save-status docsera-header__save-status--reserved" aria-hidden="true" />
                  <span className="docsera-header__publish-divider" aria-hidden="true" />
                </>
              )}
              {pendingChangesPublishToastMessage ? (
                <div className="docsera-header__publish-toast" role="status" aria-atomic="true" aria-live="polite">
                  <PublishSuccessIcon />
                  <span className="docsera-header__publish-toast-message">{pendingChangesPublishToastMessage}</span>
                  <DocseraCompactTooltip label="Dismiss publish success">
                    <button
                      type="button"
                      className="docsera-header__publish-toast-dismiss"
                      aria-label="Dismiss publish success"
                      onClick={onDismissPendingChangesPublishToast}
                    >
                      <svg viewBox="0 0 16 16" width="12" height="12" focusable="false" aria-hidden="true">
                        <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                      </svg>
                    </button>
                  </DocseraCompactTooltip>
                </div>
              ) : null}
              <button
                ref={publishButtonRef}
                type="button"
                data-docsera-changes-center-trigger="true"
                className={`docsera-header__publish-button${hasPendingChanges ? " docsera-header__publish-button--active" : ""}`}
                aria-expanded={changesOpen}
                aria-haspopup="dialog"
                aria-label={hasPendingChanges || hasPendingError ? "Open Changes Center" : "No pending changes to publish"}
                disabled={!showPublishControl || !canOpenChanges}
                onClick={() => {
                  if (!canOpenChanges) {
                    return;
                  }
                  if (pendingChangesPublishing || pendingChangesAnyDiscarding) {
                    setChangesOpen(true);
                    return;
                  }
                  setChangesOpen((current) => !current);
                }}
              >
                Publish
                <PublishChevron open={changesOpen} />
              </button>
              {showPublishControl && changesPresence.item ? (
                typeof document !== "undefined"
                  ? createPortal(
                      <section
                        ref={changesCenterRef}
                        className="docsera-changes-center docsera-changes-center--portal"
                        data-docsera-changes-center="true"
                        data-docsera-dropdown-motion={changesPresence.open ? "enter" : "exit"}
                        {...(!changesPresence.open ? { inert: "" } : {})}
                        aria-hidden={!changesPresence.open || undefined}
                        role="dialog"
                        aria-label="Changes Center"
                        style={changesCenterStyle}
                      >
                        <header className="docsera-changes-center__header">
                          <div>
                            <strong>Changes</strong> <span>{countText}</span>
                          </div>
                          <div className="docsera-changes-center__header-actions">
                            {pendingChangesRefreshing ? <span className="docsera-changes-center__refreshing" role="status">Refreshing</span> : null}
                            <button
                              ref={discardActionRef}
                              type="button"
                              className="docsera-changes-center__header-action"
                              disabled={!canOpenDiscardAllModal}
                              onClick={(event) => {
                                if (!canOpenDiscardAllModal) {
                                  return;
                                }
                                discardModalOriginRef.current = event.currentTarget;
                                setDiscardPageTarget(null);
                                setDiscardAllModalOpen(true);
                              }}
                            >
                              <UndoIcon />
                              <span>Discard all</span>
                            </button>
                          </div>
                        </header>
                        {pendingChangesErrorMessage || pendingChanges?.state === "failed" ? (
                          <div className="docsera-changes-center__state" role="alert">
                            <p>{pendingChangesErrorMessage || (pendingChanges?.state === "failed" ? pendingChanges.errorMessage : "Unable to load pending changes.")}</p>
                            {onRetryPendingChanges ? (
                              <button type="button" className="docsera-changes-center__retry" onClick={onRetryPendingChanges}>
                                Retry
                              </button>
                            ) : null}
                          </div>
                        ) : pendingChangesLoading ? (
                          <div className="docsera-changes-center__state" role="status">Loading changes</div>
                        ) : (
                          <div className="docsera-changes-center__list" role="list" aria-label="Pending pages">
                            {pendingRows.map((row) => {
                              const rowReadinessBlocked = Boolean(pendingChangesUndoBlockedPageSysId) && pendingChangesUndoBlockedPageSysId === row.pageSysId;
                              const canUndoRow =
                                Boolean(onDiscardPendingPage) &&
                                !pendingChangesPublishing &&
                                !pendingChangesAnyDiscarding &&
                                !rowReadinessBlocked;
                              const canNavigateRow =
                                row.navigable &&
                                !pendingChangesPublishing &&
                                !pendingChangesAnyDiscarding &&
                                Boolean(onOpenPendingPage);

                              return (
                                <div key={row.pageSysId} className="docsera-changes-center__row-item" role="listitem">
                                  {row.navigable ? (
                                    <button
                                      type="button"
                                      className="docsera-changes-center__row"
                                      disabled={!canNavigateRow}
                                      onClick={() => {
                                        if (!canNavigateRow) {
                                          return;
                                        }
                                        setChangesOpen(false);
                                        onOpenPendingPage?.(row.pageSysId);
                                      }}
                                    >
                                      <span className="docsera-changes-center__row-copy">
                                        <span className="docsera-changes-center__row-title">{row.title}</span>
                                        <span className="docsera-changes-center__row-meta" title={row.attribution.fullDisplayName} aria-label={row.attribution.accessibleLabel}>
                                          {row.attribution.displayName}
                                        </span>
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="docsera-changes-center__row docsera-changes-center__row--static" aria-disabled="true">
                                      <span className="docsera-changes-center__row-copy">
                                        <span className="docsera-changes-center__row-title">{row.title}</span>
                                        <span className="docsera-changes-center__row-meta" title={row.attribution.fullDisplayName} aria-label={row.attribution.accessibleLabel}>
                                          {row.attribution.displayName}
                                        </span>
                                      </span>
                                    </div>
                                  )}
                                  <div className="docsera-changes-center__row-action">
                                    <span className="docsera-changes-center__row-category" aria-hidden={canUndoRow ? "true" : undefined}>{row.category}</span>
                                    <DocseraCompactTooltip label={`Undo changes to ${row.title}`}>
                                      <button
                                        type="button"
                                        className="docsera-changes-center__row-undo"
                                        aria-label={`Undo changes to ${row.title}`}
                                        disabled={!canUndoRow}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          if (!canUndoRow) {
                                            return;
                                          }
                                          discardModalOriginRef.current = event.currentTarget;
                                          setDiscardAllModalOpen(false);
                                          setDiscardPageTarget({ pageSysId: row.pageSysId, title: row.title });
                                        }}
                                      >
                                        <span className="docsera-changes-center__row-undo-icon" aria-hidden="true">
                                          <UndoIcon />
                                        </span>
                                      </button>
                                    </DocseraCompactTooltip>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {pendingChangesPublishErrorMessage ? (
                          <div className="docsera-changes-center__publish-error" role="alert">{pendingChangesPublishErrorMessage}</div>
                        ) : null}
                        {pendingChangesDiscardAllErrorMessage && !discardModalOpen ? (
                          <div className="docsera-changes-center__publish-error" role="alert">{pendingChangesDiscardAllErrorMessage}</div>
                        ) : null}
                        {pendingChangesDiscardPageErrorMessage && !discardModalOpen ? (
                          <div className="docsera-changes-center__publish-error" role="alert">{pendingChangesDiscardPageErrorMessage}</div>
                        ) : null}
                        {pendingChangesReadinessMessage ? (
                          <div className="docsera-changes-center__blocked" role="status">{pendingChangesReadinessMessage}</div>
                        ) : null}
                        <footer className="docsera-changes-center__footer">
                          <button
                            type="button"
                            className="docsera-modal__primary docsera-changes-center__footer-primary"
                            aria-busy={pendingChangesPublishing || pendingChangesAnyDiscarding ? "true" : undefined}
                            disabled={!canPublishChanges}
                            onClick={onPublishPendingChanges}
                          >
                            <span className="docsera-changes-center__footer-primary-label">
                              {pendingChangesPublishing ? (
                                <span className="docsera-changes-center__spinner" aria-hidden="true" />
                              ) : null}
                              <span>Publish</span>
                            </span>
                          </button>
                        </footer>
                      </section>,
                      document.body
                    )
                  : null
              ) : null}
            </div>
          ) : null}
          <div className="docsera-header__action-slot docsera-header__action-slot--settings">
            {onOpenWorkspaceSettings ? (
              <span
                className={`docsera-header__contextual-control${showWorkspaceSettings ? "" : " docsera-header__contextual-control--hidden"}`}
                aria-hidden={showWorkspaceSettings ? undefined : "true"}
                {...(!showWorkspaceSettings ? { inert: "" } : {})}
              >
                <DocseraCompactTooltip label="Workspace settings">
                  <button
                    type="button"
                    className="docsera-header__ghost-button"
                    aria-label="Workspace settings"
                    disabled={workspaceControlsLocked || !showWorkspaceSettings}
                    onClick={onOpenWorkspaceSettings}
                  >
                    <GearIcon />
                  </button>
                </DocseraCompactTooltip>
              </span>
            ) : <span className="docsera-header__action-slot-placeholder" aria-hidden="true" />}
          </div>
          <DocseraCompactTooltip label="Toggle theme">
            <button
              type="button"
              className="docsera-header__ghost-button docsera-header__ghost-button--theme"
              aria-label="Toggle theme"
              onClick={onToggleTheme}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </DocseraCompactTooltip>
          <div className="docsera-header__account" ref={accountMenuRef}>
            <button
              ref={accountTriggerRef}
              type="button"
              className={`docsera-header__profile${currentUserAvailable ? "" : " docsera-header__profile--placeholder"}${showCurrentUserAvatar ? " docsera-header__profile--avatar" : ""}`}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-label={currentUserAvailable ? `Current user: ${currentUserDisplayName || currentUserName}` : "Current user loading"}
              onClick={() => {
                setWorkspaceMenuOpen(false);
                setAccountMenuOpen((current) => !current);
              }}
            >
              {showCurrentUserAvatar ? (
                <img
                  className="docsera-header__profile-avatar"
                  src={currentUserAvatarPath}
                  alt=""
                  aria-hidden="true"
                  onError={() => {
                    setFailedProfileAvatarPath(currentUserAvatarPath);
                  }}
                />
              ) : currentUserInitials ? (
                <span aria-hidden="true">{currentUserInitials}</span>
              ) : (
                <span className="docsera-header__profile-placeholder-dot" aria-hidden="true" />
              )}
            </button>
            {accountPresence.item ? (
              <div className="docsera-account-menu" role="menu" aria-label="Account menu" data-docsera-dropdown-motion={accountPresence.open ? "enter" : "exit"} {...(!accountPresence.open ? { inert: "" } : {})} aria-hidden={!accountPresence.open || undefined}>
                {currentUserAvailable ? (
                  <div className="docsera-account-menu__identity" role="presentation">
                    <strong>{currentUserDisplayName || currentUserName}</strong>
                    <span>{currentUserName}</span>
                  </div>
                ) : (
                  <div className="docsera-account-menu__identity docsera-account-menu__identity--placeholder" role="presentation">
                    <strong>Current user</strong>
                    <span>Loading session</span>
                  </div>
                )}
                <button type="button" className="docsera-account-menu__item" role="menuitem" onClick={navigateToNativeLogout}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {typeof document !== "undefined"
        ? createPortal(
            discardModalOpen ? (
              <div className="docsera-modal docsera-modal--top-biased" data-docsera-pending-change-dialog="true" role="presentation">
                <div
                  ref={discardModalPanelRef}
                  className="docsera-modal__panel"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={discardPageTarget ? "docsera-discard-page-title" : "docsera-discard-all-title"}
                >
                  <div className="docsera-modal__form">
                    <div className="docsera-modal__header">
                      <h2 id={discardPageTarget ? "docsera-discard-page-title" : "docsera-discard-all-title"} className="docsera-modal__title">
                        {discardPageTarget ? "Undo page changes" : "Discard all changes"}
                      </h2>
                    </div>
                    <div className="docsera-modal__body">
                      <p className="docsera-modal__copy docsera-modal__copy--warning">{discardPageTarget ? discardPageBody : discardAllBody}</p>
                      {(discardPageTarget ? pendingChangesDiscardPageErrorMessage : pendingChangesDiscardAllErrorMessage) ? (
                        <div className="docsera-modal__alert" role="alert">{discardPageTarget ? pendingChangesDiscardPageErrorMessage : pendingChangesDiscardAllErrorMessage}</div>
                      ) : null}
                    </div>
                    <div className="docsera-modal__footer">
                      <div className="docsera-modal__actions">
                        <button
                          type="button"
                          className="docsera-modal__secondary"
                          disabled={pendingChangesAnyDiscarding}
                          onClick={() => {
                            if (pendingChangesAnyDiscarding) {
                              return;
                            }
                            discardModalReturnFocusRef.current = true;
                            setDiscardAllModalOpen(false);
                            setDiscardPageTarget(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          ref={discardPrimaryButtonRef}
                          type="button"
                          className="docsera-modal__primary docsera-modal__primary--destructive"
                          aria-busy={pendingChangesAnyDiscarding ? "true" : undefined}
                          disabled={
                            pendingChangesAnyDiscarding ||
                            (discardPageTarget
                              ? !onDiscardPendingPage || (!pendingChangesDiscardPageRetryable && pendingChangesUndoBlockedPageSysId === discardPageTarget.pageSysId)
                              : (!canDiscardChanges && !pendingChangesDiscardAllRetryable))
                          }
                          onClick={() => {
                            if (discardPageTarget) {
                              onDiscardPendingPage?.(discardPageTarget.pageSysId);
                              return;
                            }
                            onDiscardAllPendingChanges?.();
                          }}
                        >
                          <span className="docsera-changes-center__footer-primary-label">
                            {pendingChangesAnyDiscarding ? (
                              <span className="docsera-changes-center__spinner" aria-hidden="true" />
                            ) : null}
                            <span>
                              {discardPageTarget
                                ? pendingChangesDiscardPageErrorMessage
                                  ? "Retry"
                                  : "Undo changes"
                                : pendingChangesDiscardAllErrorMessage
                                  ? "Retry discard all"
                                  : "Discard all"}
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null,
            document.body
          )
        : null}
    </header>
  );
}
