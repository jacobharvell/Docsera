import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceIconService } from "../workspaces/serviceNowWorkspaceIcons.ts";
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

function summarizeRequest(request: RequestLike) {
  const assetKey = readQueryParam(request, "assetKey");
  const workspaceSysId = readQueryParam(request, "workspaceSysId");
  return { action: "retrieve", assetKeyPresent: Boolean(assetKey), assetKeyLength: assetKey.length, workspaceSysIdPresent: Boolean(workspaceSysId), workspaceSysIdLength: workspaceSysId.length, preview: readQueryParam(request, "preview") === "settings" ? "settings" : "default" };
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceIconService();
    const result = readQueryParam(request, "preview") === "settings"
      ? await service.getWorkspaceSettingsIconPreviewFile({
          assetKey: readQueryParam(request, "assetKey"),
          workspaceSysId: readQueryParam(request, "workspaceSysId")
        })
      : await service.getWorkspaceIconFile({ assetKey: readQueryParam(request, "assetKey") });

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({ error: { message: result.errorMessage } });
      return;
    }

    response.setStatus?.(200);
    response.setHeaders?.({ "Content-Type": result.contentType });
    const writer = response.getStreamWriter?.();
    if (!writer) {
      throw new Error("A response stream writer is required for workspace icon retrieval.");
    }
    writer.writeStream(result.contentStream);
  } catch (error) {
    response.setStatus?.(500);
    gs.error(`[Docsera workspace icon file] ${JSON.stringify({ context: summarizeRequest(request), message: cleanText(error instanceof Error ? error.message : error) || "Unknown workspace icon retrieval failure." })}`);
    response.setBody({ error: { message: "Unable to load workspace icon. Please try again." } });
  }
}
