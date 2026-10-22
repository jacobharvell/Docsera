/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../../shared/editor/document";
import { WorkspaceMarkdownSourcePanel } from "./WorkspaceMarkdownSourcePanel";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import type { PageEditorCanonicalHandoffResult } from "../../editor/PageEditorHost";

type Snapshot =
  | {
      kind: "invalid";
      text: string;
      isClean: boolean;
      failure: { message: string; range?: { from: number; to: number } };
      diagnostics: { message: string; range?: { from: number; to: number } }[];
    }
  | {
      kind: "valid";
      text: string;
      isClean: boolean;
      title: string;
      envelope: DocseraDocumentEnvelope;
      normalizedMarkdown: string;
    };

let lastStateChange: ((snapshot: Snapshot) => void) | null = null;
const markdownSourceSessionMockState = vi.hoisted(() => ({
  failImport: false
}));
const createMarkdownSourceSessionMock = vi.fn();
const setEditableMock = vi.fn();
const replaceFromCanonicalMock = vi.fn();
const destroyMock = vi.fn();
const dispatchMock = vi.fn();
const focusMock = vi.fn();

function createEnvelopeWithParagraph(text: string): DocseraDocumentEnvelope {
  const envelope = createEmptyDocseraDocumentEnvelope();
  envelope.document.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }]
    }
  ];
  return envelope;
}

vi.mock("../../editor/MarkdownSourceSession", () => {
  return {
    createMarkdownSourceSession: (input: { onStateChange?: (snapshot: Snapshot) => void }) => {
      if (markdownSourceSessionMockState.failImport) {
        throw new Error("Markdown source editor failed to load.");
      }

      const initialSnapshot: Snapshot = {
        kind: "valid",
        text: "---\ntitle: \"Overview\"\n---\n# Overview\n",
        isClean: true,
        title: "Overview",
        envelope: createEmptyDocseraDocumentEnvelope(),
        normalizedMarkdown: "---\ntitle: \"Overview\"\n---\n# Overview\n"
      };
      lastStateChange = input.onStateChange ?? null;
      createMarkdownSourceSessionMock();
      input.onStateChange?.(initialSnapshot);
      let currentSnapshot = initialSnapshot;
      return {
        ok: true,
        session: {
          destroy: destroyMock,
          getSnapshot: () => initialSnapshot,
          replaceFromCanonical: (nextInput: { envelope: DocseraDocumentEnvelope; title: string }) => {
            currentSnapshot = {
              kind: "valid",
              text: currentSnapshot.text,
              isClean: true,
              title: nextInput.title,
              envelope: nextInput.envelope,
              normalizedMarkdown: currentSnapshot.normalizedMarkdown
            };
            replaceFromCanonicalMock(nextInput);
            lastStateChange?.(currentSnapshot);
            return {
              ok: true,
              envelope: nextInput.envelope,
              markdown: currentSnapshot.normalizedMarkdown,
              title: nextInput.title
            };
          },
          setEditable: setEditableMock,
          subscribe: (listener: (snapshot: Snapshot) => void) => {
            listener(currentSnapshot);
            return () => undefined;
          },
          view: { dispatch: dispatchMock, focus: focusMock } as never
        }
      };
    }
  };
});

