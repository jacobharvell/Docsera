import { WorkspaceIconBadge } from "./WorkspacePrimitives";
import { WorkspaceListIcon } from "./DocseraHeaderIcons";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";

export type RecentWorkspaceItem = Pick<WorkspaceViewRecord, "icon" | "name" | "slug"> & {
  isCurrent?: boolean;
};

type RecentWorkspacesMenuProps = {
  currentWorkspaceSlug?: string;
  items: RecentWorkspaceItem[];
  onOpenMyWorkspaces: () => void;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
};

export function RecentWorkspacesMenu({
  currentWorkspaceSlug = "",
  items,
  onOpenMyWorkspaces,
  onOpenWorkspace
}: RecentWorkspacesMenuProps) {
  return (
    <div className="docsera-header__menu" role="menu" aria-label="Recent workspaces">
      <div className="docsera-header__menu-heading">Recent workspaces</div>
      {items.length > 0 ? (
        <div className="docsera-header__menu-list">
          {items.map((workspace) => {
            const isCurrent = workspace.slug === currentWorkspaceSlug || workspace.isCurrent;

            return (
              <button
                key={workspace.slug}
                type="button"
                className={`docsera-header__menu-item${isCurrent ? " docsera-header__menu-item--current" : ""}`}
                onClick={() => onOpenWorkspace(workspace.slug, workspace)}
                role="menuitem"
              >
                <span className="docsera-header__menu-item-identity">
                  <WorkspaceIconBadge workspace={workspace} className="docsera-header__menu-item-icon" />
                  <span className="docsera-header__menu-item-label" title={workspace.name}>
                    {workspace.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="docsera-header__menu-empty">No recent workspaces available.</div>
      )}
      <div className="docsera-header__menu-divider" aria-hidden="true" />
      <button type="button" className="docsera-header__menu-footer" onClick={onOpenMyWorkspaces} role="menuitem">
        <WorkspaceListIcon />
        <span>My Workspaces</span>
      </button>
    </div>
  );
}
