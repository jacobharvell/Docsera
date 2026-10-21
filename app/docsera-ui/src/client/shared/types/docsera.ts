import type { DocseraDocumentEnvelope, DocseraTiptapDocument } from "../../../shared/editor/document";

export type DocseraRuntimeConfig = {
  backendPingPath?: string;
  pageCollectionPath?: string;
  workspaceCollectionPath?: string;
  workspaceProvisioningStatusPath?: string;
  cssPath?: string;
  scriptPath?: string;
};

export type DocseraRuntimeContext = {
  mountNode: HTMLElement | null;
  mountNodeId: string;
  config: DocseraRuntimeConfig;
};

export type PingResult = {
  authenticated: boolean;
  scope: string;
  status: string;
  timestamp: string;
  userAvatarPath: string;
  userDisplayName: string;
  userName: string;
  userSysId: string;
};

export type RuntimeProbeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; payload: PingResult }
  | { status: "error"; message: string };

export type RawPingPayload = {
  authenticated?: boolean;
  scope?: string;
  status?: string;
  timestamp?: string;
  user_display_name?: string;
  user_avatar_path?: string;
  user_name?: string;
  user_sys_id?: string;
  userAvatarPath?: string;
  userDisplayName?: string;
  userName?: string;
  userSysId?: string;
};

export type PingEnvelope = RawPingPayload | { result?: RawPingPayload };

export type WorkspaceRoleLabel = "Admin" | "Editor";
export type WorkspaceMode = "live" | "edit";

export type WorkspaceIcon = {
  type: "builtin" | "uploaded";
  key: string;
  label: string;
  assetPath?: string;
  attachmentSysId?: string;
  value?: string;
};

export type PagePublicationState = "draft" | "published" | "published_with_unpublished_changes";

export type PageContentInput = DocseraDocumentEnvelope | DocseraTiptapDocument;

export type WorkspacePageRecord = {
  sysId?: string;
  workspaceSysId: string;
  parentPageSysId: string | null;
  siblingOrder: number;
  draftTitle: string;
  draftSlug: string;
  draftSlugNormalized: string;
  draftContentJson: unknown;
  draftRevision?: number;
  draftBodyText: string | null;
  publishedTitle: string | null;
  publishedSlug: string | null;
  publishedSlugNormalized: string | null;
  publishedContentJson: unknown | null;
  publishedBodyText: string | null;
  publishedAt?: string | null;
  publishedBySysId?: string | null;
  publishedByDisplayName?: string | null;
  publicationState: PagePublicationState;
  active?: boolean;
};

export type WorkspaceViewRecord = {
  sysId?: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  icon: WorkspaceIcon;
  layout?: {
    tocVisible: boolean;
  };
  status: "active" | "inactive";
  roleLabel: WorkspaceRoleLabel | null;
  canManageWorkspaceMembers: boolean;
  canManageSettings: boolean;
};

export type WorkspaceListResult = {
  canCreateWorkspaces: boolean;
  items: WorkspaceViewRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  searchText: string;
};

export type WorkspaceLookupResult = {
  workspace: WorkspaceViewRecord | null;
};

export type PageListResult = {
  items: WorkspacePageRecord[];
  mode: WorkspaceMode;
  workspaceSlug: string;
  workspaceSysId: string;
  totalCount: number;
};

export type WorkspaceCreateInput = {
  name: string;
  shortDescription?: string | null;
  icon?: WorkspaceIcon | null;
};

export type WorkspaceSettingsSaveInput = {
  workspaceSlug: string;
  workspaceSysId: string;
  name: string;
  shortDescription?: string | null;
  icon?: WorkspaceIcon | null;
  layout?: {
    tocVisible: boolean;
  };
};

export type WorkspaceSettingsSaveResult =
  | {
      state: "succeeded";
      workspace: WorkspaceViewRecord;
    }
  | {
      code?: "forbidden" | "invalid" | "not_found" | "transient";
      errorMessage: string;
      state: "failed";
    };

