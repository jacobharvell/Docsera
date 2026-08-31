/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";
import { createOverlayOwnerDocumentHarness, createEnvelopeFromDocument, renderRuntime } from "./PageEditorHostRuntime.testUtils";

function createHarnessedOverlayRoot(ownerDocument: Document): HTMLElement {
  const overlayRoot = document.createElement("div");
  Object.defineProperty(overlayRoot, "ownerDocument", {
    configurable: true,
    value: ownerDocument
  });
  return overlayRoot;
}

function getEditorDom(): HTMLElement | null {
  return document.querySelector(".ProseMirror") as HTMLElement | null;
}

function countListenerCalls(mock: { mock: { calls: Array<[string, ...unknown[]]> } }, type: string): number {
  return mock.mock.calls.filter(([callType]) => callType === type).length;
}

describe("PageEditorHostRuntime interaction ownership", () => {
  it("keeps canonical handoff available while markdown owns pointer and focus interaction", async () => {
    const harness = createOverlayOwnerDocumentHarness(1280, 900);
    const overlayRoot = createHarnessedOverlayRoot(harness.ownerDocument);
    const initialEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "paragraph"
        }
      ]
    });
    const { editorReady, onAccessLost, onOutlineChange, onSaveDraft, onStatusChange, rerender } = renderRuntime(
      { interactionActive: false, initialEnvelope },
      { overlayRoot }
    );

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });
    const initialEditor = editorReady[0];

    const initialStatus = onStatusChange.mock.calls[onStatusChange.mock.calls.length - 1]?.[0];
    expect(initialStatus?.applyCanonicalEnvelope).toBeInstanceOf(Function);
    await waitFor(() => {
      expect(getEditorDom()).toHaveAttribute("tabindex", "-1");
    }, { timeout: 3000 });

    const nextEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Canonical handoff while markdown is active" }]
        }
      ]
    });

    await act(async () => {
      const result = initialStatus?.applyCanonicalEnvelope?.(nextEnvelope);
      expect(result).toMatchObject({ kind: "applied" });
    });

    await waitFor(() => {
      expect(initialEditor?.getJSON()).toEqual(nextEnvelope.document);
    });

    const pointerDownAddCallsBeforeEnable = countListenerCalls(harness.ownerDocumentAddEventListener, "pointerdown");
    const pointerMoveAddCallsBeforeEnable = countListenerCalls(harness.ownerDocumentAddEventListener, "pointermove");
    const keydownAddCallsBeforeEnable = countListenerCalls(harness.ownerDocumentAddEventListener, "keydown");

    await act(async () => {
      rerender(
        <PageEditorHostRuntime
          canEdit={true}
          interactionActive={true}
          initialEnvelope={initialEnvelope}
          initialRevision={0}
          onAccessLost={onAccessLost}
          onOutlineChange={onOutlineChange}
          onSaveDraft={onSaveDraft}
          onStatusChange={onStatusChange}
          overlayRoot={overlayRoot}
          pageSysId="page-001"
          theme="light"
        />
      );
    });

    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentAddEventListener, "pointerdown")).toBeGreaterThan(
        pointerDownAddCallsBeforeEnable
      );
    }, { timeout: 3000 });
    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentAddEventListener, "pointermove")).toBeGreaterThan(
        pointerMoveAddCallsBeforeEnable
      );
    }, { timeout: 3000 });
    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentAddEventListener, "keydown")).toBeGreaterThan(keydownAddCallsBeforeEnable);
    }, { timeout: 3000 });
    expect(editorReady[0]).toBe(initialEditor);
    expect(initialEditor?.isDestroyed).toBe(false);
    await waitFor(() => {
      expect(getEditorDom()).toHaveAttribute("tabindex", "0");
    });

    const pointerDownAddCallsAfterEnable = countListenerCalls(harness.ownerDocumentAddEventListener, "pointerdown");
    const pointerMoveAddCallsAfterEnable = countListenerCalls(harness.ownerDocumentAddEventListener, "pointermove");
    const keydownAddCallsAfterEnable = countListenerCalls(harness.ownerDocumentAddEventListener, "keydown");

    await act(async () => {
      rerender(
        <PageEditorHostRuntime
          canEdit={true}
          interactionActive={false}
          initialEnvelope={initialEnvelope}
          initialRevision={0}
          onAccessLost={onAccessLost}
          onOutlineChange={onOutlineChange}
          onSaveDraft={onSaveDraft}
          onStatusChange={onStatusChange}
          overlayRoot={overlayRoot}
          pageSysId="page-001"
          theme="light"
        />
      );
    });

    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentRemoveEventListener, "pointerdown")).toBeGreaterThan(0);
    }, { timeout: 3000 });
    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentRemoveEventListener, "pointermove")).toBeGreaterThan(0);
    }, { timeout: 3000 });
    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentRemoveEventListener, "keydown")).toBeGreaterThan(0);
    }, { timeout: 3000 });
    expect(editorReady[0]).toBe(initialEditor);
    expect(initialEditor?.isDestroyed).toBe(false);
    await waitFor(() => {
      expect(getEditorDom()).toHaveAttribute("tabindex", "-1");
    });

    await act(async () => {
      rerender(
        <PageEditorHostRuntime
          canEdit={true}
          interactionActive={true}
          initialEnvelope={initialEnvelope}
          initialRevision={0}
          onAccessLost={onAccessLost}
          onOutlineChange={onOutlineChange}
          onSaveDraft={onSaveDraft}
          onStatusChange={onStatusChange}
          overlayRoot={overlayRoot}
          pageSysId="page-001"
          theme="light"
        />
      );
    });

    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentAddEventListener, "pointerdown")).toBeGreaterThan(
        pointerDownAddCallsAfterEnable
      );
    }, { timeout: 3000 });
    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentAddEventListener, "pointermove")).toBeGreaterThan(
        pointerMoveAddCallsAfterEnable
      );
    }, { timeout: 3000 });
    await waitFor(() => {
      expect(countListenerCalls(harness.ownerDocumentAddEventListener, "keydown")).toBeGreaterThan(keydownAddCallsAfterEnable);
    }, { timeout: 3000 });
    expect(editorReady[0]).toBe(initialEditor);
    expect(initialEditor?.isDestroyed).toBe(false);
    await waitFor(() => {
      expect(getEditorDom()).toHaveAttribute("tabindex", "0");
    });
    expect(initialEditor?.getJSON()).toEqual(nextEnvelope.document);
  });
});
