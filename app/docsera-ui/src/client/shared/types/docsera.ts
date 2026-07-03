export type DocseraRuntimeConfig = {
  backendPingPath?: string;
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

export type ServiceNowClient = {
  ping: () => Promise<PingResult>;
};

export type DemoPage = {
  id: string;
  title: string;
  slug: string;
};

export type DemoWorkspace = {
  id: string;
  title: string;
  summary: string;
  pages: DemoPage[];
};
