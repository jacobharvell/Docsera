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
  getTabIndex: () => number;
} | null = null;
let unreadableViewReadsRemaining = 0;

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
        const readableView = {
          coordsAtPos: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
          dom
        };
        editorRef.current = {
          commands: {},
          getJSON: () => JSON.parse(JSON.stringify(documentRef.current)),
          isEditable: config.editable,
          setEditable(nextEditable: boolean) {
            editorRef.current.isEditable = nextEditable;
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
        editorRef.current.isEditable = configRef.current.editable;
        configRef.current.onCreate?.({ editor: editorRef.current });
        for (const nextDocument of initializationUpdates) {
          emitUpdate(nextDocument);
        }
        mockEditor = {
          emitUpdate,
          getTabIndex: () => (editorRef.current.view.dom as HTMLElement).tabIndex
        };
      }, []);

      React.useEffect(() => {
        editorRef.current.isEditable = config.editable;
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
});
