import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspacePageRecord } from "../../shared/types/docsera";
import { PageBodyEditor } from "./PageBodyEditor";

function createPageRecord(overrides: Partial<WorkspacePageRecord> = {}): WorkspacePageRecord {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: {
      type: "doc",
      content: []
    },
    draftBodyText: "Initial body",
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publicationState: "draft",
    active: true,
    ...overrides
  };
}

describe("page body editor", () => {
  it("tracks dirty state, prevents duplicate saves while saving, and clears back to saved", async () => {
    let resolveSave: ((value: WorkspacePageRecord) => void) | null = null;
    const onSaveBody = vi.fn(
      () =>
        new Promise<WorkspacePageRecord>((resolve) => {
          resolveSave = resolve;
        })
    );

    render(
      <PageBodyEditor
        pageSysId="page-001"
        initialBodyText="Initial body"
        canEdit={true}
        onSaveBody={onSaveBody}
      />
    );

    const textarea = screen.getByLabelText("Body");
    const saveButton = screen.getByRole("button", { name: "Save draft body" });

    expect(saveButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Updated body" } });

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSaveBody).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saving")).toBeInTheDocument();

    const saveResolver = resolveSave as unknown as (value: WorkspacePageRecord) => void;

    if (!saveResolver) {
      throw new Error("Expected the save promise resolver to be assigned.");
    }

    saveResolver(createPageRecord({ draftBodyText: "Updated body" }));

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    expect(textarea).toHaveValue("Updated body");
  });

  it("keeps draft text and shows a safe error when save fails", async () => {
    const onSaveBody = vi.fn(async () => {
      throw new Error("You do not have permission to edit page bodies in this workspace.");
    });

    render(
      <PageBodyEditor
        pageSysId="page-001"
        initialBodyText="Initial body"
        canEdit={true}
        onSaveBody={onSaveBody}
      />
    );

    const textarea = screen.getByLabelText("Body");
    const saveButton = screen.getByRole("button", { name: "Save draft body" });

    fireEvent.change(textarea, { target: { value: "Updated body" } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("You do not have permission to edit page bodies in this workspace.");
    });

    expect(textarea).toHaveValue("Updated body");
    expect(saveButton).toBeEnabled();
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });
});
