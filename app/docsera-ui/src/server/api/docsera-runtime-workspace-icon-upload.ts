import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceIconService } from "../workspaces/serviceNowWorkspaceIcons.ts";
import { readHeader, readNumericHeader, readQueryParam, readRequestBodyDataStream } from "./docsera-runtime-request.ts";

type RequestLike = {
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

function logUnexpectedIconError(error: unknown, context: Record<string, unknown>) {
  gs.error(`[Docsera workspace icon upload] ${JSON.stringify({ context, message: cleanText(error instanceof Error ? error.message : error) || "Unknown workspace icon upload failure." })}`);
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceIconService();
    if (readQueryParam(request, "action") === "cleanup-settings-staged") {
      service.cleanupStagedWorkspaceSettingsIcon(readQueryParam(request, "assetKey"), readQueryParam(request, "workspaceSysId"));
      response.setStatus?.(204);
      response.setBody({});
      return;
    }

    const result = await service.uploadWorkspaceIcon({
      contentLengthBytes: readNumericHeader(request, "Content-Length"),
      contentType: readHeader(request, "Content-Type"),
      dataStream: readRequestBodyDataStream(request),
      fileName: readQueryParam(request, "fileName"),
      workspaceSysId: readQueryParam(request, "workspaceSysId")
    });

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({ error: { message: result.errorMessage } });
      return;
    }

    response.setStatus?.(201);
    response.setBody({ result: { asset: result.asset } });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedIconError(error, { queryString: cleanText(request?.queryString), contentType: readHeader(request, "Content-Type") });
    response.setBody({ error: { message: "Something went wrong while uploading the workspace icon. The file was not saved. Please try again." } });
  }
}
