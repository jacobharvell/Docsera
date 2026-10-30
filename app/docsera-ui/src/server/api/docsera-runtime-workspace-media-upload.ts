import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceMediaService } from "../workspaces/serviceNowWorkspaceMedia.ts";
import { readHeader, readNumericHeader, readQueryParam, readRequestBodyDataStream } from "./docsera-runtime-request.ts";

type RequestLike = {
  body?: unknown;
  getHeader?: (name: string) => unknown;
  headers?: unknown;
  queryParams?: unknown;
  queryString?: string;
  requestHeaders?: unknown;
};

type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logUnexpectedMediaError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown workspace media upload failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera workspace media upload] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

function summarizeRequest(request: RequestLike) {
  const fileName = readQueryParam(request, "fileName");
  const workspaceSysId = readQueryParam(request, "workspaceSysId");
  const contentLengthBytes = readNumericHeader(request, "Content-Length");
  return { action: "upload", fileNamePresent: Boolean(fileName), fileNameLength: fileName.length, workspaceSysIdPresent: Boolean(workspaceSysId), workspaceSysIdLength: workspaceSysId.length, contentTypePresent: Boolean(readHeader(request, "Content-Type")), contentLengthBytes: typeof contentLengthBytes === "number" ? contentLengthBytes : undefined };
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceMediaService();
    const result = await service.uploadWorkspaceMedia({
      contentLengthBytes: readNumericHeader(request, "Content-Length"),
      contentType: readHeader(request, "Content-Type"),
      dataStream: readRequestBodyDataStream(request),
      fileName: readQueryParam(request, "fileName"),
      workspaceLeaseToken: readHeader(request, "X-Docsera-Workspace-Lease-Token"),
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

    response.setStatus?.(201);
    response.setBody({
      result: {
        media: result.media
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedMediaError(error, summarizeRequest(request));
    response.setBody({
      error: {
        message: "Something went wrong while uploading media. The file was not saved. Please try again."
      }
    });
  }
}

