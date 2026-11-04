import defaultWorkspaceIconDataUri from "../../assets/docsera-default-workspace-icon.png?inline";
import { describe, expect, it } from "vitest";
import { getDefaultWorkspaceIconSrc } from "./defaultWorkspaceIconAsset";

describe("defaultWorkspaceIconAsset", () => {
  it("returns the built-in Docsera workspace icon from the forced inline import", () => {
    expect(getDefaultWorkspaceIconSrc()).toBe(defaultWorkspaceIconDataUri);
  });

  it("returns the same forced-inline source regardless of runtime script tags", () => {
    const baseline = getDefaultWorkspaceIconSrc();

    const script = document.createElement("script");
    script.src = "/uxasset/externals/x_2300756_docsera/main.jsdbx?uxpcb=1783536189";
    document.head.appendChild(script);

    expect(getDefaultWorkspaceIconSrc()).toBe(baseline);
    expect(getDefaultWorkspaceIconSrc()).toBe(defaultWorkspaceIconDataUri);
  });
});
