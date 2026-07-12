import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { getMarkRange } from "@tiptap/core";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DocseraDocumentEnvelope, DocseraTiptapDocument } from "../../shared/editor/document";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION, parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import { createDocseraEditorExtensions, isDocseraAllowedLinkHref } from "../../shared/editor/schema";
import { extractDocumentOutline, type EditorOutlineItem } from "./documentOutline";
import { sanitizeDocseraPastedHTML, sanitizeDocseraPastedText } from "./pasteSanitizer";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { DocseraIcon } from "../shared/icons/DocseraIcon";
import { docseraIcons } from "../shared/icons/docseraIcons";
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Type
} from "lucide-react";

type PageEditorHostRuntimeProps = {
  canEdit: boolean;
  headerControlsRoot: HTMLElement | null;
  initialEnvelope: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onRuntimeError?: () => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onEditorReady?: (editor: Editor) => void;
  onStatusChange: (state: { isDirty: boolean; isSaving: boolean }) => void;
  overlayRoot: HTMLElement;
  pageSysId: string;
  theme: "dark" | "light";
};

export type PageEditorHostRuntimeHandle = {
  destroy: () => void;
  update: (nextProps: PageEditorHostRuntimeProps) => void;
};

type RuntimeBoundaryProps = {
  children: React.ReactNode;
  onRuntimeError: (error: unknown) => void;
};

type RuntimeBoundaryState = {
  hasError: boolean;
};

type RuntimeStatus = "dirty" | "failed" | "saved" | "saving";

type SlashCommandId =
  | "paragraph"
  | "heading2"
  | "heading3"
  | "bulletedList"
  | "numberedList"
  | "taskList"
  | "blockquote"
  | "horizontalRule"
  | "codeBlock";

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  keywords: string[];
  run: (editor: Editor) => void;
};

type LinkSurfaceState =
  | {
      from: number;
      to: number;
      draftHref: string;
      mode: "create";
    }
  | {
      from: number;
      to: number;
      draftHref: string;
      mode: "edit";
    };

const SLASH_MENU_WIDTH = 316;
const BUBBLE_MENU_WIDTH = 264;
const LINK_MENU_WIDTH = 336;
const POPOVER_GAP = 10;
const VIEWPORT_GUTTER = 12;
const SAFE_LINK_ATTRIBUTES = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
  class: null,
  title: null
} as const;

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "paragraph",
    label: "Paragraph",
    keywords: ["text", "body", "normal"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).setParagraph().run();
    }
  },
  {
    id: "heading2",
    label: "Heading 2",
    keywords: ["h2", "heading", "title"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 2 }).run();
    }
  },
  {
    id: "heading3",
    label: "Heading 3",
    keywords: ["h3", "heading", "subtitle"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 3 }).run();
    }
  },
  {
    id: "bulletedList",
    label: "Bulleted list",
    keywords: ["bullet", "unordered", "list"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run();
    }
  },
  {
    id: "numberedList",
    label: "Numbered list",
    keywords: ["numbered", "ordered", "list"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run();
    }
  },
  {
    id: "taskList",
    label: "Task list",
    keywords: ["task", "todo", "checklist"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleTaskList().run();
    }
  },
  {
    id: "blockquote",
    label: "Blockquote",
    keywords: ["quote", "callout", "blockquote"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleBlockquote().run();
    }
  },
  {
    id: "horizontalRule",
    label: "Horizontal rule",
    keywords: ["rule", "separator", "divider"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertContent([{ type: "horizontalRule" }, { type: "paragraph" }]).run();
    }
  },
  {
    id: "codeBlock",
    label: "Code block",
    keywords: ["code", "pre", "snippet"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleCodeBlock().run();
    }
  }
];

const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";

class RuntimeBoundary extends React.Component<RuntimeBoundaryProps, RuntimeBoundaryState> {
  state: RuntimeBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RuntimeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onRuntimeError(error);
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function renderRuntimeRoot(reactRoot: Root, props: PageEditorHostRuntimeProps): void {
  reactRoot.render(
    <RuntimeBoundary
      onRuntimeError={() => {
        props.onRuntimeError?.();
      }}
    >
      <PageEditorHostRuntime {...props} />
    </RuntimeBoundary>
  );
}

export function mountPageEditorHostRuntime(input: {
  props: PageEditorHostRuntimeProps;
  runtimeRoot: HTMLElement;
}): PageEditorHostRuntimeHandle {
  const reactRoot = createRoot(input.runtimeRoot);
  let currentProps = input.props;

  renderRuntimeRoot(reactRoot, currentProps);

  return {
    destroy() {
      reactRoot.unmount();
    },
    update(nextProps) {
      currentProps = nextProps;
      renderRuntimeRoot(reactRoot, currentProps);
    }
  };
}

function cloneEnvelope(envelope: DocseraDocumentEnvelope): DocseraDocumentEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as DocseraDocumentEnvelope;
}

function getSafeLinkAttributes(href: string) {
  return {
    href,
    ...SAFE_LINK_ATTRIBUTES
  };
}

function isTextSelection(selection: unknown): selection is TextSelection {
  return selection instanceof TextSelection;
}

function isNodeSelection(selection: unknown): selection is NodeSelection {
  return selection instanceof NodeSelection;
}

