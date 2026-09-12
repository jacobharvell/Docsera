import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceMembershipService } from "../workspaces/serviceNowWorkspaceMembers.ts";
import { readQueryParam } from "./docsera-runtime-request.ts";

type RequestLike = {
  body?: unknown;
  queryParams?: unknown;
  queryString?: string;
};

type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRequestBody(request: RequestLike | undefined): Record<string, unknown> {
  const body = request?.body;
  if (!body || typeof body !== "object") {
    return {};
  }

  const data = (body as Record<string, unknown>).data;
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }

  return body as Record<string, unknown>;
}

function readWorkspaceRef(request: RequestLike | undefined, body: Record<string, unknown>) {
  return {
    workspaceSlug: cleanText(body.workspaceSlug) || readQueryParam(request, "workspaceSlug") || readQueryParam(request, "workspace"),
    workspaceSysId: cleanText(body.workspaceSysId) || readQueryParam(request, "workspaceSysId")
  };
}

function setOutcome(response: ResponseLike, outcome: { errorMessage?: string; kind: string; status?: number }, successPayload: unknown) {
  if (outcome.kind === "succeeded") {
    response.setBody({ result: successPayload });
    return;
  }

  response.setStatus?.(outcome.kind === "forbidden" ? 403 : outcome.status ?? 500);
  response.setBody({
    error: {
      message: outcome.errorMessage || "Workspace membership request failed."
    }
  });
}

function logUnexpectedWorkspaceMemberError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown workspace membership failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera workspace membership] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export function listWorkspaceMembers(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceMembershipService();
    const outcome = service.listMembers(readWorkspaceRef(request, {}));
    setOutcome(response, outcome, outcome.kind === "succeeded" ? { members: outcome.members } : {});
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceMemberError(error, { operation: "list", queryString: cleanText(request?.queryString) });
    response.setBody({ error: { message: "Unable to load workspace members. Please try again." } });
  }
}

export function setWorkspaceMemberAccess(request: RequestLike, response: ResponseLike) {
  const body = readRequestBody(request);
  try {
    const service = createServiceNowWorkspaceMembershipService();
    const outcome = service.setMemberAccess({
      ...readWorkspaceRef(request, body),
      accessLevel: cleanText(body.accessLevel),
      userSysId: cleanText(body.userSysId)
    });
    setOutcome(response, outcome, outcome.kind === "succeeded" ? { member: outcome.member } : {});
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceMemberError(error, { operation: "set", workspaceSysId: cleanText(body.workspaceSysId) });
    response.setBody({ error: { message: "Unable to update workspace membership. Please try again." } });
  }
}

export function removeWorkspaceMemberAccess(request: RequestLike, response: ResponseLike) {
  const body = readRequestBody(request);
  try {
    const service = createServiceNowWorkspaceMembershipService();
    const outcome = service.removeMemberAccess({
      ...readWorkspaceRef(request, body),
      userSysId: cleanText(body.userSysId)
    });
    setOutcome(response, outcome, outcome.kind === "succeeded" ? { members: outcome.members } : {});
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceMemberError(error, { operation: "remove", workspaceSysId: cleanText(body.workspaceSysId) });
    response.setBody({ error: { message: "Unable to remove workspace membership. Please try again." } });
  }
}
