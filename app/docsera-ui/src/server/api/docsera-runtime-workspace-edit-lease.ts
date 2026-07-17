import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceEditLeaseService } from "../workspace-leases/serviceNowWorkspaceEditLeases.ts";
import { buildWorkspaceLockedMessage, cleanText, type WorkspaceEditLeaseResult } from "../workspace-leases/serverWorkspaceEditLeaseDomain.ts";

type RequestLike = { body?: unknown; data?: unknown };
type ResponseLike = { setBody(payload: unknown): void; setStatus?(status: number): void };
type Action = "acquire" | "resume" | "renew" | "release" | "status";
function bodyOf(request: RequestLike): Record<string, unknown> {
  const raw = request?.body ?? request?.data;
  return raw && typeof raw === "object" && "data" in raw && raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}
function send(action: Action, result: WorkspaceEditLeaseResult, response: ResponseLike) {
  if (result.kind === "held") {
    response.setStatus?.(200);
    response.setBody({
      result: {
        state: "held",
        ...(action === "status" ? {} : { leaseToken: result.leaseToken }),
        heartbeatIntervalMs: result.heartbeatIntervalMs,
        staleAfterMs: result.staleAfterMs,
        changeSetId: result.changeSetId,
        changeSetRevision: result.changeSetRevision,
        ...(typeof result.workspaceStateRevision === "number" ? { workspaceStateRevision: result.workspaceStateRevision } : {})
      }
    });
    return;
  }
  if (result.kind === "released" || result.kind === "unlocked") { response.setStatus?.(200); response.setBody({ result: { state: result.kind } }); return; }
  if (result.kind === "locked") { response.setStatus?.(409); response.setBody({ error: { code: "workspace_locked", retryable: false, message: buildWorkspaceLockedMessage(result.currentHolder), holderDisplayName: result.currentHolder.displayName, sameUserDifferentSession: result.currentHolder.sameUserDifferentSession } }); return; }
  if (result.kind === "lost") { response.setStatus?.(409); response.setBody({ error: { code: "workspace_lease_lost", retryable: false, message: result.errorMessage, holderDisplayName: result.currentHolder?.displayName ?? null, sameUserDifferentSession: result.currentHolder?.sameUserDifferentSession ?? false } }); return; }
  response.setStatus?.(result.status); response.setBody({ error: { code: result.status === 403 ? "forbidden" : result.status === 404 ? "not_found" : result.status === 500 ? "persistence_transient" : result.status === 409 ? "workspace_foundation_invalid" : "invalid", retryable: result.retryable, message: result.errorMessage } });
}
export function createWorkspaceEditLeaseProcessor(action: Action) {
  return async function process(request: RequestLike, response: ResponseLike) {
    const body = bodyOf(request);
    try {
      const service = createServiceNowWorkspaceEditLeaseService();
      const input = { workspaceSlug: cleanText(body.workspaceSlug), workspaceSysId: cleanText(body.workspaceSysId), leaseToken: cleanText(body.leaseToken) };
      const result = action === "acquire" ? await service.acquire(input) : action === "resume" ? await service.resume(input) : action === "renew" ? await service.renew(input) : action === "release" ? await service.release(input) : await service.status(input);
      send(action, result as WorkspaceEditLeaseResult, response);
    } catch (error) {
      gs.error(`[Docsera workspace edit lease ${action}] ${cleanText(error instanceof Error ? error.message : error) || "Unknown failure"}`);
      response.setStatus?.(500); response.setBody({ error: { code: "persistence_transient", retryable: true, message: "Something went wrong while updating the workspace edit session. Please try again." } });
    }
  };
}

/** Shared mutation boundary.  Routes resolve the workspace through the lease
 * service; they never trust a client supplied holder or actor identity. */
export async function verifyWorkspaceEditLease(input: { workspaceSlug?: unknown; workspaceSysId?: unknown; workspaceLeaseToken?: unknown }) {
  return createServiceNowWorkspaceEditLeaseService().renew({
    workspaceSlug: cleanText(input.workspaceSlug),
    workspaceSysId: cleanText(input.workspaceSysId),
    leaseToken: cleanText(input.workspaceLeaseToken)
  });
}

export function sendWorkspaceLeaseMutationFailure(result: WorkspaceEditLeaseResult, response: ResponseLike): boolean {
  if (result.kind === "held") return false;
  if (result.kind === "failed") {
    response.setStatus?.(result.status);
    response.setBody({ error: { code: result.status === 403 ? "forbidden" : "workspace_lease_invalid", retryable: result.retryable, message: result.errorMessage } });
    return true;
  }
  if (result.kind !== "locked" && result.kind !== "lost") {
    response.setStatus?.(409);
    response.setBody({ error: { code: "workspace_lease_lost", retryable: false, message: "This workspace edit session has ended." } });
    return true;
  }
  const holder = result.currentHolder;
  response.setStatus?.(409);
  response.setBody({ error: { code: "workspace_lease_lost", retryable: false, message: result.kind === "locked" ? buildWorkspaceLockedMessage(holder) : result.errorMessage, holderDisplayName: holder?.displayName ?? null, sameUserDifferentSession: holder?.sameUserDifferentSession ?? false } });
  return true;
}
