import { gs } from "@servicenow/glide";
import { createServiceNowPageSettingsService } from "../pages/serviceNowPageSettings.ts";
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

function logUnexpectedPageDeleteError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page delete failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page delete] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowPageSettingsService();
    const body = readRequestBody(request);
    if (sendWorkspaceLeaseMutationFailure(await verifyWorkspaceEditLease(body), response)) return;
    const result = await service.deletePage({
      workspaceSlug: cleanText(body.workspaceSlug),
      workspaceSysId: cleanText(body.workspaceSysId),
      pageSysId: cleanText(body.pageSysId)
    });

    if (result.kind === "forbidden") {
      response.setStatus?.(403);
      response.setBody({
        error: {
          message: result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({
        error: {
          message: result.errorMessage
        }
      });
      return;
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        mode: "servicenow",
        deletedPageSysId: result.deletedPageSysId,
        nextPageSysId: result.nextPageSysId
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedPageDeleteError(error, {
      requestBody: readRequestBody(request)
    });
    response.setBody({
      error: {
        message: "Something went wrong while deleting the page. The page was not deleted. Please try again."
      }
    });
  }
}