export type WorkspaceDeleteInput = {
  workspaceSlug: string;
  workspaceSysId: string;
};

export type WorkspaceDeleteResult =
  | {
      state: "succeeded";
      workspace: WorkspaceViewRecord;
    }
  | {
      code?: "forbidden" | "not_found" | "transient";
      deletionCommitted?: boolean;
      errorMessage: string;
      retryable?: boolean;
      state: "failed";
    };

export type WorkspaceMemberAccessLevel = "admin" | "editor";

export type WorkspaceMemberRecord = {
  accessLevel: WorkspaceMemberAccessLevel;
  active: boolean;
  displayName: string;
  email: string;
  userName: string;
  userSysId: string;
};

export type WorkspaceMemberUserSearchRecord = {
  displayName: string;
  email: string;
  userName: string;
  userSysId: string;
};

export type WorkspaceMemberCallerCapabilities = {
  canManageWorkspaceMembers: boolean;
};

export type WorkspaceMembersSucceeded = {
  callerCapabilities: WorkspaceMemberCallerCapabilities;
  members: WorkspaceMemberRecord[];
  state: "succeeded";
};

export type WorkspaceMembersFailed = {
  code?: "forbidden" | "invalid" | "not_found" | "transient";
  errorMessage: string;
  retryable?: boolean;
  state: "failed";
};

export type WorkspaceMembersResult = WorkspaceMembersSucceeded | WorkspaceMembersFailed;

export type WorkspaceMemberMutationResult =
  | (WorkspaceMembersSucceeded & { member?: WorkspaceMemberRecord | null })
  | WorkspaceMembersFailed;

export type WorkspaceMemberUserSearchResult =
  | {
      callerCapabilities: WorkspaceMemberCallerCapabilities;
      state: "succeeded";
      users: WorkspaceMemberUserSearchRecord[];
    }
  | WorkspaceMembersFailed;

