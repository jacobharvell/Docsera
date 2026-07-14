export const DOCSERA_PAGE_EDIT_LOCK_TABLE = "x_82900_docsera_page_edit_lock";

export const DOCSERA_PAGE_EDIT_LOCK_HEARTBEAT_INTERVAL_MS = 30_000;
export const DOCSERA_PAGE_EDIT_LOCK_STALE_AFTER_MS = 180_000;
export const DOCSERA_PAGE_EDIT_LOCK_CLEANUP_INTERVAL_MS = 60_000;

export type PageEditLockRecord = {
  acquiredAt: string;
  holderDisplayName: string | null;
  holderUserSysId: string;
  lastSeenAt: string;
  pageKey: string;
  pageSysId: string;
  sysId?: string;
  verifierDigest: string;
  workspaceSysId: string;
};

export type PageEditLockCurrentHolder = {
  displayName: string | null;
  sameUserDifferentSession: boolean;
};

export type PageEditLockResult =
  | {
      kind: "failed";
      errorMessage: string;
      retryable: boolean;
      status: 400 | 403 | 404 | 500;
    }
  | {
      heartbeatIntervalMs: number;
      kind: "held";
      lockToken: string;
      staleAfterMs: number;
    }
  | {
      currentHolder: PageEditLockCurrentHolder;
      kind: "locked";
    }
  | {
      currentHolder: PageEditLockCurrentHolder | null;
      errorMessage: string;
      kind: "lost";
    }
  | {
      kind: "released";
    }
  | {
      kind: "unlocked";
    };

export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildPageEditLockPageKey(pageSysId: string): string {
  return cleanText(pageSysId);
}

export function buildPageEditLockCurrentHolder(
  lock: Pick<PageEditLockRecord, "holderDisplayName" | "holderUserSysId"> | null,
  currentUserSysId: string
): PageEditLockCurrentHolder | null {
  if (!lock) {
    return null;
  }

  return {
    displayName: cleanText(lock.holderDisplayName) || null,
    sameUserDifferentSession: cleanText(lock.holderUserSysId) === cleanText(currentUserSysId)
  };
}

export function buildPageLockedMessage(holder: PageEditLockCurrentHolder | null): string {
  if (!holder) {
    return "This page is currently being edited in another session.";
  }

  if (holder.sameUserDifferentSession) {
    return "This page is already being edited in another tab or window for your account.";
  }

  if (holder.displayName) {
    return `This page is currently being edited by ${holder.displayName}.`;
  }

  return "This page is currently being edited by another user.";
}

export function buildPageLockLostMessage(holder: PageEditLockCurrentHolder | null): string {
  if (!holder) {
    return "This edit session ended and unsaved changes were not saved.";
  }

  if (holder.sameUserDifferentSession) {
    return "This edit session ended because another tab or window for your account now holds the page lock. Unsaved changes were not saved.";
  }

  if (holder.displayName) {
    return `This edit session ended because ${holder.displayName} now holds the page lock. Unsaved changes were not saved.`;
  }

  return "This edit session ended because another user now holds the page lock. Unsaved changes were not saved.";
}
