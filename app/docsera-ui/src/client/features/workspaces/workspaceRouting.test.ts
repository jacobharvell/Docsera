import { describe, expect, it } from "vitest";
import { buildLauncherHref, buildWorkspaceHref, readAppRoute, replaceWorkspaceIntentState } from "./workspaceRouting";

describe("workspace routing", () => {
  it("reads mode-aware workspace routes and preserves them in hrefs", () => {
    const route = readAppRoute({
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

    expect(buildWorkspaceHref("product-docs", { pageSlug: "overview" })).toBe("?workspace=product-docs&page=overview");
    expect(buildWorkspaceHref("product-docs", { mode: "edit", pageSlug: "details", settingsIntent: true })).toBe(
      "?workspace=product-docs&page=details&mode=edit&settings=1"
    );
    expect(replaceWorkspaceIntentState("product-docs", { mode: "edit", pageSlug: "details" })).toBe(
      "?workspace=product-docs&page=details&mode=edit"
    );
  });

  it("falls back to the launcher route when no workspace is present", () => {
    expect(readAppRoute({ search: "?view=my-workspaces" } as Location)).toEqual({
      mode: "launcher"
    });

    expect(buildLauncherHref()).toBe("?view=my-workspaces");
  });
});
