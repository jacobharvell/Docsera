import { gs } from "@servicenow/glide";
import { createServiceNowPagePublishService } from "../pages/serviceNowPagePublishing.ts";
import { sendWorkspaceLeaseMutationFailure, verifyWorkspaceEditLease } from "./docsera-runtime-workspace-edit-lease.ts";

type RequestLike = {
  body?: unknown;
  data?: unknown;
};

type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRequestBody(request: RequestLike): Record<string, unknown> {
  const rawBody = request?.body ?? request?.data;

  if (rawBody && typeof rawBody === "object" && "data" in rawBody && rawBody.data && typeof rawBody.data === "object") {
    return rawBody.data as Record<string, unknown>;
  }

  return rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : {};
}

function summarizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    workspaceSlug: cleanText(body.workspaceSlug) || undefined,
    workspaceSysId: cleanText(body.workspaceSysId) || undefined,
    pageSysId: cleanText(body.pageSysId) || undefined,
    pageSlug: cleanText(body.pageSlug) || undefined,
    expectedRevision: Number.isSafeInteger(Number(body.expectedRevision)) ? Number(body.expectedRevision) : undefined
  };
}

function logUnexpectedPagePublishError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page publish failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page publish] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowPagePublishService();
    const body = readRequestBody(request);
    if (sendWorkspaceLeaseMutationFailure(await verifyWorkspaceEditLease(body), response)) return;
    const result = await service.publishPage({
      workspaceSlug: cleanText(body.workspaceSlug),
      workspaceSysId: cleanText(body.workspaceSysId),
      pageSysId: cleanText(body.pageSysId),
      pageSlug: cleanText(body.pageSlug),
      expectedRevision: body.expectedRevision
    });

    if (result.kind === "forbidden") {
      response.setStatus?.(403);
      response.setBody({
        error: {
          code: "forbidden",
          retryable: false,
          message: result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({
        error: {
          code: result.status === 500 ? "persistence_invariant" : "invalid",
          retryable: false,
          message:
            result.status === 500
              ? "Something went wrong while publishing. Your changes were not published. Please try again."
              : result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "conflict") {
      response.setStatus?.(409);
      response.setBody({
        error: {
          code: "draft_revision_conflict",
          retryable: false,
          message: result.errorMessage,
          currentRevision: result.currentRevision
        }
      });
      return;
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        mode: "servicenow",
        page: result.page
      }
    });
  } catch (error) {
    const body = readRequestBody(request);
    response.setStatus?.(500);
    logUnexpectedPagePublishError(error, summarizeRequestBody(body));
    response.setBody({
      error: {
        code: "persistence_invariant",
        retryable: false,
        message: "Something went wrong while publishing. Your changes were not published. Please try again."
      }
    });
  }
}
