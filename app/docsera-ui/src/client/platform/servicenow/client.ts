import type {
  DocseraRuntimeContext,
  PingEnvelope,
  PingResult,
  RawPingPayload,
  ServiceNowClient
} from "../../shared/types/docsera";

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json"
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
