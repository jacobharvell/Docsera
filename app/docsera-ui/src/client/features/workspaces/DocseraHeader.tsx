import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DemoPage, WorkspaceViewRecord } from "../../shared/types/docsera";
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

export type HeaderIdentity =
  | (Pick<WorkspaceViewRecord, "icon" | "name"> & {
      kind: "docsera" | "workspace";
    })
  | {
      kind: "workspace-loading";
    };

type DocseraHeaderProps = {
  breadcrumbs?: DemoPage[];
  currentWorkspaceSlug?: string;
  identity: HeaderIdentity;
  mode: "launcher" | "workspace";
  onOpenMyWorkspaces: () => void;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings?: () => void;
  onSelectBreadcrumb?: (pageId: string) => void;
  onToggleSidebar?: () => void;
  recentWorkspaces: RecentWorkspaceItem[];
  showWorkspaceSwitcher?: boolean;
  showWorkspaceSettings?: boolean;
  sidebarCollapsed?: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  workspaceNavWidth?: number;
};

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
  onSelectBreadcrumb,
  onToggleSidebar,
  recentWorkspaces,
  showWorkspaceSwitcher = recentWorkspaces.length > 0,
  showWorkspaceSettings = false,
  sidebarCollapsed = false,
  theme,
  onToggleTheme,
  workspaceNavWidth
}: DocseraHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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
          <button
            type="button"
            className="docsera-header__ghost-button docsera-header__ghost-button--theme"
            aria-label="Toggle theme"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          {showWorkspaceSettings && onOpenWorkspaceSettings ? (
            <button
              type="button"
              className="docsera-header__ghost-button"
              aria-label="Workspace settings"
              onClick={onOpenWorkspaceSettings}
            >
              <GearIcon />
            </button>
          ) : null}
          <button type="button" className="docsera-header__profile" aria-label="Current user">
            J
          </button>
        </div>
      </div>
    </header>
  );
}
