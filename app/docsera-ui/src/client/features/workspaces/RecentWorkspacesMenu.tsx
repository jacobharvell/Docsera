import { WorkspaceIconBadge, type WorkspaceUploadedIconLoader } from "./WorkspacePrimitives";
import { WorkspaceListIcon } from "./DocseraHeaderIcons";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";

export type RecentWorkspaceItem = Pick<WorkspaceViewRecord, "icon" | "name" | "slug"> & {
  isCurrent?: boolean;
};

type RecentWorkspacesMenuProps = {
  currentWorkspaceSlug?: string;
  items: RecentWorkspaceItem[];
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  onOpenMyWorkspaces: () => void;
  onOpenWorkspace: (workspaceSlug: string, item?: RecentWorkspaceItem) => void;
};

export function RecentWorkspacesMenu({
  currentWorkspaceSlug = "",
  items,
  loadUploadedIcon,
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
              <DocseraCompactTooltip
                key={workspace.slug}
                label={workspace.name}
                resolveAnchorRect={(trigger) =>
                  trigger.querySelector<HTMLElement>(".docsera-header__menu-item-identity")?.getBoundingClientRect() ?? trigger.getBoundingClientRect()
                }
              >
                <button
                  type="button"
                  className={`docsera-header__menu-item${isCurrent ? " docsera-header__menu-item--current" : ""}`}
                  onClick={() => onOpenWorkspace(workspace.slug, workspace)}
                  role="menuitem"
                >
                  <span className="docsera-header__menu-item-identity">
                    <WorkspaceIconBadge workspace={workspace} className="docsera-header__menu-item-icon" loadUploadedIcon={loadUploadedIcon} />
                    <span className="docsera-header__menu-item-label">{workspace.name}</span>
                  </span>
                </button>
              </DocseraCompactTooltip>
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
