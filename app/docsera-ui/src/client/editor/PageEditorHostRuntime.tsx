import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { DocseraDocumentEnvelope, DocseraTiptapDocument } from "../../shared/editor/document";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION, parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import { createDocseraEditorExtensions } from "../../shared/editor/schema";
import { extractDocumentOutline, type EditorOutlineItem } from "./documentOutline";
import { sanitizeDocseraPastedHTML, sanitizeDocseraPastedText } from "./pasteSanitizer";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { TextSelection } from "@tiptap/pm/state";
import { CompactTextToolbar } from "./CompactTextToolbar";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Quote,
  Type,
} from "lucide-react";

type PageEditorHostRuntimeProps = {
  canEdit: boolean;
  initialEnvelope: DocseraDocumentEnvelope;
  initialSavedEnvelope?: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onRuntimeError?: () => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
  }) => Promise<PageBodySaveResult>;
  onEditorReady?: (editor: Editor) => void;
  onStatusChange: (state: {
    flush?: () => Promise<boolean>;
    getRecoverySnapshot?: () => {
      envelope: DocseraDocumentEnvelope;
      isDirty: boolean;
      pageSysId: string;
      savedRevision: number;
      sessionKey: string;
    } | null;
    isDirty: boolean;
    isSaving: boolean;
    status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
  }) => void;
  overlayRoot: HTMLElement;
  pageSysId: string;
  sessionKey?: string;
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

type RuntimeStatus = "conflict" | "dirty" | "failed" | "saved" | "saving";

type SlashCommandId =
  | "paragraph"
  | "heading1"
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

const SLASH_MENU_WIDTH = 316;
const AUTOSAVE_RETRY_DELAYS_MS = [1500, 3000, 6000, 12000] as const;

export function getAutosaveRetryDelay(attempt: number): number | null {
  return Number.isInteger(attempt) && attempt >= 0 && attempt < AUTOSAVE_RETRY_DELAYS_MS.length
    ? AUTOSAVE_RETRY_DELAYS_MS[attempt]
    : null;
}
const POPOVER_GAP = 10;
const VIEWPORT_GUTTER = 12;

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
    id: "heading1",
    label: "Heading 1",
    keywords: ["h1", "heading", "section"],
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 1 }).run();
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
const AUTOSAVE_IDLE_MS = 700;

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

