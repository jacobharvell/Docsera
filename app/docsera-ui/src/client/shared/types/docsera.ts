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
  user_name?: string;
  user_sys_id?: string;
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
  publicationState: PagePublicationState;
  active?: boolean;
};

export type WorkspaceViewRecord = {
  sysId?: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  icon: WorkspaceIcon;
  status: "active" | "inactive";
  roleLabel: WorkspaceRoleLabel | null;
  canManageSettings: boolean;
};

export type WorkspaceListResult = {
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

export type PageCreateInput = {
  workspaceSlug: string;
  title: string;
  parentPageSysId?: string | null;
};

export type PageCreateSucceeded = {
  page: WorkspacePageRecord;
  state: "succeeded";
};

export type PageCreateFailed = {
  errorMessage: string;
  state: "failed";
};

export type PageCreateResult = PageCreateSucceeded | PageCreateFailed;

export type PageBodySaveInput = {
  workspaceSlug?: string;
  workspaceSysId?: string;
  pageSysId?: string;
  pageSlug?: string;
  draftBodyText?: string;
  draftContentJson?: PageContentInput;
  expectedRevision?: number;
};

export type PageBodySaveSucceeded = {
  page: WorkspacePageRecord;
  state: "succeeded";
};

export type PageBodySaveFailed = {
  code?: "capacity" | "conflict" | "failed" | "forbidden" | "invalid" | "network" | "persistence_invariant" | "transient";
  currentRevision?: number;
  errorMessage: string;
  retryable?: boolean;
  state: "failed";
};

export type PageBodySaveResult = PageBodySaveSucceeded | PageBodySaveFailed;

export type PageSettingsSaveInput = {
  workspaceSlug: string;
  workspaceSysId: string;
  pageSysId: string;
  title: string;
  slug: string;
};

export type PageSettingsSaveSucceeded = {
  page: WorkspacePageRecord;
  state: "succeeded";
};

export type PageSettingsSaveFailed = {
  errorMessage: string;
  state: "failed";
};

export type PageSettingsSaveResult = PageSettingsSaveSucceeded | PageSettingsSaveFailed;

export type PageDeleteInput = {
  workspaceSlug: string;
  workspaceSysId: string;
  pageSysId: string;
};

export type PageDeleteSucceeded = {
  nextPageSysId: string;
  state: "succeeded";
};

export type PageDeleteFailed = {
  errorMessage: string;
  state: "failed";
};

export type PageDeleteResult = PageDeleteSucceeded | PageDeleteFailed;

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

export type ServiceNowClient = {
  ping: () => Promise<PingResult>;
  listWorkspaces: (input?: { searchText?: string; page?: number; pageSize?: number }) => Promise<WorkspaceListResult>;
  getWorkspace: (workspaceSlug: string) => Promise<WorkspaceLookupResult>;
  listPages: (input: { mode?: WorkspaceMode; workspaceSlug: string }) => Promise<PageListResult>;
  createWorkspace: (input: WorkspaceCreateInput) => Promise<WorkspaceCreateResult>;
  getWorkspaceProvisioningStatus: (statusPath: string) => Promise<WorkspaceCreateResult>;
  createPage: (input: PageCreateInput) => Promise<PageCreateResult>;
  savePageBody: (input: PageBodySaveInput) => Promise<PageBodySaveResult>;
  savePageSettings: (input: PageSettingsSaveInput) => Promise<PageSettingsSaveResult>;
  deletePage: (input: PageDeleteInput) => Promise<PageDeleteResult>;
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
