import "@testing-library/jest-dom/vitest";
import defaultWorkspaceIconDataUri from "../../assets/docsera-default-workspace-icon.png?inline";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceIconBadge } from "./WorkspacePrimitives";

describe("WorkspaceIconBadge", () => {
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

  it("renders the default Docsera workspace icon artwork for the built-in workspace key", () => {
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
