import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCSERA_TOOLTIP_DELAY_MS, DocseraCompactTooltip } from "./DocseraTooltip";

function renderTooltip(ownerDocument: Document = document) {
  const container = ownerDocument.createElement("div");
  ownerDocument.body.append(container);

  return render(
    <DocseraCompactTooltip label="Workspace settings" ownerDocument={ownerDocument}>
      <button type="button">Settings</button>
    </DocseraCompactTooltip>,
    { container }
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DocseraCompactTooltip window lifecycle", () => {
  it("dismisses a visible tooltip when its owner window loses focus and does not restore it from focus alone", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Settings" });

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Workspace settings");

    fireEvent.blur(window);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("cancels pending pointer hover when the owner document becomes hidden", () => {
    vi.useFakeTimers();
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Settings" });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);

    fireEvent.mouseEnter(trigger);
    document.dispatchEvent(new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(DOCSERA_TOOLTIP_DELAY_MS));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    hidden.mockRestore();
  });

  it("ignores arbitrary pointer movement after deactivation but allows intentional keyboard refocus and pointer entry", () => {
    vi.useFakeTimers();
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Settings" });

    fireEvent.focus(trigger);
    fireEvent.blur(window);
    fireEvent.pointerMove(document.body);
    fireEvent.focus(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Workspace settings");

    fireEvent.blur(window);
    fireEvent.mouseEnter(trigger);
    act(() => vi.advanceTimersByTime(DOCSERA_TOOLTIP_DELAY_MS));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Workspace settings");
  });

  it("keeps one-shot programmatic focus suppression intact", () => {
    render(
      <DocseraCompactTooltip label="Open navigation">
        <button type="button" data-docsera-suppress-focus-tooltip="true">Navigation</button>
      </DocseraCompactTooltip>
    );
    const trigger = screen.getByRole("button", { name: "Navigation" });

    fireEvent.focus(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("data-docsera-suppress-focus-tooltip");

    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Open navigation");
  });

  it("uses and cleans up listeners on the supplied owner document and window", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const ownerDocument = frame.contentDocument!;
    const ownerWindow = ownerDocument.defaultView!;
    const addDocumentListener = vi.spyOn(ownerDocument, "addEventListener");
    const removeDocumentListener = vi.spyOn(ownerDocument, "removeEventListener");
    const addWindowListener = vi.spyOn(ownerWindow, "addEventListener");
    const removeWindowListener = vi.spyOn(ownerWindow, "removeEventListener");

    const view = renderTooltip(ownerDocument);
    expect(addWindowListener).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(addDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(addDocumentListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(addDocumentListener).not.toHaveBeenCalledWith("pointermove", expect.any(Function), true);

    view.unmount();
    expect(removeWindowListener).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(removeDocumentListener).not.toHaveBeenCalledWith("pointermove", expect.any(Function), true);
    frame.remove();
  });
});
