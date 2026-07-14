import { describe, expect, it, vi } from "vitest";
import { createEmptyServerDocumentEnvelope } from "../pages/serverEditorDocument.ts";
import type { PageRecord } from "../pages/serverPageDomain.ts";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { createPageEditLockService } from "./pageEditLockService.ts";
import type { PageEditLockRecord } from "./serverPageEditLockDomain.ts";

function createWorkspace(): WorkspaceRecord {
  return {
    adminGroupSysId: "group-admin",
    creatorUserSysId: "user-001",
    editorGroupSysId: "group-editor",
    icon: {
      key: "docsera-workspace",
      label: "Docsera workspace icon",
      type: "builtin"
    },
    layout: {
      pageWidth: "readable",
      tocVisibleByDefault: true
    },
    name: "Product Docs",
    shortDescription: "Workspace",
    slug: "product-docs",
    status: "active",
    sysId: "workspace-001"
  };
}

function createPage(): PageRecord {
  return {
    active: true,
    draftBodyText: null,
    draftContentJson: createEmptyServerDocumentEnvelope(),
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftTitle: "Overview",
    parentPageSysId: null,
    publicationState: "draft",
    publishedBodyText: null,
    publishedContentJson: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedTitle: null,
    siblingOrder: 1,
    sysId: "page-001",
    workspaceSysId: "workspace-001"
  };
}

function createLock(
  overrides: Partial<PageEditLockRecord> = {}
): PageEditLockRecord {
  return {
    acquiredAt: "2026-07-13 10:00:00",
    holderDisplayName: "Alex Editor",
    holderUserSysId: "user-001",
    lastSeenAt: "2026-07-13 10:00:00",
    pageKey: "page-001",
    pageSysId: "page-001",
    sysId: "lock-001",
    verifierDigest: "digest:resume-token",
    workspaceSysId: "workspace-001",
    ...overrides
  };
}

function createServiceHarness(overrides: {
  currentLock?: PageEditLockRecord | null;
  currentUser?: { displayName: string | null; sysId: string };
  evaluateWorkspaceCapabilities?: () => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canManageWorkspaceMembers: boolean;
    canViewWorkspace: boolean;
  };
  insertLock?: (lock: PageEditLockRecord) => "conflict" | "created";
  loadLockByPageKey?: () => PageEditLockRecord | null;
  releaseExactLock?: (input: {
    holderUserSysId: string;
    lockSysId: string;
    pageKey: string;
    staleCutoffTimestamp: string;
    verifierDigest: string;
  }) => boolean;
  touchExactLock?: (input: {
    holderUserSysId: string;
    lastSeenAt: string;
    lockSysId: string;
    pageKey: string;
    staleCutoffTimestamp: string;
    verifierDigest: string;
  }) => PageEditLockRecord | null;
} = {}) {
  const workspace = createWorkspace();
  const page = createPage();
  const state = {
    currentLock: overrides.currentLock ?? null,
    currentUser: overrides.currentUser ?? {
      displayName: "Alex Editor",
      sysId: "user-001"
    }
  };
  const insertLock = vi.fn((lock: PageEditLockRecord) => {
    if (overrides.insertLock) {
      return overrides.insertLock(lock);
    }

    if (state.currentLock) {
      return "conflict" as const;
    }

    state.currentLock = {
      ...lock,
      sysId: "lock-001"
    };
    return "created" as const;
  });
  const service = createPageEditLockService({
    createToken: () => "server-token-001",
    currentTimestamp: () => "2026-07-13 10:00:00",
    digestToken: (token: string) => `digest:${token}`,
    evaluateWorkspaceCapabilities:
      overrides.evaluateWorkspaceCapabilities ??
      (() => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      })),
    getCurrentUser: () => state.currentUser,
    isLockExpired: ({ currentTimestamp, lastSeenAt, staleAfterMs }) => {
      const normalize = (value: string) => new Date(`${value.replace(" ", "T")}Z`).getTime();
      return normalize(lastSeenAt) < normalize(currentTimestamp) - staleAfterMs;
    },
    insertLock,
    listWorkspacePages: async () => [page],
    loadLockByPageKey: async () => (overrides.loadLockByPageKey ? overrides.loadLockByPageKey() : state.currentLock),
    loadWorkspaceBySlug: async (workspaceSlug: string) => (workspaceSlug === workspace.slug ? workspace : null),
    loadWorkspaceBySysId: async (workspaceSysId: string) => (workspaceSysId === workspace.sysId ? workspace : null),
    releaseExactLock: async (input) => {
      if (overrides.releaseExactLock) {
        return overrides.releaseExactLock(input);
      }

      if (
        state.currentLock &&
        state.currentLock.sysId === input.lockSysId &&
        state.currentLock.pageKey === input.pageKey &&
        state.currentLock.holderUserSysId === input.holderUserSysId &&
        state.currentLock.verifierDigest === input.verifierDigest
      ) {
        state.currentLock = null;
        return true;
      }

      return false;
    },
    touchExactLock: async (input) => {
      if (overrides.touchExactLock) {
        return overrides.touchExactLock(input);
      }

      if (
        state.currentLock &&
        state.currentLock.sysId === input.lockSysId &&
        state.currentLock.pageKey === input.pageKey &&
        state.currentLock.holderUserSysId === input.holderUserSysId &&
        state.currentLock.verifierDigest === input.verifierDigest
      ) {
        state.currentLock = {
          ...state.currentLock,
          lastSeenAt: input.lastSeenAt
        };
        return state.currentLock;
      }

      return null;
    }
  });

  return {
    insertLock,
    page,
    service,
    state,
    workspace
  };
}

