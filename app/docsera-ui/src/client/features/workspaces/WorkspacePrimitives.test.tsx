import "@testing-library/jest-dom/vitest";
import defaultWorkspaceIconDataUri from "../../assets/docsera-default-workspace-icon.png?inline";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceIconBadge } from "./WorkspacePrimitives";

function mockObjectUrl() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn()
  });
}

describe("WorkspaceIconBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("centers workspace names on the unchanged icon line and explicitly separates picker legends", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8"
    ).replace(/\r\n/g, "\n");
    const rule = (selector: string) => source.split(`${selector} {`).slice(-1)[0]?.split("\n}")[0] ?? "";

    expect(rule(".docsera-workspace-row__identity")).toContain("align-items: flex-start;");
    expect(rule(".docsera-workspace-row__name")).toContain("position: relative;");
    expect(rule(".docsera-workspace-row__name")).toContain("top: 1px;");
    expect(rule(".docsera-workspace-row__name")).toContain("display: inline-flex;");
    expect(rule(".docsera-workspace-row__name")).toContain("align-items: center;");
    expect(rule(".docsera-workspace-row__name")).toContain("min-height: 24px;");
    for (const selector of [".docsera-workspace-row__icon", ".docsera-header__menu-item-icon"]) {
      const block = rule(selector);
      expect(block).toContain("width: 24px;");
      expect(block).toContain("height: 24px;");
    }
    expect(rule(".docsera-header__menu-item-identity")).toContain("align-items: center;");
    expect(rule(".docsera-header__menu-item-label")).toContain("line-height: 24px;");
    expect(rule(".docsera-header__menu-item-label")).toContain("text-overflow: ellipsis;");
    expect(rule(".docsera-workspace-icon-picker > legend + .docsera-workspace-icon-picker__grid"))
      .toContain("margin-top: 8px;");
  });

  it("keeps built-in icon glyphs transparent and primary-colored in workspace identity surfaces", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const builtInBlock = source.match(/\.docsera-workspace-icon-badge--builtin \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const glyphBlock = source.match(/\.docsera-workspace-icon-badge__glyph \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const rowGlyphBlock =
      source.match(/\.docsera-workspace-row__icon \.docsera-workspace-icon-badge__glyph \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(builtInBlock).toContain("background: transparent;");
    expect(builtInBlock).toContain("color: var(--docsera-primary);");
    expect(builtInBlock).not.toContain("linear-gradient");
    expect(glyphBlock).toContain("width: 72%;");
    expect(glyphBlock).toContain("height: 72%;");
    expect(glyphBlock).toContain("color: currentColor;");
    expect(rowGlyphBlock).toContain("width: 86%;");
    expect(rowGlyphBlock).toContain("height: 86%;");
  });

  it("renders uploaded workspace icons as contained authenticated object URLs without built-in glyph treatment", async () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const uploadedBadgeBlock = source.match(/\.docsera-workspace-icon-badge--uploaded \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const uploadedImageBlock = source.match(/\.docsera-workspace-icon-badge__uploaded-image \{([\s\S]*?)\n\}/)?.[1] ?? "";

    mockObjectUrl();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-icon");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));

    const { container } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{
          icon: {
            type: "uploaded",
            key: "asset-key-001",
            label: "Custom icon",
            assetPath: "/api/x_2300756_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001"
          },
          name: "Custom Docs"
        }}
      />
    );

    const badge = container.firstElementChild;
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:workspace-icon"));
    const image = container.querySelector("img");
    expect(loadUploadedIcon).toHaveBeenCalledWith({
      assetPath: "/api/x_2300756_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001",
      signal: expect.any(AbortSignal)
    });
    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(badge).toHaveClass("docsera-workspace-icon-badge--uploaded");
    expect(badge).not.toHaveClass("docsera-workspace-icon-badge--builtin");
    expect(image).toHaveClass("docsera-workspace-icon-badge__uploaded-image");
    expect(uploadedBadgeBlock).toContain("padding: 0;");
    expect(uploadedBadgeBlock).toContain("background: transparent;");
    expect(uploadedBadgeBlock).toContain("box-shadow: none;");
    expect(uploadedBadgeBlock).not.toContain("color-mix");
    expect(uploadedBadgeBlock).not.toContain("inset");
    expect(uploadedImageBlock).toContain("width: 100%;");
    expect(uploadedImageBlock).toContain("height: 100%;");
    expect(uploadedImageBlock).toContain("object-fit: contain;");
  });

  it("overrides the generic header gradient for uploaded workspace icon slots", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const headerRule = (selector: string) => source.split(`${selector} {`).slice(-1)[0]?.split("\n}")[0] ?? "";
    const genericHeaderRule = headerRule(".docsera-header__workspace-icon");
    const uploadedHeaderRule = headerRule(".docsera-header__workspace-icon.docsera-workspace-icon-badge--uploaded");
    const headerSlotRule = source.match(/\.docsera-header__workspace-icon,[\s\S]*?width: 32px;[\s\S]*?height: 32px;/)?.[0] ?? "";

    expect(genericHeaderRule).toContain("background: linear-gradient");
    expect(headerSlotRule).toContain("width: 32px;");
    expect(headerSlotRule).toContain("height: 32px;");
    expect(uploadedHeaderRule).toContain("background: transparent;");
    expect(uploadedHeaderRule).toContain("box-shadow: none;");
  });

  it("keeps local uploaded previews functional when no authenticated loader is supplied", () => {
    const { container } = render(
      <WorkspaceIconBadge
        workspace={{
          icon: {
            type: "uploaded",
            key: "asset-key-001",
            label: "Custom icon",
            assetPath: "blob:local-preview"
          },
          name: "Custom Docs"
        }}
      />
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "blob:local-preview");
  });

  it("renders local uploaded previews directly even when an authenticated loader is supplied", () => {
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const { container } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{
          icon: {
            type: "uploaded",
            key: "asset-key-001",
            label: "Custom icon",
            assetPath: "blob:local-preview"
          },
          name: "Custom Docs"
        }}
      />
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "blob:local-preview");
    expect(loadUploadedIcon).not.toHaveBeenCalled();
  });

  it("clears and releases an owned staged preview before loading its canonical uploaded icon", () => {
    const loadUploadedIcon = vi.fn(() => new Promise<Blob>(() => undefined));
    const releaseOwnedPreview = vi.fn();
    const { container, rerender } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        ownedExternalObjectUrl="blob:staged-preview"
        onReleaseOwnedExternalObjectUrl={releaseOwnedPreview}
        workspace={{ icon: { type: "uploaded", key: "asset-1", label: "Staged", assetPath: "blob:staged-preview" }, name: "Staged" }}
      />
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "blob:staged-preview");
    rerender(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        ownedExternalObjectUrl="blob:staged-preview"
        onReleaseOwnedExternalObjectUrl={releaseOwnedPreview}
        workspace={{ icon: { type: "uploaded", key: "asset-1", label: "Staged", assetPath: "/icons/file?assetKey=asset-1" }, name: "Staged" }}
      />
    );

    expect(releaseOwnedPreview).toHaveBeenCalledWith("blob:staged-preview");
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it("keeps an empty reserved slot when authenticated uploaded workspace icon retrieval fails", async () => {
    const loadUploadedIcon = vi.fn(async () => null);
    const { container } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{
          icon: {
            type: "uploaded",
            key: "asset-key-001",
            label: "Custom icon",
            assetPath: "/icons/file?assetKey=asset-key-001"
          },
          name: "Custom Docs"
        }}
      />
    );

    await waitFor(() => expect(loadUploadedIcon).toHaveBeenCalled());
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
    expect(container.firstElementChild).toHaveClass("docsera-workspace-icon-badge--uploaded");
  });

  it("renders an uploaded workspace icon slot immediately without placeholder artwork while its request is unresolved", () => {
    const loadUploadedIcon = vi.fn(() => new Promise<Blob>(() => undefined));
    const { container } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-key-001", label: "Custom icon", assetPath: "/icons/file?assetKey=asset-key-001" }, name: "Custom Docs" }}
      />
    );

    expect(loadUploadedIcon).toHaveBeenCalled();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
    expect(container.firstElementChild).toHaveClass("docsera-workspace-icon-badge--uploaded");
  });

  it("releases authenticated object URLs when uploaded workspace icons are replaced or unmounted", async () => {
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const { container, rerender, unmount } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-1", label: "One", assetPath: "/icons/file?assetKey=asset-1" }, name: "One" }}
      />
    );

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:first"));
    rerender(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-2", label: "Two", assetPath: "/icons/file?assetKey=asset-2" }, name: "Two" }}
      />
    );

    await waitFor(() => expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:first"));
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:second"));
    unmount();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:second");
  });

  it("releases an authenticated object URL when replaced by a local uploaded preview", async () => {
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:authenticated");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const { container, rerender } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-1", label: "One", assetPath: "/icons/file?assetKey=asset-1" }, name: "One" }}
      />
    );

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:authenticated"));
    rerender(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-2", label: "Two", assetPath: "blob:local-preview" }, name: "Two" }}
      />
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "blob:local-preview");
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:authenticated");
  });

  it("prevents stale uploaded icon loads from replacing a newer icon", async () => {
    let resolveFirst: ((blob: Blob) => void) | undefined;
    let resolveSecond: ((blob: Blob) => void) | undefined;
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:second");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadUploadedIcon = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Blob>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise<Blob>((resolve) => {
        resolveSecond = resolve;
      }));
    const { container, rerender } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-1", label: "One", assetPath: "/icons/file?assetKey=asset-1" }, name: "One" }}
      />
    );

    rerender(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-2", label: "Two", assetPath: "/icons/file?assetKey=asset-2" }, name: "Two" }}
      />
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
    resolveFirst?.(new Blob(["first"]));
    resolveSecond?.(new Blob(["second"]));

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:second"));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("reveals loaded uploaded artwork only after its image is ready", async () => {
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-icon");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { container } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={vi.fn(async () => new Blob(["icon"], { type: "image/png" }))}
        workspace={{ icon: { type: "uploaded", key: "asset-key-001", label: "Custom icon", assetPath: "/icons/file?assetKey=asset-key-001" }, name: "Custom Docs" }}
      />
    );

    const image = await waitFor(() => {
      const current = container.querySelector("img");
      expect(current).toBeInTheDocument();
      return current!;
    });
    expect(container.firstElementChild).not.toHaveClass("docsera-workspace-icon-badge--uploaded-ready");
    fireEvent.load(image);
    expect(container.firstElementChild).toHaveClass("docsera-workspace-icon-badge--uploaded-ready");
  });

  it("resets failed uploaded icon state when the workspace icon changes", async () => {
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:second");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadUploadedIcon = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Blob(["second"], { type: "image/png" }));
    const { container, rerender } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-1", label: "One", assetPath: "/icons/file?assetKey=asset-1" }, name: "One" }}
      />
    );

    await waitFor(() => expect(container.querySelector("img")).not.toBeInTheDocument());
    expect(container.textContent).toBe("");
    rerender(
      <WorkspaceIconBadge
        loadUploadedIcon={loadUploadedIcon}
        workspace={{ icon: { type: "uploaded", key: "asset-2", label: "Two", assetPath: "/icons/file?assetKey=asset-2" }, name: "Two" }}
      />
    );

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:second"));
  });

  it("keeps an empty slot when a loaded uploaded workspace icon image cannot render", async () => {
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-icon");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { container } = render(
      <WorkspaceIconBadge
        loadUploadedIcon={vi.fn(async () => new Blob(["icon"], { type: "image/png" }))}
        workspace={{ icon: { type: "uploaded", key: "asset-key-001", label: "Custom icon", assetPath: "/icons/file?assetKey=asset-key-001" }, name: "Custom Docs" }}
      />
    );

    await waitFor(() => expect(container.querySelector("img")).toBeInTheDocument());
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
  });

  it("renders the default Docsera workspace icon artwork for the built-in workspace key", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const artworkBadgeBlock = source.match(/\.docsera-workspace-icon-badge--artwork \{([\s\S]*?)\n\}/)?.[1] ?? "";

    const { container } = render(
      <WorkspaceIconBadge
        workspace={{
          icon: {
            type: "builtin",
            key: "docsera-workspace",
            label: "Docsera workspace icon"
          },
          name: "Docsera"
        }}
      />
    );

    const image = container.querySelector("img");
    if (!image) {
      throw new Error("Expected the default workspace icon artwork image to render.");
    }

    expect(image).toHaveAttribute("src");
    expect(image.getAttribute("src")).toBe(defaultWorkspaceIconDataUri);
    expect(image).toHaveClass("docsera-workspace-icon-badge__artwork");
    expect(image.closest(".docsera-workspace-icon-badge")).toHaveClass("docsera-workspace-icon-badge--builtin");
    expect(image.closest(".docsera-workspace-icon-badge")).toHaveClass("docsera-workspace-icon-badge--artwork");
    expect(artworkBadgeBlock).toContain("padding: 0;");
    expect(artworkBadgeBlock).toContain("background: transparent;");
    expect(artworkBadgeBlock).toContain("box-shadow: none;");
  });

  it("renders supported non-default built-in icons as glyph artwork", () => {
    const { container } = render(
      <WorkspaceIconBadge
        workspace={{
          icon: {
            type: "builtin",
            key: "security",
            label: "Security"
          },
          name: "Security"
        }}
      />
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("docsera-workspace-icon-badge--builtin");
    expect(container.firstElementChild).not.toHaveClass("docsera-workspace-icon-badge--artwork");
    expect(container).toHaveTextContent("");
  });

  it("falls back to a monogram for unsupported workspace icons", () => {
    const { container } = render(
      <WorkspaceIconBadge
        workspace={{
          icon: {
            type: "builtin",
            key: "custom-workspace",
            label: "Custom Workspace"
          },
          name: "Custom Workspace"
        }}
      />
    );

    expect(container.textContent).toContain("C");
  });
});
