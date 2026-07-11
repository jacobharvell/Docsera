/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope, type DocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveInput,
  PageBodySaveResult,
  PageListResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

type MockHostProps = {
  initialRevision: number;
  onAccessLost: () => void;
  onError: (failure: { kind: "load_failed" | "mount_failed"; message: string } | null) => void;
  onOutlineChange: (outline: Array<{ id: string; level: number; text: string }>) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: { isDirty: boolean; isSaving: boolean }) => void;
  pageSysId: string;
  sessionKey: string;
};

type MockHostControl = {
  emitAccessLost: () => void;
  emitError: (message: string) => void;
  emitOutline: (text: string) => void;
  emitStatus: (state: { isDirty: boolean; isSaving: boolean }) => void;
  mountId: number;
  pageSysId: string;
  sessionKey: string;
};

const hostControls = new Map<string, MockHostControl>();
let latestHostControl: MockHostControl | null = null;
let mountSequence = 0;

function createEnvelopeFromText(text: string): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: text
        ? [{ type: "paragraph", content: [{ type: "text", text }] }]
        : []
    }
  };
}

function readPlainText(envelope: DocseraDocumentEnvelope): string {
  const paragraph = envelope.document.content?.[0] as { content?: Array<{ text?: string }> } | undefined;
  return paragraph?.content?.[0]?.text ?? "";
}

vi.mock("../editor/PageEditorHost", () => {
  function MockPageEditorHost(props: MockHostProps) {
    const mountId = useRef(++mountSequence).current;
    const [text, setText] = useState(() => readPlainText(createEmptyDocseraDocumentEnvelope()));
    const [savedText, setSavedText] = useState(() => readPlainText(createEmptyDocseraDocumentEnvelope()));
    const [historyDepth, setHistoryDepth] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      props.onStatusChange({
        isDirty: text !== savedText,
        isSaving
      });
    }, [isSaving, props.onStatusChange, savedText, text]);

    useEffect(() => {
      const control: MockHostControl = {
        emitAccessLost: () => props.onAccessLost(),
        emitError: (message) => props.onError({ kind: "mount_failed", message }),
        emitOutline: (headingText) =>
          props.onOutlineChange([
            {
              id: headingText.toLowerCase().replace(/\s+/g, "-"),
              level: 2,
              text: headingText
            }
          ]),
        emitStatus: (state) => props.onStatusChange(state),
        mountId,
        pageSysId: props.pageSysId,
        sessionKey: props.sessionKey
      };

      hostControls.set(props.sessionKey, control);
      latestHostControl = control;
      return () => {
        hostControls.delete(props.sessionKey);
        if (latestHostControl?.sessionKey === props.sessionKey) {
          latestHostControl = null;
        }
      };
    }, [mountId, props.onAccessLost, props.onError, props.onOutlineChange, props.onStatusChange, props.pageSysId, props.sessionKey]);

    async function saveCurrentDraft() {
      const snapshot = text;
      setIsSaving(true);
      const result = await props.onSaveDraft({
        draftContentJson: createEnvelopeFromText(snapshot),
        expectedRevision: props.initialRevision,
        pageSysId: props.pageSysId
      });

      setIsSaving(false);
      if (result.state === "failed") {
        if (result.code === "forbidden") {
          props.onAccessLost();
        }
        return;
      }

      setSavedText(snapshot);
    }

    function updateText(nextText: string) {
      setText(nextText);
      setHistoryDepth((value) => value + 1);
    }

    return (
      <section aria-label="Mock draft editor">
        <p>Mount {mountId}</p>
        <p>Session {props.sessionKey}</p>
        <p>Text {text || "(empty)"}</p>
        <p>Saved {savedText || "(empty)"}</p>
        <p>Status {text === savedText ? "clean" : "dirty"}</p>
        <p>History {historyDepth}</p>
        <button type="button" onClick={() => updateText("Draft change")}>
          Make dirty
        </button>
        <button type="button" onClick={() => updateText("Draft change 2")}>
          Keep typing
        </button>
        <button type="button" onClick={() => void saveCurrentDraft()}>
          Save draft
        </button>
      </section>
    );
  }

  return {
    PageEditorHost: MockPageEditorHost
  };
});

