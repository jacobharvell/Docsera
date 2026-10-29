import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import {
  LauncherIntro,
  LauncherPaginationFooter,
  LauncherSearchToolbar,
  WorkspaceList,
  WorkspaceListHeader
} from "./MyWorkspacesScreenSections";

function mockObjectUrl() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:my-workspaces-icon")
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn()
  });
}

describe("WorkspaceList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([null, "Documentation and release guidance that stays on one truncatable compact row even when the copy is long."])("keeps the name line separate from descriptions (%s) for every icon type", (shortDescription) => {
    const icons = [
      { type: "builtin" as const, key: "docsera-workspace", label: "Docsera" },
      { type: "builtin" as const, key: "documentation", label: "Book" },
      { type: "builtin" as const, key: "business", label: "Briefcase" },
      { type: "uploaded" as const, key: "custom", label: "Custom", assetPath: "blob:custom" }
    ];
    const { container } = render(
      <WorkspaceList
        items={icons.map((icon, index) => ({
          sysId: `workspace-${index}`, slug: `docs-${index}`, name: `Documentation Workspace ${index} with a deliberately long compact presentation name`,
          icon, shortDescription, roleLabel: null, layout: { tocVisible: true }, status: "active" as const,
          canManageSettings: false, canManageWorkspaceMembers: false
        }))}
        onOpenWorkspace={vi.fn()} onOpenWorkspaceSettings={vi.fn()}
      />
    );
    expect(container.querySelectorAll(".docsera-workspace-row__identity")).toHaveLength(4);
    expect(container.querySelector(".docsera-workspace-row__icon .docsera-workspace-icon-badge__artwork")).toBeInTheDocument();
    expect(container.querySelector(".docsera-workspace-row__icon .docsera-workspace-icon-badge__glyph")).toBeInTheDocument();
    expect(container.querySelector(".docsera-workspace-row__icon .docsera-workspace-icon-badge__uploaded-image")).toBeInTheDocument();
    for (const identity of container.querySelectorAll(".docsera-workspace-row__identity")) {
      expect(identity.firstElementChild).toHaveClass("docsera-workspace-row__icon");
      const copy = identity.querySelector(".docsera-workspace-row__copy");
      expect(copy?.firstElementChild).toHaveClass("docsera-workspace-row__name");
      expect(copy?.querySelector(".docsera-workspace-row__description")?.textContent ?? null).toBe(shortDescription);
    }
  });

  it("uses the shared authenticated uploaded-icon loader for My Workspaces rows", async () => {
    mockObjectUrl();
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const { container } = render(
      <WorkspaceList
        items={[
          {
            canManageSettings: false,
            canManageWorkspaceMembers: false,
            icon: { type: "uploaded", key: "asset-key-001", label: "Custom", assetPath: "/icons/file?assetKey=asset-key-001" },
            name: "Custom Docs",
            layout: {
              tocVisible: true
            },
            roleLabel: "Admin",
            shortDescription: null,
            slug: "custom-docs",
            status: "active",
            sysId: "workspace-001"
          }
        ]}
        loadUploadedIcon={loadUploadedIcon}
        onOpenWorkspace={vi.fn()}
        onOpenWorkspaceSettings={vi.fn()}
      />
    );

    await waitFor(() => expect(container.querySelector(".docsera-workspace-icon-badge__uploaded-image")).toHaveAttribute("src", "blob:my-workspaces-icon"));
    expect(loadUploadedIcon).toHaveBeenCalledWith({
      assetPath: "/icons/file?assetKey=asset-key-001",
      signal: expect.any(AbortSignal)
    });
  });

  it("keeps Workspace Name and Role headings aligned in the My Workspaces list header", () => {
    render(<WorkspaceListHeader />);

    expect(screen.getByText("Workspace Name")).toHaveClass("docsera-workspace-list__workspace-heading");
    expect(screen.getByText("Role")).toHaveClass("docsera-workspace-list__role-heading");
  });

  it("keeps compact presentation responsive without changing launcher semantics", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");
    const compactRules = source.slice(source.indexOf("@media (max-width: 920px)"), source.indexOf("@media (max-width: 680px)"));
    const narrowRules = source.slice(source.indexOf("@media (max-width: 680px)"), source.indexOf("@media (prefers-reduced-motion: reduce)"));

    const baseHeaderBlock = source.match(/\.docsera-header \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const compactLauncherHeaderBlock = compactRules.match(/\.docsera-header:not\(\.docsera-header--compact\)\.docsera-header--launcher\s*{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    const compactLauncherIdentityBlock = compactRules.match(/\.docsera-header:not\(\.docsera-header--compact\)\.docsera-header--launcher \.docsera-header__workspace\s*{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

    expect(baseHeaderBlock).toContain("border-bottom: 1px solid var(--docsera-border);");
    expect(compactLauncherHeaderBlock).toContain("grid-template-columns: min(280px, calc(100vw - 104px)) minmax(0, 1fr);");
    expect(compactLauncherHeaderBlock).toContain("min-height: var(--docsera-header-height);");
    expect(compactLauncherHeaderBlock).not.toMatch(/(^|\n)\s*height:/);
    expect(compactLauncherIdentityBlock).toContain("border-right: 1px solid var(--docsera-border);");
    expect(compactLauncherIdentityBlock).toContain("border-bottom: 0;");
    expect(compactLauncherIdentityBlock).not.toContain("border-bottom: 1px");
    expect(compactRules).toMatch(/\.docsera-header--launcher \.docsera-header__workspace-button\s*\{[^}]*width:\s*100%;/s);
    expect(compactRules).toMatch(/\.docsera-launcher__header-action\s*{[^}]*width:\s*100%;/s);
    expect(compactRules).toMatch(/\.docsera-workspace-list__header\s*{[^}]*display:\s*none;/s);
    expect(compactRules).toMatch(/\.docsera-workspace-row\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*min-height:\s*76px;/s);
    expect(compactRules).toMatch(/\.docsera-workspace-row--has-settings\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
    expect(compactRules).toMatch(/\.docsera-workspace-row:not\(\.docsera-workspace-row--has-settings\) \.docsera-workspace-row__role-cell\s*{[^}]*display:\s*none;/s);
    expect(compactRules).toMatch(/\.docsera-workspace-row__role-cell\s*{[^}]*justify-content:\s*flex-end;[^}]*min-height:\s*40px;/s);
    expect(compactRules).toMatch(/\.docsera-workspace-row__role\s*{[^}]*display:\s*none;/s);
    expect(compactRules).toMatch(/\.docsera-launcher-pagination__actions\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*width:\s*100%;/s);
    expect(narrowRules).toMatch(/\.docsera-launcher-toolbar__search\s*{[^}]*flex:\s*0 0 auto;[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
  });

  it("only reserves the compact Settings column for authorized rows", () => {
    const items: WorkspaceViewRecord[] = [
      {
        canManageSettings: true,
        canManageWorkspaceMembers: true,
        icon: { type: "builtin" as const, key: "book", label: "Book" },
        name: "Admin Docs",
        layout: { tocVisible: true },
        roleLabel: "Admin",
        shortDescription: "Settings remain available.",
        slug: "admin-docs",
        status: "active" as const,
        sysId: "workspace-admin"
      },
      {
        canManageSettings: false,
        canManageWorkspaceMembers: false,
        icon: { type: "builtin" as const, key: "documentation", label: "Book" },
        name: "Editor Docs",
        layout: { tocVisible: true },
        roleLabel: "Editor",
        shortDescription: "Identity uses the full compact row width.",
        slug: "editor-docs",
        status: "active" as const,
        sysId: "workspace-editor"
      }
    ];
    const { container } = render(
      <WorkspaceList items={items} onOpenWorkspace={vi.fn()} onOpenWorkspaceSettings={vi.fn()} />
    );

    const rows = container.querySelectorAll(".docsera-workspace-row");
    expect(rows[0]).toHaveClass("docsera-workspace-row--has-settings");
    expect(rows[0].querySelector(".docsera-workspace-row__settings")).toBeInTheDocument();
    expect(rows[1]).not.toHaveClass("docsera-workspace-row--has-settings");
    expect(rows[1].querySelector(".docsera-workspace-row__settings")).not.toBeInTheDocument();
  });

  it("keeps the authorized create action below the intro content in compact-compatible markup", () => {
    const onShowCreateModal = vi.fn();
    const { container, rerender } = render(<LauncherIntro canCreateWorkspaces onShowCreateModal={onShowCreateModal} />);

    const titleRow = container.querySelector(".docsera-launcher__title-row");
    const titleBlock = container.querySelector(".docsera-launcher__title-block");
    const createButton = screen.getByRole("button", { name: "New Workspace" });
    expect(Array.from(titleRow?.children ?? [])).toEqual([titleBlock, createButton]);
    fireEvent.click(createButton);
    expect(onShowCreateModal).toHaveBeenCalledOnce();

    rerender(<LauncherIntro canCreateWorkspaces={false} onShowCreateModal={onShowCreateModal} />);
    expect(screen.queryByRole("button", { name: "New Workspace" })).not.toBeInTheDocument();
  });

  it("keeps the range summary before equally addressable pagination actions", () => {
    const onPreviousPage = vi.fn();
    const onNextPage = vi.fn();
    const { container } = render(
      <LauncherPaginationFooter
        canGoNext
        canGoPrevious={false}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        summary="Showing 1–25 of 30"
      />
    );

    const pagination = container.querySelector(".docsera-launcher-pagination");
    expect(pagination?.firstElementChild).toHaveClass("docsera-launcher-pagination__summary");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNextPage).toHaveBeenCalledOnce();
  });

  it("uses shared tooltips for compact My Workspaces controls", async () => {
    render(<LauncherSearchToolbar searchText="api" onSearchTextChange={vi.fn()} />);

    const clearSearchButton = screen.getByRole("button", { name: "Clear search" });
    expect(clearSearchButton).not.toHaveAttribute("title");

    fireEvent.focus(clearSearchButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Clear search");
    expect(clearSearchButton).toHaveAccessibleName("Clear search");
  });

  it("keeps Settings as a navigation link that opens the settings intent", () => {
    const onOpenWorkspaceSettings = vi.fn();

    render(
      <WorkspaceList
        items={[
          {
            canManageSettings: true,
            canManageWorkspaceMembers: true,
            icon: { type: "builtin", key: "book", label: "Book" },
            name: "Admin Docs",
            layout: {
              tocVisible: true
            },
            roleLabel: "Admin",
            shortDescription: null,
            slug: "admin-docs",
            status: "active",
            sysId: "workspace-002"
          }
        ]}
        onOpenWorkspace={vi.fn()}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
      />
    );

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink).toHaveClass("docsera-workspace-row__settings");
    expect(settingsLink).toHaveAttribute("href", "/#/admin-docs?settings=1");

    fireEvent.click(settingsLink);

    expect(onOpenWorkspaceSettings).toHaveBeenCalledWith("admin-docs");
  });

  it("keeps workspace row links accessible without redundant tooltips", async () => {
    const onOpenWorkspace = vi.fn();
    const onOpenWorkspaceSettings = vi.fn();

    render(
      <WorkspaceList
        items={[
          {
            canManageSettings: true,
            canManageWorkspaceMembers: true,
            icon: { type: "builtin", key: "book", label: "Book" },
            name: "Admin Docs",
            layout: {
              tocVisible: true
            },
            roleLabel: "Admin",
            shortDescription: "Operational documentation",
            slug: "admin-docs",
            status: "active",
            sysId: "workspace-002"
          }
        ]}
        onOpenWorkspace={onOpenWorkspace}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
      />
    );

    const workspaceLink = screen.getByRole("link", { name: "Admin Docs" });
    const settingsLink = screen.getByRole("link", { name: "Settings" });

    expect(workspaceLink).toBeVisible();
    expect(settingsLink).toBeVisible();
    expect(workspaceLink).not.toHaveAttribute("title");
    expect(settingsLink).not.toHaveAttribute("title");
    expect(document.querySelector("[title]")).not.toBeInTheDocument();

    fireEvent.focus(workspaceLink);
    fireEvent.mouseOver(workspaceLink);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    fireEvent.blur(workspaceLink);
    fireEvent.focus(settingsLink);
    fireEvent.mouseOver(settingsLink);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    fireEvent.click(workspaceLink);
    expect(onOpenWorkspace).toHaveBeenCalledWith("admin-docs", expect.objectContaining({ name: "Admin Docs" }));

    fireEvent.click(settingsLink);
    expect(onOpenWorkspaceSettings).toHaveBeenCalledWith("admin-docs");
  });
});
