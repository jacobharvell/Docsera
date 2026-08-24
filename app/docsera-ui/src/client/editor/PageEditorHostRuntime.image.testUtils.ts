/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { expect, vi } from "vitest";

export function getButtonNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "");
}

export function getMenuItemNames(
  container: HTMLElement,
  role: "menuitem" | "menuitemradio" | "menuitemcheckbox" = "menuitemradio"
): string[] {
  return within(container)
    .getAllByRole(role)
    .map((item) => {
      const ariaLabel = item.getAttribute("aria-label");
      if (ariaLabel) {
        return ariaLabel;
      }

      const title = item.querySelector<HTMLElement>(".docsera-compact-menu__item-title")?.textContent?.trim() ?? "";
      const description =
        item.querySelector<HTMLElement>(".docsera-compact-menu__item-description")?.textContent?.trim() ?? "";

      return [title, description].filter(Boolean).join(" ");
    });
}

export function getOptionNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("option")
    .map((option) => option.getAttribute("aria-label") ?? option.textContent?.trim() ?? "");
}

export function normalizeColor(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("#")) {
    return normalized;
  }

  const rgbMatch = normalized.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
  if (!rgbMatch) {
    return normalized;
  }

  return `#${rgbMatch
    .slice(1)
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function expectStandardImageFieldContract(field: HTMLElement, surfaceBackgroundColor: string) {
  const style = getComputedStyle(field);
  expect(style.minHeight).toBe("34px");
  expect(style.borderRadius).toBe("4px");
  expect(normalizeColor(style.backgroundColor)).toBe(normalizeColor(surfaceBackgroundColor));
}

export function expectStandardImageMediaValueContract(field: HTMLElement, surfaceBackgroundStyle: string) {
  const mediaValue = field as HTMLInputElement;
  const style = getComputedStyle(field);
  expect(mediaValue.readOnly).toBe(true);
  expect(mediaValue.tabIndex).toBe(-1);
  expect(style.boxSizing).toBe("border-box");
  expect(style.height).toBe("34px");
  expect(style.minHeight).toBe("34px");
  expect(style.paddingTop).toBe("0px");
  expect(style.paddingBottom).toBe("0px");
  expect(style.borderRadius).toBe("4px");
  expect(style.cursor).toBe("default");
  expect(style.overflow).toBe("hidden");
  expect(style.whiteSpace).toBe("nowrap");
  expect(style.textOverflow).toBe("ellipsis");
  expect(mediaValue.style.background).toBe(surfaceBackgroundStyle);
  expect(style.boxShadow).toBe("none");
}

export function expectQuietLoadingMediaPlaceholderContract(status: HTMLElement) {
  expect(status.style.border).toBe("");
  expect(status.style.borderRadius).toBe("inherit");
  expect(status.style.boxShadow).toBe("none");
}

export const MUTED_SURFACE_BACKGROUND_STYLE = "var(--docsera-surface-muted)";

export function createMediaBlob(label: string): Blob {
  return new Blob([label], { type: "image/png" });
}

if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:mock")
  });
}

if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(() => undefined)
  });
}

export function getRuntimeStyleText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}

export function mockElementRect(element: Element, rect: DOMRect) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(element, "getBoundingClientRect");
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(element, "getBoundingClientRect", originalDescriptor);
      return;
    }

    Reflect.deleteProperty(element, "getBoundingClientRect");
  };
}

export function mockTopLevelBlockGeometry(editor: Editor, blockRects: DOMRect[]) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  const proseMirror = editor.view.dom;
  const proseMirrorChildren = Array.from(proseMirror.children);
  const restore = [
    mockElementRect(surface, new DOMRect(72, 36, 760, 540)),
    mockElementRect(proseMirror, new DOMRect(132, 52, 620, 420)),
    ...proseMirrorChildren.map((child, index) => mockElementRect(child, blockRects[index] ?? new DOMRect(0, 0, 1, 1)))
  ];

  return {
    setLayoutRects(nextRects: {
      hostRect?: DOMRect;
      mainPaneRect?: DOMRect;
      panelRect?: DOMRect;
      proseMirrorRect?: DOMRect;
      surfaceRect?: DOMRect;
    }) {
      if (nextRects.surfaceRect) {
        mockElementRect(surface, nextRects.surfaceRect);
      }

      if (nextRects.proseMirrorRect || nextRects.mainPaneRect) {
        mockElementRect(proseMirror, nextRects.proseMirrorRect ?? nextRects.mainPaneRect!);
      }
    },
    mockRestore() {
      for (const reset of restore.reverse()) {
        reset();
      }
    }
  };
}

export function getEditorPaneElement(editor: Editor) {
  const editorSurface = editor.view.dom;
  const surfaceElement = editorSurface.closest(".docsera-editor-runtime__surface");
  return surfaceElement instanceof HTMLElement ? surfaceElement : null;
}

export async function dispatchOwnerPointerEvent(
  ownerDocument: Document,
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  point: { clientX: number; clientY: number },
  options: {
    button?: number;
    buttons?: number;
    composedPath?: Array<EventTarget | null | undefined>;
    pointerId?: number;
    pointerType?: string;
  } = {}
): Promise<boolean> {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: {
      configurable: true,
      value: point.clientX
    },
    clientY: {
      configurable: true,
      value: point.clientY
    },
    button: {
      configurable: true,
      value: options.button ?? 0
    },
    buttons: {
      configurable: true,
      value: options.buttons ?? (type === "pointerdown" ? 1 : 0)
    },
    pointerId: {
      configurable: true,
      value: options.pointerId ?? 1
    },
    pointerType: {
      configurable: true,
      value: options.pointerType ?? "mouse"
    },
    target: {
      configurable: true,
      value: target
    },
    composedPath: {
      configurable: true,
      value: () => options.composedPath?.filter(Boolean) ?? [target]
    }
  });
  await act(async () => {
    const dispatchTarget =
      target instanceof Node && target.isConnected && target.ownerDocument === ownerDocument ? target : ownerDocument;
    dispatchTarget.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

export async function dispatchOwnerPointerMove(
  ownerDocument: Document,
  target: EventTarget,
  point: { clientX: number; clientY: number },
  options: { composedPath?: Array<EventTarget | null | undefined>; pointerId?: number; pointerType?: string } = {}
) {
  await dispatchOwnerPointerEvent(ownerDocument, target, "pointermove", point, options);
}

export async function openImageOptions(editor: Editor, pointer: { clientX: number; clientY: number }) {
  const surface = getEditorPaneElement(editor);
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  await dispatchOwnerPointerMove(surface.ownerDocument, surface, pointer);
  fireEvent.click(await screen.findByRole("button", { name: "Image options" }));
}
