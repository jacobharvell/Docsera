/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageEditorHost } from "./PageEditorHost";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";

let crashOnRender = false;
let crashOnLoad = false;
vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("./PageEditorHostRuntime", async () => {
  if (crashOnLoad) {
    throw new Error("Sensitive import path: /tmp/docsera-runtime.js");
  }

  return {
    PageEditorHostRuntime: () => {
      if (crashOnRender) {
        throw new Error("Sensitive render failure: sys_id=x_82900_docsera_page");
      }

      return <div>Mock runtime ready</div>;
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
});
