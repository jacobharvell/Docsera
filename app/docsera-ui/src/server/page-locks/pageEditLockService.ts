import type { PageRecord } from "../pages/serverPageDomain.ts";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import {
  buildPageEditLockCurrentHolder,
  buildPageEditLockPageKey,
  buildPageLockLostMessage,
  buildPageLockedMessage,
  cleanText,
  DOCSERA_PAGE_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
  DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS,
  type PageEditLockRecord,
  type PageEditLockResult
} from "./serverPageEditLockDomain.ts";

type WorkspaceCapability = {
  canAdminWorkspace: boolean;
  canEditWorkspace: boolean;
  canManageWorkspaceMembers: boolean;
  canViewWorkspace: boolean;
};

type PageEditLockReference = {
  lockToken?: string;
  pageSlug?: string;
  pageSysId?: string;
  workspaceSlug?: string;
  workspaceSysId?: string;
};

type CurrentUser = {
  displayName: string | null;
  sysId: string;
};

type PageEditLockDependencies = {
  createToken: () => string;
  currentTimestamp: () => string;
  digestToken: (token: string) => string;
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => WorkspaceCapability;
  getCurrentUser: () => CurrentUser;
  isLockExpired: (input: {
    currentTimestamp: string;
    lastSeenAt: string;
    staleAfterMs: number;
  }) => boolean;
  insertLock: (lock: PageEditLockRecord) => Awaitable<"created" | "conflict">;
  listWorkspacePages: (workspaceSysId: string) => Awaitable<PageRecord[]>;
  loadLockByPageKey: (pageKey: string) => Awaitable<PageEditLockRecord | null>;
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  loadWorkspaceBySysId: (workspaceSysId: string) => Awaitable<WorkspaceRecord | null>;
  releaseExactLock: (input: {
    staleCutoffTimestamp: string;
    lockSysId: string;
    pageKey: string;
    holderUserSysId: string;
    verifierDigest: string;
  }) => Awaitable<boolean>;
  touchExactLock: (input: {
    lastSeenAt: string;
    lockSysId: string;
    pageKey: string;
    holderUserSysId: string;
    staleCutoffTimestamp: string;
    verifierDigest: string;
  }) => Awaitable<PageEditLockRecord | null>;
};

type Awaitable<T> = Promise<T> | T;

type ResolvedPageContext =
  | {
      capability: WorkspaceCapability;
      currentUser: CurrentUser;
      page: PageRecord;
      pageKey: string;
      workspace: WorkspaceRecord;
    }
  | {
      currentUser: CurrentUser;
      errorMessage: string;
      kind: "failed";
      status: 400 | 403 | 404;
    };

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findPageByReference(pages: PageRecord[], reference: PageEditLockReference): PageRecord | null {
  const pageSysId = cleanText(reference.pageSysId);
  const pageSlug = cleanText(reference.pageSlug).toLowerCase();

  if (pageSysId) {
    const page = pages.find((candidate) => cleanText(candidate.sysId) === pageSysId) ?? null;
    if (!page) {
      return null;
    }

    if (pageSlug && cleanText(page.draftSlugNormalized || page.draftSlug).toLowerCase() !== pageSlug) {
      return null;
    }

    return page;
  }

  if (!pageSlug) {
    return null;
  }

  return (
    pages.find((candidate) => cleanText(candidate.draftSlugNormalized || candidate.draftSlug).toLowerCase() === pageSlug) ??
    null
  );
}

function isEditableWorkspace(capability: WorkspaceCapability): boolean {
  return Boolean(capability.canEditWorkspace || capability.canAdminWorkspace);
}

function matchesExactHeldLock(lock: PageEditLockRecord | null, currentUserSysId: string, verifierDigest: string): boolean {
  if (!lock) {
    return false;
  }

  return (
    cleanText(lock.holderUserSysId) === cleanText(currentUserSysId) &&
    cleanText(lock.verifierDigest) === cleanText(verifierDigest)
  );
}

