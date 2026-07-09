import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { docseraIcons } from "./docseraIcons";
import { DocseraIcon } from "./DocseraIcon";

describe("DocseraIcon", () => {
  it("renders decorative icons with shared defaults", () => {
    const { container } = render(<DocseraIcon icon={docseraIcons.search} size={18} />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("docsera-icon");
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("stroke-width", "2");
  });

  it("supports accessible labels for non-decorative icons", () => {
    render(<DocseraIcon icon={docseraIcons.settings} label="Workspace settings" />);

    expect(screen.getByLabelText("Workspace settings")).toHaveAttribute("role", "img");
  });
});
