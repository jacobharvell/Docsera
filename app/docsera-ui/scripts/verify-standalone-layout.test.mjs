import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readVerifierSource() {
  return readFileSync(join(process.cwd(), "scripts", "verify-standalone-layout.mjs"), "utf8");
}

describe("verify-standalone-layout", () => {
  it("does not retain background-script or durable workspace mutation paths", () => {
    const source = readVerifierSource();

    expect(source).not.toMatch(/runBackgroundScript/);
    expect(source).not.toMatch(/createWorkspace/);
    expect(source).not.toMatch(/cleanupVerificationWorkspace/);
    expect(source).not.toMatch(/findLeaseableWorkspace/);
    expect(source).not.toMatch(/listWorkspaces/);
    expect(source).not.toMatch(/lookupWorkspaceByName/);
    expect(source).not.toMatch(/lookupWorkspaceBySlug/);
    expect(source).not.toMatch(/acquireWorkspaceEditLease/);
    expect(source).not.toMatch(/createPage/);
    expect(source).not.toMatch(/savePageBody/);
    expect(source).not.toMatch(/pageDeletePath/);
    expect(source).not.toMatch(/workspaceEditLeasePath/);
    expect(source).not.toMatch(/workspacePath/);
    expect(source).not.toMatch(/workspaceProvisioningStatusPath/);
    expect(source).not.toMatch(/sys\.scripts\.do/);
    expect(source).not.toMatch(/GlideRecord/);
  });

  it("uses a temporary client-only long-content fixture in the main flow", () => {
    const source = readVerifierSource();

    expect(source).toContain('data-docsera-layout-long-fixture="true"');
    expect(source).toContain(".docsera-main__reader");
    expect(source).toContain("Expected the long-content fixture to provide a scrollable container");
    expect(source).toContain("long fixture scroll verified");
  });
});