function createWorkspace(overrides: Partial<WorkspaceViewRecord> = {}): WorkspaceViewRecord {
  return {
    sysId: "workspace-001",
    slug: "product-docs",
    name: "Product Docs",
    shortDescription: "Product documentation",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    status: "active",
    roleLabel: "Admin",
    canManageSettings: true,
    ...overrides
  };
}

function createPageRecord(overrides: Partial<WorkspacePageRecord> = {}): WorkspacePageRecord {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview Draft",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: createEmptyDocseraDocumentEnvelope(),
    draftRevision: 0,
    draftBodyText: null,
    publishedTitle: "Overview",
    publishedSlug: "overview",
    publishedSlugNormalized: "overview",
    publishedContentJson: createEmptyDocseraDocumentEnvelope(),
    publishedBodyText: null,
    publicationState: "published_with_unpublished_changes",
    active: true,
    ...overrides
  };
}

function createPageListResult(mode: WorkspaceMode, items: WorkspacePageRecord[]): PageListResult {
  return {
    items,
    mode,
    workspaceSlug: "product-docs",
    workspaceSysId: "workspace-001",
    totalCount: items.length
  };
}

function createClient(overrides: Partial<ServiceNowClient> = {}): ServiceNowClient {
  const workspace = createWorkspace();
  const editPages = [
    createPageRecord(),
    createPageRecord({
      sysId: "page-002",
      draftTitle: "Child Draft",
      draftSlug: "child",
      draftSlugNormalized: "child",
      siblingOrder: 2,
      parentPageSysId: "page-001",
      publishedTitle: "Child"
    }),
    createPageRecord({
      sysId: "page-003",
      draftTitle: "Draft Only",
      draftSlug: "draft-only",
      draftSlugNormalized: "draft-only",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft",
      siblingOrder: 3
    })
  ];
  const livePages = [
    createPageRecord({
      draftTitle: "Overview",
      publicationState: "published"
    }),
    createPageRecord({
      sysId: "page-002",
      draftTitle: "Child",
      draftSlug: "child",
      draftSlugNormalized: "child",
      siblingOrder: 2,
      parentPageSysId: "page-001",
      publicationState: "published"
    })
  ];

  return {
    ping: vi.fn(async () => {
      throw new Error("ping should not be called");
    }),
    listWorkspaces: vi.fn(async () => ({
      items: [workspace, createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })],
      page: 1,
      pageSize: 10,
      totalCount: 2,
      hasNextPage: false,
      searchText: ""
    })),
    getWorkspace: vi.fn(async (workspaceSlug: string) => ({
      workspace: workspaceSlug === "api-docs" ? createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" }) : workspace
    })),
    listPages: vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (workspaceSlug === "api-docs") {
        return {
          items: [createPageRecord({ workspaceSysId: "workspace-002", draftTitle: "API Overview", draftSlug: "api-overview", draftSlugNormalized: "api-overview" })],
          mode: mode === "edit" ? "edit" : "live",
          workspaceSlug,
          workspaceSysId: "workspace-002",
          totalCount: 1
        };
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? editPages : livePages);
    }),
    createWorkspace: vi.fn(async () => {
      throw new Error("createWorkspace should not be called");
    }),
    getWorkspaceProvisioningStatus: vi.fn(async () => {
      throw new Error("getWorkspaceProvisioningStatus should not be called");
    }),
    createPage: vi.fn(async () => {
      throw new Error("createPage should not be called");
    }),
    savePageBody: vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "succeeded",
      page: createPageRecord({ draftRevision: 1 })
    })),
    savePageSettings: vi.fn(async () => {
      throw new Error("savePageSettings should not be called");
    }),
    deletePage: vi.fn(async () => {
      throw new Error("deletePage should not be called");
    }),
    ...overrides
  };
}

