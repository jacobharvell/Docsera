import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { WorkspaceMode, WorkspacePendingChangesResult, WorkspaceViewRecord } from "../../shared/types/docsera";
import {
  DocseraBrandIcon,
  DoubleChevronIcon,
  GearIcon,
  MoonIcon,
  SidebarToggleIcon,
  SunIcon
} from "./DocseraHeaderIcons";
import { RecentWorkspacesMenu, type RecentWorkspaceItem } from "./RecentWorkspacesMenu";
import { WorkspaceIconBadge } from "./WorkspacePrimitives";
import type { WorkspacePageView } from "./workspaceViewModels";

export type HeaderIdentity =
  | (Pick<WorkspaceViewRecord, "icon" | "name"> & {
      kind: "docsera" | "workspace";
    })
  | {
      kind: "workspace-loading";
    };

type DocseraHeaderProps = {
  breadcrumbs?: WorkspacePageView[];
  currentWorkspaceSlug?: string;
  identity: HeaderIdentity;
  mode: "launcher" | "workspace";
  onOpenMyWorkspaces: () => void;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings?: () => void;
  onSelectBreadcrumb?: (pageId: string) => void;
  onToggleSidebar?: () => void;
  recentWorkspaces: RecentWorkspaceItem[];
  pendingChanges?: WorkspacePendingChangesResult | null;
  pendingChangesLoading?: boolean;
  pendingChangesPublishErrorMessage?: string;
  pendingChangesPublishRetryable?: boolean;
  pendingChangesPublishToastMessage?: string;
  pendingChangesPublishing?: boolean;
  pendingChangesReadinessMessage?: string;
  pendingChangesRefreshing?: boolean;
  pendingChangesErrorMessage?: string;
  onDismissPendingChangesPublishToast?: () => void;
  onOpenPendingPage?: (pageSysId: string) => void;
  onPublishPendingChanges?: () => void;
  onRetryPendingChanges?: () => void;
  showEditModeToggle?: boolean;
  showWorkspaceMode?: WorkspaceMode;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  showWorkspaceSwitcher?: boolean;
  showWorkspaceSettings?: boolean;
  workspaceControlsLocked?: boolean;
  sidebarCollapsed?: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  workspaceNavWidth?: number;
};

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

function HeaderIdentityIcon({ identity }: { identity: HeaderIdentity }) {
  if (identity.kind === "workspace-loading") {
    return <span className="docsera-header__workspace-icon docsera-header__workspace-icon--loading" aria-hidden="true" />;
  }

  if (identity.kind === "docsera") {
    return (
      <span className="docsera-header__workspace-icon docsera-header__workspace-icon--brand docsera-header__workspace-icon--artwork" aria-hidden="true">
        <DocseraBrandIcon />
      </span>
    );
  }

  return <WorkspaceIconBadge workspace={identity} className="docsera-header__workspace-icon" />;
}

