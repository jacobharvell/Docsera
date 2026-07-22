import { describe, expect, it } from "vitest";
import { buildLauncherHref, buildWorkspaceHref, readAppRoute, replaceWorkspaceIntentState } from "./workspaceRouting";

describe("workspace routing", () => {
  it("parses and builds canonical My Workspaces, workspace, and page routes", () => {
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do");

    expect(readAppRoute(new URL("https://example.test/x_82900_docsera_docsera_sdk_runtime.do"))).toEqual({
      mode: "launcher"
    });
    expect(readAppRoute(new URL("https://example.test/x_82900_docsera_docsera_sdk_runtime.do#/product-docs"))).toEqual({
      legacyPageId: "",
      mode: "workspace",
      pageSlug: "",
      settingsIntent: false,
      workspaceMode: "live",
      workspaceSlug: "product-docs"
    });
    expect(readAppRoute(new URL("https://example.test/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/details?mode=edit"))).toEqual({
      legacyPageId: "",
      mode: "workspace",
      pageSlug: "details",
      settingsIntent: false,
      workspaceMode: "edit",
      workspaceSlug: "product-docs"
    });

    expect(buildLauncherHref()).toBe("/x_82900_docsera_docsera_sdk_runtime.do");
    expect(buildWorkspaceHref("product-docs")).toBe("/x_82900_docsera_docsera_sdk_runtime.do#/product-docs");
    expect(buildWorkspaceHref("product-docs", { pageSlug: "overview" })).toBe("/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview");
    expect(buildWorkspaceHref("product-docs", { mode: "edit", pageSlug: "details", settingsIntent: true })).toBe(
      "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/details?mode=edit&settings=1"
    );
    expect(replaceWorkspaceIntentState("product-docs", { mode: "edit", pageSlug: "details" })).toBe(
      "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/details?mode=edit"
    );
  });

  it("encodes and decodes workspace and page route segments safely", () => {
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do");

    expect(buildWorkspaceHref("api docs", { pageSlug: "getting/started" })).toBe(
      "/x_82900_docsera_docsera_sdk_runtime.do#/api%20docs/getting%2Fstarted"
    );
    expect(readAppRoute(new URL("https://example.test/x_82900_docsera_docsera_sdk_runtime.do#/api%20docs/getting%2Fstarted"))).toEqual({
      legacyPageId: "",
      mode: "workspace",
      pageSlug: "getting/started",
      settingsIntent: false,
      workspaceMode: "live",
      workspaceSlug: "api docs"
    });
  });

  it("keeps live implicit and edit explicit in the canonical URL", () => {
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do");

    expect(buildWorkspaceHref("product-docs", { mode: "live", pageSlug: "overview" })).toBe(
      "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview"
    );
    expect(buildWorkspaceHref("product-docs", { mode: "edit", pageSlug: "overview" })).toBe(
      "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview?mode=edit"
    );
  });

  it("reads legacy query routes without building new query routes", () => {
    const route = readAppRoute({
      hash: "",
      search: "?workspace=product-docs&page=details&mode=edit&settings=1"
    } as Location);

    expect(route).toEqual({
      legacyPageId: "",
      mode: "workspace",
      pageSlug: "details",
      settingsIntent: true,
      workspaceMode: "edit",
      workspaceSlug: "product-docs"
    });
  });

  it("falls back to the launcher route when no workspace is present", () => {
    expect(readAppRoute({ hash: "", search: "?view=my-workspaces" } as Location)).toEqual({
      mode: "launcher"
    });

    expect(readAppRoute({ hash: "", search: "?mode=edit" } as Location)).toEqual({
      mode: "launcher"
    });
  });
});
