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

const uploadedIconBlobCache = new WeakMap<WorkspaceUploadedIconLoader, Map<string, Blob>>();

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
  const [uploadedImage, setUploadedImage] = useState(() => ({
    path: uploadedIconPath && (!loadUploadedIcon || isLocalObjectUrl(uploadedIconPath)) ? uploadedIconPath : "",
    ready: false,
    src: uploadedIconPath && (!loadUploadedIcon || isLocalObjectUrl(uploadedIconPath)) ? uploadedIconPath : ""
  }));
  const [uploadedImageFailed, setUploadedImageFailed] = useState(false);
  const uploadedImageSrcRef = useRef(uploadedImage.src);
  const internallyCreatedObjectUrlRef = useRef("");
  const ownedExternalObjectUrlRef = useRef(ownedExternalObjectUrl);
  const releaseOwnedExternalObjectUrlRef = useRef(onReleaseOwnedExternalObjectUrl);
  const defaultIcon = builtInIcon?.glyph === "docsera-workspace";
  const GlyphIcon = builtInIcon && !defaultIcon ? builtInGlyphIcons[builtInIcon.glyph] : null;

  function setTrackedUploadedImage(value: { path: string; ready?: boolean; src: string }) {
    uploadedImageSrcRef.current = value.src;
    setUploadedImage({ path: value.path, ready: value.ready ?? false, src: value.src });
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
      setTrackedUploadedImage({ path: "", src: "" });
      return;
    }

    if (!loadUploadedIcon || isLocalObjectUrl(uploadedIconPath)) {
      if (uploadedImageSrcRef.current !== uploadedIconPath) {
        releaseTrackedLocalObjectUrl(uploadedImageSrcRef.current);
      }
      setTrackedUploadedImage({ path: uploadedIconPath, src: uploadedIconPath });
      return;
    }

    if (uploadedImageSrcRef.current && isLocalObjectUrl(uploadedImageSrcRef.current) && releaseOwnedExternalObjectUrl(uploadedImageSrcRef.current)) {
      setTrackedUploadedImage({ path: "", src: "" });
    }

    const controller = new AbortController();
    let active = true;
    let objectUrl = "";

    const cachedBlob = uploadedIconBlobCache.get(loadUploadedIcon)?.get(uploadedIconPath);
    const blobPromise = cachedBlob
      ? Promise.resolve(cachedBlob)
      : loadUploadedIcon({ assetPath: uploadedIconPath, signal: controller.signal });

    blobPromise.then((blob) => {
      if (!active) {
        return;
      }
      if (!blob) {
        if (uploadedImageSrcRef.current && isLocalObjectUrl(uploadedImageSrcRef.current) && releaseOwnedExternalObjectUrl(uploadedImageSrcRef.current)) {
          setTrackedUploadedImage({ path: "", src: "" });
        }
        setUploadedImageFailed(true);
        return;
      }
      if (!cachedBlob) {
        const cache = uploadedIconBlobCache.get(loadUploadedIcon) ?? new Map<string, Blob>();
        cache.set(uploadedIconPath, blob);
        uploadedIconBlobCache.set(loadUploadedIcon, cache);
      }
      objectUrl = URL.createObjectURL(blob);
      internallyCreatedObjectUrlRef.current = objectUrl;
      releaseTrackedLocalObjectUrl(uploadedImageSrcRef.current);
      setTrackedUploadedImage({ path: uploadedIconPath, src: objectUrl });
    }).catch(() => {
      if (active) {
        if (uploadedImageSrcRef.current && isLocalObjectUrl(uploadedImageSrcRef.current) && releaseOwnedExternalObjectUrl(uploadedImageSrcRef.current)) {
          setTrackedUploadedImage({ path: "", src: "" });
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

  const localUploadedImage = uploadedIconPath && isLocalObjectUrl(uploadedIconPath)
    ? { path: uploadedIconPath, ready: true, src: uploadedIconPath }
    : null;
  const displayedUploadedImage = localUploadedImage ?? uploadedImage;
  const showUploadedIcon = Boolean(uploadedIconPath && displayedUploadedImage.path === uploadedIconPath && displayedUploadedImage.src && !uploadedImageFailed);
  const showEmptyUploadedSlot = Boolean(uploadedIconPath && !showUploadedIcon);

  return (
    <span
      className={`docsera-workspace-icon-badge${builtInIcon ? " docsera-workspace-icon-badge--builtin" : ""}${defaultIcon ? " docsera-workspace-icon-badge--artwork" : ""}${showUploadedIcon || showEmptyUploadedSlot ? " docsera-workspace-icon-badge--uploaded" : ""}${showUploadedIcon && displayedUploadedImage.ready ? " docsera-workspace-icon-badge--uploaded-ready" : ""}${className ? ` ${className}` : ""}`}
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
          src={displayedUploadedImage.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          onLoad={() => {
            setUploadedImage((current) => current.path === uploadedIconPath && current.src === displayedUploadedImage.src ? { ...current, ready: true } : current);
          }}
          onError={() => {
            if (uploadedImageSrcRef.current && isLocalObjectUrl(uploadedImageSrcRef.current)) {
              releaseTrackedLocalObjectUrl(uploadedImageSrcRef.current);
              setTrackedUploadedImage({ path: "", src: "" });
            }
            setUploadedImageFailed(true);
          }}
        />
      ) : uploadedIconPath ? null : GlyphIcon ? (
        <DocseraIcon className="docsera-workspace-icon-badge__glyph" icon={GlyphIcon} />
      ) : (
        monogram
      )}
    </span>
  );
}

