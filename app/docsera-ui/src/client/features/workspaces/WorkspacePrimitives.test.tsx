import defaultWorkspaceIconDataUri from "../../assets/docsera-default-workspace-icon.png?inline";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceIconBadge } from "./WorkspacePrimitives";

describe("WorkspaceIconBadge", () => {
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
  });

  it("falls back to a monogram for non-default workspace icons", () => {
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
