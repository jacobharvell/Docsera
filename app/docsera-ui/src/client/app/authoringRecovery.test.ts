import { describe, expect, it } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import { AuthoringRecoveryStore } from "./authoringRecovery";

function createEnvelope(text: string) {
  const envelope = createEmptyDocseraDocumentEnvelope();
  envelope.document.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }]
    }
  ];
  return envelope;
}

describe("AuthoringRecoveryStore", () => {
  it("keys body snapshots by workspace sys_id, workspace slug, and page sys_id", () => {
    const store = new AuthoringRecoveryStore();
    store.captureBody({
      captureGeneration: 1,
      editorSessionGeneration: 3,
      envelope: createEnvelope("body"),
      expectedRevision: 4,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).not.toBeNull();
    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "other", workspaceSysId: "workspace-001" })).toBeNull();
    expect(store.readBody({ pageSysId: "page-002", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).toBeNull();
  });

  it("keys page settings snapshots by workspace and page identity", () => {
    const store = new AuthoringRecoveryStore();
    store.capturePageSettings({
      activeField: "slug",
      captureGeneration: 2,
      generalError: "",
      pageSysId: "page-001",
      slug: "overview",
      slugError: "",
      slugSnapshot: "overview",
      title: "Overview",
      titleError: "",
      titleSnapshot: "Overview",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.readPageSettings({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).not.toBeNull();
    expect(store.readPageSettings({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-002" })).toBeNull();
  });

  it("keys inline-create snapshots by workspace identity", () => {
    const store = new AuthoringRecoveryStore();
    store.captureInlineCreate({
      captureGeneration: 3,
      focusToken: 7,
      parentPageSysId: "page-001",
      title: "Child page",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.readInlineCreate({ workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).not.toBeNull();
    expect(store.readInlineCreate({ workspaceSlug: "product-docs", workspaceSysId: "workspace-002" })).toBeNull();
  });

  it("replaces older same-identity snapshots with newer captures", () => {
    const store = new AuthoringRecoveryStore();
    store.captureBody({
      captureGeneration: 1,
      editorSessionGeneration: 1,
      envelope: createEnvelope("first"),
      expectedRevision: 1,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    store.captureBody({
      captureGeneration: 2,
      editorSessionGeneration: 2,
      envelope: createEnvelope("second"),
      expectedRevision: 1,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })?.captureGeneration).toBe(2);
    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })?.envelope.document).toEqual(createEnvelope("second").document);
  });

  it("does not let other workspaces or pages consume a snapshot", () => {
    const store = new AuthoringRecoveryStore();
    store.capturePageSettings({
      activeField: "",
      captureGeneration: 4,
      generalError: "",
      pageSysId: "page-001",
      slug: "overview",
      slugError: "",
      slugSnapshot: "overview",
      title: "Overview",
      titleError: "",
      titleSnapshot: "Overview",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.readPageSettings({ pageSysId: "page-002", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).toBeNull();
    expect(store.readPageSettings({ pageSysId: "page-001", workspaceSlug: "api-docs", workspaceSysId: "workspace-001" })).toBeNull();
  });

  it("requires the exact capture generation to clear a snapshot", () => {
    const store = new AuthoringRecoveryStore();
    store.captureInlineCreate({
      captureGeneration: 5,
      focusToken: 9,
      parentPageSysId: "page-001",
      title: "Draft child",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.clearInlineCreate({ workspaceSlug: "product-docs", workspaceSysId: "workspace-001" }, 4)).toBe(false);
    expect(store.readInlineCreate({ workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })?.captureGeneration).toBe(5);
    expect(store.clearInlineCreate({ workspaceSlug: "product-docs", workspaceSysId: "workspace-001" }, 5)).toBe(true);
    expect(store.readInlineCreate({ workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).toBeNull();
  });

  it("does not let stale generations clear newer replacements", () => {
    const store = new AuthoringRecoveryStore();
    store.captureBody({
      captureGeneration: 6,
      editorSessionGeneration: 1,
      envelope: createEnvelope("first"),
      expectedRevision: 2,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    store.captureBody({
      captureGeneration: 7,
      editorSessionGeneration: 2,
      envelope: createEnvelope("second"),
      expectedRevision: 2,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.clearBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" }, 6)).toBe(false);
    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })?.captureGeneration).toBe(7);
  });

  it("retains a body snapshot until an exact clear consumes it", () => {
    const store = new AuthoringRecoveryStore();
    store.captureBody({
      captureGeneration: 8,
      editorSessionGeneration: 3,
      envelope: createEnvelope("preserved"),
      expectedRevision: 5,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })?.expectedRevision).toBe(5);
    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).not.toBeNull();
  });

  it("clears all recovery snapshots for one exact workspace identity only", () => {
    const store = new AuthoringRecoveryStore();
    store.captureBody({
      captureGeneration: 9,
      editorSessionGeneration: 1,
      envelope: createEnvelope("workspace one body"),
      expectedRevision: 1,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    store.capturePageSettings({
      activeField: "title",
      captureGeneration: 10,
      generalError: "",
      pageSysId: "page-001",
      slug: "overview",
      slugError: "",
      slugSnapshot: "overview",
      title: "Overview Draft",
      titleError: "",
      titleSnapshot: "Overview",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    store.captureInlineCreate({
      captureGeneration: 11,
      focusToken: 3,
      parentPageSysId: "page-001",
      title: "Workspace one child",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    store.captureBody({
      captureGeneration: 12,
      editorSessionGeneration: 2,
      envelope: createEnvelope("workspace two body"),
      expectedRevision: 1,
      failureMessage: "lost",
      pageSysId: "page-001",
      workspaceSlug: "api-docs",
      workspaceSysId: "workspace-002"
    });

    const cleared = store.clearWorkspace({ workspaceSlug: "product-docs", workspaceSysId: "workspace-001" });

    expect(cleared.bodySnapshots).toHaveLength(1);
    expect(cleared.pageSettingsSnapshots).toHaveLength(1);
    expect(cleared.inlineCreateSnapshot?.title).toBe("Workspace one child");
    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).toBeNull();
    expect(store.readPageSettings({ pageSysId: "page-001", workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).toBeNull();
    expect(store.readInlineCreate({ workspaceSlug: "product-docs", workspaceSysId: "workspace-001" })).toBeNull();
    expect(store.readBody({ pageSysId: "page-001", workspaceSlug: "api-docs", workspaceSysId: "workspace-002" })?.captureGeneration).toBe(12);
  });
});