function renderApp(search: string, clientOverrides: Partial<ServiceNowClient> = {}) {
  hostControls.clear();
  latestHostControl = null;
  mountSequence = 0;
  window.history.replaceState({}, "", search);

  const runtime: DocseraRuntimeContext = {
    mountNode: document.createElement("div"),
    mountNodeId: "docsera-runtime",
    config: {}
  };

  const serviceNowClient = createClient(clientOverrides);
  return {
    serviceNowClient,
    ...render(<App runtime={runtime} serviceNowClient={serviceNowClient} />)
  };
}

function createDeferredSave() {
  let resolve: ((value: PageBodySaveResult) => void) | null = null;
  const promise = new Promise<PageBodySaveResult>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: (value: PageBodySaveResult) => {
      if (!resolve) {
        throw new Error("Deferred save was not initialized.");
      }

      resolve(value);
    }
  };
}

describe("App editor-host session boundary", () => {
  it("retains the active editor generation across repeated rerenders of the same page", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Save draft" });

    const initialMountId = latestHostControl?.mountId;
    const initialSessionKey = latestHostControl?.sessionKey;

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    await waitFor(() => {
      expect(screen.getByText("Mount 1")).toBeInTheDocument();
    });
    expect(latestHostControl?.mountId).toBe(initialMountId);
    expect(latestHostControl?.sessionKey).toBe(initialSessionKey);
  });

  it("preserves the active editor session across a successful save and keeps local history", async () => {
    const deferredSave = createDeferredSave();
    const savePageBody = vi.fn(async () => deferredSave.promise);
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { savePageBody });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Save draft" });

    const initialMountId = latestHostControl?.mountId;
    const initialSessionKey = latestHostControl?.sessionKey;

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    expect(screen.getByText("Status dirty")).toBeInTheDocument();
    expect(screen.getByText("History 1")).toBeInTheDocument();
    expect(screen.getByText("Mount 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    deferredSave.resolve({
      state: "succeeded",
      page: createPageRecord({ draftRevision: 1 })
    });

    await waitFor(() => {
      expect(screen.getByText("Status clean")).toBeInTheDocument();
    });

    expect(screen.getByText("Mount 1")).toBeInTheDocument();
    expect(latestHostControl?.mountId).toBe(initialMountId);
    expect(latestHostControl?.sessionKey).toBe(initialSessionKey);
    expect(screen.getByText("History 1")).toBeInTheDocument();
  });

  it("keeps newer in-memory edits dirty while an earlier save completes", async () => {
    const deferredSave = createDeferredSave();
    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      savePageBody: vi.fn(async () => deferredSave.promise)
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep typing" }));

    deferredSave.resolve({
      state: "succeeded",
      page: createPageRecord({ draftRevision: 1 })
    });

    await waitFor(() => {
      expect(screen.getByText("Text Draft change 2")).toBeInTheDocument();
    });

    expect(screen.getByText("Saved Draft change")).toBeInTheDocument();
    expect(screen.getByText("Status dirty")).toBeInTheDocument();
    expect(screen.getByText("History 2")).toBeInTheDocument();
  });

  it("guards dirty route transitions and keeps clean transitions immediate", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=child");

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));

    fireEvent.click(screen.getByRole("button", { name: "Overview Draft Unpublished" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay and continue editing" }));
    expect(screen.getByRole("heading", { name: "Child Draft" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Child" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Overview Draft Unpublished" }));
    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("creates one new editor generation when changing pages", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Save draft" });

    const initialSessionKey = latestHostControl?.sessionKey;

    fireEvent.click(screen.getByRole("button", { name: "Child Draft Unpublished" }));

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(latestHostControl?.sessionKey).not.toBe(initialSessionKey);
    expect(initialSessionKey ? hostControls.has(initialSessionKey) : false).toBe(false);
  });

  it("guards workspace, launcher, breadcrumb, and browser-history transitions while dirty", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=child");

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));

    fireEvent.click(screen.getByRole("button", { name: "Overview Draft Unpublished" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay and continue editing" }));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /API Docs/i }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay and continue editing" }));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "My Workspaces" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay and continue editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Overview Draft Unpublished" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));

    await act(async () => {
      window.history.back();
      await Promise.resolve();
    });

    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    expect(window.location.search).toContain("page=overview");
  });

  it("guards breadcrumb navigation while dirty", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [
        createPageRecord({
          sysId: "page-root",
          draftTitle: "Overview",
          draftSlug: "overview",
          draftSlugNormalized: "overview",
          publishedTitle: "Overview",
          publishedSlug: "overview",
          publishedSlugNormalized: "overview"
        }),
        createPageRecord({
          parentPageSysId: "page-root",
          siblingOrder: 2,
          sysId: "page-child",
          draftTitle: "Child Draft",
          draftSlug: "child",
          draftSlugNormalized: "child",
          publishedTitle: "Child",
          publishedSlug: "child",
          publishedSlugNormalized: "child"
        })
      ])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=child", { listPages });

    expect(await screen.findByRole("navigation", { name: "Page breadcrumbs" })).toBeInTheDocument();
    const breadcrumbs = screen.getByRole("navigation", { name: "Page breadcrumbs" });
    expect(within(breadcrumbs).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Overview" }));

    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay and continue editing" }));
    expect(screen.getByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
  });

  it("contains authoring access loss and ignores stale callbacks afterward", async () => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "failed",
      code: "forbidden",
      errorMessage: "You do not have permission to edit page bodies in this workspace."
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=draft-only", { savePageBody });

    expect(await screen.findByRole("heading", { name: "Draft Only" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("heading", { name: "Authoring access is no longer available" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Mock draft editor")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(screen.queryByText("Draft change")).not.toBeInTheDocument();

    latestHostControl?.emitError("Stale runtime failure");
    latestHostControl?.emitOutline("Stale draft heading");
    latestHostControl?.emitStatus({ isDirty: true, isSaving: false });

    expect(screen.queryByRole("heading", { name: "The draft editor is unavailable" })).not.toBeInTheDocument();
    expect(screen.queryByText("Stale draft heading")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Return to Live" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(window.location.search).toBe("?workspace=product-docs&page=overview");
  });

  it("creates one new editor generation when retrying the editor", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Save draft" });

    const initialSessionKey = latestHostControl?.sessionKey;

    await act(async () => {
      latestHostControl?.emitError("Sensitive runtime failure: /tmp/docsera-runtime.js");
    });
    expect(await screen.findByRole("heading", { name: "The draft editor is unavailable" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(latestHostControl?.sessionKey).not.toBe(initialSessionKey);
    });
    expect(initialSessionKey ? hostControls.has(initialSessionKey) : false).toBe(false);
  });

  it("invalidates the prior generation when leaving Edit", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Save draft" });

    const priorSessionKey = latestHostControl?.sessionKey;

    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(latestHostControl).toBeNull();
    expect(priorSessionKey ? hostControls.has(priorSessionKey) : false).toBe(false);
  });

  it("ignores a late save completion from a discarded prior page session", async () => {
    const firstSave = createDeferredSave();
    const savePageBody: ServiceNowClient["savePageBody"] = vi
      .fn(async (_input: PageBodySaveInput): Promise<PageBodySaveResult> => ({
        state: "succeeded",
        page: createPageRecord({ sysId: "page-002", draftTitle: "Child Draft", draftSlug: "child", draftSlugNormalized: "child", draftRevision: 1 })
      }))
      .mockImplementationOnce(async (_input: PageBodySaveInput) => firstSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { savePageBody });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Child Draft Unpublished" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));

    firstSave.resolve({
      state: "succeeded",
      page: createPageRecord({ draftRevision: 1 })
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    });

    expect(latestHostControl?.pageSysId).toBe("page-002");
    expect(window.location.search).toContain("page=child");
  });
});
