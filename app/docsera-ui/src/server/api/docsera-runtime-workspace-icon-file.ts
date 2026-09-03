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

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceIconService();
    const result = await service.getWorkspaceIconFile({ assetKey: readQueryParam(request, "assetKey") });

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
    gs.error(`[Docsera workspace icon file] ${JSON.stringify({ message: cleanText(error instanceof Error ? error.message : error) || "Unknown workspace icon retrieval failure.", queryString: cleanText(request?.queryString) })}`);
    response.setBody({ error: { message: "Unable to load workspace icon. Please try again." } });
  }
}
