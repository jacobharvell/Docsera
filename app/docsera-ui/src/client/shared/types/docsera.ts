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

export type WorkspaceIcon = {
  type: "builtin" | "uploaded";
  key: string;
  label: string;
  assetPath?: string;
  attachmentSysId?: string;
  value?: string;
};

export type PagePublicationState = "draft" | "published" | "published_with_unpublished_changes";

export type PageContentJson = Record<string, unknown>;

export type WorkspacePageRecord = {
  sysId?: string;
  workspaceSysId: string;
  parentPageSysId: string | null;
  siblingOrder: number;
  draftTitle: string;
  draftSlug: string;
  draftSlugNormalized: string;
  draftContentJson: PageContentJson;
  draftBodyText: string | null;
  publishedTitle: string | null;
  publishedSlug: string | null;
  publishedSlugNormalized: string | null;
  publishedContentJson: PageContentJson | null;
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
  listPages: (input: { workspaceSlug: string }) => Promise<PageListResult>;
  createWorkspace: (input: WorkspaceCreateInput) => Promise<WorkspaceCreateResult>;
  getWorkspaceProvisioningStatus: (statusPath: string) => Promise<WorkspaceCreateResult>;
  createPage: (input: PageCreateInput) => Promise<PageCreateResult>;
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
  iconLabel: string;
  homeLabel: string;
  roleLabel: string;
  canManageSettings?: boolean;
  defaultPageId: string;
  pages: DemoPage[];
};
