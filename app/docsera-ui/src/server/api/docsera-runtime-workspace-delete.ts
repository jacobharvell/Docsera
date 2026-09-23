import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceDeletionService } from "../workspaces/serviceNowWorkspaceDeletion.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBody(request: { body?: { data?: unknown } } | undefined): Record<string, unknown> {
  const body = request?.body?.data;
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

export async function process(request: { body?: { data?: unknown } }, response: { setStatus?: (status: number) => void; setBody: (body: unknown) => void }) {
  const body = readBody(request);
  const service = createServiceNowWorkspaceDeletionService();
  try {
    const result = await service.deleteWorkspace({
      workspaceSlug: cleanText(body.workspaceSlug),
      workspaceSysId: cleanText(body.workspaceSysId)
    });
    if (result.kind === "succeeded") {
      response.setStatus?.(200);
      response.setBody({ result: { state: "succeeded", workspace: result.workspace } });
      return;
    }
    response.setStatus?.(result.status);
    response.setBody({ error: { code: result.status === 403 ? "forbidden" : result.status === 404 ? "not_found" : "delete_failed", deletionCommitted: result.deletionCommitted === true, message: result.errorMessage } });
  } catch (error) {
    gs.error(`[Docsera workspace deletion route] ${cleanText(error instanceof Error ? error.message : error) || "Unknown failure"}`);
    response.setStatus?.(500);
    response.setBody({ error: { code: "delete_failed", message: "Something went wrong while deleting the workspace. Nothing was deleted. Please try again." } });
  }
}
