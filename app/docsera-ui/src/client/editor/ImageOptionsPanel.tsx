import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { Trash2, Upload } from "lucide-react";
import { ImagePickerDialog } from "./ImagePickerDialog";
import type { EditorMediaAdapter, EditorMediaReference } from "./contracts";
import { canonicalizeDocseraImageAttrs, type DocseraImageAttrs } from "../../shared/editor/imageContract";

type ImageOptionsMediaTarget = "light" | "dark";

type ImageOptionsMediaLabelState = "available" | "pending" | "unavailable" | "unset";

type ImageOptionsDraft = {
  alt: string;
  caption: string;
  darkMediaId: string | null;
  mediaId: string;
};

export type ImageOptionsPanelProps = {
  blockIndex: number;
  editor: Editor;
  initialAttrs: DocseraImageAttrs;
  isEscapeDismissalDeferred?: boolean;
  panelId: string;
  mediaAdapter?: EditorMediaAdapter;
  onClose: () => void;
  overlayRoot: HTMLElement;
  panelStyle: CSSProperties;
  sessionId: string;
};

const readonlyMediaValueStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  height: "34px",
  minHeight: "34px",
  padding: "0 12px",
  border: "1px solid var(--docsera-border)",
  borderRadius: "4px",
  background: "var(--docsera-surface-muted)",
  color: "var(--docsera-text-muted)",
  font: "inherit",
  fontSize: "0.875rem",
  fontWeight: 500,
  lineHeight: "34px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  cursor: "default",
  outline: "none",
  boxShadow: "none",
  appearance: "none",
  WebkitAppearance: "none",
  caretColor: "transparent"
};

function getTopLevelBlockPosition(editor: Editor, blockIndex: number): number | null {
  let blockPosition: number | null = null;

  editor.state.doc.forEach((_node, offset, index) => {
    if (index === blockIndex) {
      blockPosition = offset;
    }
  });

  return blockPosition;
}

function getTopLevelBlockNode(editor: Editor, blockIndex: number) {
  if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) {
    return null;
  }

  return editor.state.doc.child(blockIndex);
}

function makeDraft(attrs: DocseraImageAttrs): ImageOptionsDraft {
  return {
    alt: attrs.alt,
    caption: attrs.caption,
    darkMediaId: attrs.darkMediaId,
    mediaId: attrs.mediaId
  };
}

function areDraftsEqual(left: ImageOptionsDraft, right: ImageOptionsDraft): boolean {
  return (
    left.mediaId === right.mediaId &&
      left.darkMediaId === right.darkMediaId &&
      left.alt === right.alt &&
      left.caption === right.caption
  );
}

function mergeMediaCatalog(items: EditorMediaReference[], current: Map<string, string>): Map<string, string> {
  const next = new Map(current);
  for (const item of items) {
    next.set(item.mediaId, item.fileName);
  }
  return next;
}

function resolveMediaLabel(
  mediaCatalogLoaded: boolean,
  mediaCatalog: Map<string, string>,
  mediaId: string | null
): { label: string; state: ImageOptionsMediaLabelState } {
  if (!mediaId) {
    return { label: "Not configured", state: "unset" };
  }

  const resolvedLabel = mediaCatalog.get(mediaId);
  if (resolvedLabel) {
    return { label: resolvedLabel, state: "available" };
  }

  if (!mediaCatalogLoaded) {
    return { label: "Loading…", state: "pending" };
  }

  return { label: "Media unavailable", state: "unavailable" };
}

