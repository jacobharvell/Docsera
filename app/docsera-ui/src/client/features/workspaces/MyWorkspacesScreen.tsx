import {
  LauncherIntro,
  LauncherPaginationFooter,
  LauncherPanel,
  LauncherSearchToolbar,
  LauncherState,
  PlusIcon,
  WorkspaceList,
  WorkspaceListHeader
} from "./MyWorkspacesScreenSections";
import type { RecentWorkspaceItem } from "./RecentWorkspacesMenu";
import { WorkspaceCreateModal } from "./WorkspaceCreateModal";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";

type MyWorkspacesScreenProps = {
  canCreateWorkspaces: boolean;
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
  isRefreshing: boolean;
  items: WorkspaceViewRecord[];
  showLoadingState: boolean;
  onNextPage: () => void;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
  onOpenWorkspaceSettings: (workspaceSlug: string) => void;
  onPreviousPage: () => void;
  onRefresh: () => void;
  onSearchTextChange: (value: string) => void;
  onShowCreateModal: () => void;
  page: number;
  pageSize: number;
  searchText: string;
  totalCount: number;
  workspaceListErrorMessage?: string;
};

function CreateWorkspaceAction({ onShowCreateModal }: { onShowCreateModal: () => void }) {
  return (
    <button type="button" className="docsera-launcher-state__primary" onClick={onShowCreateModal}>
      <PlusIcon />
      <span>New Workspace</span>
    </button>
  );
}

export function MyWorkspacesScreen({
  canCreateWorkspaces,
  createModal,
  hasError,
  isEmptyState,
  isLoading,
  isNoResultsState,
  isRefreshing,
  items,
  showLoadingState,
  onNextPage,
  onOpenWorkspace,
  onOpenWorkspaceSettings,
  onPreviousPage,
  onRefresh,
  onSearchTextChange,
  onShowCreateModal,
  page,
  pageSize,
  searchText,
  totalCount,
  workspaceListErrorMessage
}: MyWorkspacesScreenProps) {
  const firstResultIndex = totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastResultIndex = Math.min(totalCount, page * pageSize);
  const rangeSummary = totalCount > 0 ? `Showing ${firstResultIndex}-${lastResultIndex} of ${totalCount}` : undefined;
  const showSearchToolbar = !hasError && !isEmptyState;
  const showList = !hasError && !isLoading && !isEmptyState && !isNoResultsState;
  const showHeaderRow = !hasError && !isLoading && !isEmptyState;
  const showFooter = showHeaderRow && rangeSummary && !isNoResultsState;

  return (
    <div className="docsera-launcher-screen">
      <div className="docsera-launcher">
        <LauncherIntro canCreateWorkspaces={canCreateWorkspaces} onShowCreateModal={onShowCreateModal} />

        <LauncherPanel
          isRefreshing={isRefreshing}
          toolbar={
            showSearchToolbar ? <LauncherSearchToolbar onSearchTextChange={onSearchTextChange} searchText={searchText} /> : undefined
          }
          headerRow={showHeaderRow ? <WorkspaceListHeader /> : undefined}
          footer={
            showFooter ? (
              <LauncherPaginationFooter
                canGoNext={items.length >= pageSize && page * pageSize < totalCount}
                canGoPrevious={page > 1}
                onNextPage={onNextPage}
                onPreviousPage={onPreviousPage}
                summary={rangeSummary}
              />
            ) : undefined
          }
        >
          {hasError ? (
            <LauncherState
              eyebrow="Unable to load workspaces"
              title="Something went wrong while loading your workspaces."
              copy={workspaceListErrorMessage ?? "Please try again."}
              action={
                <button type="button" className="docsera-launcher-state__secondary" onClick={onRefresh}>
                  Retry
                </button>
              }
            />
          ) : null}

          {!hasError && isLoading && showLoadingState ? (
            <LauncherState
              eyebrow="Loading"
              title="Loading workspaces"
              copy="Fetching your active workspace list from ServiceNow."
            />
          ) : null}

          {!hasError && !isLoading && isEmptyState ? (
            <LauncherState
              title="No workspaces to show"
              copy={
                canCreateWorkspaces
                  ? "You do not currently have editing or administration access to any workspaces. Create a workspace to get started, or request access from a workspace admin if you need to contribute to an existing workspace."
                  : "You do not currently have editing or administration access to any workspaces. Request access from a workspace admin if you need to contribute to an existing workspace."
              }
              action={canCreateWorkspaces ? <CreateWorkspaceAction onShowCreateModal={onShowCreateModal} /> : undefined}
            />
          ) : null}

          {!hasError && !isLoading && isNoResultsState ? (
            <LauncherState title="No matching workspaces" copy="Try a different search term." />
          ) : null}

          {showList ? (
            <WorkspaceList
              items={items}
              onOpenWorkspace={onOpenWorkspace}
              onOpenWorkspaceSettings={onOpenWorkspaceSettings}
            />
          ) : null}
        </LauncherPanel>

        <WorkspaceCreateModal
          errorMessage={createModal.errorMessage}
          onClose={createModal.onClose}
          onSubmit={createModal.onSubmit}
          open={createModal.open}
          phase={createModal.phase}
        />
      </div>
    </div>
  );
}
