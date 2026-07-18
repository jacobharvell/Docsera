import "@testing-library/jest-dom/vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../../shared/editor/document";
import { PageTree } from "./PageTree";
import type { WorkspacePageView } from "./workspaceViewModels";

function page(overrides: Partial<WorkspacePageView> & Pick<WorkspacePageView, "id" | "title">): WorkspacePageView {
  const sysId = overrides.sysId ?? overrides.id;
  return {
    children: overrides.children,
    contentEnvelope: createEmptyDocseraDocumentEnvelope(),
    contentError: "",
    contentState: "ready",
    id: overrides.id,
    isDraftOnly: false,
    page: {
      sysId,
      workspaceSysId: "workspace-001",
      parentPageSysId: overrides.parentPageSysId ?? null,
      siblingOrder: overrides.siblingOrder ?? 1,
      draftTitle: overrides.title,
      draftSlug: overrides.title.toLowerCase(),
      draftSlugNormalized: overrides.title.toLowerCase(),
      draftContentJson: createEmptyDocseraDocumentEnvelope(),
      draftRevision: 0,
      draftBodyText: null,
      publishedTitle: overrides.title,
      publishedSlug: overrides.title.toLowerCase(),
      publishedSlugNormalized: overrides.title.toLowerCase(),
      publishedContentJson: createEmptyDocseraDocumentEnvelope(),
      publishedBodyText: null,
      publicationState: "published",
      active: true
    },
    parentPageSysId: overrides.parentPageSysId ?? null,
    publicationState: "published",
    siblingOrder: overrides.siblingOrder ?? 1,
    slug: overrides.slug ?? overrides.title.toLowerCase(),
    statusIndicator: null,
    sysId,
    title: overrides.title,
    tocItems: []
  };
}

function renderTree(pages: WorkspacePageView[], overrides: Partial<Parameters<typeof PageTree>[0]> = {}) {
  return render(
    <PageTree
      canCreatePage={false}
      canManagePageSettings
      collapsedPageIds={[]}
      filterText=""
      inlineCreateState={null}
      isCreatingPage={false}
      onCollapsedPageIdsChange={vi.fn()}
      onCommitInlineCreate={vi.fn()}
      onInlineCreateTitleChange={vi.fn()}
      onSelectPage={vi.fn()}
      onShowCreatePage={vi.fn()}
      onShowChildPageCreate={vi.fn()}
      onTogglePageSettings={vi.fn()}
      pageSettingsOpenPageId=""
      pages={pages}
      selectedPageId=""
      {...overrides}
    />
  );
}

function row(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });
  const element = button.closest(".docsera-page-tree__row");
  if (!element) {
    throw new Error(`Missing row for ${title}.`);
  }
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 90, height: 90, left: 0, right: 200, top: 0, width: 200, x: 0, y: 0, toJSON: () => ({}) })
  });
  return element as HTMLElement;
}

function dataTransfer() {
  return {
    dropEffect: "move",
    effectAllowed: "move",
    getData: vi.fn(() => ""),
    setData: vi.fn()
  };
}

function dragDrop(sourceTitle: string, targetTitle: string, clientY: number) {
  const transfer = dataTransfer();
  fireEvent.dragStart(row(sourceTitle), { dataTransfer: transfer });
  fireEvent.dragOver(row(targetTitle), { clientY, dataTransfer: transfer });
  const drop = createEvent.drop(row(targetTitle), { dataTransfer: transfer });
  Object.defineProperty(drop, "clientY", { value: clientY });
  fireEvent(row(targetTitle), drop);
}

describe("PageTree movement drag and drop", () => {
  it("calls movement for root reorder and moving a nested page to root", () => {
    const onMovePage = vi.fn();
    renderTree([
      page({ id: "root-a", title: "Root A", siblingOrder: 1, children: [page({ id: "child-a", parentPageSysId: "root-a", title: "Child A" })] }),
      page({ id: "root-b", title: "Root B", siblingOrder: 2 })
    ], { onMovePage });

    dragDrop("Child A", "Root B", 89);

    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "child-a",
      parentPageSysId: null,
      siblingOrder: "3"
    });
  });

  it("calls movement for dropping inside an eligible parent", () => {
    const onMovePage = vi.fn();
    renderTree([
      page({ id: "root-a", title: "Root A", siblingOrder: 1 }),
      page({ id: "root-b", title: "Root B", siblingOrder: 2 })
    ], { onMovePage });

    dragDrop("Root B", "Root A", 45);

    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "root-b",
      parentPageSysId: "root-a",
      siblingOrder: "1"
    });
  });

  it("does not move when authoring is disabled or placement is circular or deeper than level six", () => {
    const onMovePage = vi.fn();
    const chain = page({
      id: "l1",
      title: "Level 1",
      siblingOrder: 1,
      children: [
        page({
          id: "l2",
          parentPageSysId: "l1",
          title: "Level 2",
          children: [
            page({
              id: "l3",
              parentPageSysId: "l2",
              title: "Level 3",
              children: [
                page({
                  id: "l4",
                  parentPageSysId: "l3",
                  title: "Level 4",
                  children: [
                    page({
                      id: "l5",
                      parentPageSysId: "l4",
                      title: "Level 5",
                      children: [page({ id: "l6", parentPageSysId: "l5", title: "Level 6" })]
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });

    const { rerender } = renderTree([chain, page({ id: "other", title: "Other", siblingOrder: 2 })], { onMovePage });
    dragDrop("Level 1", "Level 2", 45);
    dragDrop("Other", "Level 6", 45);
    expect(onMovePage).not.toHaveBeenCalled();

    rerender(
      <PageTree
        canCreatePage={false}
        canManagePageSettings={false}
        collapsedPageIds={[]}
        filterText=""
        inlineCreateState={null}
        isCreatingPage={false}
        onCommitInlineCreate={vi.fn()}
        onInlineCreateTitleChange={vi.fn()}
        onMovePage={onMovePage}
        onSelectPage={vi.fn()}
        onShowCreatePage={vi.fn()}
        onShowChildPageCreate={vi.fn()}
        onTogglePageSettings={vi.fn()}
        pageSettingsOpenPageId=""
        pages={[page({ id: "root-a", title: "Root A" }), page({ id: "root-b", title: "Root B", siblingOrder: 2 })]}
        selectedPageId=""
      />
    );
    expect(row("Root A")).toHaveAttribute("draggable", "false");
  });
});
