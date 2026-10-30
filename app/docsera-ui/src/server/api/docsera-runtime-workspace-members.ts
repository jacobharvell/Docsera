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

function summarizeQueryRequest(request: RequestLike, operation: "list" | "search") {
  const workspaceRef = readWorkspaceRef(request, {});
  const term = readQueryParam(request, "q") || readQueryParam(request, "term");
  const excludedUserCount = (readQueryParam(request, "exclude") || "").split(",").map(cleanText).filter(Boolean).length;
  const limit = Number(readQueryParam(request, "limit"));
  return { operation, workspaceSlugPresent: Boolean(workspaceRef.workspaceSlug), workspaceSlugLength: workspaceRef.workspaceSlug.length, workspaceSysIdPresent: Boolean(workspaceRef.workspaceSysId), workspaceSysIdLength: workspaceRef.workspaceSysId.length, termPresent: Boolean(term), termLength: term.length, excludedUserCount, limit: Number.isSafeInteger(limit) && limit > 0 ? limit : undefined };
}

function summarizeBodyRequest(body: Record<string, unknown>, operation: "set" | "remove") {
  const workspaceSlug = cleanText(body.workspaceSlug);
  const workspaceSysId = cleanText(body.workspaceSysId);
  const userSysId = cleanText(body.userSysId);
  return { operation, workspaceSlugPresent: Boolean(workspaceSlug), workspaceSlugLength: workspaceSlug.length, workspaceSysIdPresent: Boolean(workspaceSysId), workspaceSysIdLength: workspaceSysId.length, userSysIdPresent: Boolean(userSysId), userSysIdLength: userSysId.length, accessLevel: body.accessLevel === "admin" || body.accessLevel === "editor" || body.accessLevel === "viewer" ? body.accessLevel : undefined };
}

export function listWorkspaceMembers(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceMembershipService();
    const outcome = service.listMembers(readWorkspaceRef(request, {}));
    setOutcome(response, outcome, outcome.kind === "succeeded" ? { callerCapabilities: outcome.callerCapabilities, members: outcome.members } : {});
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceMemberError(error, summarizeQueryRequest(request, "list"));
    response.setBody({ error: { message: "Unable to load workspace members. Please try again." } });
  }
}

export function searchWorkspaceMemberUsers(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceMembershipService();
    const limit = Number(readQueryParam(request, "limit")) || 10;
    const excludedUserSysIds = (readQueryParam(request, "exclude") || "")
      .split(",")
      .map(cleanText)
      .filter(Boolean);
    const outcome = service.searchUsers({
      ...readWorkspaceRef(request, {}),
      excludedUserSysIds,
      limit,
      term: readQueryParam(request, "q") || readQueryParam(request, "term")
    });
    setOutcome(response, outcome, outcome.kind === "succeeded" ? { callerCapabilities: outcome.callerCapabilities, users: outcome.users } : {});
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceMemberError(error, summarizeQueryRequest(request, "search"));
    response.setBody({ error: { message: "Unable to search users. Please try again." } });
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
    setOutcome(response, outcome, outcome.kind === "succeeded" ? { callerCapabilities: outcome.callerCapabilities, member: outcome.member, members: outcome.members } : {});
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceMemberError(error, summarizeBodyRequest(body, "set"));
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
    setOutcome(response, outcome, outcome.kind === "succeeded" ? { callerCapabilities: outcome.callerCapabilities, members: outcome.members } : {});
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceMemberError(error, summarizeBodyRequest(body, "remove"));
    response.setBody({ error: { message: "Unable to remove workspace membership. Please try again." } });
  }
}