function isTextSelection(selection: unknown): selection is TextSelection {
  return selection instanceof TextSelection;
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

function buildSurfaceStyle(ownerDocument: Document, rect: DOMRect, width: number, height: number, preferAbove = false): CSSProperties {
  return {
    position: "fixed",
    ...clampSurfacePosition(ownerDocument, rect, width, height, preferAbove)
  };
}

function SlashCommandIcon({ id }: { id: SlashCommandId }) {
  switch (id) {
    case "paragraph":
      return <Type size={16} strokeWidth={2} />;
    case "heading1":
      return <Heading1 size={16} strokeWidth={2} />;
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

function applySlashCommand(editor: Editor, command: SlashCommand, range: { from: number; to: number }) {
  editor.chain().focus(undefined, { scrollIntoView: false }).deleteRange(range).run();
  command.run(editor);
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

function statusLabel(status: RuntimeStatus): "Unsaved" | "Saving…" | "Saved" | "Changes not saved" {
  switch (status) {
    case "dirty":
      return "Unsaved";
    case "saving":
      return "Saving…";
    case "conflict":
      return "Changes not saved";
    case "failed":
      return "Changes not saved";
    case "saved":
    default:
      return "Saved";
  }
}

function createSyntheticClipboardData(input: { html: string; text: string }) {
  const html = sanitizeDocseraPastedHTML(input.html);
  const text = sanitizeDocseraPastedText(input.text);

  return {
    getData(type: string) {
      if (type === "text/html") {
        return html;
      }

      if (type === "text/plain") {
        return text;
      }

      return "";
    },
    types: [html ? "text/html" : "", text ? "text/plain" : ""].filter(Boolean)
  };
}

function dispatchSyntheticPaste(editor: Editor, input: { html: string; text: string }): void {
  const clipboardData = createSyntheticClipboardData(input);
  const pasteEvent =
    typeof ClipboardEvent === "function"
      ? new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true
        })
      : new Event("paste", {
          bubbles: true,
          cancelable: true
        });

  Object.defineProperty(pasteEvent, "clipboardData", {
    configurable: true,
    value: clipboardData
  });

  const wasHandled = !editor.view.dom.dispatchEvent(pasteEvent);
  if (!wasHandled && !pasteEvent.defaultPrevented) {
    const fallbackValue = clipboardData.getData("text/html") || clipboardData.getData("text/plain");
    if (fallbackValue) {
      editor.commands.insertContent(fallbackValue, {
        applyPasteRules: true
      });
    }
  }
}

function findLastCanvasContentElement(proseMirror: HTMLElement): HTMLElement | null {
  const directChildren = Array.from(proseMirror.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  if (directChildren.length === 0) {
    return null;
  }

  for (let index = directChildren.length - 1; index >= 0; index -= 1) {
    const candidate = directChildren[index];
    if (candidate.getBoundingClientRect().height > 0) {
      return candidate;
    }
  }

  return directChildren[directChildren.length - 1] ?? null;
}

function isBelowEditorContentCanvasClick(event: React.MouseEvent<HTMLElement>, proseMirror: HTMLElement): boolean {
  const lastContentElement = findLastCanvasContentElement(proseMirror);
  if (!lastContentElement) {
    return true;
  }

  const lastContentRect = lastContentElement.getBoundingClientRect();
  return event.clientY >= lastContentRect.bottom;
}

function trySetEditorTabIndex(editor: Editor, isEditable: boolean): boolean {
  try {
    editor.view.dom.tabIndex = isEditable ? 0 : -1;
    return true;
  } catch {
    return false;
  }
}

export function PageEditorHostRuntime({
  canEdit,
  initialEnvelope,
  initialSavedEnvelope,
  initialRevision,
  onAccessLost,
  onOutlineChange,
  onSaveDraft,
  onEditorReady,
  onStatusChange,
  overlayRoot,
  pageSysId,
  sessionKey = "",
  theme
}: PageEditorHostRuntimeProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [dismissedSlashKey, setDismissedSlashKey] = useState("");
  const [, setLayoutTick] = useState(0);
  const incomingInitialEnvelope = useMemo(() => parseDocseraDocumentOrThrow(initialEnvelope), [initialEnvelope]);
  const incomingInitialSavedEnvelope = useMemo(
    () => parseDocseraDocumentOrThrow(initialSavedEnvelope ?? initialEnvelope),
    [initialEnvelope, initialSavedEnvelope]
  );
  const mountedInitialEnvelopeRef = useRef<DocseraDocumentEnvelope | null>(null);
  const mountedInitialSavedEnvelopeRef = useRef<DocseraDocumentEnvelope | null>(null);
  if (mountedInitialEnvelopeRef.current === null) {
    mountedInitialEnvelopeRef.current = incomingInitialEnvelope;
  }
  if (mountedInitialSavedEnvelopeRef.current === null) {
    mountedInitialSavedEnvelopeRef.current = incomingInitialSavedEnvelope;
  }
  const validatedInitialEnvelope = mountedInitialEnvelopeRef.current;
  const validatedInitialSavedEnvelope = mountedInitialSavedEnvelopeRef.current;
  const initialDocumentKey = useMemo(() => serializeDocument(validatedInitialEnvelope.document), [validatedInitialEnvelope]);
  const initialSavedDocumentKey = useMemo(() => serializeDocument(validatedInitialSavedEnvelope.document), [validatedInitialSavedEnvelope]);
  const initialSessionIsClean = initialDocumentKey === initialSavedDocumentKey;
  const editorExtensions = useMemo(() => createDocseraEditorExtensions(), []);
  const editorProps = useMemo(
    () => ({
      transformPastedHTML: sanitizeDocseraPastedHTML,
      transformPastedText: sanitizeDocseraPastedText,
      handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor || !editableRef.current) {
          return false;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          overlayOwnerDocument.dispatchEvent(new CustomEvent("docsera-open-link-surface"));
          return true;
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

        return false;
      }
    }),
    []
  );
  const [savedDocumentKey, setSavedDocumentKey] = useState(() => initialSavedDocumentKey);
  const [savedRevision, setSavedRevision] = useState(initialRevision);
  const [status, setStatus] = useState<RuntimeStatus>(() => (initialDocumentKey === initialSavedDocumentKey ? "saved" : "dirty"));
  const disposedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const currentDocumentKeyRef = useRef(initialDocumentKey);
  const savedDocumentKeyRef = useRef(savedDocumentKey);
  const savedRevisionRef = useRef(initialRevision);
  const statusRef = useRef<RuntimeStatus>("saved");
  const initializingRef = useRef(true);
  const editorRef = useRef<Editor | null>(null);
  const editableRef = useRef(false);
  const slashActiveIndexRef = useRef(0);
  const dismissedSlashKeyRef = useRef("");
  const onEditorReadyRef = useRef(onEditorReady);
  const onOutlineChangeRef = useRef(onOutlineChange);
  const isEditable = canEdit;
  const overlayOwnerDocument = overlayRoot.ownerDocument;
  const overlayOwnerWindow = overlayOwnerDocument.defaultView;

  useEffect(() => {
    editableRef.current = isEditable;
    if (!isEditable) {
      cancelPendingTimers();
    }
  }, [isEditable]);

  useEffect(() => {
    slashActiveIndexRef.current = slashActiveIndex;
  }, [slashActiveIndex]);

  useEffect(() => {
    dismissedSlashKeyRef.current = dismissedSlashKey;
  }, [dismissedSlashKey]);

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    onOutlineChangeRef.current = onOutlineChange;
  }, [onOutlineChange]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    savedDocumentKeyRef.current = savedDocumentKey;
  }, [savedDocumentKey]);

  useEffect(() => {
    savedRevisionRef.current = savedRevision;
  }, [savedRevision]);

  useEffect(() => {
    onStatusChange({
      flush: flushLatest,
      getRecoverySnapshot: () => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor) {
          return null;
        }

        return {
          envelope: createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument),
          isDirty: currentDocumentKeyRef.current !== savedDocumentKeyRef.current,
          pageSysId,
          savedRevision: savedRevisionRef.current,
          sessionKey
        };
      },
      isDirty: currentDocumentKeyRef.current !== savedDocumentKeyRef.current,
      isSaving: status === "saving",
      status: statusLabel(status)
    });
  }, [onStatusChange, pageSysId, savedDocumentKey, sessionKey, status]);

  useEffect(() => () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentDocumentKeyRef.current !== savedDocumentKeyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const editor = useEditor({
    editable: isEditable,
    editorProps,
    extensions: editorExtensions,
    content: validatedInitialEnvelope.document as unknown as Record<string, unknown>,
    immediatelyRender: false,
    onCreate: ({ editor: runtimeEditor }) => {
      editorRef.current = runtimeEditor;
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      const mountedDocumentKey = serializeDocument(envelope.document);
      currentDocumentKeyRef.current = mountedDocumentKey;
      if (initialSessionIsClean && mountedDocumentKey !== savedDocumentKeyRef.current) {
        savedDocumentKeyRef.current = mountedDocumentKey;
        setSavedDocumentKey(mountedDocumentKey);
      }
      onEditorReadyRef.current?.(runtimeEditor);
      onOutlineChangeRef.current(extractDocumentOutline(envelope));
      queueMicrotask(() => {
        if (!disposedRef.current) {
          initializingRef.current = false;
        }
      });
    },
    onUpdate: ({ editor: runtimeEditor }) => {
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      const nextDocumentKey = serializeDocument(envelope.document);
      currentDocumentKeyRef.current = nextDocumentKey;
      onOutlineChangeRef.current(extractDocumentOutline(envelope));

       if (initializingRef.current) {
        if (initialSessionIsClean && nextDocumentKey !== savedDocumentKeyRef.current) {
          savedDocumentKeyRef.current = nextDocumentKey;
          setSavedDocumentKey(nextDocumentKey);
        }
        if (statusRef.current !== "saving" && statusRef.current !== "conflict") {
          setStatus(nextDocumentKey === savedDocumentKeyRef.current ? "saved" : "dirty");
        }
        if (errorMessage) {
          setErrorMessage("");
        }
        return;
      }

      if (statusRef.current !== "saving" && statusRef.current !== "conflict") {
        setStatus(nextDocumentKey === savedDocumentKeyRef.current ? "saved" : "dirty");
      }

      if (errorMessage) {
        setErrorMessage("");
      }

      if (nextDocumentKey !== savedDocumentKeyRef.current && statusRef.current !== "conflict") {
        retryAttemptRef.current = 0;
        if (retryTimerRef.current !== null) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        scheduleAutosave();
      }
    }
  }, [editorExtensions, editorProps, initialSessionIsClean, isEditable]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      initializingRef.current = false;
      cancelPendingTimers();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(isEditable);
    if (trySetEditorTabIndex(editor, isEditable)) {
      return;
    }

    queueMicrotask(() => {
      if (disposedRef.current || (editor as Editor & { isDestroyed?: boolean }).isDestroyed) {
        return;
      }
      void trySetEditorTabIndex(editor, isEditable);
    });
  }, [editor, isEditable]);

  const overlayThemeClass = useMemo(
    () => (theme === "dark" ? "docsera-editor-runtime--dark" : "docsera-editor-runtime--light"),
    [theme]
  );
  const slashContext = editor && isEditable ? getSlashQuery(editor) : null;
  const slashMatches = slashContext ? getSlashCommandMatches(slashContext.query) : [];
  const slashKey = slashContext ? `${slashContext.from}:${slashContext.to}:${slashContext.query}` : "";
  const slashVisible = Boolean(slashContext) && slashKey !== dismissedSlashKey && isEditable;
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
    if (!editor || !slashContext) {
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
  }, [editor, overlayOwnerDocument, overlayOwnerWindow, slashContext]);

  function executeSlashCommand(command: SlashCommand) {
    if (!editor || !slashContext) {
      return;
    }

    applySlashCommand(editor, command, { from: slashContext.from, to: slashContext.to });
    setSlashActiveIndex(0);
    setDismissedSlashKey("");
  }

  function scheduleAutosave() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushLatest();
    }, AUTOSAVE_IDLE_MS);
  }

  function scheduleRetry() {
    if (retryTimerRef.current !== null || statusRef.current === "conflict" || disposedRef.current) return;
    const delay = getAutosaveRetryDelay(retryAttemptRef.current);
    if (delay === null) return;
    retryAttemptRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushLatest();
    }, delay);
  }

  function cancelPendingTimers() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  async function flushLatest(): Promise<boolean> {
    if (!editor || !editableRef.current || disposedRef.current || statusRef.current === "conflict") {
      return currentDocumentKeyRef.current === savedDocumentKeyRef.current;
    }
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    while (currentDocumentKeyRef.current !== savedDocumentKeyRef.current) {
      const savePromise = savePromiseRef.current ?? persistLatest();
      savePromiseRef.current = savePromise;
      try {
        if (!(await savePromise)) {
          return false;
        }
      } finally {
        if (savePromiseRef.current === savePromise) {
          savePromiseRef.current = null;
        }
      }
    }
    setStatus("saved");
    setErrorMessage("");
    return true;
  }

  async function persistLatest(): Promise<boolean> {
    if (!editor || !editableRef.current || saveInFlightRef.current) {
      return currentDocumentKeyRef.current === savedDocumentKeyRef.current;
    }

    let envelope: DocseraDocumentEnvelope;
    try {
      envelope = createEnvelope(editor.getJSON() as DocseraTiptapDocument);
    } catch {
      setStatus("failed");
      setErrorMessage("The page document is invalid.");
      return false;
    }

    let submittedDocumentKey = serializeDocument(envelope.document);
    const pendingDocumentKey = submittedDocumentKey;
    if (pendingDocumentKey === savedDocumentKeyRef.current) {
      setStatus("saved");
      setErrorMessage("");
      return true;
    }

    setStatus("saving");
    setErrorMessage("");
    const saveGeneration = saveGenerationRef.current + 1;
    saveGenerationRef.current = saveGeneration;
    saveInFlightRef.current = true;
    try {
      const saveInput: {
        draftContentJson: DocseraDocumentEnvelope;
        expectedRevision: number;
        pageSysId: string;
        readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
      } = {
        draftContentJson: cloneEnvelope(envelope),
        expectedRevision: savedRevisionRef.current,
        pageSysId
      };
      Object.defineProperty(saveInput, "readLatestDraftContentJson", {
        configurable: true,
        enumerable: false,
        value: () => {
          if (!editor || disposedRef.current) return null;
          try {
            const latestEnvelope = createEnvelope(editor.getJSON() as DocseraTiptapDocument);
            submittedDocumentKey = serializeDocument(latestEnvelope.document);
            return cloneEnvelope(latestEnvelope);
          } catch {
            return null;
          }
        }
      });
      const result = await onSaveDraft(saveInput);

      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return false;
      }

      if (result.state === "failed") {
        const isConflict = result.code === "conflict";
        setStatus(isConflict ? "conflict" : "failed");
        setErrorMessage(result.errorMessage || (isConflict ? "This page has a newer saved draft. Reload before saving again." : SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE));

        if (result.code === "forbidden") {
          onAccessLost();
        } else if (!isConflict && result.retryable) {
          scheduleRetry();
        }

        return false;
      }

      const nextSavedKey = submittedDocumentKey;
      savedDocumentKeyRef.current = nextSavedKey;
      setSavedDocumentKey(nextSavedKey);
      const acceptedRevision = result.page.draftRevision ?? savedRevisionRef.current + 1;
      savedRevisionRef.current = acceptedRevision;
      setSavedRevision(acceptedRevision);
      setErrorMessage("");
      retryAttemptRef.current = 0;
      const isClean = currentDocumentKeyRef.current === nextSavedKey;
      setStatus(isClean ? "saved" : "dirty");
      return true;
    } catch {
      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return false;
      }

      setStatus("failed");
      setErrorMessage(SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE);
      scheduleRetry();
      return false;
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
        .docsera-editor-runtime__lock-banner {
          display: grid;
          gap: 0.45rem;
          margin: 0 0 1rem;
          padding: 0.95rem 1rem;
          border: 1px solid color-mix(in srgb, var(--docsera-editor-primary) 18%, var(--docsera-editor-panel-border));
          border-radius: 1rem;
          background: color-mix(in srgb, var(--docsera-editor-panel) 94%, transparent);
        }
        .docsera-editor-runtime__lock-banner[data-state="lost"],
        .docsera-editor-runtime__lock-banner[data-state="failed"] {
          border-color: rgba(186, 26, 26, 0.22);
        }
        .docsera-editor-runtime__lock-title {
          margin: 0;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--docsera-editor-muted);
        }
        .docsera-editor-runtime__lock-copy {
          margin: 0;
          color: var(--docsera-editor-text);
          font-size: 0.94rem;
          line-height: 1.55;
        }
        .docsera-editor-runtime__lock-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .docsera-editor-runtime__lock-action,
        .docsera-editor-runtime__lock-secondary {
          min-height: 2.4rem;
          padding: 0.65rem 0.95rem;
          border-radius: 0.9rem;
          border: 1px solid var(--docsera-editor-panel-border);
          background: var(--docsera-editor-panel);
          color: var(--docsera-editor-text);
          font: inherit;
          font-weight: 700;
        }
        .docsera-editor-runtime__lock-action {
          border-color: rgba(1, 94, 194, 0.26);
          background: linear-gradient(135deg, var(--docsera-editor-primary), #004fa8);
          color: #fff;
        }
        .docsera-editor-runtime__lock-progress {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 0.8rem;
          border: 1px solid color-mix(in srgb, var(--docsera-editor-primary) 18%, var(--docsera-editor-panel-border));
          border-radius: 999px;
          background: color-mix(in srgb, var(--docsera-editor-panel) 96%, transparent);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
          pointer-events: none;
        }
        .docsera-editor-runtime__lock-progress-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 999px;
          background: var(--docsera-editor-primary);
          animation: docsera-editor-lock-pulse 1s ease-in-out infinite;
        }
        .docsera-editor-runtime__lock-progress-copy {
          margin: 0;
          color: var(--docsera-editor-text);
          font-size: 0.82rem;
          font-weight: 700;
          line-height: 1.2;
        }
        .docsera-editor-runtime__surface .ProseMirror {
          min-height: 340px;
          color: var(--docsera-editor-text);
          caret-color: var(--docsera-editor-primary);
          font-size: 1rem;
          line-height: 1.8;
          outline: none;
          scroll-padding-top: var(--docsera-workspace-heading-scroll-margin);
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
          scroll-margin-block-start: var(--docsera-workspace-heading-scroll-margin);
          scroll-margin-top: var(--docsera-workspace-heading-scroll-margin);
        }
        .docsera-editor-runtime__surface .ProseMirror h1 {
          font-size: 1.9rem;
          letter-spacing: -0.025em;
        }
        .docsera-editor-runtime__surface .ProseMirror h2 {
          font-size: 1.65rem;
          letter-spacing: -0.02em;
        }
        .docsera-editor-runtime__surface .ProseMirror h3 {
          font-size: 1.25rem;
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
          color: var(--docsera-primary);
          text-decoration-line: underline;
          text-decoration-color: currentColor;
          text-decoration-thickness: 0.08em;
          text-underline-offset: 0.16em;
        }
        .docsera-editor-runtime__surface .ProseMirror a:visited {
          color: var(--docsera-primary);
          text-decoration-color: currentColor;
        }
        .docsera-editor-runtime__surface .ProseMirror a:hover,
        .docsera-editor-runtime__surface .ProseMirror a:focus-visible {
          text-decoration-thickness: 0.12em;
        }
        .docsera-editor-runtime__surface .ProseMirror mark {
          padding: 0.08em 0.2em;
          border-radius: 0.28em;
          background: color-mix(in srgb, #f6d84e 58%, var(--docsera-editor-panel));
          color: inherit;
        }
        .docsera-editor-runtime__surface .ProseMirror sup,
        .docsera-editor-runtime__surface .ProseMirror sub {
          font-size: 0.72em;
          line-height: 0;
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
        .docsera-editor-floating--slash {
          width: min(100vw - 24px, 320px);
        }
        .docsera-editor-floating--bubble {
          width: min(100vw - 24px, 456px);
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
        .docsera-editor-floating__menu {
          display: grid;
          gap: 4px;
          padding: 6px;
          border: 1px solid var(--docsera-editor-panel-border);
          border-radius: 12px;
          background: color-mix(in srgb, var(--docsera-editor-panel) 96%, transparent);
        }
        .docsera-editor-floating__menu-heading {
          margin: 0;
          padding: 0 4px 2px;
          color: var(--docsera-editor-muted);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .docsera-editor-floating__menu-list {
          display: grid;
          gap: 2px;
        }
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
        .docsera-editor-floating__secondary {
          min-width: 36px;
          padding-inline: 10px;
        }
        .docsera-editor-floating__action {
          border-color: rgba(1, 94, 194, 0.24);
          background: linear-gradient(135deg, var(--docsera-editor-primary), #004fa8);
          color: #ffffff;
        }
        .docsera-editor-floating__secondary {
          background: transparent;
        }
        @keyframes docsera-editor-lock-pulse {
          0%, 100% {
            opacity: 0.35;
            transform: scale(0.85);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
      <div
        className="docsera-editor-runtime__surface"
        onClick={(event) => {
        if (!editor || !isEditable || !(event.target instanceof HTMLElement)) return;
        const proseMirror = event.currentTarget.querySelector(".ProseMirror");
        if (!(proseMirror instanceof HTMLElement) || (event.target !== event.currentTarget && event.target !== proseMirror)) return;
        if (event.target === proseMirror && !isBelowEditorContentCanvasClick(event, proseMirror)) return;
        const lastChild = editor.state.doc.lastChild;
        if (lastChild?.type.name === "paragraph" && lastChild.content.size === 0) {
          editor.commands.focus("end", { scrollIntoView: false });
          return;
        }
        editor.chain().insertContentAt(editor.state.doc.content.size, { type: "paragraph" }).focus("end", { scrollIntoView: false }).run();
      }}
      >
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

            <CompactTextToolbar
              canEdit={isEditable}
              editor={editor}
              ownerDocument={overlayOwnerDocument}
              ownerWindow={overlayOwnerWindow}
              overlayRoot={overlayRoot}
            />
          </div>,
          overlayRoot
        )}
      </div>

    </section>
  );
}
