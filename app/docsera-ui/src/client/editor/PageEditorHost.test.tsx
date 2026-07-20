/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageEditorHost } from "./PageEditorHost";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";

let crashOnRender = false;
let crashOnLoad = false;
let mountRuntimeCallCount = 0;
let updateRuntimeCallCount = 0;
vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  crashOnRender = false;
  crashOnLoad = false;
  mountRuntimeCallCount = 0;
  updateRuntimeCallCount = 0;
});

vi.mock("./PageEditorHostRuntime", async () => {
  if (crashOnLoad) {
    throw new Error("Sensitive import path: /tmp/docsera-runtime.js");
  }

  return {
    mountPageEditorHostRuntime: ({
      props,
      runtimeRoot
    }: {
      props: {
        onEditorReady?: () => void;
        onRuntimeError?: () => void;
        overlayRoot: HTMLElement;
      };
      runtimeRoot: HTMLElement;
    }) => {
      mountRuntimeCallCount += 1;
      if (crashOnRender) {
        props.onRuntimeError?.();
        return {
          destroy() {},
          update() {
            updateRuntimeCallCount += 1;
          }
        };
      }

      const runtimeText = document.createElement("div");
      runtimeText.textContent = "Mock runtime ready";
      const overlayButton = document.createElement("button");
      overlayButton.type = "button";
      overlayButton.textContent = "Mock overlay control";
      runtimeRoot.replaceChildren(runtimeText);
      props.overlayRoot.replaceChildren(overlayButton);
      props.onEditorReady?.();

      return {
        destroy() {
          runtimeRoot.replaceChildren();
          props.overlayRoot.replaceChildren();
        },
        update(nextProps: typeof props) {
          updateRuntimeCallCount += 1;
          props = nextProps;
          runtimeRoot.replaceChildren(runtimeText);
          props.overlayRoot.replaceChildren(overlayButton);
          props.onEditorReady?.();
        }
      };
    }
  };
});