function getCurrentSelectionRange(editor: Editor): { from: number; to: number } | null {
  const { selection } = editor.state;
  if (!isTextSelection(selection) || selection.empty) {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to
  };
}

function getSlashQuery(editor: Editor): {
  from: number;
  to: number;
  query: string;
} | null {
  const { selection } = editor.state;
  if (!isTextSelection(selection) || !selection.empty || !editor.isEditable) {
    return null;
  }

  const { $from } = selection;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.spec.code) {
    return null;
  }

  const text = parent.textBetween(0, $from.parentOffset, "", "");
  if (!text.startsWith("/")) {
    return null;
  }

  const query = text.slice(1);
  if (!/^[a-z0-9 -]*$/i.test(query)) {
    return null;
  }

  return {
    from: $from.start(),
    to: selection.from,
    query
  };
}

function getSelectionBounds(editor: Editor): DOMRect | null {
  const { selection } = editor.state;
  if (!editor.isEditable || isNodeSelection(selection) || !selection || !editor.view) {
    return null;
  }

  try {
    const fromRect = editor.view.coordsAtPos(selection.from);
    const toRect = editor.view.coordsAtPos(selection.to);
    const left = Math.min(fromRect.left, toRect.left);
    const right = Math.max(fromRect.right, toRect.right);
    const top = Math.min(fromRect.top, toRect.top);
    const bottom = Math.max(fromRect.bottom, toRect.bottom);
    return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
  } catch {
    return null;
  }
}

function getCaretBounds(editor: Editor): DOMRect | null {
  const { selection } = editor.state;
  if (!editor.isEditable || !isTextSelection(selection)) {
    return null;
  }

  try {
    const rect = editor.view.coordsAtPos(selection.from);
    return new DOMRect(rect.left, rect.top, Math.max(1, rect.right - rect.left), Math.max(1, rect.bottom - rect.top));
  } catch {
    return null;
  }
}

function clampSurfacePosition(ownerDocument: Document, rect: DOMRect, width: number, height: number, preferAbove = false): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const maxSurfaceHeight = Math.max(1, viewportHeight - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(width, maxSurfaceWidth));
  const clampedHeight = Math.max(1, Math.min(height, maxSurfaceHeight));
  const left = Math.min(Math.max(VIEWPORT_GUTTER, rect.left), Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER));
  const belowTop = rect.bottom + POPOVER_GAP;
  const aboveTop = rect.top - clampedHeight - POPOVER_GAP;
  const top = preferAbove && aboveTop >= VIEWPORT_GUTTER ? aboveTop : Math.min(Math.max(VIEWPORT_GUTTER, belowTop), Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER));

  return {
    left,
    top,
    width: `${clampedWidth}px`,
    maxWidth: `${maxSurfaceWidth}px`
  };
}

