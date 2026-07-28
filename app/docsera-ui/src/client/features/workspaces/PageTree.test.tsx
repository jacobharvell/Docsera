import "@testing-library/jest-dom/vitest";
import { useState } from "react";
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

function renderTreeWithCollapsedState(
  pages: WorkspacePageView[],
  overrides: Partial<Parameters<typeof PageTree>[0]> = {},
  initialCollapsedPageIds: string[] = []
) {
  const onCollapsedPageIdsChange = vi.fn();

  function Harness() {
    const [collapsedPageIds, setCollapsedPageIds] = useState(initialCollapsedPageIds);

    return (
      <PageTree
        canCreatePage={false}
        canManagePageSettings
        collapsedPageIds={collapsedPageIds}
        filterText=""
        inlineCreateState={null}
        isCreatingPage={false}
        onCollapsedPageIdsChange={(pageIds) => {
          onCollapsedPageIdsChange(pageIds);
          setCollapsedPageIds(pageIds);
        }}
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

  return {
    ...render(<Harness />),
    onCollapsedPageIdsChange
  };
}

describe("PageTree presentation", () => {
  it("renders status-bearing pages with title-only row text and accessible names", () => {
    renderTree([page({ id: "draft-page", title: "Draft Only", statusIndicator: "Draft" })]);

    expect(screen.getByRole("button", { name: "Draft Only" })).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Draft Only Draft" })).not.toBeInTheDocument();
  });
});

describe("PageTree row interaction", () => {
  it("selects and expands a collapsed parent row when the row is activated", () => {
    const parent = page({
      id: "parent",
      title: "Parent",
      children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
    });
    const onSelectPage = vi.fn();
    const { onCollapsedPageIdsChange } = renderTreeWithCollapsedState(
      [parent],
      {
        onSelectPage,
        selectedPageId: "parent"
      },
      ["parent"]
    );

    const parentButton = screen.getByRole("button", { name: "Parent" });
    expect(parentButton).toHaveAttribute("aria-current", "page");
    expect(parentButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(parentButton);

    expect(onSelectPage).toHaveBeenCalledWith("parent");
    expect(onCollapsedPageIdsChange).toHaveBeenCalledWith([]);
    expect(screen.getByRole("button", { name: "Parent" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
  });

  it("selects and collapses an expanded parent row when the row is activated", () => {
    const parent = page({
      id: "parent",
      title: "Parent",
      children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
    });
    const onSelectPage = vi.fn();
    const { onCollapsedPageIdsChange } = renderTreeWithCollapsedState(
      [parent],
      {
        onSelectPage,
        selectedPageId: "parent"
      },
      []
    );

    const parentButton = screen.getByRole("button", { name: "Parent" });
    expect(parentButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(parentButton);

    expect(onSelectPage).toHaveBeenCalledWith("parent");
    expect(onCollapsedPageIdsChange).toHaveBeenCalledWith(["parent"]);
    expect(screen.getByRole("button", { name: "Parent" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Child" })).not.toBeInTheDocument();
  });

  it("treats the chevron area as part of the same parent-row target and exposes no separate chevron control", () => {
    const parent = page({
      id: "parent",
      title: "Parent",
      children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
    });
    const onSelectPage = vi.fn();
    const { onCollapsedPageIdsChange } = renderTreeWithCollapsedState(
      [parent],
      {
        onSelectPage,
        selectedPageId: "parent"
      },
      []
    );

    const parentButton = screen.getByRole("button", { name: "Parent" });
    const chevron = parentButton.querySelector(".docsera-page-tree__chevron");
    if (!chevron) {
      throw new Error("Missing chevron area for Parent.");
    }

    expect(parentButton.closest(".docsera-page-tree__row")).toBeInTheDocument();
    expect(parentButton.closest(".docsera-page-tree__row")?.querySelector(".docsera-page-tree__chevron")).toBeInTheDocument();
    expect(parentButton.closest(".docsera-page-tree__row")?.querySelector(".docsera-page-tree__chevron")?.tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: "Expand Parent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapse Parent" })).not.toBeInTheDocument();

    fireEvent.click(chevron);

    expect(onSelectPage).toHaveBeenCalledWith("parent");
    expect(onCollapsedPageIdsChange).toHaveBeenCalledWith(["parent"]);
    expect(screen.getByRole("button", { name: "Parent" })).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates a leaf row without introducing expansion behavior", () => {
    const onSelectPage = vi.fn();
    const onCollapsedPageIdsChange = vi.fn();
    renderTree([page({ id: "leaf", title: "Leaf" })], {
      onSelectPage,
      onCollapsedPageIdsChange
    });

    const leafButton = screen.getByRole("button", { name: "Leaf" });
    expect(leafButton).not.toHaveAttribute("aria-expanded");

    fireEvent.click(leafButton);

    expect(onSelectPage).toHaveBeenCalledWith("leaf");
    expect(onCollapsedPageIdsChange).not.toHaveBeenCalled();
  });

  it("keeps the child-page plus control independent from row activation", () => {
    const onSelectPage = vi.fn();
    const onShowChildPageCreate = vi.fn();
    const onCollapsedPageIdsChange = vi.fn();
    renderTree(
      [
        page({
          id: "parent",
          title: "Parent",
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        })
      ],
      {
        canCreatePage: true,
        onCollapsedPageIdsChange,
        onSelectPage,
        onShowChildPageCreate
      }
    );

    fireEvent.click(screen.getByRole("button", { name: "Add child page to Parent" }));

    expect(onShowChildPageCreate).toHaveBeenCalledWith("parent", "Parent");
    expect(onSelectPage).not.toHaveBeenCalled();
    expect(onCollapsedPageIdsChange).not.toHaveBeenCalled();
  });

  it("keeps the Page Settings gear independent from row activation", () => {
    const onSelectPage = vi.fn();
    const onTogglePageSettings = vi.fn();
    const onCollapsedPageIdsChange = vi.fn();
    renderTree(
      [
        page({
          id: "parent",
          title: "Parent",
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        })
      ],
      {
        onCollapsedPageIdsChange,
        onSelectPage,
        onTogglePageSettings
      }
    );

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Parent" }));

    expect(onTogglePageSettings).toHaveBeenCalledWith("parent");
    expect(onSelectPage).not.toHaveBeenCalled();
    expect(onCollapsedPageIdsChange).not.toHaveBeenCalled();
  });

  it("does not add authoring controls to viewer rows", () => {
    renderTree(
      [
        page({
          id: "parent",
          title: "Parent",
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        })
      ],
      {
        canCreatePage: false,
        canManagePageSettings: false
      }
    );

    expect(screen.queryByRole("button", { name: "Add child page to Parent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open settings for Parent" })).not.toBeInTheDocument();
  });
});

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
