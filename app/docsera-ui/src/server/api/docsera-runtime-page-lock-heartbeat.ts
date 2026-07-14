import { gs } from "@servicenow/glide";
import { createServiceNowPageEditLockService } from "../page-locks/serviceNowPageEditLocks.ts";
import { cleanText } from "../page-locks/serverPageEditLockDomain.ts";

type RequestLike = {
  body?: unknown;
  data?: unknown;
};

type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

function readRequestBody(request: RequestLike): Record<string, unknown> {
  const rawBody = request?.body ?? request?.data;

  if (rawBody && typeof rawBody === "object" && "data" in rawBody && rawBody.data && typeof rawBody.data === "object") {
    return rawBody.data as Record<string, unknown>;
  }

  return rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : {};
}

function summarizeRequestBody(body: Record<string, unknown>) {
  return {
    pageSlug: cleanText(body.pageSlug) || undefined,
    pageSysId: cleanText(body.pageSysId) || undefined,
    workspaceSlug: cleanText(body.workspaceSlug) || undefined,
    workspaceSysId: cleanText(body.workspaceSysId) || undefined
  };
}

function logUnexpectedError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page edit lock heartbeat failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page edit lock heartbeat] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  const body = readRequestBody(request);

  try {
    const service = createServiceNowPageEditLockService();
    const result = await service.touchPageEditLock({
      lockToken: cleanText(body.lockToken),
      pageSlug: cleanText(body.pageSlug),
      pageSysId: cleanText(body.pageSysId),
      workspaceSlug: cleanText(body.workspaceSlug),
      workspaceSysId: cleanText(body.workspaceSysId)
    });

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({
        error: {
          code: result.status === 403 ? "forbidden" : result.status === 500 ? "persistence_transient" : "invalid",
          retryable: result.retryable,
          message: result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "lost") {
      response.setStatus?.(409);
      response.setBody({
        error: {
          code: "edit_lock_lost",
          retryable: false,
          message: result.errorMessage,
          holderDisplayName: result.currentHolder?.displayName ?? null,
          sameUserDifferentSession: result.currentHolder?.sameUserDifferentSession ?? false
        }
      });
      return;
    }

    if (result.kind !== "held") {
      throw new Error(`Unexpected heartbeat result: ${result.kind}`);
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        state: "held",
        lockToken: result.lockToken,
        heartbeatIntervalMs: result.heartbeatIntervalMs,
        staleAfterMs: result.staleAfterMs
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedError(error, summarizeRequestBody(body));
    response.setBody({
      error: {
        code: "persistence_transient",
        retryable: true,
        message: "Something went wrong while refreshing the edit session. Please try again."
      }
    });
  }
}
