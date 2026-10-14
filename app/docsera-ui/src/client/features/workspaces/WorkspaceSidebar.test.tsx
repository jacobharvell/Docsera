import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../../shared/editor/document";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { resolvePageTreeDropGeometry } from "./pageTreeDropGeometry";
import { resolvePageTreeDropDestination } from "./pageTreeDropResolver";
import type { WorkspacePageView } from "./workspaceViewModels";

vi.mock("./pageTreeDropResolver", () => ({
  resolvePageTreeDropDestination: vi.fn()
}));

vi.mock("./pageTreeDropGeometry", () => ({
  resolvePageTreeDropGeometry: vi.fn()
}));

const resolveDropDestination = vi.mocked(resolvePageTreeDropDestination);
const resolveDropGeometry = vi.mocked(resolvePageTreeDropGeometry);

beforeEach(() => {
  resolveDropDestination.mockReset();
  resolveDropGeometry.mockReset();
  vi.restoreAllMocks();
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

function rect(top: number, bottom: number, left = 0, right = 240) {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    toJSON() {
      return this;
    },
    width: right - left,
    x: left,
    y: top
  } as DOMRect;
}

function setRect(element: HTMLElement, top: number, bottom: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect(top, bottom));
}

function createTransfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "all",
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => {
      data.set(type, value);
    }
  } as unknown as DataTransfer;
}

function dispatchDragEvent(
  target: Element,
  type: "dragenter" | "dragleave" | "dragover" | "drop",
  init: { clientY?: number; dataTransfer?: DataTransfer; relatedTarget?: EventTarget | null } = {}
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientY?: number;
    dataTransfer?: DataTransfer;
    relatedTarget?: EventTarget | null;
  };

  if (typeof init.clientY === "number") {
    Object.defineProperty(event, "clientY", { configurable: true, value: init.clientY });
  }

  if (init.dataTransfer) {
    Object.defineProperty(event, "dataTransfer", { configurable: true, value: init.dataTransfer });
  }

  if (typeof init.relatedTarget !== "undefined") {
    Object.defineProperty(event, "relatedTarget", { configurable: true, value: init.relatedTarget });
  }

  act(() => {
    target.dispatchEvent(event);
  });

  return event;
}

function renderSidebar(overrides: Partial<Parameters<typeof WorkspaceSidebar>[0]> = {}) {
  const onMovePage = vi.fn();
  const onSelectPage = vi.fn();

  render(
    <WorkspaceSidebar
      canCreatePage={false}
      canManagePageSettings
      collapsedPageIds={[]}
      createPageDisabledReason=""
      inlineCreateState={null}
      isCreatingPage={false}
      mode="edit"
      onCollapsedPageIdsChange={vi.fn()}
      onCommitInlineCreate={vi.fn()}
      onInlineCreateTitleChange={vi.fn()}
      onMovePage={onMovePage}
      onRequestDeletePage={vi.fn()}
      onSelectPage={onSelectPage}
      onShowChildPageCreate={vi.fn()}
      onShowCreatePage={vi.fn()}
      onTogglePageSettings={vi.fn()}
      pageSettingsOpenPageId=""
      pages={[
        page({ id: "source", title: "Source", siblingOrder: 1 }),
        page({
          id: "parent",
          title: "Parent",
          siblingOrder: 2,
          children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
        }),
        page({ id: "root-b", title: "Root B", siblingOrder: 3 })
      ]}
      selectedPageId=""
      showCreatePageControl
      showPendingState={false}
      treeFilter=""
      onTreeFilterChange={vi.fn()}
      {...overrides}
    />
  );

  return {
    onMovePage,
    onSelectPage
  };
}

function row(title: string) {
  const button = screen.getByRole("button", { name: title });
  const element = button.closest(".docsera-page-tree__row");
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing page tree row for ${title}.`);
  }
  return element;
}

function item(title: string) {
  const button = screen.getByRole("button", { name: title });
  const element = button.closest(".docsera-page-tree__item");
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing page tree item for ${title}.`);
  }
  return element;
}

function navTree() {
  const element = screen.getByRole("navigation", { name: "Page tree" });
  if (!(element instanceof HTMLElement)) {
    throw new Error("Missing page tree navigation viewport.");
  }
  return element;
}

function sidebarPanel() {
  const element = screen.getByRole("complementary", { name: "Workspace navigation" });
  if (!(element instanceof HTMLElement)) {
    throw new Error("Missing workspace sidebar panel.");
  }
  return element;
}

function searchInput() {
  const element = screen.getByPlaceholderText("Search");
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Missing sidebar search input.");
  }
  return element;
}

function sidebarNewPageButton() {
  const element = screen
    .getAllByRole("button", { name: "New page" })
    .find((candidate) => candidate instanceof HTMLButtonElement && candidate.classList.contains("docsera-sidebar__icon-button"));
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error("Missing header New page button.");
  }
  return element;
}

function treeNewPageButton() {
  const element = document.querySelector(".docsera-page-tree__new-page");
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error("Missing tree New page button.");
  }
  return element;
}

