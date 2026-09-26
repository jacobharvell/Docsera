/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { createEnvelopeFromDocument } from "./PageEditorHostRuntime.testUtils";
import { createSuccessPage } from "./PageEditorHostRuntime.testUtils";

let mountedDocument: DocseraTiptapDocument = {
  type: "doc",
  content: [{ type: "paragraph" }]
};
let initializationUpdates: DocseraTiptapDocument[] = [];
let mockEditor: {
  emitUpdate: (nextDocument: DocseraTiptapDocument) => void;
  getOnCreateEditableSnapshot: () => {
    domContentEditable: string;
    editorIsEditable: boolean;
    optionsEditable: boolean;
    viewEditable: boolean;
  } | null;
  getEditableSnapshot: () => {
    domContentEditable: string;
    editorIsEditable: boolean;
    optionsEditable: boolean;
    viewEditable: boolean;
  };
  getTabIndex: () => number;
} | null = null;
let unreadableViewReadsRemaining = 0;
let createNonEditableView = false;
let onCreateEditableSnapshot: {
  domContentEditable: string;
  editorIsEditable: boolean;
  optionsEditable: boolean;
  viewEditable: boolean;
} | null = null;

function cloneDocument(document: DocseraTiptapDocument): DocseraTiptapDocument {
  return JSON.parse(JSON.stringify(document)) as DocseraTiptapDocument;
}

beforeEach(() => {
  mountedDocument = {
    type: "doc",
    content: [{ type: "paragraph" }]
  };
  initializationUpdates = [];
  mockEditor = null;
  unreadableViewReadsRemaining = 0;
  createNonEditableView = false;
  onCreateEditableSnapshot = null;
});

vi.mock("@tiptap/react", async () => {
  const actual = await vi.importActual<typeof import("@tiptap/react")>("@tiptap/react");
  const React = await import("react");

  return {
    ...actual,
    EditorContent: function MockEditorContent() {
      return <div data-testid="mock-editor-content" />;
    },
    useEditorState(input: { selector: (value: { editor: any; transactionNumber: number }) => unknown }) {
      return input.selector({
        editor: null,
        transactionNumber: 0
      });
    },
    useEditor(config: {
      editable: boolean;
      onCreate?: (payload: { editor: any }) => void;
      onUpdate?: (payload: { editor: any }) => void;
    }) {
      const documentRef = React.useRef<DocseraTiptapDocument>(mountedDocument);
      const configRef = React.useRef(config);
      const editorRef = React.useRef<any>(null);

      configRef.current = config;

      if (!editorRef.current) {
        const dom = document.createElement("div");
        const initialEditable = createNonEditableView ? false : config.editable;
        dom.setAttribute("contenteditable", initialEditable ? "true" : "false");
        const readableView = {
          coordsAtPos: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
          dom,
          editable: initialEditable
        };
        editorRef.current = {
          commands: {},
          getJSON: () => JSON.parse(JSON.stringify(documentRef.current)),
          isEditable: initialEditable,
          options: {
            editable: initialEditable
          },
          setEditable(nextEditable: boolean) {
            editorRef.current.isEditable = nextEditable;
            editorRef.current.options.editable = nextEditable;
            readableView.editable = nextEditable;
            dom.setAttribute("contenteditable", nextEditable ? "true" : "false");
          },
          state: {
            selection: {}
          },
          get view() {
            if (unreadableViewReadsRemaining > 0) {
              unreadableViewReadsRemaining -= 1;
              throw new Error("view unavailable");
            }
            return readableView;
          }
        };
      }

      React.useEffect(() => {
        const emitUpdate = (nextDocument: DocseraTiptapDocument) => {
          documentRef.current = cloneDocument(nextDocument);
          configRef.current.onUpdate?.({ editor: editorRef.current });
        };

        documentRef.current = cloneDocument(mountedDocument);
        configRef.current.onCreate?.({ editor: editorRef.current });
        onCreateEditableSnapshot = {
          domContentEditable: (editorRef.current.view.dom as HTMLElement).getAttribute("contenteditable") ?? "",
          editorIsEditable: editorRef.current.isEditable,
          optionsEditable: editorRef.current.options.editable,
          viewEditable: editorRef.current.view.editable
        };
        for (const nextDocument of initializationUpdates) {
          emitUpdate(nextDocument);
        }
        mockEditor = {
          emitUpdate,
          getOnCreateEditableSnapshot: () => onCreateEditableSnapshot,
          getEditableSnapshot: () => ({
            domContentEditable: (editorRef.current.view.dom as HTMLElement).getAttribute("contenteditable") ?? "",
            editorIsEditable: editorRef.current.isEditable,
            optionsEditable: editorRef.current.options.editable,
            viewEditable: editorRef.current.view.editable
          }),
          getTabIndex: () => (editorRef.current.view.dom as HTMLElement).tabIndex
        };
      }, []);

      React.useEffect(() => {
        editorRef.current.setEditable(config.editable);
      }, [config.editable]);

      return editorRef.current;
    }
  };
});

