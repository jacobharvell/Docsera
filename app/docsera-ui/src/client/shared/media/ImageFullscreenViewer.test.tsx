/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCSERA_TOOLTIP_DELAY_MS } from "../tooltip/DocseraTooltip";
import { ImageFullscreenViewer, type ImageFullscreenViewerSession } from "./ImageFullscreenViewer";

function createSession(): ImageFullscreenViewerSession {
  return {
    alt: "Architecture diagram",
    imageSrc: "blob:image-viewer",
    naturalHeight: 480,
    naturalWidth: 640,
    restoreFocusElement: null,
    sourceBorderRadius: "0px",
    sourceRect: new DOMRect(100, 100, 320, 240)
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ImageFullscreenViewer tooltip focus", () => {
  it.each([false, true])("autofocuses close without showing its tooltip when reduced motion is %s", async (reduceMotion) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: reduceMotion && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }));
    const overlayRoot = document.createElement("div");
    document.body.append(overlayRoot);

    const view = render(
      <ImageFullscreenViewer
        isOpen
        onDismissed={vi.fn()}
        onRequestClose={vi.fn()}
        overlayRoot={overlayRoot}
        session={createSession()}
        theme="light"
      />
    );

    const closeButton = overlayRoot.querySelector(".docsera-image-viewer__close");
    expect(closeButton).toBeInstanceOf(HTMLButtonElement);
    await waitFor(() => expect(closeButton).toHaveFocus());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(closeButton).not.toHaveAttribute("data-docsera-suppress-focus-tooltip");

    view.unmount();
    overlayRoot.remove();
  });

  it("restores immediate keyboard and delayed pointer tooltips after initial autofocus", async () => {
    const overlayRoot = document.createElement("div");
    document.body.append(overlayRoot);
    const view = render(
      <ImageFullscreenViewer
        isOpen
        onDismissed={vi.fn()}
        onRequestClose={vi.fn()}
        overlayRoot={overlayRoot}
        session={createSession()}
        theme="light"
      />
    );
    const closeButton = overlayRoot.querySelector(".docsera-image-viewer__close");
    expect(closeButton).toBeInstanceOf(HTMLButtonElement);
    if (!(closeButton instanceof HTMLButtonElement)) {
      throw new Error("Expected the fullscreen viewer close button.");
    }
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.blur(closeButton);
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.focus(closeButton);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Close image viewer");

    fireEvent.mouseLeave(closeButton);
    fireEvent.mouseEnter(closeButton);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Close image viewer"), {
      timeout: DOCSERA_TOOLTIP_DELAY_MS + 500
    });

    view.unmount();
    overlayRoot.remove();
  });
});
