import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

beforeAll(() => {
  const rect = () =>
    [
      {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1,
        bottom: 1,
        width: 1,
        height: 1,
        toJSON() {
          return this;
        }
      }
    ] as unknown as DOMRectList;

  const nodePrototype = Node.prototype as Node & {
    getClientRects?: () => DOMRectList;
  };
  if (!nodePrototype.getClientRects) {
    Object.defineProperty(nodePrototype, "getClientRects", {
      configurable: true,
      value: rect
    });
  }

  const rangePrototype = Range.prototype as Range & {
    getClientRects?: () => DOMRectList;
    getBoundingClientRect?: () => DOMRect;
  };
  if (!rangePrototype.getClientRects) {
    Object.defineProperty(rangePrototype, "getClientRects", {
      configurable: true,
      value: rect
    });
  }
  if (!rangePrototype.getBoundingClientRect) {
    Object.defineProperty(rangePrototype, "getBoundingClientRect", {
      configurable: true,
      value: () => rect()[0] as DOMRect
    });
  }

  const elementPrototype = Element.prototype as Element & {
    scrollIntoView?: () => void;
  };
  if (!elementPrototype.scrollIntoView) {
    Object.defineProperty(elementPrototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined
    });
  }

  Object.defineProperty(window, "scrollBy", {
    configurable: true,
    value: () => undefined
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: () => undefined
  });
});

afterEach(() => {
  cleanup();
});
