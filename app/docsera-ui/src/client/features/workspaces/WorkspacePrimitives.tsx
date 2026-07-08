import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import { getDefaultWorkspaceIconSrc } from "./defaultWorkspaceIconAsset";

function isDefaultWorkspaceIcon(workspace: Pick<WorkspaceViewRecord, "icon" | "name">): boolean {
  return cleanText(workspace.icon?.key) === "docsera-workspace";
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function WorkspaceIconBadge({
  workspace,
  className = ""
}: {
  className?: string;
  workspace: Pick<WorkspaceViewRecord, "icon" | "name">;
}) {
  const source = cleanText(workspace.icon?.label) || cleanText(workspace.name) || "D";
  const monogram = source.charAt(0).toUpperCase();
  const defaultIcon = isDefaultWorkspaceIcon(workspace);

  return (
    <span
      className={`docsera-workspace-icon-badge${defaultIcon ? " docsera-workspace-icon-badge--artwork" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {defaultIcon ? (
        <img
          className="docsera-workspace-icon-badge__artwork"
          src={getDefaultWorkspaceIconSrc()}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ) : (
        monogram
      )}
    </span>
  );
}