describe("WorkspaceMarkdownSourcePanel", () => {
  beforeEach(() => {
    lastStateChange = null;
    markdownSourceSessionMockState.failImport = false;
    createMarkdownSourceSessionMock.mockClear();
    setEditableMock.mockClear();
    replaceFromCanonicalMock.mockClear();
    destroyMock.mockClear();
    dispatchMock.mockClear();
    focusMock.mockClear();
  });

  async function waitForSourceSessionCreation(): Promise<void> {
    await waitFor(() => {
      expect(createMarkdownSourceSessionMock).toHaveBeenCalledTimes(1);
    });
  }

  it("shows recovery instructions and accessible explanations and discards the draft", async () => {
    const discard = vi.fn();
    const { rerender } = render(<WorkspaceMarkdownSourcePanel authoringSurface="markdown" canonicalEnvelope={createEmptyDocseraDocumentEnvelope()} canonicalTitle="Overview" discardNonce={0} editable pageSysId="one" visible onDiscardInvalidDraft={discard} />);
    await waitForSourceSessionCreation();
    act(() => lastStateChange?.({ kind: "invalid", text: "plain", isClean: false, failure: { message: "Opening delimiter requires ---" }, diagnostics: [{ message: "Opening delimiter requires ---" }] }));
    const message = screen.getByText("This page contains markdown that the editor cannot parse. Fix it or discard changes using the button below");
    const recovery = message.parentElement!;
    expect(recovery.querySelector("details, summary")).toBeNull();
    expect(screen.getByText("Opening delimiter requires ---")).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard invalid draft" }).parentElement).toBe(recovery);
    act(() => lastStateChange?.({ kind: "invalid", text: "first\n<bad>", isClean: false, failure: { message: "Unsupported HTML", range: { from: 6, to: 11 } }, diagnostics: [{ message: "Unsupported HTML", range: { from: 6, to: 11 } }, { message: "Second error", range: { from: 0, to: 5 } }] }));
    const explanation = screen.getByText("Unsupported HTML");
    expect(explanation).toHaveClass("docsera-main__source-diagnostic-accessible");
    explanation.focus();
    expect(explanation).toHaveFocus();
    const secondExplanation = screen.getByText("Second error");
    secondExplanation.focus();
    expect(secondExplanation).toHaveFocus();
    expect(screen.queryByRole("button", { name: /Go to line/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard invalid draft" }));
    expect(discard).toHaveBeenCalled();
    act(() => lastStateChange?.({ kind: "valid", text: "valid", isClean: true, title: "Overview", envelope: createEmptyDocseraDocumentEnvelope(), normalizedMarkdown: "valid" }));
    expect(screen.queryByText("This page contains markdown that the editor cannot parse. Fix it or discard changes using the button below")).not.toBeInTheDocument();
    act(() => lastStateChange?.({ kind: "invalid", text: "--", isClean: false, failure: { message: "Old error" }, diagnostics: [{ message: "Old error" }] }));
    rerender(<WorkspaceMarkdownSourcePanel authoringSurface="markdown" canonicalEnvelope={createEmptyDocseraDocumentEnvelope()} canonicalTitle="Overview" discardNonce={0} editable pageSysId="two" visible />);
    expect(screen.queryByText("Old error")).not.toBeInTheDocument();
  });

  it("uses a subtle source-editor focus treatment without a perimeter ring", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const sourceEditorBlock = source.match(/\.docsera-main__source-editor \.cm-editor \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const focusedBlock = source.match(/\.docsera-main__source-editor \.cm-editor\.cm-focused \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const scrollerBlock = source.match(/\.docsera-main__source-editor \.cm-focused \.cm-scroller \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(sourceEditorBlock).toContain("outline: none;");
    expect(sourceEditorBlock).toContain("transition: box-shadow 0.16s ease;");
    expect(focusedBlock).toContain("outline: none;");
    expect(focusedBlock).toContain("box-shadow: none;");
    expect(focusedBlock).not.toContain("0 0 0 1px");
    expect(scrollerBlock).toContain("outline: none;");
  });

  it("uses the latest callbacks and editable state without recreating the source session", async () => {
    const firstTitleChange = vi.fn();
    const latestTitleChange = vi.fn();
    const bodyChange = vi.fn((_: DocseraDocumentEnvelope): PageEditorCanonicalHandoffResult => ({
      kind: "applied",
      nextEnvelope: createEmptyDocseraDocumentEnvelope()
    }));
    const onInvalidChange = vi.fn();
    const canonicalEnvelope = createEmptyDocseraDocumentEnvelope();
    const { rerender } = render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={bodyChange}
        onInvalidChange={onInvalidChange}
        onTitleChange={firstTitleChange}
      />
    );

    await waitForSourceSessionCreation();

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={false}
        pageSysId="page-001"
        visible={true}
        onBodyChange={bodyChange}
        onInvalidChange={onInvalidChange}
        onTitleChange={latestTitleChange}
      />
    );

    expect(setEditableMock).toHaveBeenLastCalledWith(false);

    await act(async () => {
      lastStateChange?.({
        kind: "valid",
        text: "---\ntitle: \"Updated\"\n---\n# Updated\n",
        isClean: false,
        title: "Updated",
        envelope: createEmptyDocseraDocumentEnvelope(),
        normalizedMarkdown: "---\ntitle: \"Updated\"\n---\n# Updated\n"
      });
    });

    expect(firstTitleChange).not.toHaveBeenCalled();
    expect(latestTitleChange).toHaveBeenCalledWith("Updated");
    expect(onInvalidChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isInvalid: false,
        isUnavailable: false,
        pageSysId: "page-001"
      })
    );
  });

  it("keeps a projected source snapshot stable while canonical props converge and reprojections on later title changes", async () => {
    const canonicalEnvelope = createEmptyDocseraDocumentEnvelope();
    const projectedEnvelope = createEnvelopeWithParagraph("Projected body");
    const bodyChange = vi.fn((_: DocseraDocumentEnvelope): PageEditorCanonicalHandoffResult => ({
      kind: "applied",
      nextEnvelope: projectedEnvelope
    }));
    const { rerender } = render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={bodyChange}
        onInvalidChange={vi.fn()}
        onTitleChange={vi.fn()}
      />
    );

    await waitForSourceSessionCreation();

    await act(async () => {
      lastStateChange?.({
        kind: "valid",
        text: "---\ntitle: \"Source Title\"\n---\n# Projected body\n",
        isClean: false,
        title: "Source Title",
        envelope: projectedEnvelope,
        normalizedMarkdown: "---\ntitle: \"Source Title\"\n---\n# Projected body\n"
      });
    });

    expect(bodyChange).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={projectedEnvelope}
        canonicalTitle="Source Title"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={bodyChange}
        onInvalidChange={vi.fn()}
        onTitleChange={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(replaceFromCanonicalMock).not.toHaveBeenCalled();

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={projectedEnvelope}
        canonicalTitle="External update"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={bodyChange}
        onInvalidChange={vi.fn()}
        onTitleChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(replaceFromCanonicalMock).toHaveBeenCalledWith({
        envelope: projectedEnvelope,
        title: "External update"
      });
    });
  });

  it("does not overwrite invalid source text when canonical props change externally", async () => {
    const canonicalEnvelope = createEmptyDocseraDocumentEnvelope();
    const { rerender } = render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onTitleChange={vi.fn()}
      />
    );

    await waitForSourceSessionCreation();

    await act(async () => {
      lastStateChange?.({
        kind: "invalid",
        text: "---\ntitle: \"Broken\"\n---\n# Broken\n",
        isClean: false,
        failure: { message: "Invalid markdown source" }, diagnostics: [{ message: "Invalid markdown source" }]
      });
    });

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={createEnvelopeWithParagraph("External update")}
        canonicalTitle="External update"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onTitleChange={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(replaceFromCanonicalMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("This page contains markdown that the editor cannot parse. Fix it or discard changes using the button below")).not.toHaveLength(0);
  });

  it("marks the source unavailable when the body handoff cannot be applied", async () => {
    const onInvalidChange = vi.fn();
    const bodyChange = vi.fn((_: DocseraDocumentEnvelope): PageEditorCanonicalHandoffResult => ({
      kind: "unavailable"
    }));
    const differentEnvelope = createEmptyDocseraDocumentEnvelope();
    differentEnvelope.document.content = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Different body" }]
      }
    ];
    render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={createEmptyDocseraDocumentEnvelope()}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={bodyChange}
        onInvalidChange={onInvalidChange}
        onTitleChange={vi.fn()}
      />
    );

    await waitForSourceSessionCreation();

    await act(async () => {
      lastStateChange?.({
        kind: "valid",
        text: "---\ntitle: \"Overview\"\n---\n# Updated\n",
        isClean: false,
        title: "Overview",
        envelope: differentEnvelope,
        normalizedMarkdown: "---\ntitle: \"Overview\"\n---\n# Updated\n"
      });
    });

    expect(bodyChange).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("heading", { name: "Source unavailable" })).not.toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Invalid source" })).not.toBeInTheDocument();
  });

  it("recovers from an unavailable body handoff once the visual editor becomes available again", async () => {
    const onInvalidChange = vi.fn();
    const bodyChange = vi
      .fn()
      .mockReturnValueOnce({
        kind: "unavailable"
      })
      .mockReturnValue({
        kind: "applied",
        nextEnvelope: createEmptyDocseraDocumentEnvelope()
      });

    const { rerender } = render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={createEmptyDocseraDocumentEnvelope()}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        handoffRetryNonce={0}
        pageSysId="page-001"
        visible={true}
        onBodyChange={bodyChange}
        onInvalidChange={onInvalidChange}
        onTitleChange={vi.fn()}
      />
    );

    await waitForSourceSessionCreation();

    await act(async () => {
      const retainedEnvelope = createEmptyDocseraDocumentEnvelope();
      retainedEnvelope.document.content = [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Retained source" }]
        }
      ];
      lastStateChange?.({
        kind: "valid",
        text: "---\ntitle: \"Overview\"\n---\n# Retained\n",
        isClean: false,
        title: "Overview",
        envelope: retainedEnvelope,
        normalizedMarkdown: "---\ntitle: \"Overview\"\n---\n# Retained\n"
      });
    });

    await waitFor(() => {
      expect(onInvalidChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          errorMessage: "Markdown source is waiting for the visual editor to become available.",
          isInvalid: false,
          isUnavailable: true,
          pageSysId: "page-001"
        })
      );
    });
    expect(screen.getAllByRole("heading", { name: "Source unavailable" })).not.toHaveLength(0);

    await act(async () => {
      rerender(
        <WorkspaceMarkdownSourcePanel
          authoringSurface="markdown"
          canonicalEnvelope={createEmptyDocseraDocumentEnvelope()}
          canonicalTitle="Overview"
          discardNonce={0}
          editable={false}
          handoffRetryNonce={0}
          pageSysId="page-001"
          visible={true}
          onBodyChange={bodyChange}
          onInvalidChange={onInvalidChange}
          onTitleChange={vi.fn()}
        />
      );
      await Promise.resolve();
    });

    await act(async () => {
      rerender(
        <WorkspaceMarkdownSourcePanel
          authoringSurface="markdown"
          canonicalEnvelope={createEmptyDocseraDocumentEnvelope()}
          canonicalTitle="Overview"
          discardNonce={0}
          editable={true}
          handoffRetryNonce={1}
          pageSysId="page-001"
          visible={true}
          onBodyChange={bodyChange}
          onInvalidChange={onInvalidChange}
          onTitleChange={vi.fn()}
        />
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onInvalidChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          errorMessage: "",
          isInvalid: false,
          isUnavailable: false,
          pageSysId: "page-001"
        })
      );
    });
    expect(bodyChange).toHaveBeenCalledTimes(2);
  });

  it("defers loading the source session until the panel becomes visible", async () => {
    const canonicalEnvelope = createEmptyDocseraDocumentEnvelope();
    const { rerender } = render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="visual"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={false}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onTitleChange={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(createMarkdownSourceSessionMock).not.toHaveBeenCalled();

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onTitleChange={vi.fn()}
      />
    );

    await waitForSourceSessionCreation();
  });

  it("signals ready again when returning to a preserved source session", async () => {
    const canonicalEnvelope = createEmptyDocseraDocumentEnvelope();
    const onReadyStateChange = vi.fn();
    const { rerender } = render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="visual"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={false}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onReadyStateChange={onReadyStateChange}
        onTitleChange={vi.fn()}
      />
    );

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onReadyStateChange={onReadyStateChange}
        onTitleChange={vi.fn()}
      />
    );

    await waitForSourceSessionCreation();
    await waitFor(() => {
      expect(onReadyStateChange).toHaveBeenLastCalledWith(true);
    });

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="visual"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={false}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onReadyStateChange={onReadyStateChange}
        onTitleChange={vi.fn()}
      />
    );

    rerender(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={canonicalEnvelope}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={vi.fn()}
        onInvalidChange={vi.fn()}
        onReadyStateChange={onReadyStateChange}
        onTitleChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(onReadyStateChange).toHaveBeenLastCalledWith(true);
    });
    expect(createMarkdownSourceSessionMock).toHaveBeenCalledTimes(1);
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("renders the neutral recovery UI when the lazy session import fails", async () => {
    markdownSourceSessionMockState.failImport = true;
    const onInvalidChange = vi.fn();

    render(
      <WorkspaceMarkdownSourcePanel
        authoringSurface="markdown"
        canonicalEnvelope={createEmptyDocseraDocumentEnvelope()}
        canonicalTitle="Overview"
        discardNonce={0}
        editable={true}
        pageSysId="page-001"
        visible={true}
        onBodyChange={vi.fn()}
        onDiscardInvalidDraft={vi.fn()}
        onInvalidChange={onInvalidChange}
        onTitleChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(onInvalidChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          errorMessage: "Markdown source editor failed to load.",
          isInvalid: false,
          isUnavailable: true,
          pageSysId: "page-001"
        })
      );
    });

    expect(screen.getAllByRole("heading", { name: "Source unavailable" })).not.toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Invalid source" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Discard retained draft" })).not.toHaveLength(0);
  });
});
