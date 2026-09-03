import { useEffect, useState } from "react";
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

export type WorkspaceUploadedIconLoader = (input: { assetPath: string; signal?: AbortSignal }) => Promise<Blob | null>;

export function WorkspaceIconBadge({
  loadUploadedIcon,
  workspace,
  className = ""
}: {
  className?: string;
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  workspace: Pick<WorkspaceViewRecord, "icon" | "name">;
}) {
  const source = cleanText(workspace.icon?.label) || cleanText(workspace.name) || "D";
  const monogram = source.charAt(0).toUpperCase();
  const builtInIcon = workspace.icon?.type === "builtin" ? findBuiltInWorkspaceIcon(workspace.icon.key) : null;
  const uploadedIconPath = workspace.icon?.type === "uploaded" ? cleanText(workspace.icon.assetPath) : "";
  const [uploadedImageSrc, setUploadedImageSrc] = useState(uploadedIconPath && !loadUploadedIcon ? uploadedIconPath : "");
  const [uploadedImageFailed, setUploadedImageFailed] = useState(false);
  const defaultIcon = builtInIcon?.glyph === "docsera-workspace";
  const GlyphIcon = builtInIcon && !defaultIcon ? builtInGlyphIcons[builtInIcon.glyph] : null;

  useEffect(() => {
    setUploadedImageFailed(false);

    if (!uploadedIconPath) {
      setUploadedImageSrc("");
      return;
    }

    if (!loadUploadedIcon) {
      setUploadedImageSrc(uploadedIconPath);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let objectUrl = "";
    setUploadedImageSrc("");

    loadUploadedIcon({ assetPath: uploadedIconPath, signal: controller.signal }).then((blob) => {
      if (!active) {
        return;
      }
      if (!blob) {
        setUploadedImageFailed(true);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUploadedImageSrc(objectUrl);
    }).catch(() => {
      if (active) {
        setUploadedImageFailed(true);
      }
    });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [loadUploadedIcon, uploadedIconPath]);

  const showUploadedIcon = uploadedIconPath && uploadedImageSrc && !uploadedImageFailed;

  return (
    <span
      className={`docsera-workspace-icon-badge${builtInIcon ? " docsera-workspace-icon-badge--builtin" : ""}${defaultIcon ? " docsera-workspace-icon-badge--artwork" : ""}${showUploadedIcon ? " docsera-workspace-icon-badge--uploaded" : ""}${className ? ` ${className}` : ""}`}
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
      ) : showUploadedIcon ? (
        <img
          className="docsera-workspace-icon-badge__uploaded-image"
          src={uploadedImageSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={() => setUploadedImageFailed(true)}
        />
      ) : GlyphIcon ? (
        <DocseraIcon className="docsera-workspace-icon-badge__glyph" icon={GlyphIcon} />
      ) : (
        monogram
      )}
    </span>
  );
}

