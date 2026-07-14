/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { describe, expect, it, vi } from "vitest";
import {
  createClipboardData,
  createSuccessPage,
  renderRuntime,
  runAutosave,
  setParagraphText
} from "./PageEditorHostRuntime.testUtils";

const RESUME_TOKEN = "resume-token";
const SAME_TAB_SESSION_ID = "same-tab-session";

function buildFingerprint(lockToken: string) {
  let hash = 2166136261;
  for (const character of lockToken) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const RESUME_FINGERPRINT = buildFingerprint(RESUME_TOKEN);

function mockNavigationType(type: "back_forward" | "navigate" | "prerender" | "reload") {
  vi.spyOn(window.performance, "getEntriesByType").mockImplementation((entryType) =>
    entryType === "navigation" ? ([{ type }] as unknown as PerformanceEntry[]) : []
  );
}

function seedOwnerMarker(input: {
  fingerprint?: string;
  runtimeInstanceId?: string;
  seenAt?: number;
  tabSessionId: string;
}) {
  window.localStorage.setItem(
    "docsera.page-edit-lock-owner:page-001",
    JSON.stringify({
      fingerprint: input.fingerprint ?? RESUME_FINGERPRINT,
      runtimeInstanceId: input.runtimeInstanceId ?? "owner-runtime",
      seenAt: input.seenAt ?? Date.now(),
      tabSessionId: input.tabSessionId
    })
  );
}

describe("PageEditorHostRuntime", () => {
  it("keeps the body read-only until direct page-body interaction acquires the lock and then saves with the held lock token", async () => {
    const onAcquireEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 30000,
      lockToken: "held-lock-token",
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const onHeartbeatEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 30000,
      lockToken: "held-lock-token",
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const onRefreshEditLock = vi.fn(async () => ({
      state: "unlocked" as const
    }));
    const onReleaseEditLock = vi.fn(async () => ({
      state: "released" as const
    }));
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      page: createSuccessPage(1),
      state: "succeeded"
    }));
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock,
      onRefreshEditLock,
      onReleaseEditLock,
      onSaveDraft
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    expect(screen.queryByText(/Ready to edit/i)).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");

    fireEvent.pointerDown(container.querySelector(".ProseMirror")!, {
      clientX: 24,
      clientY: 18
    });

    await waitFor(() => {
      expect(onAcquireEditLock).toHaveBeenCalledWith({
        lockToken: undefined,
        pageSysId: "page-001"
      });
      expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");
    });

    await setParagraphText(editorReady[0], "Acquired draft");
    await runAutosave();

    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lockToken: "held-lock-token",
        pageSysId: "page-001"
      })
    );
  });

  it("confirms same-tab reload resume only when the fresh marker is paired with a reload navigation signal", async () => {
    const onAcquireEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 30000,
      lockToken: RESUME_TOKEN,
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const onHeartbeatEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 30000,
      lockToken: RESUME_TOKEN,
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const onRefreshEditLock = vi.fn(async ({ lockToken }: { lockToken?: string; pageSysId: string }) =>
      lockToken
        ? ({
            heartbeatIntervalMs: 30000,
            lockToken: RESUME_TOKEN,
            staleAfterMs: 180000,
            state: "held" as const
          })
        : ({
            state: "unlocked" as const
          })
    );
    const onReleaseEditLock = vi.fn(async () => ({
      state: "released" as const
    }));
    const firstMount = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock,
      onRefreshEditLock,
      onReleaseEditLock
    });

    await waitFor(() => {
      expect(firstMount.editorReady[0]).toBeDefined();
      expect(onRefreshEditLock).toHaveBeenCalledWith({
        pageSysId: "page-001"
      });
    });

    fireEvent.pointerDown(firstMount.container.querySelector(".ProseMirror")!, {
      clientX: 22,
      clientY: 14
    });
    await waitFor(() => {
      expect(onAcquireEditLock).toHaveBeenCalledWith({
        lockToken: undefined,
        pageSysId: "page-001"
      });
      expect(firstMount.container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");
    });

    firstMount.unmount();
    expect(onReleaseEditLock).not.toHaveBeenCalled();
    const persistedTokenRecord = window.sessionStorage.getItem("docsera.page-edit-lock:page-001");
    expect(persistedTokenRecord).toContain(RESUME_TOKEN);
    window.sessionStorage.setItem("docsera.page-edit-lock:page-001", persistedTokenRecord!);
    mockNavigationType("reload");

    const secondMount = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock,
      onRefreshEditLock,
      onReleaseEditLock
    });

    await waitFor(() => {
      expect(secondMount.editorReady[0]).toBeDefined();
    });
    await waitFor(() => {
      expect(onRefreshEditLock).toHaveBeenNthCalledWith(2, {
        lockToken: RESUME_TOKEN,
        pageSysId: "page-001"
      });
    }, { timeout: 2500 });

    expect(onAcquireEditLock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Ready to edit/i)).not.toBeInTheDocument();
  });

  it("fails closed and avoids token resume when BroadcastChannel is unavailable", async () => {
    const originalBroadcastChannel = (window as any).BroadcastChannel;
    vi.stubGlobal("BroadcastChannel", undefined);
    (window as any).BroadcastChannel = undefined;
    window.sessionStorage.setItem("docsera.page-edit-lock:page-001", JSON.stringify({ token: RESUME_TOKEN }));
    mockNavigationType("reload");

    const onRefreshEditLock = vi.fn(async ({ lockToken }: { lockToken?: string; pageSysId: string }) =>
      lockToken
        ? ({
            heartbeatIntervalMs: 30000,
            lockToken: RESUME_TOKEN,
            staleAfterMs: 180000,
            state: "held" as const
          })
        : ({
            state: "unlocked" as const
          })
    );

    renderRuntime({
      onAcquireEditLock: vi.fn(),
      onHeartbeatEditLock: vi.fn(),
      onRefreshEditLock,
      onReleaseEditLock: vi.fn(async () => ({ state: "released" as const }))
    });

    await waitFor(() => {
      expect(onRefreshEditLock).toHaveBeenCalledWith({
        pageSysId: "page-001"
      });
    }, { timeout: 2500 });
    expect(onRefreshEditLock).not.toHaveBeenCalledWith({
      lockToken: RESUME_TOKEN,
      pageSysId: "page-001"
    });
    expect(window.sessionStorage.getItem("docsera.page-edit-lock:page-001")).toBeNull();

    vi.stubGlobal("BroadcastChannel", originalBroadcastChannel);
    (window as any).BroadcastChannel = originalBroadcastChannel;
  });

  it("fails closed and avoids token resume when owner-marker storage is unavailable", async () => {
    window.sessionStorage.setItem("docsera.page-edit-lock:page-001", JSON.stringify({ token: RESUME_TOKEN }));
    mockNavigationType("reload");
    const getItemSpy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });

    const onRefreshEditLock = vi.fn(async ({ lockToken }: { lockToken?: string; pageSysId: string }) =>
      lockToken
        ? ({
            heartbeatIntervalMs: 30000,
            lockToken: RESUME_TOKEN,
            staleAfterMs: 180000,
            state: "held" as const
          })
        : ({
            state: "unlocked" as const
          })
    );

    renderRuntime({
      onAcquireEditLock: vi.fn(),
      onHeartbeatEditLock: vi.fn(),
      onRefreshEditLock,
      onReleaseEditLock: vi.fn(async () => ({ state: "released" as const }))
    });

    await waitFor(() => {
      expect(onRefreshEditLock).toHaveBeenCalledWith({
        pageSysId: "page-001"
      });
    }, { timeout: 2500 });
    expect(onRefreshEditLock).not.toHaveBeenCalledWith({
      lockToken: RESUME_TOKEN,
      pageSysId: "page-001"
    });
    expect(window.sessionStorage.getItem("docsera.page-edit-lock:page-001")).toBeNull();

    getItemSpy.mockRestore();
  });

  it("fails closed on coordination timeout when only a fresh same-tab marker is available", async () => {
    window.name = `docsera.page-edit-lock-tab:${SAME_TAB_SESSION_ID}`;
    window.sessionStorage.setItem("docsera.page-edit-lock:page-001", JSON.stringify({ token: RESUME_TOKEN }));
    seedOwnerMarker({
      runtimeInstanceId: "reloading-owner-runtime",
      tabSessionId: SAME_TAB_SESSION_ID
    });

    const onRefreshEditLock = vi.fn(async ({ lockToken }: { lockToken?: string; pageSysId: string }) =>
      lockToken
        ? ({
            heartbeatIntervalMs: 30000,
            lockToken: RESUME_TOKEN,
            staleAfterMs: 180000,
            state: "held" as const
          })
        : ({
            holderDisplayName: "Alex Editor",
            sameUserDifferentSession: true,
            state: "locked" as const
          })
    );

    renderRuntime({
      onAcquireEditLock: vi.fn(),
      onHeartbeatEditLock: vi.fn(),
      onRefreshEditLock,
      onReleaseEditLock: vi.fn(async () => ({ state: "released" as const }))
    });

    await waitFor(() => {
      expect(onRefreshEditLock).toHaveBeenCalledWith({
        pageSysId: "page-001"
      });
    }, { timeout: 2500 });
    expect(onRefreshEditLock).not.toHaveBeenCalledWith({
      lockToken: RESUME_TOKEN,
      pageSysId: "page-001"
    });
    expect(await screen.findByText("This page is already being edited in another tab or window for your account.")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("docsera.page-edit-lock:page-001")).toBeNull();
  });

  it("fails closed when a fresh foreign owner marker is present", async () => {
    window.sessionStorage.setItem("docsera.page-edit-lock:page-001", JSON.stringify({ token: RESUME_TOKEN }));
    seedOwnerMarker({
      runtimeInstanceId: "foreign-runtime",
      tabSessionId: "foreign-tab"
    });
    mockNavigationType("reload");

    const onRefreshEditLock = vi.fn(async ({ lockToken }: { lockToken?: string; pageSysId: string }) =>
      lockToken
        ? ({
            heartbeatIntervalMs: 30000,
            lockToken: RESUME_TOKEN,
            staleAfterMs: 180000,
            state: "held" as const
          })
        : ({
            holderDisplayName: "Alex Editor",
            sameUserDifferentSession: true,
            state: "locked" as const
          })
    );

    renderRuntime({
      onAcquireEditLock: vi.fn(),
      onHeartbeatEditLock: vi.fn(),
      onRefreshEditLock,
      onReleaseEditLock: vi.fn(async () => ({ state: "released" as const }))
    });

    await waitFor(() => {
      expect(onRefreshEditLock).toHaveBeenCalledWith({
        pageSysId: "page-001"
      });
    }, { timeout: 2500 });
    expect(onRefreshEditLock).not.toHaveBeenCalledWith({
      lockToken: RESUME_TOKEN,
      pageSysId: "page-001"
    });
    expect(await screen.findByText("This page is already being edited in another tab or window for your account.")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("docsera.page-edit-lock:page-001")).toBeNull();
  });

  it("prevents a duplicated tab with copied storage from resuming the owning tab token", async () => {
    const heldResult = {
      heartbeatIntervalMs: 30000,
      lockToken: RESUME_TOKEN,
      staleAfterMs: 180000,
      state: "held" as const
    };
    const onAcquireEditLock = vi.fn(async () => heldResult);
    const onHeartbeatEditLock = vi.fn(async () => heldResult);
    const onReleaseEditLock = vi.fn(async () => ({
      state: "released" as const
    }));
    const ownerRefresh = vi.fn(async ({ lockToken }: { lockToken?: string; pageSysId: string }) =>
      lockToken
        ? heldResult
        : ({
            state: "unlocked" as const
          })
    );
    const duplicateRefresh = vi.fn(async ({ lockToken }: { lockToken?: string; pageSysId: string }) =>
      lockToken
        ? heldResult
        : ({
            holderDisplayName: "Alex Editor",
            sameUserDifferentSession: true,
            state: "locked" as const
          })
    );

    const owner = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock,
      onRefreshEditLock: ownerRefresh,
      onReleaseEditLock
    });

    await waitFor(() => {
      expect(owner.editorReady[0]).toBeDefined();
    });
    fireEvent.pointerDown(owner.container.querySelector(".ProseMirror")!, {
      clientX: 20,
      clientY: 12
    });
    await waitFor(() => {
      expect(owner.container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");
    });

    const duplicate = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock,
      onRefreshEditLock: duplicateRefresh,
      onReleaseEditLock
    });

    await waitFor(() => {
      expect(duplicate.editorReady[0]).toBeDefined();
      expect(duplicateRefresh).toHaveBeenCalledWith({
        pageSysId: "page-001"
      });
    });

    expect(duplicateRefresh).not.toHaveBeenCalledWith({
      lockToken: RESUME_TOKEN,
      pageSysId: "page-001"
    });
    expect(await screen.findByText("This page is already being edited in another tab or window for your account.")).toBeInTheDocument();
    expect(duplicate.container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  });

  it("preserves formatted HTML on the first paste after acquisition", async () => {
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock: vi.fn(async () => ({
        heartbeatIntervalMs: 30000,
        lockToken: "held-lock-token",
        staleAfterMs: 180000,
        state: "held" as const
      })),
      onHeartbeatEditLock: vi.fn(async () => ({
        heartbeatIntervalMs: 30000,
        lockToken: "held-lock-token",
        staleAfterMs: 180000,
        state: "held" as const
      })),
      onRefreshEditLock: vi.fn(async () => ({
        state: "unlocked" as const
      })),
      onReleaseEditLock: vi.fn(async () => ({
        state: "released" as const
      }))
    });

    await waitFor(() => expect(editorReady[0]).toBeDefined());

    fireEvent.paste(container.querySelector(".ProseMirror")!, {
      clipboardData: createClipboardData(
        "<h2>Overview</h2><p><strong>Bold</strong> <a href=\"https://example.com/docs\">link</a></p>",
        "Overview\nBold link"
      )
    } as never);

    await waitFor(() => {
      expect(editorReady[0].getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Overview" }]
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Bold", marks: [{ type: "bold" }] },
              { type: "text", text: " " },
              {
                type: "text",
                text: "link",
                marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }]
              }
            ]
          }
        ]
      });
    });
  });

  it("preserves plain text and trailing line structure on the first paste after acquisition", async () => {
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock: vi.fn(async () => ({
        heartbeatIntervalMs: 30000,
        lockToken: "held-lock-token",
        staleAfterMs: 180000,
        state: "held" as const
      })),
      onHeartbeatEditLock: vi.fn(async () => ({
        heartbeatIntervalMs: 30000,
        lockToken: "held-lock-token",
        staleAfterMs: 180000,
        state: "held" as const
      })),
      onRefreshEditLock: vi.fn(async () => ({
        state: "unlocked" as const
      })),
      onReleaseEditLock: vi.fn(async () => ({
        state: "released" as const
      }))
    });

    await waitFor(() => expect(editorReady[0]).toBeDefined());

    fireEvent.paste(container.querySelector(".ProseMirror")!, {
      clipboardData: createClipboardData("", "First line\nhttps://example.com/docs\n")
    } as never);

    await waitFor(() => {
      expect(editorReady[0].getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First line" }]
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "https://example.com/docs",
                marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }]
              }
            ]
          },
          {
            type: "paragraph"
          }
        ]
      });
    });
  });

  it("sanitizes unsafe HTML on the first paste after acquisition", async () => {
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock: vi.fn(async () => ({
        heartbeatIntervalMs: 30000,
        lockToken: "held-lock-token",
        staleAfterMs: 180000,
        state: "held" as const
      })),
      onHeartbeatEditLock: vi.fn(async () => ({
        heartbeatIntervalMs: 30000,
        lockToken: "held-lock-token",
        staleAfterMs: 180000,
        state: "held" as const
      })),
      onRefreshEditLock: vi.fn(async () => ({
        state: "unlocked" as const
      })),
      onReleaseEditLock: vi.fn(async () => ({
        state: "released" as const
      }))
    });

    await waitFor(() => expect(editorReady[0]).toBeDefined());

    fireEvent.paste(container.querySelector(".ProseMirror")!, {
      clipboardData: createClipboardData("<p><a href=\"javascript:alert(1)\">Unsafe</a></p><script>alert(1)</script>", "Unsafe")
    } as never);

    await waitFor(() => {
      expect(editorReady[0].getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Unsafe" }]
          }
        ]
      });
    });
  });

  it("does not mutate content when first-paste acquisition is denied", async () => {
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock: vi.fn(async () => ({
        holderDisplayName: "Alex Editor",
        sameUserDifferentSession: true,
        state: "locked" as const
      })),
      onHeartbeatEditLock: vi.fn(),
      onRefreshEditLock: vi.fn(async () => ({
        state: "unlocked" as const
      })),
      onReleaseEditLock: vi.fn(async () => ({
        state: "released" as const
      }))
    });

    await waitFor(() => expect(editorReady[0]).toBeDefined());

    fireEvent.paste(container.querySelector(".ProseMirror")!, {
      clipboardData: createClipboardData("<p>Denied</p>", "Denied")
    } as never);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");
    });
    expect(editorReady[0].getJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("replays the first paste exactly once after acquisition succeeds", async () => {
    const onAcquireEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 30000,
      lockToken: "held-lock-token",
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock: vi.fn(async () => ({
        heartbeatIntervalMs: 30000,
        lockToken: "held-lock-token",
        staleAfterMs: 180000,
        state: "held" as const
      })),
      onRefreshEditLock: vi.fn(async () => ({
        state: "unlocked" as const
      })),
      onReleaseEditLock: vi.fn(async () => ({
        state: "released" as const
      }))
    });

    await waitFor(() => expect(editorReady[0]).toBeDefined());

    fireEvent.paste(container.querySelector(".ProseMirror")!, {
      clipboardData: createClipboardData("", "Single paste")
    } as never);

    await waitFor(() => {
      expect(editorReady[0].getText()).toBe("Single paste");
    });
    expect(onAcquireEditLock).toHaveBeenCalledTimes(1);
    expect(editorReady[0].getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Single paste" }]
        }
      ]
    });
  });

  it("transitions to lock-lost read-only state after a lock-aware save rejection and keeps local text visible", async () => {
    const onAcquireEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 30000,
      lockToken: "held-lock-token",
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const onHeartbeatEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 30000,
      lockToken: "held-lock-token",
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const onRefreshEditLock = vi.fn(async () => ({
      state: "unlocked" as const
    }));
    const onReleaseEditLock = vi.fn(async () => ({
      state: "released" as const
    }));
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      code: "lock_lost",
      errorMessage: "This edit session ended and unsaved changes were not saved.",
      retryable: false,
      state: "failed"
    }));
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock,
      onRefreshEditLock,
      onReleaseEditLock,
      onSaveDraft
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    fireEvent.pointerDown(container.querySelector(".ProseMirror")!, {
      clientX: 18,
      clientY: 16
    });
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");
    });

    await setParagraphText(editorReady[0], "Unsaved lock draft");
    await runAutosave();

    expect(await screen.findByRole("alert")).toHaveTextContent("This edit session ended and unsaved changes were not saved.");
    expect(screen.getByText("Unsaved lock draft")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  });

  it("stops heartbeat renewal and becomes read-only when a held session loses edit access", async () => {
    const onAcquireEditLock = vi.fn(async () => ({
      heartbeatIntervalMs: 1,
      lockToken: "held-lock-token",
      staleAfterMs: 180000,
      state: "held" as const
    }));
    const onHeartbeatEditLock = vi.fn(async () => ({
      code: "forbidden" as const,
      errorMessage: "You do not have permission to edit pages in this workspace.",
      retryable: false,
      state: "failed" as const
    }));
    const { container, editorReady } = renderRuntime({
      onAcquireEditLock,
      onHeartbeatEditLock,
      onRefreshEditLock: vi.fn(async () => ({
        state: "unlocked" as const
      })),
      onReleaseEditLock: vi.fn(async () => ({
        state: "released" as const
      }))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    fireEvent.pointerDown(container.querySelector(".ProseMirror")!, {
      clientX: 18,
      clientY: 16
    });
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");
    });

    await waitFor(() => {
      expect(onHeartbeatEditLock).toHaveBeenCalledWith({
        lockToken: "held-lock-token",
        pageSysId: "page-001"
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit pages in this workspace.");
    expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  });
});

