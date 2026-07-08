import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import { DocseraHeader } from "./DocseraHeader";
import type { RecentWorkspaceItem } from "./RecentWorkspacesMenu";
import { WorkspaceIconBadge } from "./WorkspacePrimitives";
import { WorkspaceCreateModal } from "./WorkspaceCreateModal";
import { buildWorkspaceHref } from "./workspaceRouting";

type MyWorkspacesScreenProps = {
  createModal: {
    errorMessage?: string;
    onClose: () => void;
    onSubmit: (input: { name: string; shortDescription: string }) => void;
    open: boolean;
    phase: "idle" | "submitting" | "polling";
  };
  hasError: boolean;
  isEmptyState: boolean;
  isLoading: boolean;
  isNoResultsState: boolean;
  items: WorkspaceViewRecord[];
  onNextPage: () => void;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings: (workspaceSlug: string) => void;
  onPreviousPage: () => void;
  onRefresh: () => void;
  onSearchTextChange: (value: string) => void;
  onShowCreateModal: () => void;
  recentWorkspaces: RecentWorkspaceItem[];
  page: number;
  pageSize: number;
  searchText: string;
  theme: "dark" | "light";
  totalCount: number;
  onToggleTheme: () => void;
  workspaceListErrorMessage?: string;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4.5v15m7.5-7.5h-15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function WorkspaceRow({
  onOpenWorkspace,
  onOpenWorkspaceSettings,
  workspace
}: {
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings: (workspaceSlug: string) => void;
  workspace: WorkspaceViewRecord;
}) {
  return (
    <li className="docsera-workspace-list__item">
      <article className="docsera-workspace-row">
        <div className="docsera-workspace-row__identity">
          <WorkspaceIconBadge workspace={workspace} className="docsera-workspace-row__icon" />
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

        <div className="docsera-workspace-row__role" aria-label={`Role: ${workspace.roleLabel ?? "View only"}`}>
          {workspace.roleLabel ?? "View only"}
        </div>

        <div className="docsera-workspace-row__actions">
          {workspace.canManageSettings ? (
            <a
              className="docsera-workspace-row__settings"
              href={buildWorkspaceHref(workspace.slug, true)}
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

function EmptyState({ onShowCreateModal }: { onShowCreateModal: () => void }) {
  return (
    <section className="docsera-launcher-state" role="status">
      <p className="docsera-launcher-state__eyebrow">My Workspaces</p>
      <h2 className="docsera-launcher-state__title">No workspaces to show</h2>
      <p className="docsera-launcher-state__copy">
        You do not currently have editing or administration access to any active workspaces.
      </p>
      <div className="docsera-launcher-state__actions">
        <button type="button" className="docsera-launcher-state__primary" onClick={onShowCreateModal}>
          <PlusIcon />
          <span>New Workspace</span>
        </button>
      </div>
    </section>
  );
}

export function MyWorkspacesScreen({
  createModal,
  hasError,
  isEmptyState,
  isLoading,
  isNoResultsState,
  items,
  onNextPage,
  onOpenWorkspace,
  onOpenWorkspaceSettings,
  onPreviousPage,
  onRefresh,
  onSearchTextChange,
  onShowCreateModal,
  recentWorkspaces,
  page,
  pageSize,
  searchText,
  theme,
  totalCount,
  onToggleTheme,
  workspaceListErrorMessage
}: MyWorkspacesScreenProps) {
  const firstResultIndex = totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastResultIndex = Math.min(totalCount, page * pageSize);

  return (
    <>
      <DocseraHeader
        identity={{
          kind: "docsera",
          icon: {
            type: "builtin",
            key: "docsera-workspace",
            label: "Docsera workspace icon"
          },
          name: "Docsera"
        }}
        mode="launcher"
        onOpenMyWorkspaces={() => {
          return;
        }}
        onOpenWorkspace={onOpenWorkspace}
        recentWorkspaces={recentWorkspaces}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <div className="docsera-launcher">
        <header className="docsera-launcher__header">
          <div className="docsera-launcher__title-row">
            <div>
              <h1 className="docsera-launcher__title">My Workspaces</h1>
              <p className="docsera-launcher__copy">Workspaces where you have editing or administration access.</p>
            </div>
            <button type="button" className="docsera-launcher__primary" onClick={onShowCreateModal}>
              <PlusIcon />
              <span>New Workspace</span>
            </button>
          </div>
        </header>

        {!hasError && !isLoading ? (
          <section className="docsera-launcher-list__toolbar docsera-launcher-list__toolbar--standalone">
            <label className="docsera-launcher-list__search">
              <span className="docsera-launcher-list__search-icon">
                <SearchIcon />
              </span>
              <input
                className="docsera-launcher-list__search-input"
                type="search"
                placeholder="Search workspaces..."
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
              />
            </label>
            {totalCount > 0 ? (
              <div className="docsera-launcher-list__summary">
                <span>
                  Showing {firstResultIndex}-{lastResultIndex} of {totalCount}
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        {hasError ? (
          <section className="docsera-launcher-state" role="status">
            <p className="docsera-launcher-state__eyebrow">Unable to load workspaces</p>
            <h2 className="docsera-launcher-state__title">Something went wrong while loading your workspaces.</h2>
            <p className="docsera-launcher-state__copy">{workspaceListErrorMessage ?? "Please try again."}</p>
            <div className="docsera-launcher-state__actions">
              <button type="button" className="docsera-launcher-state__secondary" onClick={onRefresh}>
                Retry
              </button>
            </div>
          </section>
        ) : null}

        {!hasError && isLoading ? (
          <section className="docsera-launcher-state" aria-live="polite" role="status">
            <p className="docsera-launcher-state__eyebrow">Loading</p>
            <h2 className="docsera-launcher-state__title">Loading workspaces</h2>
            <p className="docsera-launcher-state__copy">Fetching your active workspace list from ServiceNow.</p>
          </section>
        ) : null}

        {!hasError && !isLoading && isEmptyState ? <EmptyState onShowCreateModal={onShowCreateModal} /> : null}

        {!hasError && !isLoading && isNoResultsState ? (
          <section className="docsera-launcher-state" role="status">
            <p className="docsera-launcher-state__eyebrow">No matching workspaces</p>
            <h2 className="docsera-launcher-state__title">Try a different search term.</h2>
            <p className="docsera-launcher-state__copy">Only workspace names are searched in this MVP slice.</p>
          </section>
        ) : null}

        {!hasError && !isLoading && !isEmptyState && !isNoResultsState ? (
          <section className="docsera-launcher-list">
            <ul className="docsera-workspace-list">
              {items.map((workspace) => (
                <WorkspaceRow
                  key={workspace.sysId ?? workspace.slug}
                  workspace={workspace}
                  onOpenWorkspace={onOpenWorkspace}
                  onOpenWorkspaceSettings={onOpenWorkspaceSettings}
                />
              ))}
            </ul>

            <div className="docsera-launcher-list__pager">
              <button type="button" className="docsera-launcher-list__pager-button" onClick={onPreviousPage} disabled={page <= 1}>
                <ChevronLeftIcon />
                <span>Previous</span>
              </button>
              <span className="docsera-launcher-list__pager-copy">
                Page {page} of {Math.max(1, Math.ceil(totalCount / pageSize))}
              </span>
              <button
                type="button"
                className="docsera-launcher-list__pager-button"
                onClick={onNextPage}
                disabled={items.length < pageSize || page * pageSize >= totalCount}
              >
                <span>Next</span>
                <ChevronRightIcon />
              </button>
            </div>
          </section>
        ) : null}

        <WorkspaceCreateModal
          errorMessage={createModal.errorMessage}
          onClose={createModal.onClose}
          onSubmit={createModal.onSubmit}
          open={createModal.open}
          phase={createModal.phase}
        />
      </div>
    </>
  );
}
