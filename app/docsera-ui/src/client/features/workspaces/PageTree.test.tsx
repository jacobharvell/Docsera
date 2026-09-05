import "@testing-library/jest-dom/vitest";
// @ts-expect-error node builtin types are not included in the client test tsconfig
import { readFileSync } from "node:fs";
// @ts-expect-error node builtin types are not included in the client test tsconfig
import { join } from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../../shared/editor/document";
import { PageTree } from "./PageTree";
import { resolvePageTreeDropGeometry } from "./pageTreeDropGeometry";
import {
  resolvePageTreeDropDestination,
  type PageTreeDropDestination,
  type PageTreeDropPosition
} from "./pageTreeDropResolver";
import type { WorkspacePageView } from "./workspaceViewModels";

vi.mock("./pageTreeDropResolver", () => ({
  resolvePageTreeDropDestination: vi.fn()
}));

vi.mock("./pageTreeDropGeometry", () => ({
  resolvePageTreeDropGeometry: vi.fn()
}));

const resolveDropDestination = vi.mocked(resolvePageTreeDropDestination);
const resolveDropGeometry = vi.mocked(resolvePageTreeDropGeometry);
let activeGeometryCandidate: MockGeometryCandidate | null = null;

beforeEach(() => {
  resolveDropDestination.mockReset();
  resolveDropGeometry.mockReset();
  activeGeometryCandidate = null;
  resolveDropGeometry.mockImplementation(() => activeGeometryCandidate);
  resolveDropDestination.mockReturnValue(null);
});

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
      onRequestDeletePage={vi.fn()}
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
        onRequestDeletePage={vi.fn()}
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

  it("opens the page context menu on right-click without activating the row", async () => {
    const onSelectPage = vi.fn();
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
        onSelectPage
      }
    );

    fireEvent.contextMenu(row("Parent"), { clientX: 20, clientY: 30 });

    expect(await screen.findByRole("menu", { name: "Page actions for Parent" })).toBeInTheDocument();
    expect(onSelectPage).not.toHaveBeenCalled();
    expect(onCollapsedPageIdsChange).not.toHaveBeenCalled();
  });

  it("offers Add child page for a leaf page and invokes the existing child creation callback for that target", async () => {
    const onShowChildPageCreate = vi.fn();
    renderTree([page({ id: "leaf", title: "Leaf" })], {
      canCreatePage: true,
      onShowChildPageCreate
    });

    fireEvent.contextMenu(row("Leaf"), { clientX: 20, clientY: 30 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add child page" }));

    expect(onShowChildPageCreate).toHaveBeenCalledWith("leaf", "Leaf");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not offer Add child page from the context menu while page creation is pending", async () => {
    const onShowChildPageCreate = vi.fn();
    renderTree([page({ id: "leaf", title: "Leaf" })], {
      canCreatePage: true,
      isCreatingPage: true,
      onShowChildPageCreate
    });

    fireEvent.contextMenu(row("Leaf"), { clientX: 20, clientY: 30 });

    expect(await screen.findByRole("menu", { name: "Page actions for Leaf" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Add child page" })).not.toBeInTheDocument();
    expect(onShowChildPageCreate).not.toHaveBeenCalled();
  });

  it("filters context menu actions by authoring authorization and suppresses empty viewer menus", async () => {
    const { rerender } = renderTree([page({ id: "leaf", title: "Leaf" })], {
      canCreatePage: true,
      canManagePageSettings: false
    });

    fireEvent.contextMenu(row("Leaf"), { clientX: 20, clientY: 30 });
    expect(await screen.findByRole("menuitem", { name: "Add child page" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Page Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete page" })).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    rerender(
      <PageTree
        canCreatePage={false}
        canManagePageSettings={false}
        collapsedPageIds={[]}
        filterText=""
        inlineCreateState={null}
        isCreatingPage={false}
        onCollapsedPageIdsChange={vi.fn()}
        onCommitInlineCreate={vi.fn()}
        onInlineCreateTitleChange={vi.fn()}
        onRequestDeletePage={vi.fn()}
        onSelectPage={vi.fn()}
        onShowCreatePage={vi.fn()}
        onShowChildPageCreate={vi.fn()}
        onTogglePageSettings={vi.fn()}
        pageSettingsOpenPageId=""
        pages={[page({ id: "viewer", title: "Viewer" })]}
        selectedPageId=""
      />
    );

    fireEvent.contextMenu(row("Viewer"), { clientX: 20, clientY: 30 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps actions bound to the page that opened the context menu even when another page is selected", async () => {
    const onSelectPage = vi.fn();
    const onTogglePageSettings = vi.fn();
    const onRequestDeletePage = vi.fn();
    renderTree([page({ id: "selected", title: "Selected" }), page({ id: "target", title: "Target" })], {
      canCreatePage: true,
      onRequestDeletePage,
      onSelectPage,
      onTogglePageSettings,
      selectedPageId: "selected"
    });

    fireEvent.contextMenu(row("Target"), { clientX: 20, clientY: 30 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Page Settings" }));

    expect(onTogglePageSettings).toHaveBeenCalledWith("target");
    expect(onSelectPage).not.toHaveBeenCalled();

    fireEvent.contextMenu(row("Target"), { clientX: 20, clientY: 30 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete page" }));

    expect(onRequestDeletePage).toHaveBeenCalledWith("target");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports keyboard opening, menu navigation, activation, Escape focus return, and outside dismissal", async () => {
    const onShowChildPageCreate = vi.fn();
    const onRequestDeletePage = vi.fn();
    renderTree([page({ id: "keyboard", title: "Keyboard" })], {
      canCreatePage: true,
      onRequestDeletePage,
      onShowChildPageCreate
    });

    const keyboardRow = screen.getByRole("button", { name: "Keyboard" });
    keyboardRow.focus();
    fireEvent.keyDown(keyboardRow, { key: "ContextMenu" });

    expect(await screen.findByRole("menu", { name: "Page actions for Keyboard" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Add child page" })).toHaveFocus());

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Page Settings" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Delete page" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Home" });
    expect(screen.getByRole("menuitem", { name: "Add child page" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Delete page" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Delete page" }), { key: "Enter" });
    expect(onRequestDeletePage).toHaveBeenCalledWith("keyboard");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.keyDown(keyboardRow, { key: "F10", shiftKey: true });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Add child page" }), { key: " " });
    expect(onShowChildPageCreate).toHaveBeenCalledWith("keyboard", "Keyboard");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.keyDown(keyboardRow, { key: "F10", shiftKey: true });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(keyboardRow).toHaveFocus());

    fireEvent.keyDown(keyboardRow, { key: "ContextMenu" });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});

describe("PageTree drag destination indicators", () => {
  it("renders no spacer drop-zone items and keeps movable and non-movable trees compact", () => {
    const pages = [
      page({ id: "source", title: "Source", siblingOrder: 1 }),
      page({
        id: "parent",
        title: "Parent",
        siblingOrder: 2,
        children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
      }),
      page({ id: "root-b", title: "Root B", siblingOrder: 3 })
    ];

    const { rerender } = renderTree(pages, {
      canCreatePage: true,
      onMovePage: vi.fn()
    });

    expect(document.querySelector("[data-docsera-page-tree-drop-zone]")).not.toBeInTheDocument();
    expect(treeItems().children).toHaveLength(4);
    expect(document.querySelectorAll(".docsera-page-tree__drop-edge-line")).toHaveLength(0);

    rerender(
      <PageTree
        canCreatePage
        canManagePageSettings={false}
        collapsedPageIds={[]}
        filterText=""
        inlineCreateState={null}
        isCreatingPage={false}
        onCommitInlineCreate={vi.fn()}
        onInlineCreateTitleChange={vi.fn()}
        onRequestDeletePage={vi.fn()}
        onSelectPage={vi.fn()}
        onShowCreatePage={vi.fn()}
        onShowChildPageCreate={vi.fn()}
        onTogglePageSettings={vi.fn()}
        pageSettingsOpenPageId=""
        pages={pages}
        selectedPageId=""
      />
    );

    expect(document.querySelector("[data-docsera-page-tree-drop-zone]")).not.toBeInTheDocument();
    expect(treeItems().children).toHaveLength(4);
  });

  it("resolves the virtual top destination above the first root row and anchors the line at the first row boundary", async () => {
    const onMovePage = vi.fn();
    renderTree(
      [
        page({ id: "source", title: "Source", siblingOrder: 1 }),
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 2,
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        }),
        page({ id: "root-b", title: "Root B", siblingOrder: 3 })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 260);
    setRect(row("Source"), 40, 70);
    setRect(row("Parent"), 74, 104);
    setRect(row("Child"), 108, 138);
    setRect(row("Root B"), 142, 172);

    const transfer = startDrag("Child");
    mockDropResolver({
      source: {
        before: {
          pageSysId: "child",
          parentPageSysId: null,
          position: "before",
          siblingOrder: "0.5",
          targetPageId: "source"
        }
      }
    });
    mockGeometryResolver({ edge: "top", position: "before", targetPageId: "source" });

    hover(treeList(), 20, transfer);
    await waitFor(() => expect(dropEdgeLine("top")).toHaveStyle({ top: "40px" }));
    expect(item("Source")).not.toHaveClass("docsera-page-tree__item--drop-before");
    expect(activeIndicatorCount()).toBe(1);

    fireEvent.drop(treeList(), { clientY: 20, dataTransfer: transfer });
    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "child",
      parentPageSysId: null,
      siblingOrder: "0.5"
    });
    expectNoIndicators();
  });

  it("resolves the virtual bottom destination after the final visible root branch and keeps the line after descendants", async () => {
    const onMovePage = vi.fn();
    renderTree(
      [
        page({
          id: "root-a",
          title: "Root A",
          siblingOrder: 1,
          children: [page({ id: "child-a", parentPageSysId: "root-a", title: "Child A" })]
        }),
        page({
          id: "root-b",
          title: "Root B",
          siblingOrder: 2,
          children: [page({ id: "child-b", parentPageSysId: "root-b", title: "Child B" })]
        })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 280);
    setRect(row("Root A"), 40, 70);
    setRect(row("Child A"), 74, 104);
    setRect(row("Root B"), 108, 138);
    setRect(row("Child B"), 142, 172);

    const transfer = startDrag("Child A");
    mockDropResolver({
      "root-b": {
        after: {
          pageSysId: "child-a",
          parentPageSysId: null,
          position: "after",
          siblingOrder: "3",
          targetPageId: "root-b"
        }
      }
    });
    mockGeometryResolver({ edge: "bottom", position: "after", targetPageId: "root-b" });

    hover(treeList(), 220, transfer);
    await waitFor(() => expect(dropEdgeLine("bottom")).toHaveStyle({ top: "172px" }));
    expect(item("Root B")).not.toHaveClass("docsera-page-tree__item--drop-after");
    expect(activeIndicatorCount()).toBe(1);

    fireEvent.drop(treeList(), { clientY: 220, dataTransfer: transfer });
    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "child-a",
      parentPageSysId: null,
      siblingOrder: "3"
    });
    expectNoIndicators();
  });

  it("keeps one stable line above the lower peer while the pointer crosses equivalent root peer regions", async () => {
    const onMovePage = vi.fn();
    renderTree(
      [
        page({ id: "dragged", title: "Dragged", siblingOrder: 1 }),
        page({ id: "root-a", title: "Root A", siblingOrder: 2 }),
        page({ id: "root-b", title: "Root B", siblingOrder: 3 })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 180);
    setRect(row("Dragged"), 24, 54);
    setRect(row("Root A"), 58, 88);
    setRect(row("Root B"), 92, 122);

    const transfer = startDrag("Dragged");

    const regions = [
      {
        geometry: { edge: null, position: "after" as PageTreeDropPosition, targetPageId: "root-a" },
        y: 80
      },
      {
        geometry: { edge: null, position: "after" as PageTreeDropPosition, targetPageId: "root-a" },
        y: 90
      },
      {
        geometry: { edge: null, position: "before" as PageTreeDropPosition, targetPageId: "root-b" },
        y: 95
      },
      {
        geometry: { edge: null, position: "before" as PageTreeDropPosition, targetPageId: "root-b" },
        y: 100
      }
    ];

    for (const region of regions) {
      mockDropResolver({
        "root-a": {
          after: {
            pageSysId: "dragged",
            parentPageSysId: null,
            position: "after",
            siblingOrder: "2.5",
            targetPageId: "root-a"
          }
        },
        "root-b": {
          before: {
            pageSysId: "dragged",
            parentPageSysId: null,
            position: "before",
            siblingOrder: "2.5",
            targetPageId: "root-b"
          }
        }
      });
      mockGeometryResolver(region.geometry);
      hover(treeList(), region.y, transfer);
      await waitFor(() => expect(item("Root B")).toHaveClass("docsera-page-tree__item--drop-before"));
      expect(item("Root A")).not.toHaveClass("docsera-page-tree__item--drop-after");
      expect(activeIndicatorCount()).toBe(1);
    }

    fireEvent.drop(treeList(), { clientY: 100, dataTransfer: transfer });
    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "dragged",
      parentPageSysId: null,
      siblingOrder: "2.5"
    });
    expect(onMovePage).toHaveBeenCalledTimes(1);
  });

  it("keeps equivalent nested peer regions on the lower peer before indicator and final move input", async () => {
    const onMovePage = vi.fn();
    renderTree(
      [
        page({ id: "dragged", title: "Dragged", siblingOrder: 1 }),
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 2,
          children: [
            page({ id: "nested-a", parentPageSysId: "parent", title: "Nested A", siblingOrder: 1 }),
            page({ id: "nested-b", parentPageSysId: "parent", title: "Nested B", siblingOrder: 2 })
          ]
        })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 220);
    setRect(row("Dragged"), 24, 54);
    setRect(row("Parent"), 58, 88);
    setRect(row("Nested A"), 92, 122);
    setRect(row("Nested B"), 126, 156);

    const transfer = startDrag("Dragged");
    const regions = [
      {
        geometry: { edge: null, position: "after" as PageTreeDropPosition, targetPageId: "nested-a" },
        y: 112
      },
      {
        geometry: { edge: null, position: "before" as PageTreeDropPosition, targetPageId: "nested-b" },
        y: 130
      }
    ];

    for (const region of regions) {
      mockDropResolver({
        "nested-a": {
          after: {
            pageSysId: "dragged",
            parentPageSysId: "parent",
            position: "after",
            siblingOrder: "1.5",
            targetPageId: "nested-a"
          }
        },
        "nested-b": {
          before: {
            pageSysId: "dragged",
            parentPageSysId: "parent",
            position: "before",
            siblingOrder: "1.5",
            targetPageId: "nested-b"
          }
        }
      });
      mockGeometryResolver(region.geometry);
      hover(treeList(), region.y, transfer);
      await waitFor(() => expect(item("Nested B")).toHaveClass("docsera-page-tree__item--drop-before"));
      expect(item("Nested A")).not.toHaveClass("docsera-page-tree__item--drop-after");
      expect(activeIndicatorCount()).toBe(1);
    }

    fireEvent.drop(treeList(), { clientY: 130, dataTransfer: transfer });
    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "dragged",
      parentPageSysId: "parent",
      siblingOrder: "1.5"
    });
    expect(onMovePage).toHaveBeenCalledTimes(1);
  });

  it("allows the bottom destination to win over the New page area without activating New page", async () => {
    const onMovePage = vi.fn();
    const onShowCreatePage = vi.fn();
    renderTree(
      [
        page({
          id: "root-a",
          title: "Root A",
          siblingOrder: 1,
          children: [page({ id: "child-a", parentPageSysId: "root-a", title: "Child A" })]
        }),
        page({
          id: "root-b",
          title: "Root B",
          siblingOrder: 2,
          children: [page({ id: "child-b", parentPageSysId: "root-b", title: "Child B" })]
        })
      ],
      { canCreatePage: true, onMovePage, onShowCreatePage }
    );

    setRect(treeList(), 0, 320);
    setRect(row("Root A"), 40, 70);
    setRect(row("Child A"), 74, 104);
    setRect(row("Root B"), 108, 138);
    setRect(row("Child B"), 142, 172);

    const transfer = startDrag("Child A");
    mockDropResolver({
      "root-b": {
        after: {
          pageSysId: "child-a",
          parentPageSysId: null,
          position: "after",
          siblingOrder: "3",
          targetPageId: "root-b"
        }
      }
    });
    mockGeometryResolver({ edge: "bottom", position: "after", targetPageId: "root-b" });

    hover(treeList(), 290, transfer);
    await waitFor(() => expect(dropEdgeLine("bottom")).toHaveStyle({ top: "172px" }));
    fireEvent.drop(treeList(), { clientY: 290, dataTransfer: transfer });

    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "child-a",
      parentPageSysId: null,
      siblingOrder: "3"
    });
    expect(onShowCreatePage).not.toHaveBeenCalled();
  });

  it("keeps the row-third, gap, stale-parent, clear-state, and viewer suppression behavior intact", async () => {
    mockDropResolver({
      child: {
        before: null,
        inside: null,
        after: null
      },
      parent: {
        before: null,
        inside: null,
        after: null
      },
      "level-6": {
        inside: null
      },
      viewer: {
        before: null
      }
    });
    mockGeometryResolver(null);

    const onMovePage = vi.fn();
    renderTree(
      [
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 1,
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        }),
        page({ id: "root-a", title: "Root A", siblingOrder: 2 })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 220);
    setRect(row("Parent"), 40, 70);
    setRect(row("Child"), 74, 104);
    setRect(row("Root A"), 108, 138);

    const invalidTransfer = startDrag("Parent");
    hover(treeList(), 50, invalidTransfer);
    expectNoIndicators();

    hover(treeList(), 82, invalidTransfer);
    expectNoIndicators();

    const viewerRender = renderTree([page({ id: "viewer", title: "Viewer" })], {
      canManagePageSettings: false,
      onMovePage
    });
    expect(row("Viewer")).toHaveAttribute("draggable", "false");
    expectNoIndicators();
    expect(onMovePage).not.toHaveBeenCalled();
    viewerRender.unmount();
  });

  it.each<InvalidDragAcceptanceCase>([
    {
      title: "hovering the dragged page itself",
      pages: [
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 1,
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        }),
        page({ id: "root-b", title: "Root B", siblingOrder: 2 })
      ],
      draggedTitle: "Parent",
      geometry: { edge: null, position: "before" as PageTreeDropPosition, targetPageId: "parent" },
      destinationMap: { parent: { before: null } },
      rowRects: [
        ["Parent", 40, 70],
        ["Child", 74, 104],
        ["Root B", 108, 138]
      ],
      clientY: 50
    },
    {
      title: "a true no-op sibling destination",
      pages: [page({ id: "root-a", title: "Root A", siblingOrder: 1 }), page({ id: "root-b", title: "Root B", siblingOrder: 2 })],
      draggedTitle: "Root A",
      geometry: { edge: null, position: "before" as PageTreeDropPosition, targetPageId: "root-b" },
      destinationMap: { "root-b": { before: null } },
      rowRects: [
        ["Root A", 40, 70],
        ["Root B", 74, 104]
      ],
      clientY: 48
    },
    {
      title: "a descendant or circular destination",
      pages: [
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 1,
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        }),
        page({ id: "root-b", title: "Root B", siblingOrder: 2 })
      ],
      draggedTitle: "Parent",
      geometry: { edge: null, position: "inside" as PageTreeDropPosition, targetPageId: "child" },
      destinationMap: { child: { inside: null } },
      rowRects: [
        ["Parent", 40, 70],
        ["Child", 74, 104],
        ["Root B", 108, 138]
      ],
      clientY: 86
    },
    {
      title: "a depth-invalid destination",
      pages: [
        page({
          id: "level-1",
          title: "Level 1",
          siblingOrder: 1,
          children: [
            page({
              id: "level-2",
              parentPageSysId: "level-1",
              title: "Level 2",
              children: [
                page({
                  id: "level-3",
                  parentPageSysId: "level-2",
                  title: "Level 3",
                  children: [
                    page({
                      id: "level-4",
                      parentPageSysId: "level-3",
                      title: "Level 4",
                      children: [
                        page({
                          id: "level-5",
                          parentPageSysId: "level-4",
                          title: "Level 5",
                          children: [page({ id: "level-6", parentPageSysId: "level-5", title: "Level 6" })]
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        }),
        page({
          id: "source",
          title: "Source",
          siblingOrder: 2,
          children: [page({ id: "source-child", parentPageSysId: "source", title: "Source Child" })]
        }),
        page({ id: "other", title: "Other", siblingOrder: 3 })
      ],
      draggedTitle: "Source",
      geometry: { edge: null, position: "inside" as PageTreeDropPosition, targetPageId: "level-5" },
      destinationMap: { "level-5": { inside: null } },
      rowRects: [
        ["Level 1", 24, 54],
        ["Level 2", 58, 88],
        ["Level 6", 92, 122],
        ["Source", 126, 156],
        ["Other", 160, 190]
      ],
      clientY: 104
    },
    {
      title: "a movement-resolver rejection",
      pages: [page({ id: "mover", title: "Mover", siblingOrder: 1 }), page({ id: "target", title: "Target", siblingOrder: 2 })],
      draggedTitle: "Mover",
      geometry: { edge: null, position: "before" as PageTreeDropPosition, targetPageId: "target" },
      destinationMap: { target: { before: null } },
      rowRects: [
        ["Mover", 40, 70],
        ["Target", 74, 104]
      ],
      clientY: 80
    }
  ])("accepts browser dragover but rejects movement for $title", async ({ pages, draggedTitle, geometry, destinationMap, rowRects, clientY }) => {
    const onMovePage = vi.fn();
    renderTree(pages, { onMovePage });

    setRect(treeList(), 0, 220);
    for (const [title, top, bottom] of rowRects) {
      setRect(row(title), top, bottom);
    }

    const transfer = startDrag(draggedTitle);
    mockGeometryResolver(geometry);
    mockDropResolver(destinationMap);

    const dragOverEvent = dispatchDragEvent(treeList(), "dragover", { clientY, dataTransfer: transfer });
    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");
    expectNoIndicators();

    const dropEvent = dispatchDragEvent(treeList(), "drop", { clientY, dataTransfer: transfer });
    expect(dropEvent.defaultPrevented).toBe(true);
    expect(onMovePage).not.toHaveBeenCalled();
    expectNoIndicators();
  });

  it("clears indicators on drag leave, drop, and drag end", async () => {
    const onMovePage = vi.fn();
    renderTree(
      [
        page({ id: "mover", title: "Mover", siblingOrder: 1 }),
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 2,
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 220);
    setRect(row("Mover"), 40, 70);
    setRect(row("Parent"), 74, 104);
    setRect(row("Child"), 108, 138);

    mockDropResolver({
      parent: {
        inside: {
          pageSysId: "mover",
          parentPageSysId: "parent",
          position: "inside",
          siblingOrder: "1",
          targetPageId: "parent"
        }
      }
    });
    mockGeometryResolver({ edge: null, position: "inside", targetPageId: "parent" });

    const transfer = startDrag("Mover");
    hover(treeList(), 88, transfer);
    await waitFor(() => expect(row("Parent")).toHaveClass("docsera-page-tree__row--drop-inside"));
    expect(activeIndicatorCount()).toBe(0);

    fireEvent.dragLeave(treeList(), { dataTransfer: transfer, relatedTarget: document.body });
    expectNoIndicators();

    hover(treeList(), 88, transfer);
    await waitFor(() => expect(row("Parent")).toHaveClass("docsera-page-tree__row--drop-inside"));

    fireEvent.drop(treeList(), { clientY: 88, dataTransfer: transfer });
    expectNoIndicators();

    const nextTransfer = startDrag("Mover");
    hover(treeList(), 88, nextTransfer);
    await waitFor(() => expect(row("Parent")).toHaveClass("docsera-page-tree__row--drop-inside"));

    fireEvent.dragEnd(row("Mover"), { dataTransfer: nextTransfer });
    expectNoIndicators();
  });

  it("keeps drop-inside title weight at the base row weight while preserving the hover highlight", async () => {
    const onMovePage = vi.fn();
    renderTree(
      [
        page({ id: "mover", title: "Mover", siblingOrder: 1 }),
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 2,
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 220);
    setRect(row("Mover"), 40, 70);
    setRect(row("Parent"), 74, 104);
    setRect(row("Child"), 108, 138);

    mockDropResolver({
      parent: {
        inside: {
          pageSysId: "mover",
          parentPageSysId: "parent",
          position: "inside",
          siblingOrder: "1",
          targetPageId: "parent"
        }
      }
    });
    mockGeometryResolver({ edge: null, position: "inside", targetPageId: "parent" });

    const transfer = startDrag("Mover");
    hover(treeList(), 88, transfer);

    await waitFor(() => expect(row("Parent")).toHaveClass("docsera-page-tree__row--drop-inside"));
    const cwd = new Function("return process.cwd()")() as string;
    const cssSource = readFileSync(join(cwd, "src/client/styles/runtime-shell.css"), "utf8");
    expect(cssSource).toContain(".docsera-page-tree__row--drop-inside .docsera-page-tree__title");
    expect(cssSource).toContain("color: var(--docsera-primary);");
    expect(cssSource).toContain("font-weight: 500;");
  });

  it("keeps the ordinary New page button behavior unchanged when not dragging", () => {
    const onShowCreatePage = vi.fn();
    renderTree(
      [
        page({ id: "root-a", title: "Root A", siblingOrder: 1 }),
        page({ id: "root-b", title: "Root B", siblingOrder: 2 })
      ],
      {
        canCreatePage: true,
        onShowCreatePage
      }
    );

    fireEvent.click(screen.getByRole("button", { name: "New page" }));

    expect(onShowCreatePage).toHaveBeenCalledTimes(1);
  });
});

describe("PageTree movement drag and drop", () => {
  it("calls movement for root reorder and moving a nested page to root", async () => {
    mockDropResolver({
      "root-b": {
        after: {
          pageSysId: "child-a",
          parentPageSysId: null,
          position: "after",
          siblingOrder: "3",
          targetPageId: "root-b"
        }
      }
    });

    const onMovePage = vi.fn();
    renderTree(
      [
        page({ id: "root-a", title: "Root A", siblingOrder: 1, children: [page({ id: "child-a", parentPageSysId: "root-a", title: "Child A" })] }),
        page({ id: "root-b", title: "Root B", siblingOrder: 2 })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 150);
    setRect(row("Root A"), 24, 54);
    setRect(row("Child A"), 58, 88);
    setRect(row("Root B"), 92, 122);
    mockGeometryResolver({ edge: null, position: "after", targetPageId: "root-b" });

    const transfer = await dragDrop("Child A", "Root B", 116);

    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "child-a",
      parentPageSysId: null,
      siblingOrder: "3"
    });
    fireEvent.dragEnd(row("Child A"), { dataTransfer: transfer });
  });

  it("calls movement for dropping inside an eligible parent", async () => {
    mockDropResolver({
      "root-a": {
        inside: {
          pageSysId: "root-b",
          parentPageSysId: "root-a",
          position: "inside",
          siblingOrder: "1",
          targetPageId: "root-a"
        }
      }
    });

    const onMovePage = vi.fn();
    renderTree(
      [
        page({ id: "root-a", title: "Root A", siblingOrder: 1 }),
        page({ id: "root-b", title: "Root B", siblingOrder: 2 })
      ],
      { onMovePage }
    );

    setRect(treeList(), 0, 150);
    setRect(row("Root A"), 24, 54);
    setRect(row("Root B"), 58, 88);
    setRect(treeList(), 0, 150);
    mockGeometryResolver({ edge: null, position: "inside", targetPageId: "root-a" });

    await dragDrop("Root B", "Root A", 40);

    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "root-b",
      parentPageSysId: "root-a",
      siblingOrder: "1"
    });
  });

  it("does not move when authoring is disabled or placement is circular or deeper than level six", async () => {
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
        }),
        page({
          id: "source",
          parentPageSysId: "l1",
          title: "Source",
          children: [page({ id: "source-child", parentPageSysId: "source", title: "Source Child" })]
        })
      ]
    });

    const { rerender } = renderTree([chain, page({ id: "other", title: "Other", siblingOrder: 2 })], { onMovePage });
    setRect(treeList(), 0, 190);
    setRect(row("Level 1"), 24, 54);
    setRect(row("Level 2"), 58, 88);
    setRect(row("Level 6"), 92, 122);
    setRect(row("Other"), 126, 156);
    setRect(treeList(), 0, 190);
    mockGeometryResolver({ edge: null, position: "inside", targetPageId: "level-2" });

    mockDropResolver({
      "level-2": {
        inside: null
      },
      "level-6": {
        inside: null
      }
    });

    await dragDrop("Level 1", "Level 2", 72);
    mockGeometryResolver({ edge: null, position: "inside", targetPageId: "level-6" });
    await dragDrop("Source", "Level 6", 104);
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
        onRequestDeletePage={vi.fn()}
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

function row(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });
  const element = button.closest(".docsera-page-tree__row");
  if (!element) {
    throw new Error(`Missing row for ${title}.`);
  }
  return element as HTMLElement;
}

function item(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });
  const element = button.closest(".docsera-page-tree__item");
  if (!element) {
    throw new Error(`Missing item for ${title}.`);
  }
  return element as HTMLElement;
}

function dropEdgeLine(kind: "top" | "bottom"): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.docsera-page-tree__drop-edge-line--${kind}`);
  if (!element) {
    throw new Error(`Missing ${kind} drop edge line.`);
  }
  return element;
}

function treeItems(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".docsera-page-tree__items");
  if (!element) {
    throw new Error("Missing page tree items.");
  }
  return element;
}

function treeList(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".docsera-page-tree__list");
  if (!element) {
    throw new Error("Missing page tree list.");
  }
  return element;
}

function setRect(element: HTMLElement, top: number, bottom: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom,
      height: bottom - top,
      left: 0,
      right: 200,
      top,
      width: 200,
      x: 0,
      y: top,
      toJSON: () => ({})
    })
  });
}

function dataTransfer(): DataTransfer {
  return {
    dropEffect: "move",
    effectAllowed: "move",
    getData: vi.fn(() => ""),
    setData: vi.fn()
  } as unknown as DataTransfer;
}

function startDrag(sourceTitle: string) {
  const transfer = dataTransfer();
  fireEvent.dragStart(row(sourceTitle), { dataTransfer: transfer });
  return transfer;
}

function hover(target: HTMLElement, clientY: number, transfer: ReturnType<typeof dataTransfer>) {
  fireEvent.dragOver(target, { dataTransfer: transfer, clientY });
}

type InvalidDragAcceptanceCase = {
  clientY: number;
  destinationMap: MockDestinationMap;
  draggedTitle: string;
  geometry: MockGeometryCandidate;
  pages: WorkspacePageView[];
  rowRects: Array<[string, number, number]>;
  title: string;
};

function dispatchDragEvent(
  target: Element,
  type: "dragover" | "drop",
  init: { clientY?: number; dataTransfer?: DataTransfer } = {}
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientY?: number;
    dataTransfer?: DataTransfer;
  };

  if (typeof init.clientY === "number") {
    Object.defineProperty(event, "clientY", { configurable: true, value: init.clientY });
  }

  if (init.dataTransfer) {
    Object.defineProperty(event, "dataTransfer", { configurable: true, value: init.dataTransfer });
  }

  act(() => {
    target.dispatchEvent(event);
  });

  return event;
}

async function dragDrop(sourceTitle: string, _targetTitle: string, clientY: number) {
  const transfer = startDrag(sourceTitle);
  hover(treeList(), clientY, transfer);
  fireEvent.drop(treeList(), { clientY, dataTransfer: transfer });
  return transfer;
}

function expectNoIndicators() {
  expect(activeIndicatorCount()).toBe(0);
}

function activeIndicatorCount() {
  return document.querySelectorAll(".docsera-page-tree__drop-indicator, .docsera-page-tree__drop-edge-line").length;
}

type MockDestinationMap = Record<string, Partial<Record<PageTreeDropPosition, PageTreeDropDestination | null>>>;

type MockGeometryCandidate = {
  edge: "top" | "bottom" | null;
  position: PageTreeDropPosition;
  targetPageId: string;
};

function mockGeometryResolver(candidate: MockGeometryCandidate | null) {
  activeGeometryCandidate = candidate;
}

function mockDropResolver(destinationsByTargetPageId: MockDestinationMap) {
  resolveDropDestination.mockImplementation(({ targetPageId, position }) => {
    return destinationsByTargetPageId[targetPageId]?.[position] ?? null;
  });
}
