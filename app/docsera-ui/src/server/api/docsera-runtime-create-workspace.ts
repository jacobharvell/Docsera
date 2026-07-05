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

    response.setBody({
      result: {
        mode: "servicenow",
        workspace: result.workspace,
        groups: {
          admin: result.adminGroup,
          editor: result.editorGroup
        },
        roleNames: service.roleNames
      }
    });
  } catch (error) {
    if (typeof response.setStatus === "function") {
      response.setStatus(400);
    }

    const message = error instanceof Error ? error.message : "Workspace creation failed.";
    gs.error(`[Docsera workspace provisioning] ${message}`);

    response.setBody({
      error: {
        message
      }
    });
  }
}