function getSlashCommandMatches(query: string): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter((command) => {
    const haystack = [command.label, ...command.keywords].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function findLinkRange(editor: Editor): { from: number; to: number; href: string } | null {
  const { selection } = editor.state;
  const linkType = editor.schema.marks.link;
  if (!linkType) {
    return null;
  }

  const range = getMarkRange(selection.$from, linkType);
  if (!range) {
    return null;
  }

  const attrs = editor.getAttributes("link");
  const href = typeof attrs.href === "string" ? attrs.href : "";
  return {
    from: range.from,
    to: range.to,
    href
  };
}

function buildSurfaceStyle(ownerDocument: Document, rect: DOMRect, width: number, height: number, preferAbove = false): CSSProperties {
  return {
    position: "fixed",
    ...clampSurfacePosition(ownerDocument, rect, width, height, preferAbove)
  };
}

function BubbleButton({
  active,
  children,
  label,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`docsera-editor-floating__chip${active ? " docsera-editor-floating__chip--active" : ""}`}
      aria-pressed={Boolean(active)}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SlashCommandIcon({ id }: { id: SlashCommandId }) {
  switch (id) {
    case "paragraph":
      return <Type size={16} strokeWidth={2} />;
    case "heading2":
      return <Heading2 size={16} strokeWidth={2} />;
    case "heading3":
      return <Heading3 size={16} strokeWidth={2} />;
    case "bulletedList":
      return <List size={16} strokeWidth={2} />;
    case "numberedList":
      return <ListOrdered size={16} strokeWidth={2} />;
    case "taskList":
      return <CheckIcon />;
    case "blockquote":
      return <Quote size={16} strokeWidth={2} />;
    case "horizontalRule":
      return <Minus size={16} strokeWidth={2} />;
    case "codeBlock":
    default:
      return <Code2 size={16} strokeWidth={2} />;
  }
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3 8.5 6.2 11.7 13 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FloatingIconButton({
  active,
  label,
  onClick,
  children
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`docsera-editor-floating__icon-button${active ? " docsera-editor-floating__icon-button--active" : ""}`}
      aria-pressed={Boolean(active)}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LinkFieldIcon() {
  return <Link2 size={15} strokeWidth={2} />;
}

function applySlashCommand(editor: Editor, command: SlashCommand, range: { from: number; to: number }) {
  editor.chain().focus(undefined, { scrollIntoView: false }).deleteRange(range).run();
  command.run(editor);
}

function restoreSelection(editor: Editor, from: number, to: number) {
  editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from, to }).run();
}

function getEditorSelectionRole(selection: unknown): string {
  if (isNodeSelection(selection)) {
    return "node";
  }

  if (isTextSelection(selection)) {
    return selection.empty ? "collapsed" : "text";
  }

  return "other";
}

function normalizeDocument(document: DocseraTiptapDocument): DocseraTiptapDocument {
  const cloned = JSON.parse(JSON.stringify(document)) as DocseraTiptapDocument;
  return {
    ...cloned,
    content: Array.isArray(cloned.content) ? cloned.content : []
  };
}

function serializeDocument(document: DocseraTiptapDocument): string {
  return JSON.stringify(
    parseDocseraDocumentOrThrow({
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: normalizeDocument(document)
    })
  );
}

function createEnvelope(document: DocseraTiptapDocument): DocseraDocumentEnvelope {
  const envelope = {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: normalizeDocument(document)
  };

  return parseDocseraDocumentOrThrow(envelope);
}

function statusLabel(status: RuntimeStatus): string {
  switch (status) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "failed":
      return "Save failed";
    case "saved":
    default:
      return "Saved";
  }
}

export function PageEditorHostRuntime({
  canEdit,
  headerControlsRoot,
  initialEnvelope,
  initialRevision,
  onAccessLost,
  onOutlineChange,
  onSaveDraft,
  onEditorReady,
  onStatusChange,
  overlayRoot,
  pageSysId,
  theme
}: PageEditorHostRuntimeProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [linkSurface, setLinkSurface] = useState<LinkSurfaceState | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [dismissedSlashKey, setDismissedSlashKey] = useState("");
  const [, setLayoutTick] = useState(0);
  const validatedInitialEnvelope = useMemo(() => parseDocseraDocumentOrThrow(initialEnvelope), [initialEnvelope]);
  const editorExtensions = useMemo(() => createDocseraEditorExtensions(), []);
  const editorProps = useMemo(
    () => ({
      transformPastedHTML: sanitizeDocseraPastedHTML,
      transformPastedText: sanitizeDocseraPastedText,
      handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor || !canEditRef.current) {
          return false;
        }

        const slashQuery = getSlashQuery(runtimeEditor);
        const slashOptions = slashQuery ? getSlashCommandMatches(slashQuery.query) : [];
        if (slashQuery) {
          const currentSlashKey = `${slashQuery.from}:${slashQuery.to}:${slashQuery.query}`;
          if (dismissedSlashKeyRef.current === currentSlashKey && event.key !== "Escape") {
            return false;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            if (event.key === "ArrowDown") {
              const nextIndex = slashOptions.length ? (slashActiveIndexRef.current + 1) % slashOptions.length : -1;
              setSlashActiveIndex(nextIndex);
              return true;
            }

            if (event.key === "ArrowUp") {
              const nextIndex = slashOptions.length
                ? (slashActiveIndexRef.current - 1 + slashOptions.length) % slashOptions.length
                : -1;
              setSlashActiveIndex(nextIndex);
              return true;
            }

            if (event.key === "Escape") {
              setDismissedSlashKey(`${slashQuery.from}:${slashQuery.to}:${slashQuery.query}`);
              return true;
            }

            if (event.key === "Enter") {
              const activeCommand = slashOptions[Math.max(0, slashActiveIndexRef.current)] ?? slashOptions[0];
              if (activeCommand) {
                applySlashCommand(runtimeEditor, activeCommand, { from: slashQuery.from, to: slashQuery.to });
                setSlashActiveIndex(0);
                setDismissedSlashKey("");
                return true;
              }
            }
          }
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          const selectedLink = findLinkRange(runtimeEditor);
          const selectionRange = selectedLink ?? getCurrentSelectionRange(runtimeEditor);
          if (!selectionRange) {
            return true;
          }

          const href = selectedLink?.href ?? (typeof runtimeEditor.getAttributes("link").href === "string" ? String(runtimeEditor.getAttributes("link").href) : "");
          const mode: LinkSurfaceState["mode"] = selectedLink || runtimeEditor.isActive("link") ? "edit" : "create";
          setLinkSurface({
            from: selectionRange.from,
            to: selectionRange.to,
            draftHref: href,
            mode
          });
          return true;
        }

        return false;
      }
    }),
    []
  );
  const [savedDocumentKey, setSavedDocumentKey] = useState(() => serializeDocument(validatedInitialEnvelope.document));
  const [savedRevision, setSavedRevision] = useState(initialRevision);
  const [status, setStatus] = useState<RuntimeStatus>("saved");
  const disposedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const saveGenerationRef = useRef(0);
  const currentDocumentKeyRef = useRef(savedDocumentKey);
  const savedDocumentKeyRef = useRef(savedDocumentKey);
  const statusRef = useRef<RuntimeStatus>("saved");
  const editorRef = useRef<Editor | null>(null);
  const canEditRef = useRef(canEdit);
  const slashActiveIndexRef = useRef(0);
  const dismissedSlashKeyRef = useRef("");

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    slashActiveIndexRef.current = slashActiveIndex;
  }, [slashActiveIndex]);

  useEffect(() => {
    dismissedSlashKeyRef.current = dismissedSlashKey;
  }, [dismissedSlashKey]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    savedDocumentKeyRef.current = savedDocumentKey;
  }, [savedDocumentKey]);

  useEffect(() => {
    onStatusChange({
      isDirty: currentDocumentKeyRef.current !== savedDocumentKey,
      isSaving: status === "saving"
    });
  }, [onStatusChange, savedDocumentKey, status]);

  const editor = useEditor({
    editable: canEdit,
    editorProps,
    extensions: editorExtensions,
    content: validatedInitialEnvelope.document as unknown as Record<string, unknown>,
    immediatelyRender: false,
    onCreate: ({ editor: runtimeEditor }) => {
      editorRef.current = runtimeEditor;
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      currentDocumentKeyRef.current = serializeDocument(envelope.document);
      onEditorReady?.(runtimeEditor);
      onOutlineChange(extractDocumentOutline(envelope));
    },
    onUpdate: ({ editor: runtimeEditor }) => {
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      const nextDocumentKey = serializeDocument(envelope.document);
      currentDocumentKeyRef.current = nextDocumentKey;
      onOutlineChange(extractDocumentOutline(envelope));

      if (statusRef.current !== "saving") {
        setStatus(nextDocumentKey === savedDocumentKeyRef.current ? "saved" : "dirty");
      }

      if (errorMessage) {
        setErrorMessage("");
      }
    }
  });

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!canEdit) {
      setLinkSurface(null);
    }
  }, [canEdit, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(canEdit);
  }, [canEdit, editor]);

  const isDirty = currentDocumentKeyRef.current !== savedDocumentKey;
  const isSaving = status === "saving";
  const overlayThemeClass = useMemo(
    () => (theme === "dark" ? "docsera-editor-runtime--dark" : "docsera-editor-runtime--light"),
    [theme]
  );
  const headerControls =
    headerControlsRoot && canEdit
      ? createPortal(
          <div className="docsera-main__authoring-controls">
            <div className={`docsera-main__authoring-status docsera-main__authoring-status--${status}`}>{statusLabel(status)}</div>
            <button
              type="button"
              className="docsera-main__authoring-save"
              disabled={!canEdit || isSaving || !isDirty}
              onClick={() => {
                void handleSave();
              }}
            >
            {isSaving ? "Saving…" : "Save draft"}
            </button>
          </div>,
          headerControlsRoot
        )
      : null;
  const overlayOwnerDocument = overlayRoot.ownerDocument;
  const overlayOwnerWindow = overlayOwnerDocument.defaultView;
  const selectionSnapshot = useEditorState({
    editor,
    selector: ({ editor: snapshotEditor, transactionNumber }) =>
      snapshotEditor
        ? {
            transactionNumber,
            selectionFrom: snapshotEditor.state.selection.from,
            selectionTo: snapshotEditor.state.selection.to,
            selectionEmpty: snapshotEditor.state.selection.empty,
            selectionRole: getEditorSelectionRole(snapshotEditor.state.selection),
            editable: snapshotEditor.isEditable
          }
        : {
            transactionNumber,
            selectionFrom: 0,
            selectionTo: 0,
            selectionEmpty: true,
            selectionRole: "other",
            editable: false
          }
  });
  const slashContext = editor && canEdit ? getSlashQuery(editor) : null;
  const slashMatches = slashContext ? getSlashCommandMatches(slashContext.query) : [];
  const slashKey = slashContext ? `${slashContext.from}:${slashContext.to}:${slashContext.query}` : "";
  const slashVisible = Boolean(slashContext) && slashKey !== dismissedSlashKey && !linkSurface && canEdit;
  const bubbleVisible =
    Boolean(editor) &&
    canEdit &&
    !linkSurface &&
    editor!.isEditable &&
    isTextSelection(editor!.state.selection) &&
    !editor!.state.selection.empty &&
    !editor!.state.selection.$from.parent.type.spec.code;
  const bubbleSelection = bubbleVisible && editor ? { from: editor.state.selection.from, to: editor.state.selection.to } : null;
  const bubbleMarks = editor
    ? {
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        strike: editor.isActive("strike"),
        code: editor.isActive("code"),
        link: editor.isActive("link")
      }
    : null;

  useEffect(() => {
    if (!slashContext) {
      setSlashActiveIndex(0);
      setDismissedSlashKey("");
      return;
    }

    setSlashActiveIndex((currentIndex) => Math.min(currentIndex, Math.max(0, slashMatches.length - 1)));
    if (!slashMatches.length) {
      setSlashActiveIndex(-1);
      return;
    }

    if (slashActiveIndexRef.current < 0 || slashActiveIndexRef.current >= slashMatches.length) {
      setSlashActiveIndex(0);
    }
  }, [slashContext, slashMatches.length]);

  useEffect(() => {
    if (!linkSurface) {
      return;
    }

    const ownerDocument = overlayOwnerDocument;
    const ownerNode = ownerDocument.defaultView?.Node;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!ownerNode || !(target instanceof ownerNode)) {
        return;
      }

      if (overlayRoot.contains(target)) {
        return;
      }

      setLinkSurface(null);
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [linkSurface, overlayOwnerDocument, overlayRoot]);

  useEffect(() => {
    if (!editor || (!slashContext && !bubbleVisible && !linkSurface)) {
      return;
    }

    const handleViewportChange = () => {
      setLayoutTick((currentTick) => currentTick + 1);
    };

    overlayOwnerDocument.addEventListener("scroll", handleViewportChange, true);
    overlayOwnerWindow?.addEventListener("resize", handleViewportChange, { passive: true });
    return () => {
      overlayOwnerDocument.removeEventListener("scroll", handleViewportChange, true);
      overlayOwnerWindow?.removeEventListener("resize", handleViewportChange);
    };
  }, [bubbleVisible, editor, linkSurface, overlayOwnerDocument, overlayOwnerWindow, slashContext]);

  function executeSlashCommand(command: SlashCommand) {
    if (!editor || !slashContext) {
      return;
    }

    applySlashCommand(editor, command, { from: slashContext.from, to: slashContext.to });
    setSlashActiveIndex(0);
    setDismissedSlashKey("");
  }

  function openLinkSurfaceFromEditor() {
    if (!editor || !canEdit) {
      return;
    }

    const selectedLink = findLinkRange(editor);
    const selectionRange = selectedLink ?? getCurrentSelectionRange(editor);
    if (!selectionRange) {
      return;
    }

    const href = selectedLink?.href ?? (typeof editor.getAttributes("link").href === "string" ? String(editor.getAttributes("link").href) : "");
    const mode: LinkSurfaceState["mode"] = selectedLink || editor.isActive("link") ? "edit" : "create";

    setLinkSurface({
      from: selectionRange.from,
      to: selectionRange.to,
      draftHref: href,
      mode
    });
  }

  function dismissLinkSurface() {
    if (!editor || !linkSurface) {
      setLinkSurface(null);
      return;
    }

    restoreSelection(editor, linkSurface.from, linkSurface.to);
    setLinkSurface(null);
  }

  function applyLinkSurface() {
    if (!editor || !linkSurface) {
      return;
    }

    const href = linkSurface.draftHref.trim();
    if (!editor.isEditable || !href || !isDocseraAllowedLinkHref(href)) {
      return;
    }

    restoreSelection(editor, linkSurface.from, linkSurface.to);
    if (!editor.commands.setLink(getSafeLinkAttributes(href))) {
      return;
    }

    setLinkSurface(null);
  }

  function removeLinkSurfaceLink() {
    if (!editor || !linkSurface) {
      return;
    }

    restoreSelection(editor, linkSurface.from, linkSurface.to);
    editor.chain().focus(undefined, { scrollIntoView: false }).unsetLink().run();
    setLinkSurface(null);
  }

  function followLinkSurfaceLink() {
    if (!linkSurface) {
      return;
    }

    const href = linkSurface.draftHref.trim();
    if (!href || !isDocseraAllowedLinkHref(href)) {
      return;
    }

    const externalWindow = overlayOwnerWindow?.open(href, "_blank", "noopener,noreferrer") ?? null;
    if (externalWindow) {
      externalWindow.opener = null;
    }
  }

  async function handleSave() {
    if (!editor || !canEdit || isSaving || saveInFlightRef.current) {
      return;
    }

    let envelope: DocseraDocumentEnvelope;
    try {
      envelope = createEnvelope(editor.getJSON() as DocseraTiptapDocument);
    } catch {
      setStatus("failed");
      setErrorMessage("The page document is invalid.");
      return;
    }

    const pendingDocumentKey = serializeDocument(envelope.document);
    if (pendingDocumentKey === savedDocumentKeyRef.current) {
      setStatus("saved");
      setErrorMessage("");
      return;
    }

    setStatus("saving");
    setErrorMessage("");
    const saveGeneration = saveGenerationRef.current + 1;
    saveGenerationRef.current = saveGeneration;
    saveInFlightRef.current = true;

    try {
      const result = await onSaveDraft({
        draftContentJson: cloneEnvelope(envelope),
        expectedRevision: savedRevision,
        pageSysId
      });

      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return;
      }

      if (result.state === "failed") {
        setStatus("failed");
        setErrorMessage(result.errorMessage);

        if (result.code === "forbidden") {
          onAccessLost();
        }

        return;
      }

      const nextSavedKey = pendingDocumentKey;
      setSavedDocumentKey(nextSavedKey);
      setSavedRevision(result.page.draftRevision ?? savedRevision + 1);
      setErrorMessage("");
      setStatus(currentDocumentKeyRef.current === nextSavedKey ? "saved" : "dirty");
    } catch {
      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return;
      }

      setStatus("failed");
      setErrorMessage(SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE);
    } finally {
      if (saveGenerationRef.current === saveGeneration) {
        saveInFlightRef.current = false;
      }
    }
  }

  return (
    <section className={`docsera-editor-runtime ${overlayThemeClass}`} aria-label="Draft editor">
      <style>{`
        .docsera-editor-runtime {
          display: block;
          color: var(--docsera-editor-text);
          font-family: Inter, "Segoe UI", sans-serif;
        }
        .docsera-editor-runtime--light {
          --docsera-editor-muted: #5f6b7c;
          --docsera-editor-panel: rgba(255, 255, 255, 0.98);
          --docsera-editor-panel-border: rgba(140, 156, 178, 0.22);
          --docsera-editor-text: #16212f;
          --docsera-editor-primary: #015ec2;
        }
        .docsera-editor-runtime--dark {
          --docsera-editor-muted: #a7b3c5;
          --docsera-editor-panel: rgba(15, 18, 24, 0.98);
          --docsera-editor-panel-border: rgba(122, 139, 167, 0.22);
          --docsera-editor-text: #eef2f8;
          --docsera-editor-primary: #58a6ff;
        }
        .docsera-editor-runtime__surface {
          position: relative;
          min-height: 340px;
        }
        .docsera-editor-runtime__surface .ProseMirror {
          min-height: 340px;
          color: var(--docsera-editor-text);
          caret-color: var(--docsera-editor-primary);
          font-size: 1rem;
          line-height: 1.8;
          outline: none;
        }
        .docsera-editor-runtime__surface .ProseMirror ::selection {
          background: color-mix(in srgb, var(--docsera-editor-primary) 22%, transparent);
        }
        .docsera-editor-runtime__surface .ProseMirror > :first-child {
          margin-top: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror > :last-child {
          margin-bottom: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror p {
          margin: 0 0 1rem;
        }
        .docsera-editor-runtime__surface .ProseMirror h1,
        .docsera-editor-runtime__surface .ProseMirror h2,
        .docsera-editor-runtime__surface .ProseMirror h3 {
          margin: 1.4rem 0 0.7rem;
          line-height: 1.2;
        }
        .docsera-editor-runtime__surface .ProseMirror ul,
        .docsera-editor-runtime__surface .ProseMirror ol {
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .docsera-editor-runtime__surface .ProseMirror li + li {
          margin-top: 0.35rem;
        }
        .docsera-editor-runtime__surface .ProseMirror blockquote {
          margin: 0 0 1rem;
          padding-left: 1rem;
          border-left: 3px solid color-mix(in srgb, var(--docsera-editor-primary) 24%, transparent);
          color: var(--docsera-editor-muted);
        }
        .docsera-editor-runtime__surface .ProseMirror pre {
          margin: 0 0 1rem;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          background: color-mix(in srgb, var(--docsera-editor-panel) 86%, black 14%);
          color: var(--docsera-editor-text);
          overflow-x: auto;
        }
        .docsera-editor-runtime__surface .ProseMirror code {
          font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
          font-size: 0.92em;
        }
        .docsera-editor-runtime__surface .ProseMirror p code {
          padding: 0.12rem 0.35rem;
          border-radius: 0.4rem;
          background: color-mix(in srgb, var(--docsera-editor-panel) 88%, black 12%);
        }
        .docsera-editor-runtime__surface .ProseMirror hr {
          margin: 1.5rem 0;
          border: 0;
          border-top: 1px solid color-mix(in srgb, var(--docsera-editor-panel-border) 88%, transparent);
        }
        .docsera-editor-runtime__surface .ProseMirror a {
          color: var(--docsera-editor-primary);
          text-decoration-thickness: 0.08em;
          text-underline-offset: 0.16em;
        }
        .docsera-editor-runtime__status-message {
          margin: 12px 0 0;
          color: #ba1a1a;
          font-size: 0.875rem;
          font-weight: 700;
          line-height: 1.5;
        }
        .docsera-editor-floating-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 30;
        }
        .docsera-editor-floating {
          pointer-events: auto;
          display: grid;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--docsera-editor-panel-border);
          border-radius: 16px;
          background: color-mix(in srgb, var(--docsera-editor-panel) 92%, transparent);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(14px);
        }
        .docsera-editor-floating--slash,
        .docsera-editor-floating--bubble {
          width: min(100vw - 24px, 320px);
        }
        .docsera-editor-floating--link {
          width: min(100vw - 24px, 340px);
        }
        .docsera-editor-floating__label {
          margin: 0;
          color: var(--docsera-editor-muted);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .docsera-editor-floating__list {
          display: grid;
          gap: 4px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .docsera-editor-floating__item-button {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 11px;
          border: 1px solid transparent;
          border-radius: 12px;
          background: transparent;
          color: var(--docsera-editor-text);
          font-size: 0.925rem;
          font-weight: 600;
          text-align: left;
        }
        .docsera-editor-floating__item-button[aria-selected="true"],
        .docsera-editor-floating__item-button:hover,
        .docsera-editor-floating__item-button:focus-visible,
        .docsera-editor-floating__chip:hover,
        .docsera-editor-floating__chip:focus-visible,
        .docsera-editor-floating__icon-button:hover,
        .docsera-editor-floating__icon-button:focus-visible,
        .docsera-editor-floating__action:hover,
        .docsera-editor-floating__action:focus-visible {
          border-color: rgba(1, 94, 194, 0.22);
          background: rgba(1, 94, 194, 0.08);
          outline: none;
        }
        .docsera-editor-floating__item-icon,
        .docsera-editor-floating__chip-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: 24px;
          height: 24px;
          color: var(--docsera-editor-primary);
        }
        .docsera-editor-floating__item-copy {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .docsera-editor-floating__item-description {
          color: var(--docsera-editor-muted);
          font-size: 0.76rem;
          font-weight: 500;
          line-height: 1.4;
        }
        .docsera-editor-floating__empty {
          margin: 0;
          color: var(--docsera-editor-muted);
          font-size: 0.875rem;
          line-height: 1.5;
        }
        .docsera-editor-floating__row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .docsera-editor-floating__chip,
        .docsera-editor-floating__icon-button,
        .docsera-editor-floating__action,
        .docsera-editor-floating__secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 36px;
          padding: 8px 11px;
          border: 1px solid var(--docsera-editor-panel-border);
          border-radius: 12px;
          background: var(--docsera-editor-panel);
          color: var(--docsera-editor-text);
          font-size: 0.875rem;
          font-weight: 700;
        }
        .docsera-editor-floating__icon-button,
        .docsera-editor-floating__secondary {
          min-width: 36px;
          padding-inline: 10px;
        }
        .docsera-editor-floating__chip--active,
        .docsera-editor-floating__icon-button--active {
          border-color: rgba(1, 94, 194, 0.3);
          background: rgba(1, 94, 194, 0.13);
          color: var(--docsera-editor-primary);
        }
        .docsera-editor-floating__link-form {
          display: grid;
          gap: 10px;
        }
        .docsera-editor-floating__field {
          display: grid;
          gap: 6px;
        }
        .docsera-editor-floating__field-label {
          color: var(--docsera-editor-muted);
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .docsera-editor-floating__input {
          min-width: 0;
          padding: 10px 11px;
          border: 1px solid var(--docsera-editor-panel-border);
          border-radius: 12px;
          background: var(--docsera-editor-panel);
          color: var(--docsera-editor-text);
          font: inherit;
        }
        .docsera-editor-floating__input--invalid {
          border-color: rgba(186, 26, 26, 0.3);
        }
        .docsera-editor-floating__error {
          margin: 0;
          color: #ba1a1a;
          font-size: 0.8rem;
          font-weight: 600;
          line-height: 1.45;
        }
        .docsera-editor-floating__actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .docsera-editor-floating__action {
          border-color: rgba(1, 94, 194, 0.24);
          background: linear-gradient(135deg, var(--docsera-editor-primary), #004fa8);
          color: #ffffff;
        }
        .docsera-editor-floating__secondary {
          background: transparent;
        }
      `}</style>
      {headerControls}
      <div className="docsera-editor-runtime__surface">
        <EditorContent editor={editor} />
        {createPortal(
          <div className="docsera-editor-floating-layer" aria-hidden={!editor}>
            {slashVisible && slashContext ? (
              <div
                className="docsera-editor-floating docsera-editor-floating--slash"
                style={buildSurfaceStyle(
                  overlayOwnerDocument,
                  getCaretBounds(editor!) ?? new DOMRect(12, 12, 1, 1),
                  SLASH_MENU_WIDTH,
                  308
                )}
                role="listbox"
                aria-label="Slash command menu"
                aria-activedescendant={slashMatches[slashActiveIndex]?.id ? `slash-command-${slashMatches[slashActiveIndex].id}` : undefined}
                data-surface="slash"
              >
                <p className="docsera-editor-floating__label">Insert block</p>
                {slashMatches.length ? (
                  <ul className="docsera-editor-floating__list">
                    {slashMatches.map((command, index) => (
                      <li key={command.id}>
                        <button
                          id={`slash-command-${command.id}`}
                          type="button"
                          className="docsera-editor-floating__item-button"
                          role="option"
                          aria-selected={index === slashActiveIndex}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            executeSlashCommand(command);
                          }}
                        >
                          <span className="docsera-editor-floating__item-icon" aria-hidden="true">
                            <SlashCommandIcon id={command.id} />
                          </span>
                          <span className="docsera-editor-floating__item-copy">
                            <span>{command.label}</span>
                            <span className="docsera-editor-floating__item-description">
                              {command.keywords[0] ? `Keyword: ${command.keywords[0]}` : "Command"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="docsera-editor-floating__empty">No commands match this query.</p>
                )}
              </div>
            ) : null}

            {bubbleVisible && editor && bubbleSelection ? (
              <div
                className="docsera-editor-floating docsera-editor-floating--bubble"
                style={buildSurfaceStyle(
                  overlayOwnerDocument,
                  getSelectionBounds(editor) ?? new DOMRect(12, 12, 1, 1),
                  BUBBLE_MENU_WIDTH,
                  52,
                  true
                )}
                role="toolbar"
                aria-label="Text formatting"
                data-surface="bubble"
              >
                <div className="docsera-editor-floating__row">
                  <FloatingIconButton
                    label="Bold"
                    active={bubbleMarks?.bold}
                    onClick={() => {
                      restoreSelection(editor, bubbleSelection.from, bubbleSelection.to);
                      editor.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run();
                    }}
                  >
                    <DocseraIcon icon={Bold} size={15} />
                  </FloatingIconButton>
                  <FloatingIconButton
                    label="Italic"
                    active={bubbleMarks?.italic}
                    onClick={() => {
                      restoreSelection(editor, bubbleSelection.from, bubbleSelection.to);
                      editor.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run();
                    }}
                  >
                    <DocseraIcon icon={Italic} size={15} />
                  </FloatingIconButton>
                  <FloatingIconButton
                    label="Strike"
                    active={bubbleMarks?.strike}
                    onClick={() => {
                      restoreSelection(editor, bubbleSelection.from, bubbleSelection.to);
                      editor.chain().focus(undefined, { scrollIntoView: false }).toggleStrike().run();
                    }}
                  >
                    <DocseraIcon icon={Strikethrough} size={15} />
                  </FloatingIconButton>
                  <FloatingIconButton
                    label="Inline code"
                    active={bubbleMarks?.code}
                    onClick={() => {
                      restoreSelection(editor, bubbleSelection.from, bubbleSelection.to);
                      editor.chain().focus(undefined, { scrollIntoView: false }).toggleCode().run();
                    }}
                  >
                    <DocseraIcon icon={Code2} size={15} />
                  </FloatingIconButton>
                  <FloatingIconButton
                    label="Link"
                    active={bubbleMarks?.link}
                    onClick={() => {
                      restoreSelection(editor, bubbleSelection.from, bubbleSelection.to);
                      openLinkSurfaceFromEditor();
                    }}
                  >
                    <DocseraIcon icon={Link2} size={15} />
                  </FloatingIconButton>
                </div>
              </div>
            ) : null}

            {linkSurface && editor ? (
              <LinkSurface
                canEdit={canEdit}
                editor={editor}
                linkSurface={linkSurface}
                onChangeHref={(draftHref) => {
                  setLinkSurface((current) => (current ? { ...current, draftHref } : current));
                }}
                onDismiss={() => {
                  dismissLinkSurface();
                }}
                onApply={() => {
                  applyLinkSurface();
                }}
                onRemove={() => {
                  removeLinkSurfaceLink();
                }}
                onFollow={() => {
                  followLinkSurfaceLink();
                }}
                ownerDocument={overlayOwnerDocument}
                overlayRect={getSelectionBounds(editor) ?? getCaretBounds(editor) ?? new DOMRect(12, 12, 1, 1)}
              />
            ) : null}
          </div>,
          overlayRoot
        )}
      </div>

      {errorMessage ? (
        <p className="docsera-editor-runtime__status-message" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function LinkSurface({
  canEdit,
  editor,
  linkSurface,
  onApply,
  onChangeHref,
  onDismiss,
  onFollow,
  onRemove,
  ownerDocument,
  overlayRect
}: {
  canEdit: boolean;
  editor: Editor;
  linkSurface: LinkSurfaceState;
  onApply: () => void;
  onChangeHref: (href: string) => void;
  onDismiss: () => void;
  onFollow: () => void;
  onRemove: () => void;
  ownerDocument: Document;
  overlayRect: DOMRect;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const safeHref = linkSurface.draftHref.trim();
  const isValidHref = Boolean(safeHref) && isDocseraAllowedLinkHref(safeHref);
  const showValidation = Boolean(safeHref) && !isValidHref;
  const canApply = canEdit && isValidHref;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputId]);

  return (
    <div
      className="docsera-editor-floating docsera-editor-floating--link"
      style={buildSurfaceStyle(ownerDocument, overlayRect, LINK_MENU_WIDTH, linkSurface.mode === "edit" ? 238 : 210)}
      role="dialog"
      aria-label={linkSurface.mode === "edit" ? "Edit link" : "Create link"}
      data-surface="link"
    >
      <p className="docsera-editor-floating__label">{linkSurface.mode === "edit" ? "Edit link" : "Create link"}</p>
      <div className="docsera-editor-floating__link-form">
        <label className="docsera-editor-floating__field" htmlFor={inputId}>
          <span className="docsera-editor-floating__field-label">URL</span>
          <input
            id={inputId}
            ref={inputRef}
            className={`docsera-editor-floating__input${showValidation ? " docsera-editor-floating__input--invalid" : ""}`}
            type="url"
            value={linkSurface.draftHref}
            placeholder="https://example.com"
            onChange={(event) => {
              onChangeHref(event.target.value);
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onDismiss();
              }

              if (event.key === "Enter") {
                event.preventDefault();
                if (canApply) {
                  onApply();
                }
              }
            }}
            aria-invalid={showValidation}
            aria-describedby={showValidation ? `${inputId}-error` : undefined}
            disabled={!canEdit}
          />
        </label>
        {showValidation ? (
          <p id={`${inputId}-error`} className="docsera-editor-floating__error" role="alert">
            Enter a safe URL.
          </p>
        ) : null}
        <div className="docsera-editor-floating__actions">
          <button
            type="button"
            className="docsera-editor-floating__action"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (canApply) {
                onApply();
              }
            }}
            disabled={!canApply}
          >
            Apply
          </button>
          <button type="button" className="docsera-editor-floating__secondary" onMouseDown={(event) => event.preventDefault()} onClick={onRemove} disabled={linkSurface.mode === "create"}>
            Remove
          </button>
          <button type="button" className="docsera-editor-floating__secondary" onMouseDown={(event) => event.preventDefault()} onClick={onFollow} disabled={!isValidHref}>
            Follow
          </button>
          <button type="button" className="docsera-editor-floating__secondary" onMouseDown={(event) => event.preventDefault()} onClick={onDismiss}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

