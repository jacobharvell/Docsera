import type {
  DocseraRuntimeContext,
  PingEnvelope,
  PingResult,
  RawPingPayload,
  ServiceNowClient
} from "../../shared/types/docsera";

type TokenBearingWindow = Window & {
  NOW?: {
    user?: {
      token?: string;
    };
  };
  g_ck?: string;
};

function readWindowUserToken(candidate: Window | null | undefined): string | undefined {
  const tokenWindow = candidate as TokenBearingWindow | null | undefined;
  const token = tokenWindow?.g_ck ?? tokenWindow?.NOW?.user?.token;
  return typeof token === "string" && token.trim() ? token.trim() : undefined;
}

function resolveUserToken(): string | undefined {
  const localToken = readWindowUserToken(window);
  if (localToken) {
    return localToken;
  }

  try {
    return readWindowUserToken(window.top);
  } catch {
    return undefined;
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const userToken = resolveUserToken();
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(userToken ? { "X-UserToken": userToken } : {})
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function normalizePingPayload(payload: PingEnvelope): PingResult {
  const result: RawPingPayload =
    "result" in payload && payload.result ? payload.result : (payload as RawPingPayload);

  return {
    authenticated: Boolean(result.authenticated),
    scope: result.scope ?? "unknown",
    status: result.status ?? "unknown",
    timestamp: result.timestamp ?? "unknown",
    userName: result.userName ?? result.user_name ?? "unknown",
    userSysId: result.userSysId ?? result.user_sys_id ?? "unknown"
  };
}

export function createServiceNowClient(runtime: DocseraRuntimeContext): ServiceNowClient {
  return {
    async ping(): Promise<PingResult> {
      const pingPath = runtime.config.backendPingPath;

      if (!pingPath) {
        throw new Error("No backend ping path configured.");
      }

      const payload = await requestJson<PingEnvelope>(pingPath);
      return normalizePingPayload(payload);
    }
  };
}
