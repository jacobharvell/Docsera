import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceMediaService } from "../workspaces/serviceNowWorkspaceMedia.ts";
import { readQueryParam } from "./docsera-runtime-request.ts";

type RequestLike = {
  queryParams?: unknown;
  queryString?: string;
};

type ResponseLike = {
  getStreamWriter?: () => { writeStream: (stream: unknown) => void };
  setBody: (payload: unknown) => void;
  setHeaders?: (headers: Record<string, string>) => void;
  setStatus?: (status: number) => void;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logUnexpectedMediaError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown workspace media retrieval failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera workspace media file] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceMediaService();
    const result = await service.getWorkspaceMediaFile({
      mediaId: readQueryParam(request, "mediaId"),
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

    response.setStatus?.(200);
    response.setHeaders?.({
      "Content-Type": result.contentType
    });
    const writer = response.getStreamWriter?.();
    if (!writer) {
      throw new Error("A response stream writer is required for media retrieval.");
    }
    writer.writeStream(result.contentStream);
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedMediaError(error, {
      action: "retrieve",
      queryString: cleanText(request?.queryString),
      queryParams: request?.queryParams && typeof request.queryParams === "object" ? request.queryParams : undefined
    });
    response.setBody({
      error: {
        message: "Unable to load media file. Please try again."
      }
    });
  }
}