export function ImageOptionsPanel({
  blockIndex,
  editor,
  initialAttrs,
  panelId,
  mediaAdapter,
  isEscapeDismissalDeferred = false,
  onClose,
  overlayRoot,
  panelStyle,
  sessionId
}: ImageOptionsPanelProps) {
  const titleId = useId();
  const pickerSessionIdRef = useRef(0);
  const [draft, setDraft] = useState<ImageOptionsDraft>(() => makeDraft(initialAttrs));
  const [mediaCatalog, setMediaCatalog] = useState<Map<string, string>>(() => new Map());
  const [mediaCatalogLoaded, setMediaCatalogLoaded] = useState<boolean>(() => !mediaAdapter);
  const [pickerTarget, setPickerTarget] = useState<ImageOptionsMediaTarget | null>(null);
  const [pickerSessionId, setPickerSessionId] = useState("");

  useEffect(() => {
    setDraft(makeDraft(initialAttrs));
    setMediaCatalog(new Map());
    setMediaCatalogLoaded(!mediaAdapter);
    setPickerTarget(null);
    setPickerSessionId("");
    pickerSessionIdRef.current += 1;
  }, [blockIndex, initialAttrs, mediaAdapter, sessionId]);

  useEffect(() => {
    if (!mediaAdapter) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    void mediaAdapter
      .list({ signal: controller.signal })
      .then((items) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        setMediaCatalog((current) => mergeMediaCatalog(items, current));
        setMediaCatalogLoaded(true);
      })
      .catch(() => {
        if (!active || controller.signal.aborted) {
          return;
        }

        setMediaCatalogLoaded(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [initialAttrs.mediaId, mediaAdapter, sessionId]);

  useEffect(() => {
    if (pickerTarget) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (isEscapeDismissalDeferred) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    overlayRoot.ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => overlayRoot.ownerDocument.removeEventListener("keydown", handleKeyDown, true);
  }, [isEscapeDismissalDeferred, onClose, overlayRoot, pickerTarget]);

  const lightMediaLabel = resolveMediaLabel(mediaCatalogLoaded, mediaCatalog, draft.mediaId);
  const darkMediaLabel = resolveMediaLabel(mediaCatalogLoaded, mediaCatalog, draft.darkMediaId);
  const canSave = Boolean(editor && !editor.isDestroyed);

  const closePicker = () => {
    setPickerTarget(null);
    setPickerSessionId("");
  };

  const openPicker = (target: ImageOptionsMediaTarget) => {
    pickerSessionIdRef.current += 1;
    setPickerTarget(target);
    setPickerSessionId(`image-options-picker-${sessionId}-${pickerSessionIdRef.current}`);
  };

  const handleSelectMedia = (reference: EditorMediaReference) => {
    setMediaCatalog((current) => {
      const next = new Map(current);
      next.set(reference.mediaId, reference.fileName);
      return next;
    });

    setDraft((current) =>
      pickerTarget === "dark"
        ? {
            ...current,
            darkMediaId: reference.mediaId
          }
        : {
            ...current,
            mediaId: reference.mediaId
          }
    );
    closePicker();
  };

  const handleSave = () => {
    if (!canSave) {
      onClose();
      return;
    }

    const node = getTopLevelBlockNode(editor, blockIndex);
    if (!node || node.type.name !== "image") {
      onClose();
      return;
    }

    const position = getTopLevelBlockPosition(editor, blockIndex);
    if (position === null) {
      onClose();
      return;
    }

    const liveAttrs = canonicalizeDocseraImageAttrs(node.attrs);
    const nextAttrs = {
      ...liveAttrs,
      mediaId: draft.mediaId,
      darkMediaId: draft.darkMediaId,
      alt: draft.alt,
      caption: draft.caption
    };

    if (areDraftsEqual(makeDraft(liveAttrs), draft)) {
      onClose();
      return;
    }

    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .command(({ tr, dispatch }) => {
        tr.setNodeMarkup(position, undefined, nextAttrs);
        dispatch?.(tr);
        return true;
      })
      .run();
    onClose();
  };

  const handleDelete = () => {
    if (!canSave) {
      onClose();
      return;
    }

    const node = getTopLevelBlockNode(editor, blockIndex);
    if (!node || node.type.name !== "image") {
      onClose();
      return;
    }

    const position = getTopLevelBlockPosition(editor, blockIndex);
    if (position === null) {
      onClose();
      return;
    }

    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .command(({ tr, dispatch }) => {
        tr.delete(position, position + node.nodeSize);
        const nextSelectionAnchor = Math.min(position, tr.doc.content.size);
        try {
          tr.setSelection(Selection.near(tr.doc.resolve(nextSelectionAnchor), -1));
        } catch {
          // Let ProseMirror resolve the cursor position naturally when the nearby selection lookup fails.
        }
        dispatch?.(tr);
        return true;
      })
      .run();
    onClose();
  };

  if (!canSave) {
    return null;
  }

  return createPortal(
    <div
      className="docsera-image-options-panel"
      id={panelId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={panelStyle}
      data-surface="image-options"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="docsera-image-options-panel__header">
        <h2 id={titleId} className="docsera-image-options-panel__title">
          Image Options
        </h2>
      </div>
      <div className="docsera-image-options-panel__header-divider" aria-hidden="true" />

      <div className="docsera-image-options-panel__body">
        <div className="docsera-image-options-panel__field docsera-image-options-panel__media-field">
          <span id={`${titleId}-light-media-label`} className="docsera-image-options-panel__field-label">
            Light mode image
          </span>
          <div className="docsera-image-options-panel__media-row">
            <input
              id={`${titleId}-light-media`}
              className={`docsera-image-options-panel__media-value docsera-image-options-panel__media-value--${lightMediaLabel.state}`}
              style={readonlyMediaValueStyle}
              type="text"
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              aria-labelledby={`${titleId}-light-media-label`}
              title={lightMediaLabel.label}
              value={lightMediaLabel.label}
            />
            <button
              type="button"
              className="docsera-image-options-panel__chip"
              disabled={!mediaAdapter}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => openPicker("light")}
            >
              <Upload size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
              <span style={{ marginInlineStart: 6 }}>Upload</span>
            </button>
          </div>
        </div>

        <div className="docsera-image-options-panel__field docsera-image-options-panel__media-field">
          <span id={`${titleId}-dark-media-label`} className="docsera-image-options-panel__field-label">
            Dark mode image
          </span>
          <div className="docsera-image-options-panel__media-row">
            <input
              aria-labelledby={`${titleId}-dark-media-label`}
              className={`docsera-image-options-panel__media-value docsera-image-options-panel__media-value--${darkMediaLabel.state}`}
              style={readonlyMediaValueStyle}
              type="text"
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              title={darkMediaLabel.label}
              value={darkMediaLabel.label}
            />
            <button
              type="button"
              className="docsera-image-options-panel__chip"
              disabled={!mediaAdapter}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => openPicker("dark")}
            >
              <Upload size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
              <span style={{ marginInlineStart: 6 }}>Upload</span>
            </button>
          </div>
        </div>

        <label className="docsera-image-options-panel__field" htmlFor={`${titleId}-alt`}>
          <span className="docsera-image-options-panel__field-label">Alt text</span>
          <input
            id={`${titleId}-alt`}
            className="docsera-image-options-panel__input"
            type="text"
            value={draft.alt}
            onChange={(event) => {
              const nextAlt = event.target.value;
              setDraft((current) => ({ ...current, alt: nextAlt }));
            }}
          />
        </label>

        <label className="docsera-image-options-panel__field" htmlFor={`${titleId}-caption`}>
          <span className="docsera-image-options-panel__field-label">Caption</span>
          <input
            id={`${titleId}-caption`}
            className="docsera-image-options-panel__input"
            type="text"
            placeholder="Enter caption"
            value={draft.caption}
            onChange={(event) => {
              const nextCaption = event.target.value;
              setDraft((current) => ({ ...current, caption: nextCaption }));
            }}
          />
        </label>
      </div>

      <div className="docsera-image-options-panel__footer">
        <div className="docsera-image-options-panel__footer-actions">
          <button
            type="button"
            className="docsera-image-options-panel__button docsera-image-options-panel__button--destructive"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleDelete}
          >
            <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
            <span style={{ marginInlineStart: 6 }}>Delete</span>
          </button>
          <button
            type="button"
            className="docsera-image-options-panel__button docsera-image-options-panel__button--primary"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleSave}
          >
            Save Changes
          </button>
        </div>
      </div>

      <ImagePickerDialog
        isOpen={pickerTarget !== null}
        mediaAdapter={mediaAdapter}
        onClose={closePicker}
        onSelect={handleSelectMedia}
        overlayRoot={overlayRoot}
        sessionId={pickerSessionId}
      />
    </div>,
    overlayRoot
  );
}
