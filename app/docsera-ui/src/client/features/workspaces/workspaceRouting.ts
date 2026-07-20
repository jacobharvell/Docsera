import { createMyWorkspacesRouteQuery, createWorkspaceRouteQuery } from "../../../shared/workspaces/domain";
import { recordDocseraDiagnosticEvent } from "../../diagnostics";
import type { WorkspaceMode } from "../../shared/types/docsera";

export type DocseraAppRoute =
  | {
      mode: "launcher";
    }
  | {
      mode: "workspace";
      legacyPageId: string;
      pageSlug: string;
      settingsIntent: boolean;
      workspaceMode: WorkspaceMode;
      workspaceSlug: string;
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readParam(params: URLSearchParams, key: string): string {
  return cleanText(params.get(key) ?? "");
}

export function readAppRoute(location: Pick<Location, "search"> | URL): DocseraAppRoute {
  const params = new URLSearchParams(location.search);
  const workspaceSlug = readParam(params, "workspace");
  const view = readParam(params, "view");

  if (workspaceSlug) {
    const route = {
      mode: "workspace",
      legacyPageId: readParam(params, "page_id"),
      pageSlug: readParam(params, "page"),
      settingsIntent: readParam(params, "settings") === "1",
      workspaceMode: readParam(params, "mode") === "edit" ? "edit" : "live",
      workspaceSlug,
    } satisfies DocseraAppRoute;
    recordRouteParse(location.search, route, true, false);
    return route;
  }

  if (view === "my-workspaces") {
    const route = { mode: "launcher" } satisfies DocseraAppRoute;
    recordRouteParse(location.search, route, false, true);
    return route;
  }

  const route = { mode: "launcher" } satisfies DocseraAppRoute;
  recordRouteParse(location.search, route, false, true);
  return route;
}

function recordRouteParse(
  rawSearch: string,
  route: DocseraAppRoute,
  workspacePresent: boolean,
  defaultedToLauncher: boolean
): void {
  recordDocseraDiagnosticEvent("route.parse", {
    defaultedToLauncher,
    pageSlug: route.mode === "workspace" ? route.pageSlug : "",
    parsedRoute: route,
    rawSearch,
    requestedMode: route.mode === "workspace" ? route.workspaceMode : "",
    workspacePresent,
    workspaceSlug: route.mode === "workspace" ? route.workspaceSlug : ""
  });
}

export function buildLauncherHref(): string {
  return createMyWorkspacesRouteQuery();
}

export function buildWorkspaceHref(
  workspaceSlug: string,
  options: {
    mode?: WorkspaceMode;
    pageSlug?: string;
    settingsIntent?: boolean;
  } = {}
): string {
  return createWorkspaceRouteQuery(workspaceSlug, {
    mode: options.mode === "edit" ? "edit" : "live",
    pageSlug: options.pageSlug,
    settingsIntent: options.settingsIntent
  });
}

export function replaceWorkspaceIntentState(
  workspaceSlug: string,
  options: {
    mode?: WorkspaceMode;
    pageSlug?: string;
  } = {}
): string {
  return createWorkspaceRouteQuery(workspaceSlug, {
    mode: options.mode === "edit" ? "edit" : "live",
    pageSlug: options.pageSlug
  });
}

