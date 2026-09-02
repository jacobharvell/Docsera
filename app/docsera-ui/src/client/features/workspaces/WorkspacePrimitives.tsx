import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { getDefaultWorkspaceIconSrc } from "./defaultWorkspaceIconAsset";
import { findBuiltInWorkspaceIcon, type BuiltInWorkspaceIconGlyph } from "../../../shared/workspaces/domain";

const builtInGlyphIcons = {
  "book-open": docseraIcons.bookOpen,
  briefcase: docseraIcons.briefcaseBusiness,
  building: docseraIcons.building,
  "clipboard-list": docseraIcons.clipboardList,
  code: docseraIcons.code,
  "docsera-workspace": null,
  "folder-kanban": docseraIcons.folderKanban,
  "graduation-cap": docseraIcons.graduationCap,
  lightbulb: docseraIcons.lightbulb,
  "monitor-cog": docseraIcons.monitorCog,
  "shield-check": docseraIcons.shieldCheck,
  users: docseraIcons.users
} satisfies Record<BuiltInWorkspaceIconGlyph, (typeof docseraIcons)[keyof typeof docseraIcons] | null>;

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
  const builtInIcon = workspace.icon?.type === "builtin" ? findBuiltInWorkspaceIcon(workspace.icon.key) : null;
  const defaultIcon = builtInIcon?.glyph === "docsera-workspace";
  const GlyphIcon = builtInIcon && !defaultIcon ? builtInGlyphIcons[builtInIcon.glyph] : null;

  return (
    <span
      className={`docsera-workspace-icon-badge${builtInIcon ? " docsera-workspace-icon-badge--builtin" : ""}${defaultIcon ? " docsera-workspace-icon-badge--artwork" : ""}${className ? ` ${className}` : ""}`}
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
      ) : GlyphIcon ? (
        <DocseraIcon className="docsera-workspace-icon-badge__glyph" icon={GlyphIcon} />
      ) : (
        monogram
      )}
    </span>
  );
}

