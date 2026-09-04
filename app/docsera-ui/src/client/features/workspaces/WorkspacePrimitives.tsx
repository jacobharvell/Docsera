import { useEffect, useRef, useState } from "react";
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

function isLocalObjectUrl(value: string): boolean {
  return value.startsWith("blob:");
}

export type WorkspaceUploadedIconLoader = (input: { assetPath: string; signal?: AbortSignal }) => Promise<Blob | null>;

export function WorkspaceIconBadge({
  loadUploadedIcon,
  onReleaseOwnedExternalObjectUrl,
  ownedExternalObjectUrl,
  workspace,
  className = ""
}: {
  className?: string;
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  onReleaseOwnedExternalObjectUrl?: (objectUrl: string) => void;
  ownedExternalObjectUrl?: string;
  workspace: Pick<WorkspaceViewRecord, "icon" | "name">;
}) {
  const source = cleanText(workspace.icon?.label) || cleanText(workspace.name) || "D";
  const monogram = source.charAt(0).toUpperCase();
  const builtInIcon = workspace.icon?.type === "builtin" ? findBuiltInWorkspaceIcon(workspace.icon.key) : null;
  const uploadedIconPath = workspace.icon?.type === "uploaded" ? cleanText(workspace.icon.assetPath) : "";
  const [uploadedImageSrc, setUploadedImageSrc] = useState(uploadedIconPath && (!loadUploadedIcon || isLocalObjectUrl(uploadedIconPath)) ? uploadedIconPath : "");
  const [uploadedImageFailed, setUploadedImageFailed] = useState(false);
  const uploadedImageSrcRef = useRef(uploadedImageSrc);
  const internallyCreatedObjectUrlRef = useRef("");
  const ownedExternalObjectUrlRef = useRef(ownedExternalObjectUrl);
  const releaseOwnedExternalObjectUrlRef = useRef(onReleaseOwnedExternalObjectUrl);
  const defaultIcon = builtInIcon?.glyph === "docsera-workspace";
  const GlyphIcon = builtInIcon && !defaultIcon ? builtInGlyphIcons[builtInIcon.glyph] : null;

  function setTrackedUploadedImageSrc(value: string) {
    uploadedImageSrcRef.current = value;
    setUploadedImageSrc(value);
  }

  function releaseOwnedExternalObjectUrl(objectUrl: string) {
    if (objectUrl && objectUrl === ownedExternalObjectUrlRef.current) {
      releaseOwnedExternalObjectUrlRef.current?.(objectUrl);
      return true;
    }
    return false;
  }

  function releaseTrackedLocalObjectUrl(objectUrl: string) {
    if (!objectUrl || !isLocalObjectUrl(objectUrl)) return;
    if (releaseOwnedExternalObjectUrl(objectUrl)) return;
    if (objectUrl === internallyCreatedObjectUrlRef.current) {
      URL.revokeObjectURL(objectUrl);
      internallyCreatedObjectUrlRef.current = "";
    }
  }

  useEffect(() => {
    ownedExternalObjectUrlRef.current = ownedExternalObjectUrl;
    releaseOwnedExternalObjectUrlRef.current = onReleaseOwnedExternalObjectUrl;
  }, [onReleaseOwnedExternalObjectUrl, ownedExternalObjectUrl]);

  useEffect(() => {
    setUploadedImageFailed(false);

    if (!uploadedIconPath) {
      releaseTrackedLocalObjectUrl(uploadedImageSrcRef.current);
      setTrackedUploadedImageSrc("");
      return;
    }

    if (!loadUploadedIcon || isLocalObjectUrl(uploadedIconPath)) {
      if (uploadedImageSrcRef.current !== uploadedIconPath) {
        releaseTrackedLocalObjectUrl(uploadedImageSrcRef.current);
      }
      setTrackedUploadedImageSrc(uploadedIconPath);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let objectUrl = "";

    loadUploadedIcon({ assetPath: uploadedIconPath, signal: controller.signal }).then((blob) => {
      if (!active) {
        return;
      }
      if (!blob) {
        if (uploadedImageSrcRef.current && isLocalObjectUrl(uploadedImageSrcRef.current) && releaseOwnedExternalObjectUrl(uploadedImageSrcRef.current)) {
          setTrackedUploadedImageSrc("");
        }
        setUploadedImageFailed(true);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      internallyCreatedObjectUrlRef.current = objectUrl;
      releaseTrackedLocalObjectUrl(uploadedImageSrcRef.current);
      setTrackedUploadedImageSrc(objectUrl);
    }).catch(() => {
      if (active) {
        if (uploadedImageSrcRef.current && isLocalObjectUrl(uploadedImageSrcRef.current) && releaseOwnedExternalObjectUrl(uploadedImageSrcRef.current)) {
          setTrackedUploadedImageSrc("");
        }
        setUploadedImageFailed(true);
      }
    });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl && objectUrl === internallyCreatedObjectUrlRef.current) {
        URL.revokeObjectURL(objectUrl);
        internallyCreatedObjectUrlRef.current = "";
      }
    };
  }, [loadUploadedIcon, uploadedIconPath]);

  useEffect(() => {
    return () => {
      const current = uploadedImageSrcRef.current;
      if (current && current === ownedExternalObjectUrlRef.current) {
        releaseOwnedExternalObjectUrl(current);
      }
    };
  }, []);

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
          onError={() => {
            if (uploadedImageSrcRef.current && isLocalObjectUrl(uploadedImageSrcRef.current) && releaseOwnedExternalObjectUrl(uploadedImageSrcRef.current)) {
              setTrackedUploadedImageSrc("");
            }
            setUploadedImageFailed(true);
          }}
        />
      ) : GlyphIcon ? (
        <DocseraIcon className="docsera-workspace-icon-badge__glyph" icon={GlyphIcon} />
      ) : (
        monogram
      )}
    </span>
  );
}