describe("WorkspaceSidebar page tree drag surface", () => {
  it("uses shared tooltips for compact navigation controls", async () => {
    renderSidebar({
      canCreatePage: true,
      pages: [page({ id: "getting-started", title: "Getting Started" })],
      showCreatePageControl: true
    });

    const newPageButton = document.querySelector<HTMLButtonElement>(".docsera-sidebar__icon-button[aria-label='New page']");
    expect(newPageButton).toBeInstanceOf(HTMLButtonElement);
    if (!(newPageButton instanceof HTMLButtonElement)) {
      throw new Error("Expected the compact New page button.");
    }
    expect(newPageButton).toHaveClass("docsera-sidebar__icon-button");
    expect(newPageButton).not.toHaveAttribute("title");

    fireEvent.focus(newPageButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("New page");
    expect(newPageButton).toHaveAccessibleName("New page");
  });

  it("treats the complete sidebar panel as the drag surface and routes search-row drops to the root top destination", async () => {
    const onTreeFilterChange = vi.fn();
    const onShowCreatePage = vi.fn();
    const { onMovePage } = renderSidebar({
      canCreatePage: true,
      onShowCreatePage,
      onTreeFilterChange,
      treeFilter: ""
    });
    const transfer = createTransfer();

    setRect(sidebarPanel(), 0, 360);
    setRect(navTree(), 72, 320);
    setRect(row("Source"), 112, 142);
    setRect(row("Parent"), 146, 176);
    setRect(row("Child"), 180, 210);
    setRect(row("Root B"), 214, 244);

    resolveDropGeometry.mockReturnValue({ edge: "top", position: "before", targetPageId: "Source" });
    resolveDropDestination.mockReturnValue({
      pageSysId: "child",
      parentPageSysId: null,
      position: "before",
      siblingOrder: "0.5",
      targetPageId: "source"
    });

    fireEvent.dragStart(row("Child"), { dataTransfer: transfer });
    const dragOverEvent = dispatchDragEvent(searchInput(), "dragover", { clientY: 20, dataTransfer: transfer });

    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");
    expect(resolveDropGeometry).toHaveBeenCalledWith(
      expect.objectContaining({
        pointerY: 20,
        topEdgeZone: expect.objectContaining({
          bottom: 112,
          pageId: "source",
          top: 0
        })
      })
    );

    await waitFor(() => expect(document.querySelector(".docsera-page-tree__drop-edge-line--top")).toHaveStyle({ top: "40px" }));
    expect(searchInput()).toHaveValue("");

    const dropEvent = dispatchDragEvent(searchInput(), "drop", { clientY: 20, dataTransfer: transfer });
    expect(dropEvent.defaultPrevented).toBe(true);
    expect(onMovePage).toHaveBeenCalledWith({
      pageSysId: "child",
      parentPageSysId: null,
      siblingOrder: "0.5"
    });
    expect(searchInput()).toHaveValue("");
    expect(onShowCreatePage).not.toHaveBeenCalled();

    fireEvent.change(searchInput(), { target: { value: "Updated filter" } });
    expect(searchInput()).toHaveAttribute("autocomplete", "off");
    expect(onTreeFilterChange).toHaveBeenCalledWith("Updated filter");

    fireEvent.click(treeNewPageButton());
    expect(onShowCreatePage).toHaveBeenCalledTimes(1);
  });

  it("keeps drag acceptance stable when moving from the search row into the first row and clears preview only on full sidebar exit", async () => {
    renderSidebar({
      pages: [
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
      ]
    });
    const transfer = createTransfer();

    setRect(sidebarPanel(), 0, 380);
    setRect(navTree(), 72, 340);
    setRect(row("Root A"), 112, 142);
    setRect(row("Child A"), 146, 176);
    setRect(row("Root B"), 180, 210);
    setRect(row("Child B"), 214, 244);

    resolveDropGeometry.mockReturnValueOnce({ edge: "top", position: "before", targetPageId: "root-a" });
    resolveDropDestination.mockReturnValue({
      pageSysId: "child-a",
      parentPageSysId: null,
      position: "before",
      siblingOrder: "0.5",
      targetPageId: "root-a"
    });

    fireEvent.dragStart(row("Child A"), { dataTransfer: transfer });
    const searchDragEnter = dispatchDragEvent(searchInput(), "dragenter", { dataTransfer: transfer });
    expect(searchDragEnter.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");

    const searchDragOver = dispatchDragEvent(searchInput(), "dragover", { clientY: 20, dataTransfer: transfer });
    expect(searchDragOver.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");
    await waitFor(() => expect(document.querySelector(".docsera-page-tree__drop-edge-line--top")).toHaveStyle({ top: "40px" }));

    dispatchDragEvent(searchInput(), "dragleave", { dataTransfer: transfer, relatedTarget: row("Root A") });
    expect(document.querySelector(".docsera-page-tree__drop-edge-line--top")).toBeInTheDocument();

    resolveDropGeometry.mockReturnValueOnce({ edge: null, position: "before", targetPageId: "root-a" });
    const firstRowDragEnter = dispatchDragEvent(row("Root A"), "dragenter", { dataTransfer: transfer });
    expect(firstRowDragEnter.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");

    const firstRowDragOver = dispatchDragEvent(row("Root A"), "dragover", { clientY: 120, dataTransfer: transfer });
    expect(firstRowDragOver.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");
    expect(document.querySelector(".docsera-page-tree__drop-edge-line--top")).not.toBeInTheDocument();
    expect(item("Root A")).toHaveClass("docsera-page-tree__item--drop-before");

    dispatchDragEvent(sidebarPanel(), "dragleave", { dataTransfer: transfer, relatedTarget: document.body });
    expect(document.querySelector(".docsera-page-tree__drop-indicator, .docsera-page-tree__drop-edge-line")).not.toBeInTheDocument();
  });

  it("does not attach page-drop behavior for non-movable trees", () => {
    renderSidebar({
      canManagePageSettings: false,
      onMovePage: undefined
    });

    setRect(sidebarPanel(), 0, 360);
    setRect(navTree(), 72, 320);
    setRect(row("Source"), 112, 142);
    dispatchDragEvent(navTree(), "dragover", { clientY: 20, dataTransfer: createTransfer() });

    expect(resolveDropGeometry).not.toHaveBeenCalled();
    expect(row("Source")).toHaveAttribute("draggable", "false");
  });
});
