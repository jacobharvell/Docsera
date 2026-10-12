import "@testing-library/jest-dom/vitest";
import defaultWorkspaceIconDataUri from "../../assets/docsera-default-workspace-icon.png?inline";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocseraBrandIcon, DoubleChevronIcon, GearIcon, MoonIcon, SidebarToggleIcon, SunIcon, WorkspaceListIcon } from "./DocseraHeaderIcons";

describe("DocseraHeaderIcons", () => {
  it("renders the recent-workspaces chevron at 19px with a lighter stroke", () => {
    const { container } = render(<DoubleChevronIcon />);
    const svgs = container.querySelectorAll("svg");

    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveClass("docsera-header__workspace-chevron-icon");
    expect(svgs[0]?.getAttribute("width")).toBe("19");
    expect(svgs[0]?.getAttribute("height")).toBe("19");
    expect(svgs[0]?.getAttribute("stroke-width")).toBe("1.5");
    expect(svgs[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the expanded sidebar toggle as the 16px Lucide panel-left-close icon", () => {
    const { container } = render(<SidebarToggleIcon collapsed={false} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveClass("lucide-panel-left-close");
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
  });

  it("renders the collapsed sidebar toggle as the 16px Lucide panel-left-open icon", () => {
    const { container } = render(<SidebarToggleIcon collapsed={true} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveClass("lucide-panel-left-open");
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
  });

  it("renders the theme and settings icons at 20px", () => {
    const { container: moonContainer } = render(<MoonIcon />);
    const moonSvg = moonContainer.querySelector("svg");
    expect(moonSvg).toHaveClass("docsera-header__action-icon");
    expect(moonSvg?.getAttribute("width")).toBe("20");
    expect(moonSvg?.getAttribute("height")).toBe("20");

    const { container: sunContainer } = render(<SunIcon />);
    const sunSvg = sunContainer.querySelector("svg");
    expect(sunSvg).toHaveClass("docsera-header__action-icon");
    expect(sunSvg?.getAttribute("width")).toBe("20");
    expect(sunSvg?.getAttribute("height")).toBe("20");

    const { container: gearContainer } = render(<GearIcon />);
    const gearSvg = gearContainer.querySelector("svg");
    expect(gearSvg).toHaveClass("docsera-header__action-icon");
    expect(gearSvg?.getAttribute("width")).toBe("20");
    expect(gearSvg?.getAttribute("height")).toBe("20");
  });

  it("renders the workspace list icon at 16px", () => {
    const { container } = render(<WorkspaceListIcon />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
  });

  it("renders the Docsera brand icon as the workspace artwork image", () => {
    const { container } = render(<DocseraBrandIcon />);

    const image = container.querySelector("img");
    if (!image) {
      throw new Error("Expected the Docsera brand icon image to render.");
    }

    expect(image).toHaveAttribute("src");
    expect(image.getAttribute("src")).toBe(defaultWorkspaceIconDataUri);
  });
});
