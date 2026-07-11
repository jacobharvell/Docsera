/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyDocseraDocumentEnvelope,
  type DocseraDocumentEnvelope
} from "../../shared/editor/document";
import { createSupportedE2DocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
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

function createClipboardData(html: string, text = html) {
  return {
    getData: (type: string) => {
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

async function pasteIntoEditor(editor: Editor, html: string, text = html) {
  await act(async () => {
    editor.commands.focus("end");
    fireEvent.paste(editor.view.dom, {
      clipboardData: createClipboardData(html, text)
    } as never);
  });
}

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-docsera-editor-runtime-overlay-root='true']").forEach((node) => node.remove());
});

describe("PageEditorHostRuntime", () => {
  it("mounts the supported E2 rich-text schema without normalizing away accepted nodes or marks", async () => {
    const supportedEnvelope = createSupportedE2DocseraDocumentEnvelope();
    const { editorReady, onSaveDraft } = renderRuntime({ initialEnvelope: supportedEnvelope });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    expect(editorReady[0].getJSON()).toEqual(supportedEnvelope.document);

    const saveButton = within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("rejects an invalid initial envelope before editor mount", () => {
    expect(() =>
      renderRuntime({
        initialEnvelope: {
          schemaVersion: 1,
          document: {
            type: "doc",
            content: [
              {
                type: "image"
              }
            ]
          }
        } as never
      })
    ).toThrow("valid TipTap document");
  });

  it("explicitly saves the supported E2 rich-text schema without flattening accepted structure", async () => {
    const supportedEnvelope = createSupportedE2DocseraDocumentEnvelope();
    const { editorReady, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent(supportedEnvelope.document as never);
    });

    const saveButton = within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: supportedEnvelope,
      expectedRevision: 0,
      pageSysId: "page-001"
    });

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("preserves plain-text paste as paragraphs and auto-links supported URLs", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await pasteIntoEditor(editor, "", "First line\nhttps://example.com/docs\nSecond line");

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First line" }]
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "https://example.com/docs",
              marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }]
            }
          ]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second line" }]
        }
      ]
    });
  });

  it("preserves supported rich HTML paste while stripping unsupported markup and unsafe links", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await pasteIntoEditor(
      editor,
      [
        "<h2>Overview</h2>",
        "<p><strong>Bold</strong> <em>italic</em> <s>strike</s> <code>code</code> <a href=\"https://example.com/docs\">link</a></p>",
        "<ol start=\"3\"><li><p>Ordered item</p><ul><li><p>Nested bullet</p></li></ul></li></ol>",
        "<ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"true\"><p>Checked task</p></li></ul>",
        "<blockquote><p>Quoted text</p></blockquote>",
        "<pre><code class=\"language-typescript\">const value = 1;</code></pre>",
        "<script>alert(1)</script>",
        "<style>.bad{color:red}</style>",
        "<p><a href=\"javascript:alert(1)\">Unsafe</a></p>"
      ].join("")
    );

    const json = editor.getJSON();
    expect(json).toMatchObject({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }]
        },
        { type: "paragraph" },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Ordered item" }]
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested bullet" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Checked task" }]
                }
              ]
            }
          ]
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted text" }]
            }
          ]
        },
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const value = 1;" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Unsafe" }]
        }
      ]
    });

    const paragraph = (json.content?.[1] as { content?: Array<{ marks?: Array<{ type: string }> }> } | undefined)?.content ?? [];
    const paragraphMarkTypes = paragraph.flatMap((node) => node.marks?.map((mark) => mark.type) ?? []);
    expect(paragraphMarkTypes).toEqual(expect.arrayContaining(["bold", "italic", "strike", "code", "link"]));
  });

  it("keeps unsupported active and embedded markup out of canonical JSON during paste", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await pasteIntoEditor(
      editor,
      [
        "<p>Safe text</p>",
        "<img src=\"x\" onerror=\"alert(1)\">",
        "<svg onload=\"alert(1)\"><title>Ignored</title></svg>",
        "<math><mi>x</mi></math>",
        "<object data=\"x\"></object>",
        "<embed src=\"x\"></embed>",
        "<iframe srcdoc=\"<p>bad</p>\"></iframe>",
        "<span data-unsupported=\"yes\" style=\"color: red\">still text</span>"
      ].join("")
    );

    const jsonValue = editor.getJSON();
    expect(jsonValue.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Safe text" }]
    });

    const json = JSON.stringify(jsonValue);
    expect(json).not.toContain("image");
    expect(json).not.toContain("svg");
    expect(json).not.toContain("math");
    expect(json).not.toContain("object");
    expect(json).not.toContain("embed");
    expect(json).not.toContain("iframe");
    expect(json).not.toContain("onerror");
    expect(json).not.toContain("srcdoc");
  });

  it("keeps undo and redo available after an explicit save", async () => {
    const { editorReady, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Base" }]
          }
        ]
      });
    });

    await act(async () => {
      editor.commands.insertContent(" edit");
    });

    const saveButton = within(screen.getByLabelText("Draft editor")).getByRole("button", { name: "Save draft" });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    const savedState = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).not.toEqual(savedState);

    await act(async () => {
      editor.commands.redo();
    });

    expect(editor.getJSON()).toEqual(savedState);
  });

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
