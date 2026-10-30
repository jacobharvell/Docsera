import { gs } from "@servicenow/glide";
import { createServiceNowPageListingService } from "../pages/serviceNowPageListing.ts";

type RequestLike = {
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

function readValueFromQuery(value: unknown): string {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const text = cleanText(candidate);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (value && typeof value === "object") {
    return cleanText((value as Record<string, unknown>).value) || cleanText((value as Record<string, unknown>).sys_id);
  }

  return cleanText(value);
}

function readQueryParam(request: RequestLike | undefined, key: string): string {
  const queryString = cleanText(request?.queryString);
  if (!queryString) {
    const queryParams = request?.queryParams;
    if (queryParams && typeof queryParams === "object") {
      return readValueFromQuery((queryParams as Record<string, unknown>)[key]);
    }

    return "";
  }

  const normalizedQuery = queryString.startsWith("?") ? queryString.slice(1) : queryString;
  for (const entry of normalizedQuery.split("&")) {
    if (!entry) {
      continue;
    }

    const [rawKey, ...rawValueParts] = entry.split("=");
    if (cleanText(decodeURIComponent(rawKey || "")) !== key) {
      continue;
    }

    const rawValue = rawValueParts.join("=");
    if (!rawValue) {
      return "";
    }

    return cleanText(decodeURIComponent(rawValue.replace(/\+/g, " ")));
  }

  const queryParams = request?.queryParams;
  if (queryParams && typeof queryParams === "object") {
    return readValueFromQuery((queryParams as Record<string, unknown>)[key]);
  }

  return "";
}

function normalizePagePayload(result: {
  items?: unknown[];
  mode?: "edit" | "live";
  workspaceSlug?: string;
  workspaceSysId?: string;
  totalCount?: number;
}) {
  return {
    mode: "servicenow",
    pageMode: result.mode ?? "live",
    items: result.items ?? [],
    workspaceSlug: cleanText(result.workspaceSlug),
    workspaceSysId: cleanText(result.workspaceSysId),
    totalCount: Number(result.totalCount) || (result.items ?? []).length
  };
}

function logUnexpectedPageListingError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page listing failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page listing] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

function summarizeRequest(request: RequestLike) {
  const workspaceSlug = readQueryParam(request, "workspaceSlug") || readQueryParam(request, "workspace");
  const mode = readQueryParam(request, "mode");
  return { workspaceSlugPresent: Boolean(workspaceSlug), workspaceSlugLength: workspaceSlug.length, mode: mode === "edit" ? "edit" : mode ? "other" : "absent" };
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowPageListingService();
    const workspaceSlug = readQueryParam(request, "workspaceSlug") || readQueryParam(request, "workspace");
    const result = await service.listPages({
      mode: readQueryParam(request, "mode") === "edit" ? "edit" : "live",
      workspaceSlug
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
          message: result.errorMessage
        }
      });
      return;
    }

    response.setBody({
      result: normalizePagePayload({
        items: result.pages,
        mode: result.mode,
        workspaceSlug: result.workspace.slug,
        workspaceSysId: result.workspace.sysId,
        totalCount: result.pages.length
      })
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedPageListingError(error, {
      ...summarizeRequest(request)
    });
    response.setBody({
      error: {
        message: "Unable to load pages. Please try again."
      }
    });
  }
}
