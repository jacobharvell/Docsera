export type DocseraRuntimeConfig = {
  backendPingPath?: string;
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

export type WorkspaceCreateInput = {
  name: string;
  shortDescription?: string | null;
  icon?: WorkspaceIcon | null;
};

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
  createWorkspace: (input: WorkspaceCreateInput) => Promise<WorkspaceCreateResult>;
  getWorkspaceProvisioningStatus: (statusPath: string) => Promise<WorkspaceCreateResult>;
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
