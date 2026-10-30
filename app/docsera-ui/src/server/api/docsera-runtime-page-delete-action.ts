import { GlideRecord, gs } from "@servicenow/glide";
import { DOCSERA_WORKSPACE_TABLE } from "../workspaces/serverWorkspaceDomain.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { createServiceNowWorkspaceChangeSetPersistenceService } from "../workspaces/serviceNowWorkspaceChangeSetPersistence.ts";
import { readWorkspaceMutationAuthority, sendWorkspaceLeaseMutationFailure, verifyWorkspaceEditLease } from "./docsera-runtime-workspace-edit-lease.ts";

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

function summarizeRequestBody(body: Record<string, unknown>) {
  const workspaceSlug = cleanText(body.workspaceSlug);
  const workspaceSysId = cleanText(body.workspaceSysId);
  const pageSysId = cleanText(body.pageSysId);
  return { workspaceSlugPresent: Boolean(workspaceSlug), workspaceSlugLength: workspaceSlug.length, workspaceSysIdPresent: Boolean(workspaceSysId), workspaceSysIdLength: workspaceSysId.length, pageSysIdPresent: Boolean(pageSysId), pageSysIdLength: pageSysId.length };
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
  if (!row.next()) {
    return null;
  }
  return mapWorkspaceRecord(row);
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceChangeSetPersistenceService();
    const body = readRequestBody(request);
    const lease = await verifyWorkspaceEditLease(body);
    if (sendWorkspaceLeaseMutationFailure(lease, response)) return;
    if (lease.kind !== "held") return;
    const authority = readWorkspaceMutationAuthority(lease, body, response);
    if (!authority) return;
    if (!cleanText(body.workspaceSlug) && !cleanText(body.workspaceSysId)) {
      response.setStatus?.(400);
      response.setBody({ error: { code: "invalid", message: "A workspace reference is required." } });
      return;
    }
    const workspace = loadWorkspace(body);
    if (!workspace) {
      response.setStatus?.(404);
      response.setBody({ error: { code: "invalid", message: "Workspace could not be found." } });
      return;
    }
    const result = service.deletePage({
      authority,
      pageSysId: cleanText(body.pageSysId),
      workspace
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
          code:
            result.code === "stale_generation"
              ? "stale_generation"
              : result.code === "recovery_required"
                ? "recovery_required"
                : result.code === "unsupported"
                  ? "unsupported"
                  : "invalid",
          message: result.errorMessage,
          ...(typeof result.currentChangeSetId === "string" && typeof result.currentChangeSetRevision === "number"
            ? {
                currentChangeSetId: result.currentChangeSetId,
                currentChangeSetRevision: result.currentChangeSetRevision
              }
            : {}),
          ...(typeof result.affectedPageCount === "number"
            ? { affectedPageCount: result.affectedPageCount }
            : {}),
          ...(typeof result.recoveryCommandId === "string" && result.recoveryCommandId
            ? { recoveryCommandId: result.recoveryCommandId }
            : {})
        }
      });
      return;
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        mode: "servicenow",
        deletedPageSysId: result.result.deletedPageSysId,
        nextPageSysId: result.result.nextPageSysId,
        changeSetId: result.authority.changeSetId,
        changeSetRevision: result.authority.changeSetRevision
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedPageDeleteError(error, {
      ...summarizeRequestBody(readRequestBody(request))
    });
    response.setBody({
      error: {
        message: "Something went wrong while deleting the page. The page was not deleted. Please try again."
      }
    });
  }
}
