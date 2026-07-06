import type { WorkspaceViewRecord } from "../../shared/types/docsera";

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

  return (
    <span className={`docsera-workspace-icon-badge${className ? ` ${className}` : ""}`} aria-hidden="true">
      {monogram}
    </span>
  );
}

