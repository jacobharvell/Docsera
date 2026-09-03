import { useRef, type ReactNode } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import type { RecentWorkspaceItem } from "./RecentWorkspacesMenu";
import { WorkspaceIconBadge, type WorkspaceUploadedIconLoader } from "./WorkspacePrimitives";
import { buildWorkspaceHref } from "./workspaceRouting";

function SearchIcon() {
  return <DocseraIcon icon={docseraIcons.search} />;
}

function ChevronLeftIcon() {
  return <DocseraIcon icon={docseraIcons.chevronLeft} />;
}

function ChevronRightIcon() {
  return <DocseraIcon icon={docseraIcons.chevronRight} />;
}

function ClearIcon() {
  return <DocseraIcon icon={docseraIcons.close} />;
}

export function PlusIcon() {
  return <DocseraIcon icon={docseraIcons.plus} />;
}

export function LauncherIntro({
  canCreateWorkspaces,
  onShowCreateModal
}: {
  canCreateWorkspaces: boolean;
  onShowCreateModal: () => void;
}) {
  return (
    <header className="docsera-launcher__header">
      <div className="docsera-launcher__title-row">
        <div className="docsera-launcher__title-block">
          <h1 className="docsera-launcher__title">My Workspaces</h1>
          <p className="docsera-launcher__copy">Workspaces where you have editing or administration access.</p>
        </div>
        {canCreateWorkspaces ? (
          <button type="button" className="docsera-launcher__header-action" onClick={onShowCreateModal}>
            <PlusIcon />
            <span>New Workspace</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function LauncherPanel({
  children,
  footer,
  headerRow,
  isRefreshing = false,
  toolbar
}: {
  children: ReactNode;
  footer?: ReactNode;
  headerRow?: ReactNode;
  isRefreshing?: boolean;
  toolbar?: ReactNode;
}) {
  return (
    <section className="docsera-launcher-panel" aria-busy={isRefreshing}>
      {toolbar ? <div className="docsera-launcher-panel__toolbar">{toolbar}</div> : null}
      {headerRow ? <div className="docsera-launcher-panel__header-row">{headerRow}</div> : null}
      <div className="docsera-launcher-panel__body">{children}</div>
      {footer ? <div className="docsera-launcher-panel__footer">{footer}</div> : null}
    </section>
  );
}

export function LauncherSearchToolbar({
  onSearchTextChange,
  searchText
}: {
  onSearchTextChange: (value: string) => void;
  searchText: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="docsera-launcher-toolbar">
      <label className="docsera-launcher-toolbar__search">
        <span className="docsera-launcher-toolbar__search-icon">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          className="docsera-launcher-toolbar__search-input"
          type="text"
          placeholder="Search workspaces..."
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
        />
        {searchText ? (
          <button
            type="button"
            className="docsera-launcher-toolbar__clear"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onSearchTextChange("");
              inputRef.current?.focus();
            }}
          >
            <ClearIcon />
          </button>
        ) : null}
      </label>
    </div>
  );
}

export function WorkspaceListHeader() {
  return (
    <div className="docsera-workspace-list__header" role="presentation">
      <div>Workspace</div>
      <div>Role</div>
    </div>
  );
}

export function WorkspaceRow({
  onOpenWorkspace,
  onOpenWorkspaceSettings,
  loadUploadedIcon,
  workspace
}: {
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings: (workspaceSlug: string) => void;
  workspace: WorkspaceViewRecord;
}) {
  return (
    <li className="docsera-workspace-list__item">
      <article className="docsera-workspace-row">
        <div className="docsera-workspace-row__identity">
          <WorkspaceIconBadge workspace={workspace} className="docsera-workspace-row__icon" loadUploadedIcon={loadUploadedIcon} />
          <div className="docsera-workspace-row__copy">
            <a
              className="docsera-workspace-row__name"
              href={buildWorkspaceHref(workspace.slug)}
              onClick={(event) => {
                event.preventDefault();
                onOpenWorkspace(workspace.slug, workspace);
              }}
              title={`Open ${workspace.name}`}
            >
              {workspace.name}
            </a>
            {workspace.shortDescription ? (
              <p className="docsera-workspace-row__description">{workspace.shortDescription}</p>
            ) : null}
          </div>
        </div>

        <div className="docsera-workspace-row__role-cell" aria-label={`Role: ${workspace.roleLabel ?? "View only"}`}>
          <span className="docsera-workspace-row__role">{workspace.roleLabel ?? "View only"}</span>
          {workspace.canManageSettings ? (
            <a
              className="docsera-workspace-row__settings"
              href={buildWorkspaceHref(workspace.slug, { settingsIntent: true })}
              onClick={(event) => {
                event.preventDefault();
                onOpenWorkspaceSettings(workspace.slug);
              }}
              title={`Open settings for ${workspace.name}`}
            >
              Settings
            </a>
          ) : null}
        </div>
      </article>
    </li>
  );
}

export function WorkspaceList({
  items,
  loadUploadedIcon,
  onOpenWorkspace,
  onOpenWorkspaceSettings
}: {
  items: WorkspaceViewRecord[];
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings: (workspaceSlug: string) => void;
}) {
  return (
    <ul className="docsera-workspace-list">
      {items.map((workspace) => (
        <WorkspaceRow
          key={workspace.sysId ?? workspace.slug}
          workspace={workspace}
          loadUploadedIcon={loadUploadedIcon}
          onOpenWorkspace={onOpenWorkspace}
          onOpenWorkspaceSettings={onOpenWorkspaceSettings}
        />
      ))}
    </ul>
  );
}

export function LauncherPaginationFooter({
  canGoNext,
  canGoPrevious,
  onNextPage,
  onPreviousPage,
  summary
}: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  summary: string;
}) {
  return (
    <div className="docsera-launcher-pagination">
      <span className="docsera-launcher-pagination__summary">{summary}</span>
      <div className="docsera-launcher-pagination__actions">
        <button type="button" className="docsera-launcher-pagination__button" onClick={onPreviousPage} disabled={!canGoPrevious}>
          <ChevronLeftIcon />
          <span>Previous</span>
        </button>
        <button type="button" className="docsera-launcher-pagination__button" onClick={onNextPage} disabled={!canGoNext}>
          <span>Next</span>
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

export function LauncherState({
  action,
  copy,
  eyebrow,
  title
}: {
  action?: ReactNode;
  copy: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <section className="docsera-launcher-state" role="status">
      {eyebrow ? <p className="docsera-launcher-state__eyebrow">{eyebrow}</p> : null}
      <h2 className="docsera-launcher-state__title">{title}</h2>
      <p className="docsera-launcher-state__copy">{copy}</p>
      {action ? <div className="docsera-launcher-state__actions">{action}</div> : null}
    </section>
  );
}