describe("PageEditorHost runtime containment", () => {
  it("contains runtime import failures and reports a generic safe message", async () => {
    const onError = vi.fn();
    crashOnLoad = true;

    render(
      <PageEditorHost
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={vi.fn()}
        onError={onError}
        onOutlineChange={vi.fn()}
        onSaveDraft={vi.fn()}
        onStatusChange={vi.fn()}
        pageSysId="page-001"
        sessionKey="page-001:1"
        theme="light"
      />
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith({
        kind: "load_failed",
        message: "The editor runtime could not be loaded."
      });
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain("Sensitive import path");

    crashOnLoad = false;
  });

  it("contains child runtime render failures and reports a generic safe message", async () => {
    const onError = vi.fn();
    crashOnRender = true;
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <div>
          <p>Workspace shell stays mounted</p>
          <PageEditorHost
            canEdit={true}
            initialEnvelope={createEmptyDocseraDocumentEnvelope()}
            initialRevision={0}
            onAccessLost={vi.fn()}
            onError={onError}
            onOutlineChange={vi.fn()}
            onSaveDraft={vi.fn()}
            onStatusChange={vi.fn()}
            pageSysId="page-001"
            sessionKey="page-001:1"
            theme="light"
          />
        </div>
      );
    });

    expect(screen.getByText("Workspace shell stays mounted")).toBeInTheDocument();
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith({
        kind: "mount_failed",
        message: "The editor host could not be mounted."
      });
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain("Sensitive render failure");
    expect(JSON.stringify(onError.mock.calls)).not.toContain("sys_id=x_82900_docsera_page");

    crashOnRender = false;
    onError.mockClear();
    await act(async () => {
      view.rerender(
        <div>
          <p>Workspace shell stays mounted</p>
          <PageEditorHost
            canEdit={true}
            initialEnvelope={createEmptyDocseraDocumentEnvelope()}
            initialRevision={0}
            onAccessLost={vi.fn()}
            onError={onError}
            onOutlineChange={vi.fn()}
            onSaveDraft={vi.fn(async (): Promise<PageBodySaveResult> => ({
              state: "failed",
              errorMessage: "unused"
            }))}
            onStatusChange={vi.fn()}
            pageSysId="page-001"
            sessionKey="page-001:2"
            theme="light"
          />
        </div>
      );
    });

    await waitFor(() => {
      const host = view.container.querySelector("[data-docsera-page-editor-host='true']");
      const shadowText = host?.shadowRoot?.textContent ?? "";
      expect(shadowText).toContain("Mock runtime ready");
    });
    expect(screen.getByText("Workspace shell stays mounted")).toBeInTheDocument();
  });

  it("tears down overlay controls when the session key changes", async () => {
    const onError = vi.fn();
    const view = render(
      <PageEditorHost
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={vi.fn()}
        onError={onError}
        onOutlineChange={vi.fn()}
        onSaveDraft={vi.fn()}
        onStatusChange={vi.fn()}
        pageSysId="page-001"
        sessionKey="page-001:1"
        theme="light"
      />
    );

    await waitFor(() => {
      const host = view.container.querySelector("[data-docsera-page-editor-host='true']");
      expect(host?.shadowRoot?.querySelector("button")).not.toBeNull();
    });
    const initialHost = view.container.querySelector("[data-docsera-page-editor-host='true']") as HTMLElement | null;
    const initialOverlayRoot = initialHost?.shadowRoot?.querySelector("[data-docsera-editor-overlay-root='true']") as HTMLElement | null;
    const initialButton = initialOverlayRoot?.querySelector("button");
    expect(initialButton).toBeTruthy();

    await act(async () => {
      view.rerender(
        <PageEditorHost
          canEdit={true}
          initialEnvelope={createEmptyDocseraDocumentEnvelope()}
          initialRevision={0}
          onAccessLost={vi.fn()}
          onError={onError}
          onOutlineChange={vi.fn()}
          onSaveDraft={vi.fn()}
          onStatusChange={vi.fn()}
          pageSysId="page-002"
          sessionKey="page-002:1"
          theme="light"
        />
      );
    });

    await waitFor(() => {
      const host = view.container.querySelector("[data-docsera-page-editor-host='true']") as HTMLElement | null;
      const overlayRoot = host?.shadowRoot?.querySelector("[data-docsera-editor-overlay-root='true']") as HTMLElement | null;
      const replacementButton = overlayRoot?.querySelector("button");
      expect(replacementButton).not.toBeNull();
      expect(replacementButton?.isConnected).toBe(true);
      expect(initialButton?.isConnected).toBe(false);
      expect(overlayRoot).not.toBe(initialOverlayRoot);
    });

    await act(async () => {
      view.unmount();
    });
    expect(initialButton?.isConnected).toBe(false);
    expect(view.container.querySelector("[data-docsera-editor-overlay-root='true']")).toBeNull();
    expect(onError).toHaveBeenCalledWith(null);
  });

  it("does not throw when cleanup runs after nodes are detached and Element.remove is patched", async () => {
    const originalRemove = Element.prototype.remove;
    Element.prototype.remove = function patchedRemove() {
      throw new Error("Prototype remove should not be called.");
    };
    try {
      const view = render(
        <PageEditorHost
          canEdit={true}
          initialEnvelope={createEmptyDocseraDocumentEnvelope()}
          initialRevision={0}
          onAccessLost={vi.fn()}
          onError={vi.fn()}
          onOutlineChange={vi.fn()}
          onSaveDraft={vi.fn()}
          onStatusChange={vi.fn()}
          pageSysId="page-001"
          sessionKey="page-001:1"
          theme="light"
        />
      );

      await waitFor(() => {
        expect(view.container.querySelector("[data-docsera-page-editor-host='true']")?.shadowRoot?.textContent).toContain("Mock runtime ready");
      });
      const host = view.container.querySelector("[data-docsera-page-editor-host='true']") as HTMLElement;
      host.shadowRoot?.replaceChildren();

      await expect(act(async () => {
        view.unmount();
        await Promise.resolve();
      })).resolves.toBeUndefined();
    } finally {
      Element.prototype.remove = originalRemove;
    }
  });

  it("mounts the lazy runtime once and reuses it for same-session prop updates", async () => {
    const view = render(
      <PageEditorHost
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={vi.fn()}
        onError={vi.fn()}
        onOutlineChange={vi.fn()}
        onSaveDraft={vi.fn()}
        onStatusChange={vi.fn()}
        pageSysId="page-001"
        sessionKey="page-001:1"
        theme="light"
      />
    );

    await waitFor(() => {
      expect(view.container.querySelector("[data-docsera-page-editor-host='true']")?.shadowRoot?.textContent).toContain("Mock runtime ready");
    });
    expect(mountRuntimeCallCount).toBe(1);

    await act(async () => {
      view.rerender(
        <PageEditorHost
          canEdit={true}
          initialEnvelope={createEmptyDocseraDocumentEnvelope()}
          initialRevision={1}
          onAccessLost={vi.fn()}
          onError={vi.fn()}
          onOutlineChange={vi.fn()}
          onSaveDraft={vi.fn()}
          onStatusChange={vi.fn()}
          pageSysId="page-001"
          sessionKey="page-001:1"
          theme="dark"
        />
      );
    });

    expect(mountRuntimeCallCount).toBe(1);
    expect(updateRuntimeCallCount).toBeGreaterThan(0);
  });
});
