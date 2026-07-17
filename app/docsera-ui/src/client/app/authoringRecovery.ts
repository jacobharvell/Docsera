import type { DocseraDocumentEnvelope } from "../../shared/editor/document";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRevision(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeGeneration(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export type AuthoringRecoveryReason = "contention" | "forbidden";

export type WorkspaceRecoveryIdentity = {
  workspaceSysId: string;
  workspaceSlug: string;
};

export type BodyRecoveryIdentity = WorkspaceRecoveryIdentity & {
  pageSysId: string;
};

export type BodyRecoverySnapshot = BodyRecoveryIdentity & {
  captureGeneration: number;
  editorSessionGeneration: number;
  envelope: DocseraDocumentEnvelope;
  expectedRevision: number;
  failureMessage: string;
  inputKind: "body";
};

export type PageSettingsRecoverySnapshot = BodyRecoveryIdentity & {
  activeField: "title" | "slug" | "";
  captureGeneration: number;
  generalError: string;
  inputKind: "page_settings";
  slug: string;
  slugError: string;
  slugSnapshot: string;
  title: string;
  titleError: string;
  titleSnapshot: string;
};

export type InlineCreateRecoverySnapshot = WorkspaceRecoveryIdentity & {
  captureGeneration: number;
  focusToken: number;
  inputKind: "inline_create";
  parentPageSysId: string;
  title: string;
};

export type WorkspaceRecoveryClearResult = {
  bodySnapshots: BodyRecoverySnapshot[];
  inlineCreateSnapshot: InlineCreateRecoverySnapshot | null;
  pageSettingsSnapshots: PageSettingsRecoverySnapshot[];
};

function createBodyKey(identity: BodyRecoveryIdentity): string {
  return `${cleanText(identity.workspaceSysId)}::${cleanText(identity.workspaceSlug)}::${cleanText(identity.pageSysId)}`;
}

function createWorkspaceKey(identity: WorkspaceRecoveryIdentity): string {
  return `${cleanText(identity.workspaceSysId)}::${cleanText(identity.workspaceSlug)}`;
}

function normalizeBodyIdentity(identity: BodyRecoveryIdentity): BodyRecoveryIdentity {
  return {
    pageSysId: cleanText(identity.pageSysId),
    workspaceSlug: cleanText(identity.workspaceSlug),
    workspaceSysId: cleanText(identity.workspaceSysId)
  };
}

function normalizeWorkspaceIdentity(identity: WorkspaceRecoveryIdentity): WorkspaceRecoveryIdentity {
  return {
    workspaceSlug: cleanText(identity.workspaceSlug),
    workspaceSysId: cleanText(identity.workspaceSysId)
  };
}

export class AuthoringRecoveryStore {
  private bodySnapshots = new Map<string, BodyRecoverySnapshot>();

  private inlineSnapshots = new Map<string, InlineCreateRecoverySnapshot>();

  private pageSettingsSnapshots = new Map<string, PageSettingsRecoverySnapshot>();

  captureBody(input: Omit<BodyRecoverySnapshot, "captureGeneration" | "inputKind"> & { captureGeneration: number }): BodyRecoverySnapshot {
    const identity = normalizeBodyIdentity(input);
    const snapshot: BodyRecoverySnapshot = {
      ...identity,
      captureGeneration: normalizeGeneration(input.captureGeneration),
      editorSessionGeneration: normalizeGeneration(input.editorSessionGeneration),
      envelope: structuredClone(input.envelope),
      expectedRevision: normalizeRevision(input.expectedRevision),
      failureMessage: cleanText(input.failureMessage),
      inputKind: "body"
    };
    this.bodySnapshots.set(createBodyKey(snapshot), snapshot);
    return snapshot;
  }

  readBody(identity: BodyRecoveryIdentity): BodyRecoverySnapshot | null {
    return this.bodySnapshots.get(createBodyKey(normalizeBodyIdentity(identity))) ?? null;
  }

  listBodySnapshots(identity: WorkspaceRecoveryIdentity): BodyRecoverySnapshot[] {
    const workspaceIdentity = normalizeWorkspaceIdentity(identity);
    return [...this.bodySnapshots.values()].filter(
      (snapshot) =>
        snapshot.workspaceSysId === workspaceIdentity.workspaceSysId &&
        snapshot.workspaceSlug === workspaceIdentity.workspaceSlug
    );
  }

  clearBody(identity: BodyRecoveryIdentity, captureGeneration?: number): boolean {
    const key = createBodyKey(normalizeBodyIdentity(identity));
    const existing = this.bodySnapshots.get(key);
    if (!existing) {
      return false;
    }
    if (captureGeneration !== undefined && existing.captureGeneration !== normalizeGeneration(captureGeneration)) {
      return false;
    }
    this.bodySnapshots.delete(key);
    return true;
  }

  capturePageSettings(
    input: Omit<PageSettingsRecoverySnapshot, "captureGeneration" | "inputKind"> & { captureGeneration: number }
  ): PageSettingsRecoverySnapshot {
    const identity = normalizeBodyIdentity(input);
    const snapshot: PageSettingsRecoverySnapshot = {
      ...identity,
      activeField: input.activeField === "title" || input.activeField === "slug" ? input.activeField : "",
      captureGeneration: normalizeGeneration(input.captureGeneration),
      generalError: cleanText(input.generalError),
      inputKind: "page_settings",
      slug: cleanText(input.slug),
      slugError: cleanText(input.slugError),
      slugSnapshot: cleanText(input.slugSnapshot),
      title: cleanText(input.title),
      titleError: cleanText(input.titleError),
      titleSnapshot: cleanText(input.titleSnapshot)
    };
    this.pageSettingsSnapshots.set(createBodyKey(snapshot), snapshot);
    return snapshot;
  }

  readPageSettings(identity: BodyRecoveryIdentity): PageSettingsRecoverySnapshot | null {
    return this.pageSettingsSnapshots.get(createBodyKey(normalizeBodyIdentity(identity))) ?? null;
  }

  listPageSettingsSnapshots(identity: WorkspaceRecoveryIdentity): PageSettingsRecoverySnapshot[] {
    const workspaceIdentity = normalizeWorkspaceIdentity(identity);
    return [...this.pageSettingsSnapshots.values()].filter(
      (snapshot) =>
        snapshot.workspaceSysId === workspaceIdentity.workspaceSysId &&
        snapshot.workspaceSlug === workspaceIdentity.workspaceSlug
    );
  }

  clearPageSettings(identity: BodyRecoveryIdentity, captureGeneration?: number): boolean {
    const key = createBodyKey(normalizeBodyIdentity(identity));
    const existing = this.pageSettingsSnapshots.get(key);
    if (!existing) {
      return false;
    }
    if (captureGeneration !== undefined && existing.captureGeneration !== normalizeGeneration(captureGeneration)) {
      return false;
    }
    this.pageSettingsSnapshots.delete(key);
    return true;
  }

  captureInlineCreate(
    input: Omit<InlineCreateRecoverySnapshot, "captureGeneration" | "inputKind"> & { captureGeneration: number }
  ): InlineCreateRecoverySnapshot {
    const identity = normalizeWorkspaceIdentity(input);
    const snapshot: InlineCreateRecoverySnapshot = {
      ...identity,
      captureGeneration: normalizeGeneration(input.captureGeneration),
      focusToken: normalizeGeneration(input.focusToken),
      inputKind: "inline_create",
      parentPageSysId: cleanText(input.parentPageSysId),
      title: cleanText(input.title)
    };
    this.inlineSnapshots.set(createWorkspaceKey(snapshot), snapshot);
    return snapshot;
  }

  readInlineCreate(identity: WorkspaceRecoveryIdentity): InlineCreateRecoverySnapshot | null {
    return this.inlineSnapshots.get(createWorkspaceKey(normalizeWorkspaceIdentity(identity))) ?? null;
  }

  clearInlineCreate(identity: WorkspaceRecoveryIdentity, captureGeneration?: number): boolean {
    const key = createWorkspaceKey(normalizeWorkspaceIdentity(identity));
    const existing = this.inlineSnapshots.get(key);
    if (!existing) {
      return false;
    }
    if (captureGeneration !== undefined && existing.captureGeneration !== normalizeGeneration(captureGeneration)) {
      return false;
    }
    this.inlineSnapshots.delete(key);
    return true;
  }

  clearWorkspace(identity: WorkspaceRecoveryIdentity): WorkspaceRecoveryClearResult {
    const workspaceIdentity = normalizeWorkspaceIdentity(identity);
    const bodySnapshots = this.listBodySnapshots(workspaceIdentity);
    const pageSettingsSnapshots = this.listPageSettingsSnapshots(workspaceIdentity);
    const inlineCreateSnapshot = this.readInlineCreate(workspaceIdentity);

    for (const snapshot of bodySnapshots) {
      this.bodySnapshots.delete(createBodyKey(snapshot));
    }

    for (const snapshot of pageSettingsSnapshots) {
      this.pageSettingsSnapshots.delete(createBodyKey(snapshot));
    }

    if (inlineCreateSnapshot) {
      this.inlineSnapshots.delete(createWorkspaceKey(inlineCreateSnapshot));
    }

    return {
      bodySnapshots,
      inlineCreateSnapshot,
      pageSettingsSnapshots
    };
  }
}
