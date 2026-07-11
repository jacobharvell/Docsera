/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocseraDocumentEnvelope, type DocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";

function createEnvelopeFromDocument(document: DocseraDocumentEnvelope["document"]): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: JSON.parse(JSON.stringify(document)) as DocseraDocumentEnvelope["document"]
  };
}

function createSuccessPage(revision: number) {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: createEmptyDocseraDocumentEnvelope(),
    draftRevision: revision,
    draftBodyText: null,
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publicationState: "draft" as const,
    active: true
  };
}

function renderRuntime(overrides: Partial<Parameters<typeof PageEditorHostRuntime>[0]> = {}) {
  const editorReady: Editor[] = [];
  const onAccessLost = vi.fn();
  const onOutlineChange = vi.fn();
  const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
    state: "succeeded",
    page: createSuccessPage(1)
  }));
  const onStatusChange = vi.fn();
  const overlayRoot = document.createElement("div");
  overlayRoot.dataset.docseraEditorRuntimeOverlayRoot = "true";
  document.body.append(overlayRoot);

  const view = render(
    <PageEditorHostRuntime
      canEdit={true}
      initialEnvelope={createEmptyDocseraDocumentEnvelope()}
      initialRevision={0}
      onAccessLost={onAccessLost}
      onOutlineChange={onOutlineChange}
      onSaveDraft={onSaveDraft}
      onEditorReady={(editor) => {
        editorReady[0] = editor;
      }}
      onStatusChange={onStatusChange}
      overlayRoot={overlayRoot}
      pageSysId="page-001"
      theme="light"
      {...overrides}
    />
  );

  return {
    editorReady,
    onAccessLost,
    onOutlineChange,
    onSaveDraft,
    onStatusChange,
    overlayRoot,
    ...view
  };
}

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-docsera-editor-runtime-overlay-root='true']").forEach((node) => node.remove());
});

describe("PageEditorHostRuntime", () => {
  it("becomes dirty after a real TipTap transaction and does not save a clean document", async () => {
    const { editorReady, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const saveButton = within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" });

    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSaveDraft).not.toHaveBeenCalled();

    await act(async () => {
      editor.commands.insertContent("Draft change");
    });

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: createEnvelopeFromDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Draft change" }]
          }
        ]
      }),
      expectedRevision: 0,
      pageSysId: "page-001"
    });

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("keeps newer edits dirty while a save is pending and advances the revision after success", async () => {
    let resolveSave: ((value: PageBodySaveResult) => void) | null = null;
    const onSaveDraft = vi.fn(
      () =>
        new Promise<PageBodySaveResult>((resolve) => {
          resolveSave = resolve;
        })
    );
    const { editorReady } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const saveButton = within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" });
    await act(async () => {
      editor.commands.insertContent("First draft");
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Saving")).toBeInTheDocument();
    });

    await act(async () => {
      editor.commands.insertContent(" after save begins");
    });

    expect(screen.getByText("Saving")).toBeInTheDocument();

    await act(async () => {
      resolveSave?.({
        state: "succeeded",
        page: createSuccessPage(1)
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(2);
    });

    const secondSaveCall = onSaveDraft.mock.calls[1] as unknown as [
      {
        expectedRevision: number;
        pageSysId: string;
      }
    ];

    expect(secondSaveCall?.[0]).toMatchObject({
      expectedRevision: 1,
      pageSysId: "page-001"
    });
  });

  it("keeps draft content after save failures and allows retry", async () => {
    const onSaveDraft = vi
      .fn()
      .mockResolvedValueOnce({
        state: "failed",
        code: "failed",
        errorMessage: "Something went wrong while saving the page body. Please try again."
      } satisfies PageBodySaveResult)
      .mockResolvedValueOnce({
        state: "succeeded",
        page: createSuccessPage(1)
      } satisfies PageBodySaveResult);
    const { editorReady } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("Retry me");
    });

    fireEvent.click(within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong while saving the page body. Please try again.");
    });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Retry me" }] }]
    });

    fireEvent.click(within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
  });

  it("preserves the in-memory draft and dirty state after a conflict save failure", async () => {
    const onAccessLost = vi.fn();
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "failed",
      code: "conflict",
      currentRevision: 3,
      errorMessage: "This draft was updated elsewhere. Refresh to load the latest revision."
    }));
    const { editorReady } = renderRuntime({ onAccessLost, onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("Conflict draft");
    });

    fireEvent.click(within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This draft was updated elsewhere. Refresh to load the latest revision."
      );
    });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Conflict draft" }] }]
    });
    expect(screen.getByText("Save failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(screen.getByText("Changes stay in the shared draft until you save them.")).toBeInTheDocument();
    expect(onAccessLost).not.toHaveBeenCalled();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: createEnvelopeFromDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Conflict draft" }]
          }
        ]
      }),
      expectedRevision: 0,
      pageSysId: "page-001"
    });
  });

  it("suppresses duplicate overlapping explicit saves and accepts a later save after the first settles", async () => {
    let resolveSave: ((value: PageBodySaveResult) => void) | null = null;
    const onSaveDraft = vi.fn(
      () =>
        new Promise<PageBodySaveResult>((resolve) => {
          resolveSave = resolve;
        })
    );
    const { editorReady } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("First draft");
    });

    const saveButton = within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saving")).toBeInTheDocument();

    await act(async () => {
      resolveSave?.({
        state: "succeeded",
        page: createSuccessPage(1)
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    await act(async () => {
      editor.commands.insertContent(" second draft");
    });

    fireEvent.click(within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(2);
    });

    const secondSaveCall = onSaveDraft.mock.calls[1] as unknown as [
      {
        expectedRevision: number;
        pageSysId: string;
      }
    ];

    expect(secondSaveCall?.[0]).toMatchObject({
      expectedRevision: 1,
      pageSysId: "page-001"
    });
  });

  it("keeps forbidden saves recoverable and notifies access loss", async () => {
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "failed",
      code: "forbidden",
      errorMessage: "You do not have permission to edit page bodies in this workspace."
    }));
    const { editorReady, onAccessLost } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("Forbidden draft");
    });

    fireEvent.click(within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(onAccessLost).toHaveBeenCalledTimes(1);
    });
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Forbidden draft" }] }]
    });
  });

  it("preserves canonical JSON and terminal whitespace through explicit save", async () => {
    const expectedDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Canonical title" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trailing whitespace " }]
        }
      ]
    } as const;

    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "succeeded",
      page: createSuccessPage(1)
    }));
    const { editorReady } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent(expectedDocument as never);
    });

    fireEvent.click(within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: {
        schemaVersion: 1,
        document: expectedDocument
      },
      expectedRevision: 0,
      pageSysId: "page-001"
    });
  });

  it("keeps the same editor instance across a rerender for the same page", async () => {
    const { editorReady, rerender, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot, onAccessLost } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const initialEditor = editorReady[0];
    rerender(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={(editor) => {
          editorReady[0] = editor;
        }}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );

    expect(editorReady[0]).toBe(initialEditor);
  });
});
