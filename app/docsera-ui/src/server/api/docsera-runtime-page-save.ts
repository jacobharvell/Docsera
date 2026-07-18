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

function summarizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  const draftBodyText = cleanText(body.draftBodyText);

  return {
    workspaceSlug: cleanText(body.workspaceSlug) || undefined,
    workspaceSysId: cleanText(body.workspaceSysId) || undefined,
    pageSysId: cleanText(body.pageSysId) || undefined,
    pageSlug: cleanText(body.pageSlug) || undefined,
    draftBodyTextPresent: Boolean(draftBodyText),
    draftBodyTextLength: draftBodyText.length,
    expectedRevision: Number.isSafeInteger(Number(body.expectedRevision)) ? Number(body.expectedRevision) : undefined
  };
}

function logUnexpectedPageSaveError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page save failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page save] ${JSON.stringify({
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
      response.setBody({
        error: {
          code: "invalid",
          retryable: false,
          message: "A workspace reference is required."
        }
      });
      return;
    }
    const workspace = loadWorkspace(body);
    if (!workspace) {
      response.setStatus?.(404);
      response.setBody({
        error: {
          code: "invalid",
          retryable: false,
          message: "Workspace could not be found."
        }
      });
      return;
    }
    const result = service.savePageBody({
      authority,
      draftContentJson: body.draftContentJson,
      expectedRevision: Number(body.expectedRevision),
      pageSysId: cleanText(body.pageSysId),
      pageSlug: cleanText(body.pageSlug),
      workspace
    });

    if (result.kind === "forbidden") {
      response.setStatus?.(403);
      response.setBody({
        error: {
          code: "forbidden",
          retryable: false,
          message: result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({
        error: {
          code: result.code === "stale_generation" ? "stale_generation" : "invalid",
          retryable: false,
          message: result.errorMessage,
          ...(typeof result.currentChangeSetId === "string" && typeof result.currentChangeSetRevision === "number"
            ? {
                currentChangeSetId: result.currentChangeSetId,
                currentChangeSetRevision: result.currentChangeSetRevision
              }
            : {})
        }
      });
      return;
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        mode: "servicenow",
        page: result.result.page,
        changeSetId: result.authority.changeSetId,
        changeSetRevision: result.authority.changeSetRevision
      }
    });
  } catch (error) {
    const body = readRequestBody(request);
    response.setStatus?.(500);
    logUnexpectedPageSaveError(error, summarizeRequestBody(body));
    response.setBody({
      error: {
        code: "persistence_invariant",
        retryable: false,
        message: "Something went wrong while saving the page body. Please try again."
      }
    });
  }
}
