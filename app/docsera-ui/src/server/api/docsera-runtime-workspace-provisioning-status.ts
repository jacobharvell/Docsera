import { gs } from "@servicenow/glide";
import type { RESTAPIRequest, RESTAPIResponse } from "@servicenow/glide/sn_ws_int";
import { createServiceNowWorkspaceProvisioningService } from "../workspaces/serviceNowWorkspaceProvisioning.ts";
import { canCurrentUserCreateWorkspaces } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { toWorkspaceViewRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringFromObjectValue(value: unknown): string {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = cleanText(entry);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (value && typeof value === "object") {
    return (
      cleanText((value as Record<string, unknown>).value) ||
      cleanText((value as Record<string, unknown>).sys_id)
    );
  }

  return cleanText(value);
}

function readRequestId(request: Partial<RESTAPIRequest> | undefined): string {
  const queryParams = request?.queryParams;
  if (queryParams && typeof queryParams === "object") {
    const direct = readStringFromObjectValue((queryParams as Record<string, unknown>).requestId);
    if (direct) {
      return direct;
    }

    const sysId = readStringFromObjectValue((queryParams as Record<string, unknown>).sys_id);
    if (sysId) {
      return sysId;
    }
  }

  const queryString = cleanText(request?.queryString);
  if (queryString) {
    for (const segment of queryString.split("&")) {
      const [rawKey, rawValue] = segment.split("=", 2);
      if (cleanText(rawKey) === "requestId" || cleanText(rawKey) === "sys_id") {
        return cleanText(decodeURIComponent(rawValue || ""));
      }
    }
  }

  return "";
}

function cloneRoleNames(roleNames: Record<string, string>) {
  return {
    docseraAdmin: cleanText(roleNames.docseraAdmin),
    editor: cleanText(roleNames.editor),
    workspaceAdmin: cleanText(roleNames.workspaceAdmin)
  };
}

function logUnexpectedWorkspaceProvisioningStatusError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown workspace provisioning status failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera workspace provisioning status] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: Partial<RESTAPIRequest>, response: Partial<RESTAPIResponse>) {
  if (!canCurrentUserCreateWorkspaces()) {
    response.setStatus?.(403);
    response.setBody?.({
      error: {
        code: "workspace_provisioning_status_forbidden",
        message: "You do not have permission to check workspace provisioning status."
      }
    });
    return;
  }

  const requestId = readRequestId(request);
  if (!requestId) {
    response.setStatus?.(400);
    response.setBody?.({
      error: {
        message: "Workspace provisioning requestId is required."
      }
    });
    return;
  }

  try {
    const service = createServiceNowWorkspaceProvisioningService();
    const result = await service.getProvisioningStatus(requestId);
    if (!result) {
      response.setStatus?.(404);
      response.setBody?.({
        error: {
          message: "Workspace provisioning request could not be found."
        }
      });
      return;
    }

    if (result.kind === "failed") {
      response.setBody?.({
        result: {
          error: {
            code: result.errorCode,
            message: result.errorMessage
          },
          mode: "servicenow",
          provisioning: {
            requestId: result.requestId,
            state: "failed",
            statusPath: service.statusPathFor(result.requestId)
          },
          roleNames: cloneRoleNames(service.roleNames)
        }
      });
      return;
    }

    if (result.kind === "pending") {
      response.setBody?.({
        result: {
          mode: "servicenow",
          provisioning: {
            pollAfterMs: 1000,
            requestId: result.requestId,
            state: result.state,
            statusPath: service.statusPathFor(result.requestId)
          },
          roleNames: cloneRoleNames(service.roleNames)
        }
      });
      return;
    }

      response.setBody?.({
        result: {
          mode: "servicenow",
          provisioning: {
            requestId: result.requestId,
            state: "succeeded",
            statusPath: service.statusPathFor(result.requestId)
          },
          workspace: toWorkspaceViewRecord(result.workspace, "Admin"),
          groups: {
            admin: result.adminGroup,
            editor: result.editorGroup
          },
        roleNames: cloneRoleNames(service.roleNames)
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceProvisioningStatusError(error, { requestId });
    response.setBody?.({
      error: {
        message: "Workspace provisioning status could not be checked. Please try again."
      }
    });
  }
}
