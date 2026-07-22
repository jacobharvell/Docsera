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

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20")).trim();
  } catch {
    return "";
  }
}

function encodeRouteSegment(value: string): string {
  return encodeURIComponent(cleanText(value));
}

function readHashRoute(hash: string): { params: URLSearchParams; segments: string[] } {
  const rawHash = cleanText(hash);
  if (!rawHash || rawHash === "#") {
    return { params: new URLSearchParams(), segments: [] };
  }

  const routeText = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const [rawPath = "", rawQuery = ""] = routeText.split("?", 2);
  const path = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  return {
    params: new URLSearchParams(rawQuery),
    segments: path.split("/").map(decodeRouteSegment).filter(Boolean)
  };
}

function getRuntimeBasePath(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.pathname || "/";
}

function readLegacyQueryRoute(search: string): DocseraAppRoute | null {
  const params = new URLSearchParams(search);
  const workspaceSlug = readParam(params, "workspace");
  const view = readParam(params, "view");

  if (workspaceSlug) {
    return {
      mode: "workspace",
      legacyPageId: readParam(params, "page_id"),
      pageSlug: readParam(params, "page"),
      settingsIntent: readParam(params, "settings") === "1",
      workspaceMode: readParam(params, "mode") === "edit" ? "edit" : "live",
      workspaceSlug,
    } satisfies DocseraAppRoute;
  }

  if (view === "my-workspaces") {
    return { mode: "launcher" } satisfies DocseraAppRoute;
  }

  return null;
}

export function readAppRoute(location: Pick<Location, "hash" | "search"> | URL): DocseraAppRoute {
  const hashRoute = readHashRoute(location.hash);
  const workspaceSlug = hashRoute.segments[0] ?? "";

  if (workspaceSlug) {
    const route = {
      mode: "workspace",
      legacyPageId: "",
      pageSlug: hashRoute.segments[1] ?? "",
      settingsIntent: readParam(hashRoute.params, "settings") === "1",
      workspaceMode: readParam(hashRoute.params, "mode") === "edit" ? "edit" : "live",
      workspaceSlug
    } satisfies DocseraAppRoute;
    recordRouteParse(location.hash || location.search, route, true, false, "hash");
    return route;
  }

  const legacyRoute = readLegacyQueryRoute(location.search);
  if (legacyRoute) {
    recordRouteParse(location.search, legacyRoute, legacyRoute.mode === "workspace", legacyRoute.mode === "launcher", "query");
    return legacyRoute;
  }

  const route = { mode: "launcher" } satisfies DocseraAppRoute;
  recordRouteParse(location.hash || location.search, route, false, true, "root");
  return route;
}

function recordRouteParse(
  rawRoute: string,
  route: DocseraAppRoute,
  workspacePresent: boolean,
  defaultedToLauncher: boolean,
  source: "hash" | "query" | "root"
): void {
  recordDocseraDiagnosticEvent("route.parse", {
    defaultedToLauncher,
    pageSlug: route.mode === "workspace" ? route.pageSlug : "",
    parsedRoute: route,
    rawRoute,
    rawSearch: rawRoute,
    routeSource: source,
    requestedMode: route.mode === "workspace" ? route.workspaceMode : "",
    workspacePresent,
    workspaceSlug: route.mode === "workspace" ? route.workspaceSlug : ""
  });
}

export function buildLauncherHref(): string {
  return getRuntimeBasePath();
}

export function buildWorkspaceHref(
  workspaceSlug: string,
  options: {
    mode?: WorkspaceMode;
    pageSlug?: string;
    settingsIntent?: boolean;
  } = {}
): string {
  const workspaceSegment = encodeRouteSegment(workspaceSlug);
  const pageSegment = encodeRouteSegment(options.pageSlug ?? "");
  const routeSegments = [workspaceSegment, pageSegment].filter(Boolean).join("/");
  const params = new URLSearchParams();

  if (options.mode === "edit") {
    params.set("mode", "edit");
  }

  if (options.settingsIntent) {
    params.set("settings", "1");
  }

  const query = params.toString();
  return `${getRuntimeBasePath()}#/${routeSegments}${query ? `?${query}` : ""}`;
}

export function replaceWorkspaceIntentState(
  workspaceSlug: string,
  options: {
    mode?: WorkspaceMode;
    pageSlug?: string;
  } = {}
): string {
  return buildWorkspaceHref(workspaceSlug, {
    mode: options.mode,
    pageSlug: options.pageSlug
  });
}

