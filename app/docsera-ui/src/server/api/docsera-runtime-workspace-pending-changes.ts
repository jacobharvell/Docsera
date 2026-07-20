import { GlideRecord, gs } from "@servicenow/glide";
import { createServiceNowWorkspaceChangeSetPersistenceService } from "../workspaces/serviceNowWorkspaceChangeSetPersistence.ts";
import { DOCSERA_WORKSPACE_TABLE } from "../workspaces/serverWorkspaceDomain.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { sendWorkspaceLeaseMutationFailure, validateWorkspaceEditLeaseForRead } from "./docsera-runtime-workspace-edit-lease.ts";

type RequestLike = { body?: unknown; data?: unknown };
type ResponseLike = { setBody: (payload: unknown) => void; setStatus?: (status: number) => void };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRequestBody(request: RequestLike): Record<string, unknown> {
  const rawBody = request?.body ?? request?.data;
  if (rawBody && typeof rawBody === "object" && "data" in rawBody && rawBody.data && typeof rawBody.data === "object") {
    return rawBody.data as Record<string, unknown>;
  }
  return rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {};
}

function loadWorkspace(body: Record<string, unknown>) {
  const workspaceSysId = cleanText(body.workspaceSysId);
  const workspaceSlug = cleanText(body.workspaceSlug);
  const row = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (workspaceSysId) {
    if (!row.get("sys_id", workspaceSysId)) {
      return null;
    }
    const workspace = mapWorkspaceRecord(row);
    return !workspaceSlug || workspace.slug === workspaceSlug ? workspace : null;
  }
  if (!workspaceSlug) {
    return null;
  }
  row.addQuery("workspace_slug", workspaceSlug);
  row.setLimit(1);
  row.query();
  return row.next() ? mapWorkspaceRecord(row) : null;
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const body = readRequestBody(request);
    const lease = await validateWorkspaceEditLeaseForRead(body);
    if (sendWorkspaceLeaseMutationFailure(lease, response)) {
      return;
    }
    if (lease.kind !== "held") {
      return;
    }
    if (!cleanText(body.workspaceSlug) && !cleanText(body.workspaceSysId)) {
      response.setStatus?.(400);
      response.setBody({ error: { code: "invalid", message: "A workspace reference is required." } });
      return;
    }
    const workspace = loadWorkspace(body);
    if (!workspace) {
      response.setStatus?.(404);
      response.setBody({ error: { code: "not_found", message: "Workspace could not be found." } });
      return;
    }

    const result = createServiceNowWorkspaceChangeSetPersistenceService().pendingChanges(workspace);
    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({ error: { code: "pending_changes_unavailable", message: result.errorMessage } });
      return;
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        mode: "servicenow",
        ...result.pending
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    gs.error(`[Docsera pending changes] ${cleanText(error instanceof Error ? error.message : error) || "Unknown pending changes failure."}`);
    response.setBody({ error: { code: "pending_changes_unavailable", message: "Unable to load pending changes. Please try again." } });
  }
}