vi.mock("./CompactTextToolbar", () => ({
  CompactTextToolbar: function MockCompactTextToolbar() {
    return null;
  }
}));

import { PageEditorHostRuntime } from "./PageEditorHostRuntime";

function createSaveResult(revision: number) {
  return {
    state: "succeeded" as const,
    page: createSuccessPage(revision)
  } satisfies PageBodySaveResult;
}

describe("PageEditorHostRuntime initialization baseline", () => {
  it("keeps mount-time onUpdate bursts inside initialization, then autosaves exactly once after the first real edit", async () => {
    vi.useFakeTimers();
    const mountedNormalizedDocument: DocseraTiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Mounted normalization" }]
        }
      ]
    };
    const postInitializationDocument: DocseraTiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Mounted normalization plus one real edit" }]
        }
      ]
    };
    mountedDocument = mountedNormalizedDocument;
    initializationUpdates = [mountedNormalizedDocument];
    const onStatusChange = vi.fn();
    const onSaveDraft = vi.fn(async () => createSaveResult(1));

    render(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={vi.fn()}
        onOutlineChange={vi.fn()}
        onSaveDraft={onSaveDraft}
        onStatusChange={onStatusChange}
        overlayRoot={document.body.appendChild(document.createElement("div"))}
        pageSysId="page-001"
        theme="light"
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockEditor).not.toBeNull();
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: false,
        isSaving: false,
        status: "Saved"
      })
    );

    const initializationStatuses = onStatusChange.mock.calls.map(([state]) => state.status);
    expect(initializationStatuses).not.toContain("Unsaved");
    expect(initializationStatuses).not.toContain("Savingâ€¦");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(710);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(0);

    await act(async () => {
      mockEditor?.emitUpdate(postInitializationDocument);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: true,
        isSaving: false,
        status: "Unsaved"
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(710);
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: createEnvelopeFromDocument(postInitializationDocument),
      expectedRevision: 0,
      pageSysId: "page-001"
    });
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: false,
        isSaving: false,
        status: "Saved"
      })
    );
  });

  it("retries the tabIndex sync after a transient unreadable editor view", async () => {
    unreadableViewReadsRemaining = 1;

    render(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={vi.fn()}
        onOutlineChange={vi.fn()}
        onSaveDraft={vi.fn(async () => createSaveResult(1))}
        onStatusChange={vi.fn()}
        overlayRoot={document.body.appendChild(document.createElement("div"))}
        pageSysId="page-001"
        theme="light"
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockEditor).not.toBeNull();
    expect(mockEditor?.getTabIndex()).toBe(0);
  });

  it("reconciles the mounted ProseMirror view when creation starts from a stale non-editable state", async () => {
    createNonEditableView = true;

    render(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={vi.fn()}
        onOutlineChange={vi.fn()}
        onSaveDraft={vi.fn(async () => createSaveResult(1))}
        onStatusChange={vi.fn()}
        overlayRoot={document.body.appendChild(document.createElement("div"))}
        pageSysId="page-001"
        theme="light"
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockEditor?.getEditableSnapshot()).toEqual({
      domContentEditable: "true",
      editorIsEditable: true,
      optionsEditable: true,
      viewEditable: true
    });
    expect(mockEditor?.getOnCreateEditableSnapshot()).toEqual({
      domContentEditable: "true",
      editorIsEditable: true,
      optionsEditable: true,
      viewEditable: true
    });
  });
});
