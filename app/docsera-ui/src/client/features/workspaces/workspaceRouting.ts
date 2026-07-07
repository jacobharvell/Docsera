import { createMyWorkspacesRouteQuery, createWorkspaceRouteQuery } from "../../../shared/workspaces/domain";

export type DocseraAppRoute =
  | {
      mode: "launcher";
    }
  | {
      mode: "workspace";
      settingsIntent: boolean;
      workspaceSlug: string;
      pageId: string;
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readParam(params: URLSearchParams, key: string): string {
  return cleanText(params.get(key) ?? "");
}

export function readAppRoute(location: Location): DocseraAppRoute {
  const params = new URLSearchParams(location.search);
  const workspaceSlug = readParam(params, "workspace");
  const view = readParam(params, "view");

  if (workspaceSlug) {
    return {
      mode: "workspace",
      settingsIntent: readParam(params, "settings") === "1",
      workspaceSlug,
      pageId: readParam(params, "page_id")
    };
  }

  if (view === "my-workspaces") {
    return { mode: "launcher" };
  }

  return { mode: "launcher" };
}

export function buildLauncherHref(): string {
  return createMyWorkspacesRouteQuery();
}

export function buildWorkspaceHref(workspaceSlug: string, settingsIntent = false, pageId = ""): string {
  return createWorkspaceRouteQuery(workspaceSlug, settingsIntent, pageId);
}

export function replaceWorkspaceIntentState(workspaceSlug: string, pageId = ""): string {
  return createWorkspaceRouteQuery(workspaceSlug, false, pageId);
}