describe("page edit lock service", () => {
  it("cold-acquires one lock record and returns the opaque token", async () => {
    const harness = createServiceHarness();

    const result = await harness.service.acquirePageEditLock({
      pageSysId: harness.page.sysId,
      workspaceSlug: harness.workspace.slug
    });

    expect(result).toEqual({
      heartbeatIntervalMs: 30000,
      kind: "held",
      lockToken: "server-token-001",
      staleAfterMs: 180000
    });
    expect(harness.insertLock).toHaveBeenCalledTimes(1);
    expect(harness.state.currentLock).toMatchObject({
      holderUserSysId: "user-001",
      pageKey: "page-001",
      verifierDigest: "digest:server-token-001",
      workspaceSysId: "workspace-001"
    });
  });

  it("resumes the same held lock when the caller presents the matching token", async () => {
    const harness = createServiceHarness({
      currentLock: createLock()
    });

    const result = await harness.service.acquirePageEditLock({
      lockToken: "resume-token",
      pageSlug: "overview",
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      heartbeatIntervalMs: 30000,
      kind: "held",
      lockToken: "resume-token",
      staleAfterMs: 180000
    });
    expect(harness.insertLock).not.toHaveBeenCalled();
  });

  it("returns held status for a valid token while edit capability is still present", async () => {
    const harness = createServiceHarness({
      currentLock: createLock()
    });

    const result = await harness.service.getPageEditLockStatus({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      heartbeatIntervalMs: 30000,
      kind: "held",
      lockToken: "resume-token",
      staleAfterMs: 180000
    });
  });

  it("refuses to resume a valid token through status after edit capability is removed", async () => {
    const harness = createServiceHarness({
      currentLock: createLock(),
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      })
    });

    const result = await harness.service.getPageEditLockStatus({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      errorMessage: "You do not have permission to edit pages in this workspace.",
      kind: "failed",
      retryable: false,
      status: 403
    });
  });

  it("returns the winner details when a concurrent acquire loses the unique insert race", async () => {
    let loadCount = 0;
    const winnerLock = createLock({
      holderDisplayName: "Priya Writer",
      holderUserSysId: "user-002",
      verifierDigest: "digest:winner-token"
    });
    const harness = createServiceHarness({
      currentLock: null,
      insertLock: () => "conflict",
      loadLockByPageKey: () => {
        loadCount += 1;
        return loadCount === 1 ? null : winnerLock;
      }
    });

    const result = await harness.service.acquirePageEditLock({
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      currentHolder: {
        displayName: "Priya Writer",
        sameUserDifferentSession: false
      },
      kind: "locked"
    });
  });

  it("treats another session for the same user as lock loss with the distinct same-user message", async () => {
    const harness = createServiceHarness({
      currentLock: createLock({
        holderDisplayName: "Alex Editor",
        holderUserSysId: "user-001",
        verifierDigest: "digest:newer-token"
      })
    });

    const result = await harness.service.touchPageEditLock({
      lockToken: "stale-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      currentHolder: {
        displayName: "Alex Editor",
        sameUserDifferentSession: true
      },
      errorMessage:
        "This edit session ended because another tab or window for your account now holds the page lock. Unsaved changes were not saved.",
      kind: "lost"
    });
  });

  it("treats an expired resume token as lock loss instead of reviving it", async () => {
    const harness = createServiceHarness({
      currentLock: createLock({
        lastSeenAt: "2026-07-13 09:56:59"
      })
    });

    const result = await harness.service.getPageEditLockStatus({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      currentHolder: null,
      errorMessage: "This edit session ended and unsaved changes were not saved.",
      kind: "lost"
    });
  });

  it("treats an expired heartbeat as lock loss instead of silently renewing it", async () => {
    const touchExactLock = vi.fn();
    const harness = createServiceHarness({
      currentLock: createLock({
        lastSeenAt: "2026-07-13 09:56:59"
      }),
      touchExactLock
    });

    const result = await harness.service.touchPageEditLock({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      currentHolder: null,
      errorMessage: "This edit session ended and unsaved changes were not saved.",
      kind: "lost"
    });
    expect(touchExactLock).not.toHaveBeenCalled();
  });

  it("does not touch last-seen when edit capability is removed before heartbeat", async () => {
    const touchExactLock = vi.fn();
    const harness = createServiceHarness({
      currentLock: createLock(),
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      touchExactLock
    });

    const result = await harness.service.touchPageEditLock({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      errorMessage: "You do not have permission to edit pages in this workspace.",
      kind: "failed",
      retryable: false,
      status: 403
    });
    expect(touchExactLock).not.toHaveBeenCalled();
  });

  it("refuses to release a replaced lock when the exact delete no longer matches", async () => {
    const harness = createServiceHarness({
      currentLock: createLock({
        holderDisplayName: "Priya Writer",
        holderUserSysId: "user-002",
        verifierDigest: "digest:replacement-token"
      }),
      releaseExactLock: () => false
    });

    const result = await harness.service.releasePageEditLock({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      currentHolder: {
        displayName: "Priya Writer",
        sameUserDifferentSession: false
      },
      errorMessage:
        "This edit session ended because Priya Writer now holds the page lock. Unsaved changes were not saved.",
      kind: "lost"
    });
  });

  it("refuses to release an expired held token", async () => {
    const releaseExactLock = vi.fn(() => true);
    const harness = createServiceHarness({
      currentLock: createLock({
        lastSeenAt: "2026-07-13 09:56:59"
      }),
      releaseExactLock
    });

    const result = await harness.service.releasePageEditLock({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      currentHolder: null,
      errorMessage: "This edit session ended and unsaved changes were not saved.",
      kind: "lost"
    });
    expect(releaseExactLock).not.toHaveBeenCalled();
  });

  it("still allows exact-token release after edit capability is removed", async () => {
    const releaseExactLock = vi.fn(() => true);
    const harness = createServiceHarness({
      currentLock: createLock(),
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      releaseExactLock
    });

    const result = await harness.service.releasePageEditLock({
      lockToken: "resume-token",
      pageSysId: "page-001",
      workspaceSlug: "product-docs"
    });

    expect(result).toEqual({
      kind: "released"
    });
    expect(releaseExactLock).toHaveBeenCalledTimes(1);
  });
});