function buildStaleCutoffTimestamp(currentTimestamp: string, staleAfterMs: number): string {
  const normalizedTimestamp = cleanText(currentTimestamp);
  if (!normalizedTimestamp) {
    return "";
  }

  const parsedTimestamp = new Date(`${normalizedTimestamp.replace(" ", "T")}Z`);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return "";
  }

  const cutoff = new Date(parsedTimestamp.getTime() - Math.max(0, staleAfterMs));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${cutoff.getUTCFullYear()}-${pad(cutoff.getUTCMonth() + 1)}-${pad(cutoff.getUTCDate())} ${pad(cutoff.getUTCHours())}:${pad(cutoff.getUTCMinutes())}:${pad(cutoff.getUTCSeconds())}`;
}

function isExpiredLock(
  dependencies: Pick<PageEditLockDependencies, "isLockExpired">,
  lock: PageEditLockRecord | null,
  currentTimestamp: string
): boolean {
  if (!lock) {
    return false;
  }

  return dependencies.isLockExpired({
    currentTimestamp,
    lastSeenAt: cleanText(lock.lastSeenAt),
    staleAfterMs: DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS
  });
}

async function resolvePageContext(
  dependencies: PageEditLockDependencies,
  input: PageEditLockReference
): Promise<ResolvedPageContext> {
  const currentUser = dependencies.getCurrentUser();
  if (!cleanText(currentUser.sysId)) {
    return {
      currentUser,
      errorMessage: "You do not have permission to edit pages in this workspace.",
      kind: "failed",
      status: 403
    };
  }

  const workspaceSlug = cleanText(input.workspaceSlug);
  const workspaceSysId = cleanText(input.workspaceSysId);
  const pageSysId = cleanText(input.pageSysId);
  const pageSlug = cleanText(input.pageSlug);

  if (!workspaceSlug && !workspaceSysId) {
    return {
      currentUser,
      errorMessage: "A workspace reference is required.",
      kind: "failed",
      status: 400
    };
  }

  if (!pageSysId && !pageSlug) {
    return {
      currentUser,
      errorMessage: "A page reference is required.",
      kind: "failed",
      status: 400
    };
  }

  const workspace =
    workspaceSysId
      ? await dependencies.loadWorkspaceBySysId(workspaceSysId)
      : workspaceSlug
        ? await dependencies.loadWorkspaceBySlug(workspaceSlug)
        : null;

  if (!workspace || !cleanText(workspace.sysId)) {
    return {
      currentUser,
      errorMessage: "Workspace could not be found.",
      kind: "failed",
      status: 404
    };
  }

  if (workspaceSlug && cleanText(workspace.slug) !== workspaceSlug) {
    return {
      currentUser,
      errorMessage: "Workspace could not be found.",
      kind: "failed",
      status: 404
    };
  }

  const pages = await dependencies.listWorkspacePages(workspace.sysId);
  const page = findPageByReference(pages, input);
  if (!page || !cleanText(page.sysId)) {
    return {
      currentUser,
      errorMessage: "Page could not be found.",
      kind: "failed",
      status: 404
    };
  }

  if (cleanText(page.workspaceSysId) !== cleanText(workspace.sysId)) {
    return {
      currentUser,
      errorMessage: "Page could not be found in this workspace.",
      kind: "failed",
      status: 400
    };
  }

  return {
    capability: dependencies.evaluateWorkspaceCapabilities(workspace),
    currentUser,
    page,
    pageKey: buildPageEditLockPageKey(page.sysId),
    workspace
  };
}

export function createPageEditLockService(dependencies: PageEditLockDependencies) {
  return {
    async acquirePageEditLock(input: PageEditLockReference): Promise<PageEditLockResult> {
      const resolved = await resolvePageContext(dependencies, input);
      if ("kind" in resolved) {
        return {
          kind: "failed",
          errorMessage: resolved.errorMessage,
          retryable: false,
          status: resolved.status
        };
      }

      if (!isEditableWorkspace(resolved.capability)) {
        return {
          kind: "failed",
          errorMessage: "You do not have permission to edit pages in this workspace.",
          retryable: false,
          status: 403
        };
      }

      const currentLock = await dependencies.loadLockByPageKey(resolved.pageKey);
      const currentTimestamp = dependencies.currentTimestamp();
      const suppliedToken = cleanText(input.lockToken);
      const suppliedDigest = suppliedToken ? dependencies.digestToken(suppliedToken) : "";

      if (
        suppliedDigest &&
        matchesExactHeldLock(currentLock, resolved.currentUser.sysId, suppliedDigest) &&
        !isExpiredLock(dependencies, currentLock, currentTimestamp)
      ) {
        return {
          kind: "held",
          lockToken: suppliedToken,
          heartbeatIntervalMs: DOCSERA_PAGE_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
          staleAfterMs: DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS
        };
      }

      if (currentLock) {
        return {
          kind: "locked",
          currentHolder: buildPageEditLockCurrentHolder(currentLock, resolved.currentUser.sysId) ?? {
            displayName: null,
            sameUserDifferentSession: false
          }
        };
      }

      const lockToken = dependencies.createToken();
      const verifierDigest = dependencies.digestToken(lockToken);
      const timestamp = dependencies.currentTimestamp();
      const created = await dependencies.insertLock({
        acquiredAt: timestamp,
        holderDisplayName: resolved.currentUser.displayName,
        holderUserSysId: resolved.currentUser.sysId,
        lastSeenAt: timestamp,
        pageKey: resolved.pageKey,
        pageSysId: cleanText(resolved.page.sysId),
        verifierDigest,
        workspaceSysId: cleanText(resolved.workspace.sysId)
      });

      if (created === "created") {
        return {
          kind: "held",
          lockToken,
          heartbeatIntervalMs: DOCSERA_PAGE_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
          staleAfterMs: DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS
        };
      }

      const winner = await dependencies.loadLockByPageKey(resolved.pageKey);
      if (!winner) {
        return {
          kind: "failed",
          errorMessage: "Something went wrong while starting the edit session. Please try again.",
          retryable: true,
          status: 500
        };
      }

      return {
        kind: "locked",
        currentHolder: buildPageEditLockCurrentHolder(winner, resolved.currentUser.sysId) ?? {
          displayName: null,
          sameUserDifferentSession: false
        }
      };
    },

    async getPageEditLockStatus(input: PageEditLockReference): Promise<PageEditLockResult> {
      const resolved = await resolvePageContext(dependencies, input);
      if ("kind" in resolved) {
        return {
          kind: "failed",
          errorMessage: resolved.errorMessage,
          retryable: false,
          status: resolved.status
        };
      }

      const currentLock = await dependencies.loadLockByPageKey(resolved.pageKey);
      const currentTimestamp = dependencies.currentTimestamp();
      const suppliedToken = cleanText(input.lockToken);
      const suppliedDigest = suppliedToken ? dependencies.digestToken(suppliedToken) : "";

      if (!isEditableWorkspace(resolved.capability)) {
        return {
          kind: "failed",
          errorMessage: "You do not have permission to edit pages in this workspace.",
          retryable: false,
          status: 403
        };
      }

      if (
        suppliedDigest &&
        matchesExactHeldLock(currentLock, resolved.currentUser.sysId, suppliedDigest) &&
        !isExpiredLock(dependencies, currentLock, currentTimestamp)
      ) {
        return {
          kind: "held",
          lockToken: suppliedToken,
          heartbeatIntervalMs: DOCSERA_PAGE_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
          staleAfterMs: DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS
        };
      }

      if (
        suppliedDigest &&
        matchesExactHeldLock(currentLock, resolved.currentUser.sysId, suppliedDigest) &&
        isExpiredLock(dependencies, currentLock, currentTimestamp)
      ) {
        return {
          kind: "lost",
          currentHolder: null,
          errorMessage: "This edit session ended and unsaved changes were not saved."
        };
      }

      if (!currentLock) {
        return { kind: "unlocked" };
      }

      return {
        kind: "locked",
        currentHolder: buildPageEditLockCurrentHolder(currentLock, resolved.currentUser.sysId) ?? {
          displayName: null,
          sameUserDifferentSession: false
        }
      };
    },

    async touchPageEditLock(input: PageEditLockReference): Promise<PageEditLockResult> {
      const suppliedToken = cleanText(input.lockToken);
      if (!suppliedToken) {
        return {
          kind: "failed",
          errorMessage: "A page edit lock token is required.",
          retryable: false,
          status: 400
        };
      }

      const resolved = await resolvePageContext(dependencies, input);
      if ("kind" in resolved) {
        return {
          kind: "failed",
          errorMessage: resolved.errorMessage,
          retryable: false,
          status: resolved.status
        };
      }

      const verifierDigest = dependencies.digestToken(suppliedToken);
      const currentTimestamp = dependencies.currentTimestamp();
      const currentLock = await dependencies.loadLockByPageKey(resolved.pageKey);
      if (!matchesExactHeldLock(currentLock, resolved.currentUser.sysId, verifierDigest)) {
        const currentHolder = buildPageEditLockCurrentHolder(currentLock, resolved.currentUser.sysId);
        return {
          kind: "lost",
          currentHolder,
          errorMessage: buildPageLockLostMessage(currentHolder)
        };
      }

      if (isExpiredLock(dependencies, currentLock, currentTimestamp)) {
        return {
          kind: "lost",
          currentHolder: null,
          errorMessage: "This edit session ended and unsaved changes were not saved."
        };
      }

      if (!isEditableWorkspace(resolved.capability)) {
        return {
          kind: "failed",
          errorMessage: "You do not have permission to edit pages in this workspace.",
          retryable: false,
          status: 403
        };
      }

      const touchedLock = await dependencies.touchExactLock({
        lastSeenAt: currentTimestamp,
        lockSysId: cleanText(currentLock.sysId),
        pageKey: resolved.pageKey,
        holderUserSysId: resolved.currentUser.sysId,
        staleCutoffTimestamp: buildStaleCutoffTimestamp(currentTimestamp, DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS),
        verifierDigest
      });

      if (!touchedLock) {
        const replacementLock = await dependencies.loadLockByPageKey(resolved.pageKey);
        const currentHolder = buildPageEditLockCurrentHolder(replacementLock, resolved.currentUser.sysId);
        return {
          kind: "lost",
          currentHolder,
          errorMessage: buildPageLockLostMessage(currentHolder)
        };
      }

      return {
        kind: "held",
        lockToken: suppliedToken,
        heartbeatIntervalMs: DOCSERA_PAGE_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
        staleAfterMs: DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS
      };
    },

    async releasePageEditLock(input: PageEditLockReference): Promise<PageEditLockResult> {
      const suppliedToken = cleanText(input.lockToken);
      if (!suppliedToken) {
        return {
          kind: "failed",
          errorMessage: "A page edit lock token is required.",
          retryable: false,
          status: 400
        };
      }

      const resolved = await resolvePageContext(dependencies, input);
      if ("kind" in resolved) {
        return {
          kind: "failed",
          errorMessage: resolved.errorMessage,
          retryable: false,
          status: resolved.status
        };
      }

      const verifierDigest = dependencies.digestToken(suppliedToken);
      const currentTimestamp = dependencies.currentTimestamp();
      const currentLock = await dependencies.loadLockByPageKey(resolved.pageKey);
      if (!matchesExactHeldLock(currentLock, resolved.currentUser.sysId, verifierDigest)) {
        const currentHolder = buildPageEditLockCurrentHolder(currentLock, resolved.currentUser.sysId);
        return {
          kind: "lost",
          currentHolder,
          errorMessage: buildPageLockLostMessage(currentHolder)
        };
      }

      if (isExpiredLock(dependencies, currentLock, currentTimestamp)) {
        return {
          kind: "lost",
          currentHolder: null,
          errorMessage: "This edit session ended and unsaved changes were not saved."
        };
      }

      const released = await dependencies.releaseExactLock({
        lockSysId: cleanText(currentLock.sysId),
        pageKey: resolved.pageKey,
        holderUserSysId: resolved.currentUser.sysId,
        staleCutoffTimestamp: buildStaleCutoffTimestamp(currentTimestamp, DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS),
        verifierDigest
      });

      if (!released) {
        const replacementLock = await dependencies.loadLockByPageKey(resolved.pageKey);
        const currentHolder = buildPageEditLockCurrentHolder(replacementLock, resolved.currentUser.sysId);
        return {
          kind: "lost",
          currentHolder,
          errorMessage: buildPageLockLostMessage(currentHolder)
        };
      }

      return {
        kind: "released"
      };
    },

    buildLockedMessage(result: Extract<PageEditLockResult, { kind: "locked" }>): string {
      return buildPageLockedMessage(result.currentHolder);
    }
  };
}