export function DocseraHeader({
  breadcrumbs = [],
  currentWorkspaceSlug = "",
  identity,
  mode,
  onOpenMyWorkspaces,
  onOpenWorkspace,
  onOpenWorkspaceSettings,
  onDismissPendingChangesPublishToast,
  onOpenPendingPage,
  onSelectBreadcrumb,
  onToggleSidebar,
  onRetryPendingChanges,
  pendingChanges = null,
  pendingChangesErrorMessage = "",
  pendingChangesLoading = false,
  pendingChangesPublishErrorMessage = "",
  pendingChangesPublishRetryable = false,
  pendingChangesPublishToastMessage = "",
  pendingChangesPublishing = false,
  pendingChangesReadinessMessage = "",
  pendingChangesRefreshing = false,
  recentWorkspaces,
  onPublishPendingChanges,
  showEditModeToggle = false,
  showWorkspaceMode = "live",
  onWorkspaceModeChange,
  showWorkspaceSwitcher = recentWorkspaces.length > 0,
  showWorkspaceSettings = false,
  workspaceControlsLocked = false,
  sidebarCollapsed = false,
  theme,
  onToggleTheme,
  workspaceNavWidth
}: DocseraHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const changesRef = useRef<HTMLDivElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
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
  const pendingCount = pendingChanges?.state === "succeeded" ? pendingChanges.affectedPageCount : pendingRows.length;
  const hasPendingChanges = pendingChanges?.state === "succeeded" && pendingCount > 0;
  const showPublishControl = mode === "workspace" && showWorkspaceMode === "edit" && showEditModeToggle;
  const countText = `${pendingCount} ${pendingCount === 1 ? "page" : "pages"}`;
  const hasPendingError = Boolean(pendingChangesErrorMessage) || pendingChanges?.state === "failed";
  const hasPublishError = Boolean(pendingChangesPublishErrorMessage);
  const canOpenChanges = (hasPendingChanges || hasPendingError || hasPublishError || pendingChangesPublishing) && (!workspaceControlsLocked || pendingChangesPublishing);
  const canPublishChanges =
    hasPendingChanges &&
    !hasPendingError &&
    !pendingChangesLoading &&
    !pendingChangesRefreshing &&
    !pendingChangesPublishing &&
    (!hasPublishError || pendingChangesPublishRetryable) &&
    !pendingChangesReadinessMessage &&
    Boolean(onPublishPendingChanges);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!changesOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (changesRef.current?.contains(event.target as Node)) {
        return;
      }
      if (pendingChangesPublishing) {
        return;
      }

      setChangesOpen(false);
      publishButtonRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingChangesPublishing) {
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
  }, [changesOpen, pendingChangesPublishing]);

  useEffect(() => {
    setChangesOpen(false);
  }, [currentWorkspaceSlug, showWorkspaceMode]);

  useEffect(() => {
    if (!changesOpen || pendingChangesPublishing || pendingChangesLoading || pendingChangesRefreshing || hasPendingError || hasPublishError) {
      return;
    }
    if (pendingChanges?.state === "succeeded" && pendingChanges.affectedPageCount === 0) {
      setChangesOpen(false);
      publishButtonRef.current?.focus();
    }
  }, [changesOpen, hasPendingError, hasPublishError, pendingChanges, pendingChangesLoading, pendingChangesPublishing, pendingChangesRefreshing]);

  return (
    <header
      className={`docsera-header${mode === "workspace" && sidebarCollapsed ? " docsera-header--sidebar-collapsed" : ""}`}
      style={mode === "workspace" && workspaceNavWidth ? ({ "--docsera-workspace-nav-width": `${workspaceNavWidth}px` } as CSSProperties) : undefined}
    >
      <div className="docsera-header__workspace">
        {mode === "workspace" && sidebarCollapsed ? null : (
          <div className="docsera-header__workspace-panel" ref={menuRef}>
            <button
              type="button"
              className={`docsera-header__workspace-button${canSwitchWorkspaces ? "" : " docsera-header__workspace-button--static"}`}
              aria-expanded={canSwitchWorkspaces ? menuOpen : undefined}
              aria-haspopup={canSwitchWorkspaces ? "menu" : undefined}
              aria-label={workspaceButtonLabel}
              disabled={!canSwitchWorkspaces}
              onClick={() => {
                if (!canSwitchWorkspaces) {
                  return;
                }

                setMenuOpen((current) => !current);
              }}
            >
              <HeaderIdentityIcon identity={identity} />
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

            {menuOpen ? (
              <RecentWorkspacesMenu
                currentWorkspaceSlug={currentWorkspaceSlug}
                items={recentWorkspaces}
                onOpenMyWorkspaces={() => {
                  setMenuOpen(false);
                  onOpenMyWorkspaces();
                }}
                onOpenWorkspace={(workspaceSlug) => {
                  setMenuOpen(false);
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
            <button
              type="button"
              className="docsera-header__ghost-button docsera-header__ghost-button--sidebar-toggle"
              onClick={onToggleSidebar}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <SidebarToggleIcon collapsed={sidebarCollapsed} />
            </button>
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
            {mode === "workspace" && showEditModeToggle && onWorkspaceModeChange ? (
              <div className="docsera-header__mode-toggle" role="group" aria-label="Workspace mode">
                  <button
                    type="button"
                    className={`docsera-header__mode-segment${showWorkspaceMode === "live" ? " docsera-header__mode-segment--active" : ""}`}
                    aria-pressed={showWorkspaceMode === "live"}
                    disabled={workspaceControlsLocked}
                    onClick={() => onWorkspaceModeChange("live")}
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    className={`docsera-header__mode-segment${showWorkspaceMode === "edit" ? " docsera-header__mode-segment--active" : ""}`}
                    aria-pressed={showWorkspaceMode === "edit"}
                    disabled={workspaceControlsLocked}
                    onClick={() => onWorkspaceModeChange("edit")}
                  >
                    Edit
                  </button>
                </div>
            ) : (
              <span className="docsera-header__action-slot-placeholder" aria-hidden="true" />
            )}
          </div>
          {showPublishControl ? (
            <div className="docsera-header__publish-panel" ref={changesRef}>
              {pendingChangesPublishToastMessage ? (
                <div className="docsera-header__publish-toast" role="status" aria-atomic="true" aria-live="polite">
                  <PublishSuccessIcon />
                  <span className="docsera-header__publish-toast-message">{pendingChangesPublishToastMessage}</span>
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
                </div>
              ) : null}
              <button
                ref={publishButtonRef}
                type="button"
                className={`docsera-header__publish-button${hasPendingChanges ? " docsera-header__publish-button--active" : ""}`}
                aria-expanded={changesOpen}
                aria-haspopup="dialog"
                aria-label={hasPendingChanges || hasPendingError ? "Open Changes Center" : "No pending changes to publish"}
                disabled={!canOpenChanges}
                onClick={() => {
                  if (!canOpenChanges) {
                    return;
                  }
                  if (pendingChangesPublishing) {
                    setChangesOpen(true);
                    return;
                  }
                  setChangesOpen((current) => !current);
                }}
              >
                Publish
                <PublishChevron open={changesOpen} />
              </button>
              {changesOpen ? (
                <section className="docsera-changes-center" role="dialog" aria-label="Changes Center">
                  <header className="docsera-changes-center__header">
                    <div>
                      <strong>Changes</strong> <span>{countText}</span>
                    </div>
                    {pendingChangesRefreshing ? <span className="docsera-changes-center__refreshing" role="status">Refreshing</span> : null}
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
                        const content = (
                          <>
                            <span className="docsera-changes-center__row-title">{row.title}</span>
                            <span className="docsera-changes-center__row-meta" title={row.attribution.fullDisplayName} aria-label={row.attribution.accessibleLabel}>
                              {row.attribution.displayName}
                            </span>
                            <span className="docsera-changes-center__row-category">{row.category}</span>
                          </>
                        );
                        return row.navigable ? (
                          <div key={row.pageSysId} className="docsera-changes-center__row-item" role="listitem">
                            <button
                              type="button"
                              className="docsera-changes-center__row"
                              onClick={() => {
                                if (!pendingChangesPublishing) {
                                  setChangesOpen(false);
                                }
                                onOpenPendingPage?.(row.pageSysId);
                              }}
                            >
                              {content}
                            </button>
                          </div>
                        ) : (
                          <div key={row.pageSysId} className="docsera-changes-center__row-item" role="listitem">
                            <div className="docsera-changes-center__row docsera-changes-center__row--static" aria-disabled="true">
                              {content}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {pendingChangesPublishErrorMessage ? (
                    <div className="docsera-changes-center__publish-error" role="alert">{pendingChangesPublishErrorMessage}</div>
                  ) : null}
                  {pendingChangesReadinessMessage ? (
                    <div className="docsera-changes-center__blocked" role="status">{pendingChangesReadinessMessage}</div>
                  ) : null}
                  <footer className="docsera-changes-center__footer">
                    <button type="button" className="docsera-changes-center__footer-link" disabled>
                      Discard all
                    </button>
                    <button
                      type="button"
                      className="docsera-changes-center__footer-primary"
                      aria-busy={pendingChangesPublishing}
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
                </section>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="docsera-header__ghost-button docsera-header__ghost-button--theme"
            aria-label="Toggle theme"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="docsera-header__action-slot docsera-header__action-slot--settings">
            {showWorkspaceSettings && onOpenWorkspaceSettings ? (
              <button
                type="button"
                className="docsera-header__ghost-button"
                aria-label="Workspace settings"
                disabled={workspaceControlsLocked}
                onClick={onOpenWorkspaceSettings}
              >
                <GearIcon />
              </button>
            ) : (
              <span className="docsera-header__action-slot-placeholder" aria-hidden="true" />
            )}
          </div>
          <button type="button" className="docsera-header__profile" aria-label="Current user">
            J
          </button>
        </div>
      </div>
    </header>
  );
}
