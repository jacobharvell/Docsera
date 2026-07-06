import type { DemoPage, DemoWorkspace } from "../../shared/types/docsera";

type WorkspaceHeaderProps = {
  canManageWorkspaceSettings: boolean;
  onOpenWorkspaceSettings: () => void;
  workspace: DemoWorkspace;
  pagePath: DemoPage[];
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSelectPage: (pageId: string) => void;
  onOpenMyWorkspaces: () => void;
};

function DoubleChevronIcon() {
  return (
    <span className="docsera-header__workspace-chevron" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path
          d="M4.5 15.75l7.5-7.5 7.5 7.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
      </svg>
      <svg viewBox="0 0 24 24">
        <path
          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
      </svg>
    </span>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={
          collapsed
            ? "M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"
            : "M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
        }
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.3"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <path
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21.75 12.83A9.5 9.5 0 0112.25 2.25 8.5 8.5 0 1021.75 12.83z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function WorkspaceHeader({
  canManageWorkspaceSettings,
  onOpenWorkspaceSettings,
  workspace,
  pagePath,
  sidebarCollapsed,
  onToggleSidebar,
  onSelectPage,
  onOpenMyWorkspaces
}: WorkspaceHeaderProps) {
  const currentPage = pagePath.length > 0 ? pagePath[pagePath.length - 1] : undefined;
  const parentPages = currentPage ? pagePath.slice(0, -1) : [];

  return (
    <header className="docsera-header">
      <div className="docsera-header__workspace">
        <button
          type="button"
          className="docsera-header__workspace-button"
          aria-label={`Workspace switcher: ${workspace.title}`}
          onClick={onOpenMyWorkspaces}
        >
          <div className="docsera-header__workspace-icon" aria-hidden="true">
            {workspace.iconLabel}
          </div>
          <div className="docsera-header__workspace-copy">
            <span className="docsera-header__workspace-name" title={workspace.title}>
              {workspace.title}
            </span>
          </div>
          <DoubleChevronIcon />
        </button>
      </div>

      <div className="docsera-header__bar">
        <div className="docsera-header__leading">
          <button
            type="button"
            className="docsera-header__ghost-button"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            <SidebarToggleIcon collapsed={sidebarCollapsed} />
          </button>

          <nav className="docsera-breadcrumbs" aria-label="Page breadcrumbs">
            {parentPages.map((page) => (
              <button
                key={page.id}
                type="button"
                className="docsera-breadcrumbs__item"
                onClick={() => onSelectPage(page.id)}
              >
                {page.title}
              </button>
            ))}
            {currentPage ? (
              <span className="docsera-breadcrumbs__current" aria-current="page">
                {currentPage.title}
              </span>
            ) : null}
          </nav>
        </div>

        <div className="docsera-header__actions" aria-label="Workspace controls">
          <div className="docsera-header__mode-switch" aria-label="Page mode">
            <button
              type="button"
              className="docsera-header__mode-button docsera-header__mode-button--active"
              aria-label="Reader mode"
              disabled
            >
              <EyeIcon />
            </button>
            <button type="button" className="docsera-header__mode-button" aria-label="Source mode" disabled>
              <CodeIcon />
            </button>
          </div>
          <div className="docsera-header__divider" aria-hidden="true" />
          <button type="button" className="docsera-header__ghost-button" aria-label="Toggle theme" disabled>
            <MoonIcon />
          </button>
          {canManageWorkspaceSettings ? (
            <button
              type="button"
              className="docsera-header__ghost-button"
              aria-label="Workspace settings"
              onClick={onOpenWorkspaceSettings}
            >
              <GearIcon />
            </button>
          ) : null}
          <div className="docsera-header__profile" aria-label="Current user">
            J
          </div>
        </div>
      </div>
    </header>
  );
}
