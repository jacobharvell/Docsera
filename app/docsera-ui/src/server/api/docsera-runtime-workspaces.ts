import { gs } from "@servicenow/glide";
import { createServiceNowWorkspaceCatalogService } from "../workspaces/serviceNowWorkspaceCatalog.ts";
import { toWorkspaceViewRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";

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

function readPageNumber(request: RequestLike | undefined, key: "page" | "pageSize", fallback: number): number {
  const value = Number(readQueryParam(request, key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeWorkspacePayload(result: {
  canCreateWorkspaces?: boolean;
  items?: Array<ReturnType<typeof toWorkspaceViewRecord>>;
  workspace?: ReturnType<typeof toWorkspaceViewRecord> | null;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  hasNextPage?: boolean;
  searchText?: string;
}) {
  return {
    mode: "servicenow",
    ...result
  };
}

function logUnexpectedWorkspaceError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown workspace catalog failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera workspace catalog] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowWorkspaceCatalogService();
    const workspaceSlug = readQueryParam(request, "workspaceSlug") || readQueryParam(request, "workspace");

    if (workspaceSlug) {
      const workspace = await service.getWorkspace(workspaceSlug);
      if (!workspace) {
        response.setStatus?.(404);
        response.setBody({
          error: {
            message: "Workspace could not be found."
          }
        });
        return;
      }

      response.setBody({
        result: normalizeWorkspacePayload({
          workspace: toWorkspaceViewRecord(workspace, workspace.roleLabel)
        })
      });
      return;
    }

    const result = await service.listWorkspaces({
      searchText: readQueryParam(request, "q") || readQueryParam(request, "searchText") || readQueryParam(request, "name"),
      page: readPageNumber(request, "page", 1),
      pageSize: readPageNumber(request, "pageSize", 10)
    });

    response.setBody({
      result: normalizeWorkspacePayload({
        items: result.items.map((item) => toWorkspaceViewRecord(item, item.roleLabel ?? null)),
        canCreateWorkspaces: result.canCreateWorkspaces,
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        hasNextPage: result.hasNextPage,
        searchText: result.searchText
      })
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedWorkspaceError(error, {
      queryString: cleanText(request?.queryString),
      queryParams: request?.queryParams && typeof request.queryParams === "object" ? request.queryParams : undefined
    });
    response.setBody({
      error: {
        message: "Unable to load workspaces. Please try again."
      }
    });
  }
}
