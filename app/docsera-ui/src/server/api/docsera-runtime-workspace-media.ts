import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceMediaService } from "../workspaces/serviceNowWorkspaceMedia.ts";
import { readQueryParam } from "./docsera-runtime-request.ts";

type RequestLike = {
  queryParams?: unknown;
  queryString?: string;
};

type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logUnexpectedMediaError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown workspace media failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera workspace media] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

function summarizeRequest(request: RequestLike) {
  const workspaceSysId = readQueryParam(request, "workspaceSysId");
  return { action: "list", workspaceSysIdPresent: Boolean(workspaceSysId), workspaceSysIdLength: workspaceSysId.length };
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceMediaService();
    const result = await service.listWorkspaceMedia({
      workspaceSysId: readQueryParam(request, "workspaceSysId")
    });

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({
        error: {
          message: result.errorMessage
        }
      });
      return;
    }

    response.setBody({
      result: {
        items: result.items
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedMediaError(error, summarizeRequest(request));
    response.setBody({
      error: {
        message: "Unable to load workspace media. Please try again."
      }
    });
  }
}

