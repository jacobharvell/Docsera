import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceSettingsService } from "../workspaces/serviceNowWorkspaceSettings.ts";
import { toWorkspaceViewRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";

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
  const name = cleanText(body.name);
  const shortDescription = cleanText(body.shortDescription);
  const layout = body.layout && typeof body.layout === "object" ? body.layout as Record<string, unknown> : null;
  return { workspaceSlugPresent: Boolean(workspaceSlug), workspaceSlugLength: workspaceSlug.length, workspaceSysIdPresent: Boolean(workspaceSysId), workspaceSysIdLength: workspaceSysId.length, namePresent: Boolean(name), nameLength: name.length, shortDescriptionPresent: Boolean(shortDescription), shortDescriptionLength: shortDescription.length, iconProvided: body.icon !== undefined, layoutProvided: Boolean(layout), layoutTocVisibleProvided: typeof layout?.tocVisible === "boolean" };
}

function logUnexpectedWorkspaceSettingsError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown workspace settings failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera workspace settings] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  const body = readRequestBody(request);

  try {
    const service = createServiceNowWorkspaceSettingsService();
    const layout = body.layout && typeof body.layout === "object" ? (body.layout as Record<string, unknown>) : null;
    const result = await service.saveWorkspaceSettings({
      workspaceSlug: cleanText(body.workspaceSlug),
      workspaceSysId: cleanText(body.workspaceSysId),
      name: cleanText(body.name),
      shortDescription: cleanText(body.shortDescription) || null,
      icon: body.icon === undefined ? undefined : body.icon && (typeof body.icon === "object" || typeof body.icon === "string") ? body.icon : null,
      layout: layout
        ? {
            tocVisible: typeof layout.tocVisible === "boolean" ? layout.tocVisible : undefined
          }
        : null
    });

    if (result.kind === "forbidden") {
      response.setStatus?.(403);
      response.setBody({
        error: {
          code: "workspace_settings_forbidden",
          message: result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({
        error: {
          code: result.status === 404 ? "workspace_not_found" : "workspace_settings_invalid",
          message: result.errorMessage
        }
      });
      return;
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        mode: "servicenow",
        workspace: toWorkspaceViewRecord(result.workspace, "Admin")
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceSettingsError(error, {
      ...summarizeRequestBody(body)
    });
    response.setBody({
      error: {
        message: "Something went wrong while saving workspace settings. Your changes were not saved. Please try again."
      }
    });
  }
}
