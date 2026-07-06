import { gs } from "@servicenow/glide";
import type { WorkspaceDraftInput } from "../workspaces/serverWorkspaceDomain.ts";
import { createServiceNowWorkspaceProvisioningService } from "../workspaces/serviceNowWorkspaceProvisioning.ts";

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

function normalizeWorkspaceErrorMessage(error: unknown): string {
  const rawMessage = cleanText(error instanceof Error ? error.message : error);
  if (!rawMessage) {
    return "Workspace creation failed.";
  }

  return rawMessage;
}

function cloneRoleNames(roleNames: Record<string, string>) {
  return {
    docseraAdmin: cleanText(roleNames.docseraAdmin),
    editor: cleanText(roleNames.editor),
    workspaceAdmin: cleanText(roleNames.workspaceAdmin)
  };
}

function readRequestBody(request: RequestLike): Record<string, unknown> {
  const rawBody = request?.body ?? request?.data;

  if (rawBody && typeof rawBody === "object" && "data" in rawBody && rawBody.data && typeof rawBody.data === "object") {
    return rawBody.data as Record<string, unknown>;
  }

  return rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : {};
}

function normalizeWorkspaceInput(request: RequestLike): WorkspaceDraftInput {
  const body = readRequestBody(request);
  const icon = body.icon && typeof body.icon === "object" ? (body.icon as Record<string, unknown>) : null;
  const layout = body.layout && typeof body.layout === "object" ? (body.layout as Record<string, unknown>) : null;

  return {
    name: cleanText(body.name),
    shortDescription: cleanText(body.shortDescription) || null,
    icon: icon
      ? {
          type: icon.type === "uploaded" ? "uploaded" : "builtin",
          key: cleanText(icon.key),
          label: cleanText(icon.label),
          assetPath: cleanText(icon.assetPath) || undefined
        }
      : null,
    status: body.status === "inactive" ? "inactive" : "active",
    layout: layout
      ? {
          tocVisibleByDefault: typeof layout.tocVisibleByDefault === "boolean" ? layout.tocVisibleByDefault : undefined,
          pageWidth: layout.pageWidth === "full" ? "full" : "readable"
        }
      : undefined
  };
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceProvisioningService();
    const result = await service.createWorkspace(normalizeWorkspaceInput(request));

    if (result.kind === "failed") {
      if (typeof response.setStatus === "function") {
        response.setStatus(400);
      }

      response.setBody({
        error: {
          message: result.errorMessage
        },
        result: {
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
      if (typeof response.setStatus === "function") {
        response.setStatus(202);
      }

      response.setBody({
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

    if (typeof response.setStatus === "function") {
      response.setStatus(201);
    }

    response.setBody({
      result: {
        mode: "servicenow",
        provisioning: {
          requestId: result.requestId,
          state: "succeeded",
          statusPath: service.statusPathFor(result.requestId)
        },
        workspace: result.workspace,
        groups: {
          admin: result.adminGroup,
          editor: result.editorGroup
        },
        roleNames: cloneRoleNames(service.roleNames)
      }
    });
  } catch (error) {
    if (typeof response.setStatus === "function") {
      response.setStatus(400);
    }

    const message = normalizeWorkspaceErrorMessage(error);
    gs.error(`[Docsera workspace provisioning] ${message}`);

    response.setBody({
      error: {
        message
      }
    });
  }
}
