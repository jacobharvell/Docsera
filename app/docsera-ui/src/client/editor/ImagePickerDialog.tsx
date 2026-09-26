import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { EditorMediaAdapter, EditorMediaReference } from "./contracts";
import { useWorkspaceMediaObjectUrl } from "../shared/media/useWorkspaceMediaObjectUrl";
import { DocseraCompactTooltip } from "../shared/tooltip/DocseraTooltip";
import { ChevronLeft, Upload, X } from "lucide-react";

type ImagePickerDialogProps = {
  isOpen: boolean;
  mediaAdapter?: EditorMediaAdapter;
  onClose: () => void;
  onInsert?: (reference: EditorMediaReference) => void;
  onSelect?: (reference: EditorMediaReference) => void;
  overlayRoot: HTMLElement;
  sessionId: string;
};

type PickerViewState = "library" | "upload";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getFileExtension(fileName: string): string {
  const trimmed = cleanText(fileName);
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < trimmed.length - 1 ? trimmed.slice(dotIndex + 1).toLowerCase() : "";
}

function getMimeForExtension(extension: string): string | null {
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

function formatFileName(baseName: string): string {
  return cleanText(baseName);
}

function getSafeErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    return cleanText(error) || fallback;
  }

  if (error && typeof error === "object" && "message" in error) {
    return cleanText((error as { message?: unknown }).message) || fallback;
  }

  return fallback;
}

function canCreateObjectUrl(): boolean {
  return typeof URL.createObjectURL === "function";
}

function revokeObjectUrl(value: string | null): void {
  if (!value || typeof URL.revokeObjectURL !== "function") {
    return;
  }

  URL.revokeObjectURL(value);
}

function ImagePickerThumbnail({
  fileName,
  mediaAdapter,
  mediaId
}: {
  fileName: string;
  mediaAdapter?: EditorMediaAdapter;
  mediaId: string;
}) {
  const mediaState = useWorkspaceMediaObjectUrl({
    loadMedia: mediaAdapter?.load,
    mediaId
  });

  if (mediaState.status === "ready" && mediaState.objectUrl) {
    return <img className="docsera-image-picker__tile-image" src={mediaState.objectUrl} alt="" draggable={false} />;
  }

  return (
    <span className={`docsera-image-picker__tile-image docsera-image-picker__tile-image--${mediaState.status}`} aria-hidden="true">
      <span className="docsera-image-picker__tile-image-fallback">{fileName.slice(0, 1).toUpperCase() || "?"}</span>
    </span>
  );
}

function validateUploadFile(file: File | null, editedFileName: string): string | null {
  if (!file) {
    return "Choose an image file to continue.";
  }

  if (file.size <= 0) {
    return "The selected file is empty.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return "The selected file is larger than 10 MB.";
  }

  const normalizedFileName = cleanText(editedFileName);
  if (!normalizedFileName) {
    return "A file name is required.";
  }

  if (normalizedFileName.includes("/") || normalizedFileName.includes("\\") || normalizedFileName.includes("..")) {
    return "The file name cannot include a path or traversal intent.";
  }

  const extension = getFileExtension(normalizedFileName);
  if (!extension || !SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    return "The file name must end with a supported image extension.";
  }

  const expectedMime = getMimeForExtension(extension);
  const fileMime = cleanText(file.type).toLowerCase();
  if (!expectedMime || !SUPPORTED_IMAGE_MIME_TYPES.has(fileMime)) {
    return "The selected file type is not supported.";
  }

  if (fileMime !== expectedMime) {
    return "The file name extension and selected file type do not match.";
  }

  return null;
}