export type PageCreateInput = {
  workspaceSlug: string;
  title: string;
  parentPageSysId?: string | null;
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type PageCreateSucceeded = {
  changeSetId?: string;
  changeSetRevision?: number;
  page: WorkspacePageRecord;
  state: "succeeded";
};

export type PageCreateFailed = {
  affectedPageCount?: number;
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  state: "failed";
};

export type PageCreateResult = PageCreateSucceeded | PageCreateFailed;

export type PageBodySaveInput = {
  workspaceSlug?: string;
  workspaceSysId?: string;
  pageSysId?: string;
  pageSlug?: string;
  /** Workspace lease is the only persistence authority. Page-lock fields remain
   * on the editor transport temporarily, but are never sent to mutations. */
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  /** @deprecated retained for editor-session compatibility; never sent as mutation authority. */
  lockToken?: string;
  draftBodyText?: string;
  draftContentJson?: PageContentInput;
  expectedRevision?: number;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type PageBodySaveSucceeded = {
  changeSetId?: string;
  changeSetRevision?: number;
  page: WorkspacePageRecord;
  state: "succeeded";
};

export type PageBodySaveFailed = {
  affectedPageCount?: number;
  code?: "capacity" | "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "network" | "persistence_invariant" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  currentRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  retryable?: boolean;
  state: "failed";
};

export type PageBodySaveResult = PageBodySaveSucceeded | PageBodySaveFailed;

export type PagePublishInput = {
  workspaceSlug?: string;
  workspaceSysId?: string;
  pageSysId?: string;
  pageSlug?: string;
  workspaceLeaseToken?: string;
  /** @deprecated retained for editor-session compatibility; never sent as mutation authority. */
  lockToken?: string;
  expectedRevision?: number;
};

export type PagePublishSucceeded = {
  page: WorkspacePageRecord;
  state: "succeeded";
};

export type PagePublishFailed = {
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "network" | "persistence_invariant" | "transient";
  currentRevision?: number;
  errorMessage: string;
  retryable?: boolean;
  state: "failed";
};

export type PagePublishResult = PagePublishSucceeded | PagePublishFailed;

export type PageSettingsSaveInput = {
  workspaceSlug: string;
  workspaceSysId: string;
  pageSysId: string;
  title: string;
  slug: string;
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type PageSettingsSaveSucceeded = {
  changeSetId?: string;
  changeSetRevision?: number;
  page: WorkspacePageRecord;
  state: "succeeded";
};

export type PageSettingsSaveFailed = {
  affectedPageCount?: number;
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  state: "failed";
};

export type PageSettingsSaveResult = PageSettingsSaveSucceeded | PageSettingsSaveFailed;

export type PageDeleteInput = {
  workspaceSlug: string;
  workspaceSysId: string;
  pageSysId: string;
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type WorkspaceEditLeaseReferenceInput = {
  workspaceSlug?: string;
  workspaceSysId?: string;
  leaseToken?: string;
};
export type WorkspaceEditLeaseGeneration = { changeSetId: string; changeSetRevision: number; workspaceStateRevision?: number };
export type WorkspaceEditLeaseHeld = WorkspaceEditLeaseGeneration & { state: "held"; leaseToken: string; heartbeatIntervalMs: number; staleAfterMs: number };
export type WorkspaceEditLeaseStatusHeld = WorkspaceEditLeaseGeneration & { state: "held"; heartbeatIntervalMs: number; staleAfterMs: number };
export type WorkspaceEditLeaseLocked = { state: "locked"; holderDisplayName: string | null; holderUserSysId?: string; sameUserDifferentSession: boolean; observedLeaseId?: string };
export type WorkspaceEditLeaseLost = { state: "lost"; errorMessage: string; holderDisplayName: string | null; sameUserDifferentSession: boolean };
export type WorkspaceEditLeaseReleased = { state: "released" };
export type WorkspaceEditLeaseUnlocked = { state: "unlocked" };
export type WorkspaceEditLeaseFailureKind = "forbidden" | "transient" | "terminal";
export type WorkspaceEditLeaseFailed = { state: "failed"; errorMessage: string; failure: WorkspaceEditLeaseFailureKind; retryable?: boolean };
export type WorkspaceEditLeaseAcquireResult = WorkspaceEditLeaseHeld | WorkspaceEditLeaseLocked | WorkspaceEditLeaseFailed;
export type WorkspaceEditLeaseRenewResult = WorkspaceEditLeaseHeld | WorkspaceEditLeaseLost | WorkspaceEditLeaseFailed;
export type WorkspaceEditLeaseReleaseResult = WorkspaceEditLeaseReleased | WorkspaceEditLeaseLost | WorkspaceEditLeaseFailed;
export type WorkspaceEditLeaseStatusResult = WorkspaceEditLeaseStatusHeld | WorkspaceEditLeaseLocked | WorkspaceEditLeaseUnlocked | WorkspaceEditLeaseFailed;
export type WorkspacePendingChangeCategory = "Added" | "Modified" | "Moved" | "Modified Ã‚Â· Moved" | "Removed";
export type WorkspacePendingChangeRow = {
  attribution: {
    accessibleLabel: string;
    displayName: string;
    fullDisplayName: string;
  };
  category: WorkspacePendingChangeCategory;
  firstPendingSequence: number;
  lastChangedOn: string;
  navigable: boolean;
  pageSysId: string;
  title: string;
};
export type WorkspacePendingChangesSucceeded = WorkspaceEditLeaseGeneration & {
  affectedPageCount: number;
  rows: WorkspacePendingChangeRow[];
  state: "succeeded";
  workspaceSysId: string;
};
export type WorkspacePendingChangesFailed = {
  affectedPageCount?: number;
  code?: "forbidden" | "lock_lost" | "not_found" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  retryable?: boolean;
  state: "failed";
};
export type WorkspacePendingChangesResult = WorkspacePendingChangesSucceeded | WorkspacePendingChangesFailed;

export type WorkspacePublishInput = {
  commandId: string;
  workspaceSlug: string;
  workspaceSysId: string;
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type WorkspaceDiscardAllInput = {
  commandId: string;
  workspaceSlug: string;
  workspaceSysId: string;
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type WorkspaceDiscardPageInput = {
  workspaceSlug: string;
  workspaceSysId: string;
  pageSysId: string;
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type WorkspacePublishSucceeded = WorkspaceEditLeaseGeneration & {
  pages: WorkspacePageRecord[];
  pendingChanges: WorkspacePendingChangesSucceeded;
  publishedSnapshotSetId: string;
  state: "succeeded";
  workspaceStateRevision: number;
};

export type WorkspacePublishFailed = {
  affectedPageCount?: number;
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  retryable?: boolean;
  state: "failed";
};

export type WorkspacePublishResult = WorkspacePublishSucceeded | WorkspacePublishFailed;

export type WorkspaceDiscardAllSucceeded = WorkspaceEditLeaseGeneration & {
  pages: WorkspacePageRecord[];
  pendingChanges: WorkspacePendingChangesSucceeded;
  state: "succeeded";
  workspaceStateRevision: number;
};

export type WorkspaceDiscardAllFailed = {
  affectedPageCount?: number;
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  retryable?: boolean;
  state: "failed";
};

export type WorkspaceDiscardAllResult = WorkspaceDiscardAllSucceeded | WorkspaceDiscardAllFailed;

export type WorkspaceDiscardPageSucceeded = WorkspaceEditLeaseGeneration & {
  discardedPageSysId: string;
  pages: WorkspacePageRecord[];
  pendingChanges: WorkspacePendingChangesSucceeded;
  state: "succeeded";
  workspaceStateRevision: number;
};

export type WorkspaceDiscardPageFailed = {
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  retryable?: boolean;
  state: "failed";
};

export type WorkspaceDiscardPageResult = WorkspaceDiscardPageSucceeded | WorkspaceDiscardPageFailed;

export type PageDeleteSucceeded = {
  changeSetId?: string;
  changeSetRevision?: number;
  nextPageSysId: string;
  state: "succeeded";
};

export type PageDeleteFailed = {
  affectedPageCount?: number;
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  state: "failed";
};

export type PageDeleteResult = PageDeleteSucceeded | PageDeleteFailed;

export type PageMoveInput = {
  workspaceSlug: string;
  workspaceSysId: string;
  pageSysId: string;
  parentPageSysId?: string | null;
  siblingOrder: string | number;
  workspaceLeaseToken?: string;
  workspaceAuthority?: WorkspaceEditLeaseGeneration;
  expectedChangeSetId?: string;
  expectedChangeSetRevision?: number;
};

export type PageMoveSucceeded = {
  changeSetId?: string;
  changeSetRevision?: number;
  pages: WorkspacePageRecord[];
  state: "succeeded";
};

export type PageMoveFailed = {
  affectedPageCount?: number;
  code?: "conflict" | "failed" | "forbidden" | "invalid" | "lock_lost" | "recovery_required" | "transient";
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  errorMessage: string;
  recoveryCommandId?: string;
  state: "failed";
};

export type PageMoveResult = PageMoveSucceeded | PageMoveFailed;

export type PageEditLockReferenceInput = {
  workspaceSlug?: string;
  workspaceSysId?: string;
  pageSysId?: string;
  pageSlug?: string;
  lockToken?: string;
};

export type PageEditLockHeld = {
  heartbeatIntervalMs: number;
  lockToken: string;
  staleAfterMs: number;
  state: "held";
};

export type PageEditLockUnlocked = {
  state: "unlocked";
};

export type PageEditLockLocked = {
  holderDisplayName: string | null;
  sameUserDifferentSession: boolean;
  state: "locked";
};

export type PageEditLockLost = {
  errorMessage: string;
  holderDisplayName: string | null;
  sameUserDifferentSession: boolean;
  state: "lost";
};

export type PageEditLockReleased = {
  state: "released";
};

export type PageEditLockFailed = {
  code?: "failed" | "forbidden" | "invalid" | "network" | "persistence_invariant" | "transient";
  errorMessage: string;
  retryable?: boolean;
  state: "failed";
};

export type PageEditLockStatusResult = PageEditLockHeld | PageEditLockLocked | PageEditLockUnlocked | PageEditLockLost | PageEditLockFailed;
export type PageEditLockAcquireResult = PageEditLockHeld | PageEditLockLocked | PageEditLockFailed;
export type PageEditLockHeartbeatResult = PageEditLockHeld | PageEditLockLost | PageEditLockFailed;
export type PageEditLockReleaseResult = PageEditLockReleased | PageEditLockLost | PageEditLockFailed;

export type WorkspaceCreateSucceeded = {
  state: "succeeded";
  workspace: WorkspaceViewRecord;
  requestId?: string;
  statusPath?: string;
};

export type WorkspaceCreatePending = {
  state: "pending";
  requestId: string;
  statusPath: string;
  pollAfterMs: number;
};

export type WorkspaceCreateFailed = {
  state: "failed";
  errorMessage: string;
  requestId?: string;
  statusPath?: string;
};

export type WorkspaceCreateResult = WorkspaceCreateSucceeded | WorkspaceCreatePending | WorkspaceCreateFailed;

export type WorkspaceMediaDescriptor = {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  createdOn: string;
  fileName: string;
  mediaId: string;
  sizeBytes: number;
  updatedOn: string;
};

export type WorkspaceMediaFailure = {
  errorMessage: string;
  retryable?: boolean;
  state: "failed";
};

export type WorkspaceMediaLoader = (input: { mediaId: string; signal?: AbortSignal }) => Promise<Blob | null>;

export type WorkspaceMediaListResult =
  | {
      items: WorkspaceMediaDescriptor[];
      state: "succeeded";
    }
  | WorkspaceMediaFailure;

export type WorkspaceMediaUploadResult =
  | {
      media: WorkspaceMediaDescriptor;
      state: "succeeded";
    }
  | WorkspaceMediaFailure;

export type WorkspaceIconUploadResult =
  | {
      icon: WorkspaceIcon & { type: "uploaded"; assetPath: string };
      state: "succeeded";
    }
  | WorkspaceMediaFailure;

export type ServiceNowClient = {
  ping: () => Promise<PingResult>;
  listWorkspaces: (input?: { searchText?: string; page?: number; pageSize?: number }) => Promise<WorkspaceListResult>;
  getWorkspace: (workspaceSlug: string) => Promise<WorkspaceLookupResult>;
  listPages: (input: { mode?: WorkspaceMode; workspaceSlug: string }) => Promise<PageListResult>;
  createWorkspace: (input: WorkspaceCreateInput) => Promise<WorkspaceCreateResult>;
  saveWorkspaceSettings?: (input: WorkspaceSettingsSaveInput) => Promise<WorkspaceSettingsSaveResult>;
  deleteWorkspace?: (input: WorkspaceDeleteInput) => Promise<WorkspaceDeleteResult>;
  listWorkspaceMembers?: (input: { workspaceSlug: string; workspaceSysId?: string }) => Promise<WorkspaceMembersResult>;
  searchWorkspaceMemberUsers?: (input: { excludedUserSysIds?: string[]; term: string; workspaceSlug: string; workspaceSysId?: string }) => Promise<WorkspaceMemberUserSearchResult>;
  setWorkspaceMemberAccess?: (input: { accessLevel: WorkspaceMemberAccessLevel; userSysId: string; workspaceSlug: string; workspaceSysId?: string }) => Promise<WorkspaceMemberMutationResult>;
  removeWorkspaceMemberAccess?: (input: { userSysId: string; workspaceSlug: string; workspaceSysId?: string }) => Promise<WorkspaceMemberMutationResult>;
  getWorkspaceProvisioningStatus: (statusPath: string) => Promise<WorkspaceCreateResult>;
  createPage: (input: PageCreateInput) => Promise<PageCreateResult>;
  listWorkspaceMedia?: (input: { workspaceSysId: string }) => Promise<WorkspaceMediaListResult>;
  uploadWorkspaceMedia?: (input: { file: File; workspaceLeaseToken: string; workspaceSysId: string }) => Promise<WorkspaceMediaUploadResult>;
  uploadWorkspaceIcon?: (input: { file: File; workspaceSysId?: string }) => Promise<WorkspaceIconUploadResult>;
  cleanupWorkspaceSettingsIcon?: (input: { assetKey: string; workspaceSysId: string }) => Promise<void>;
  loadWorkspaceIcon?: (input: { assetPath: string; signal?: AbortSignal }) => Promise<Blob | null>;
  loadWorkspaceMedia?: (input: { mediaId: string; signal?: AbortSignal; workspaceSysId: string }) => Promise<Blob | null>;
  acquireWorkspaceEditLease?: (input: WorkspaceEditLeaseReferenceInput) => Promise<WorkspaceEditLeaseAcquireResult>;
  resumeWorkspaceEditLease?: (input: WorkspaceEditLeaseReferenceInput) => Promise<WorkspaceEditLeaseRenewResult>;
  renewWorkspaceEditLease?: (input: WorkspaceEditLeaseReferenceInput) => Promise<WorkspaceEditLeaseRenewResult>;
  endPreviousWorkspaceEditSession?: (input: WorkspaceEditLeaseReferenceInput & { observedLeaseId: string }) => Promise<WorkspaceEditLeaseReleaseResult>;
  releaseWorkspaceEditLease?: (input: WorkspaceEditLeaseReferenceInput & { keepalive?: boolean }) => Promise<WorkspaceEditLeaseReleaseResult>;
  getWorkspaceEditLeaseStatus?: (input: WorkspaceEditLeaseReferenceInput) => Promise<WorkspaceEditLeaseStatusResult>;
  getWorkspacePendingChanges?: (input: WorkspaceEditLeaseReferenceInput) => Promise<WorkspacePendingChangesResult>;
  discardPageWorkspace?: (input: WorkspaceDiscardPageInput) => Promise<WorkspaceDiscardPageResult>;
  discardAllWorkspace?: (input: WorkspaceDiscardAllInput) => Promise<WorkspaceDiscardAllResult>;
  publishWorkspace?: (input: WorkspacePublishInput) => Promise<WorkspacePublishResult>;
  getPageEditLockStatus: (input: PageEditLockReferenceInput) => Promise<PageEditLockStatusResult>;
  acquirePageEditLock: (input: PageEditLockReferenceInput) => Promise<PageEditLockAcquireResult>;
  heartbeatPageEditLock: (input: PageEditLockReferenceInput) => Promise<PageEditLockHeartbeatResult>;
  releasePageEditLock: (input: PageEditLockReferenceInput & { keepalive?: boolean }) => Promise<PageEditLockReleaseResult>;
  savePageBody: (input: PageBodySaveInput) => Promise<PageBodySaveResult>;
  publishPage: (input: PagePublishInput) => Promise<PagePublishResult>;
  savePageSettings: (input: PageSettingsSaveInput) => Promise<PageSettingsSaveResult>;
  deletePage: (input: PageDeleteInput) => Promise<PageDeleteResult>;
  movePage?: (input: PageMoveInput) => Promise<PageMoveResult>;
};

export type DemoPageSection = {
  id: string;
  title: string;
  body?: string;
};

export type DemoPage = {
  id: string;
  title: string;
  slug: string;
  body: string;
  sections: DemoPageSection[];
  children?: DemoPage[];
};

export type DemoWorkspace = {
  id: string;
  title: string;
  icon?: WorkspaceIcon;
  iconLabel: string;
  homeLabel: string;
  roleLabel: string;
  canManageSettings?: boolean;
  defaultPageId: string;
  pages: DemoPage[];
};
