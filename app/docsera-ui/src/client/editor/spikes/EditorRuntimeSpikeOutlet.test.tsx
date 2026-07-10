import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorRuntimeSpikeOutlet } from "./EditorRuntimeSpikeOutlet";

describe("E1 editor runtime spike outlet", () => {
  it("loads TipTap into a child shadow root with an editor-local overlay", async () => {
    const { container, unmount } = render(<EditorRuntimeSpikeOutlet />);

    expect(screen.getByRole("status")).toHaveTextContent("loading");
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("ready");
    });

    const host = container.querySelector<HTMLElement>("[data-docsera-editor-spike-host='true']");
    expect(host?.shadowRoot?.querySelector(".ProseMirror")).toHaveTextContent("TipTap editor asset loaded");
    expect(host?.shadowRoot?.querySelector("[data-docsera-editor-spike-overlay='true']")).toBeInTheDocument();
    expect(document.body.querySelector("[data-docsera-editor-spike-overlay='true']")).toBeNull();

    unmount();
    await waitFor(() => {
      expect(host?.shadowRoot?.childElementCount).toBe(0);
    });
  });
});