export function ImagePickerDialog({
  isOpen,
  mediaAdapter,
  onClose,
  onInsert,
  onSelect,
  overlayRoot,
  sessionId
}: ImagePickerDialogProps) {
  const pickerId = useId();
  const searchId = useId();
  const nameId = useId();
  const fileInputId = useId();
  const libraryScrollRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeSessionRef = useRef(sessionId);
  const objectUrlRef = useRef<string | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const uploadAttemptRef = useRef(0);
  const [view, setView] = useState<PickerViewState>("library");
  const [searchText, setSearchText] = useState("");
  const [libraryState, setLibraryState] = useState<{
    items: EditorMediaReference[];
    status: "idle" | "loading" | "ready" | "error";
    errorMessage: string;
  }>({
    items: [],
    status: "idle",
    errorMessage: ""
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editedFileName, setEditedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [libraryReloadToken, setLibraryReloadToken] = useState(0);
  const chooseMedia = onSelect ?? onInsert;

  const activeLibraryItems = useMemo(() => {
    const query = cleanText(searchText).toLowerCase();
    if (!query) {
      return libraryState.items;
    }

    return libraryState.items.filter((item) => cleanText(item.fileName).toLowerCase().includes(query));
  }, [libraryState.items, searchText]);

  const clearUploadSelection = useCallback(
    (options: { invalidateAttempt?: boolean } = {}) => {
      const { invalidateAttempt = false } = options;

      if (invalidateAttempt) {
        uploadAttemptRef.current += 1;
      }

      revokeObjectUrl(objectUrlRef.current);
      objectUrlRef.current = null;

      setSelectedFile(null);
      setEditedFileName("");
      setUploadError("");
      setIsUploading(false);
      setObjectUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    []
  );

  useEffect(() => {
    activeSessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setView("library");
    setSearchText("");
    clearUploadSelection();
    setLibraryState((current) => ({ ...current, status: "idle", errorMessage: "" }));
    pendingScrollTopRef.current = null;
    if (libraryScrollRef.current && typeof libraryScrollRef.current.scrollTo === "function") {
      libraryScrollRef.current.scrollTo({ top: 0 });
    }
    searchInputRef.current?.focus();
  }, [clearUploadSelection, isOpen]);

  useEffect(() => {
    if (!isOpen || !mediaAdapter) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLibraryState((current) => ({
      ...current,
      status: "loading",
      errorMessage: ""
    }));

    void mediaAdapter
      .list({ signal: controller.signal })
      .then((items) => {
        if (!active || controller.signal.aborted || activeSessionRef.current !== sessionId) {
          return;
        }

        setLibraryState({
          items,
          status: "ready",
          errorMessage: ""
        });
      })
      .catch(() => {
        if (!active || controller.signal.aborted || activeSessionRef.current !== sessionId) {
          return;
        }

        setLibraryState({
          items: [],
          status: "error",
          errorMessage: "Unable to load the workspace media library."
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, libraryReloadToken, mediaAdapter, sessionId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (objectUrlRef.current) {
      revokeObjectUrl(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!selectedFile || !canCreateObjectUrl()) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(selectedFile);
    objectUrlRef.current = nextUrl;
    setObjectUrl(nextUrl);

    return () => {
      if (objectUrlRef.current === nextUrl) {
        revokeObjectUrl(nextUrl);
        objectUrlRef.current = null;
      }
    };
  }, [isOpen, selectedFile]);

  useEffect(() => {
    if (view !== "library") {
      return;
    }

    const restoreTop = pendingScrollTopRef.current;
    if (restoreTop === null || !libraryScrollRef.current) {
      return;
    }

    const timer = window.requestAnimationFrame(() => {
      if (libraryScrollRef.current) {
        libraryScrollRef.current.scrollTop = restoreTop;
      }
      pendingScrollTopRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(timer);
    };
  }, [view]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (view === "upload" && searchInputRef.current) {
      searchInputRef.current.blur();
    }
  }, [isOpen, view]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    overlayRoot.ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      overlayRoot.ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, onClose, overlayRoot]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        revokeObjectUrl(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  if (!isOpen) {
    return null;
  }

  const closeDialog = () => {
    clearUploadSelection({ invalidateAttempt: true });
    onClose();
  };

  const openNativeChooser = () => {
    fileInputRef.current?.click();
  };

  const handleChooseFile = () => {
    const file = fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (view === "library" && libraryScrollRef.current) {
      pendingScrollTopRef.current = libraryScrollRef.current.scrollTop;
    }
    setSelectedFile(file);
    setEditedFileName(formatFileName(file.name));
    setUploadError("");
    setView("upload");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!mediaAdapter || !selectedFile || isUploading) {
      return;
    }

    const validationError = validateUploadFile(selectedFile, editedFileName);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const currentAttempt = uploadAttemptRef.current + 1;
    uploadAttemptRef.current = currentAttempt;
    setIsUploading(true);
    setUploadError("");

    const uploadFile = new File([selectedFile], editedFileName, { type: selectedFile.type });
    try {
      const result = await mediaAdapter.upload({ file: uploadFile });
      if (activeSessionRef.current !== sessionId || uploadAttemptRef.current !== currentAttempt) {
        return;
      }

      chooseMedia?.(result);
      closeDialog();
    } catch (error) {
      if (activeSessionRef.current !== sessionId || uploadAttemptRef.current !== currentAttempt) {
        return;
      }

      setUploadError(getSafeErrorMessage(error, "Unable to upload the selected image."));
      setIsUploading(false);
    }
  };

  const handleSelectExisting = (reference: EditorMediaReference) => {
    chooseMedia?.(reference);
    closeDialog();
  };

  return createPortal(
    <div className="docsera-modal docsera-image-picker__backdrop" role="presentation" onClick={closeDialog}>
      <div
        className="docsera-modal__surface docsera-image-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={pickerId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="docsera-image-picker__header">
          <h2 id={pickerId} className="docsera-image-picker__title">
            Select image
          </h2>
          <DocseraCompactTooltip label="Close image picker" ownerDocument={overlayRoot.ownerDocument}>
            <button type="button" className="docsera-modal__close docsera-image-picker__close" aria-label="Close image picker" onClick={closeDialog}>
              <X size={16} strokeWidth={2.25} aria-hidden="true" focusable="false" />
            </button>
          </DocseraCompactTooltip>
        </div>

        <input
          ref={fileInputRef}
          id={fileInputId}
          className="docsera-image-picker__hidden-input"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
          onChange={handleChooseFile}
        />

        {view === "library" ? (
          <div className="docsera-image-picker__library-view">
            <div className="docsera-image-picker__search-row">
              <input
                ref={searchInputRef}
                id={searchId}
                className="docsera-modal__input docsera-image-picker__search"
                type="search"
                placeholder="Search images"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>

            <div
              ref={libraryScrollRef}
              className="docsera-image-picker__library-scroll"
              aria-busy={libraryState.status === "loading" ? "true" : undefined}
            >
              <ul className="docsera-image-picker__grid" role="list">
                <li className="docsera-image-picker__grid-item">
                  <button
                    type="button"
                    className="docsera-image-picker__tile docsera-image-picker__tile--upload"
                    aria-label="Upload image"
                    onClick={openNativeChooser}
                  >
                    <span className="docsera-image-picker__tile-icon" aria-hidden="true">
                      <Upload size={18} strokeWidth={2.2} />
                    </span>
                    <span className="docsera-image-picker__tile-label">Upload</span>
                  </button>
                </li>
                {libraryState.status === "ready"
                  ? activeLibraryItems.map((item) => (
                      <li key={item.mediaId} className="docsera-image-picker__grid-item">
                        <button
                          type="button"
                          className="docsera-image-picker__tile"
                          aria-label={item.fileName}
                          onClick={() => handleSelectExisting(item)}
                        >
                          <span className="docsera-image-picker__tile-thumb" aria-hidden="true">
                            <ImagePickerThumbnail fileName={item.fileName} mediaAdapter={mediaAdapter} mediaId={item.mediaId} />
                          </span>
                        </button>
                      </li>
                    ))
                  : null}
              </ul>
            </div>

            {libraryState.status === "error" ? (
              <div className="docsera-image-picker__state" role="alert">
                <p className="docsera-main__lede">{libraryState.errorMessage}</p>
                <button
                  type="button"
                  className="docsera-modal__secondary docsera-image-picker__secondary-action"
                  onClick={() => {
                    setLibraryReloadToken((current) => current + 1);
                  }}
                >
                  Try again
                </button>
              </div>
            ) : libraryState.status === "ready" && activeLibraryItems.length === 0 ? (
              <div className="docsera-image-picker__state" role="status">
                <p className="docsera-main__lede">{searchText ? "No images match your search." : "This workspace has no images yet."}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="docsera-image-picker__upload-view">
            <button
              type="button"
              className="docsera-image-picker__back-button"
              onClick={() => {
                clearUploadSelection({ invalidateAttempt: true });
                setView("library");
                setUploadError("");
              }}
            >
              <ChevronLeft size={16} strokeWidth={2.25} aria-hidden="true" focusable="false" />
              <span>Go back</span>
            </button>

            <div className="docsera-image-picker__upload-preview">
              {objectUrl ? <img src={objectUrl} alt={selectedFile?.name ?? "Selected file preview"} /> : null}
            </div>

            <div className="docsera-image-picker__upload-fields">
              <div className="docsera-image-picker__field">
                <label htmlFor={nameId} className="docsera-modal__label">
                  Image file name
                </label>
                <input
                  id={nameId}
                  className="docsera-modal__input docsera-image-picker__input"
                  type="text"
                  value={editedFileName}
                  onChange={(event) => setEditedFileName(event.target.value)}
                />
              </div>

              <button
                type="button"
                className="docsera-modal__primary docsera-image-picker__primary-action"
                disabled={isUploading || !selectedFile}
                onClick={handleUpload}
              >
                {isUploading ? "Uploading..." : "Upload image"}
              </button>

              {uploadError ? (
                <p className="docsera-image-picker__error" role="alert">
                  {uploadError}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>,
    overlayRoot
  );
}
