import { describe, expect, it } from "vitest";
import { buildLauncherHref, buildWorkspaceHref, readAppRoute, replaceWorkspaceIntentState } from "./workspaceRouting";

describe("workspace routing", () => {
  it("reads workspace page_id and preserves it in workspace hrefs", () => {
    const route = readAppRoute({
      search: "?workspace=product-docs&page_id=page-002&settings=1"
    } as Location);

    expect(route).toEqual({
      mode: "workspace",
      pageId: "page-002",
      settingsIntent: true,
      workspaceSlug: "product-docs"
    });

    expect(buildWorkspaceHref("product-docs", false, "page-002")).toBe("?workspace=product-docs&page_id=page-002");
    expect(buildWorkspaceHref("product-docs", true, "page-002")).toBe("?workspace=product-docs&page_id=page-002&settings=1");
    expect(replaceWorkspaceIntentState("product-docs", "page-002")).toBe("?workspace=product-docs&page_id=page-002");
  });

  it("falls back to the launcher route when no workspace is present", () => {
    expect(readAppRoute({ search: "?view=my-workspaces" } as Location)).toEqual({
      mode: "launcher"
    });

    expect(buildLauncherHref()).toBe("?view=my-workspaces");
  });
});
