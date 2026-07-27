import { describe, expect, it, vi } from "vitest";
import {
  initializeWorkspaceFoundationViaLiveLoad,
  prepareProvisionedWorkspaceForEdit
} from "./workspace-verifier-runtime-sequence.mjs";

describe("workspace verifier runtime sequence", () => {
  it("loads the newly provisioned workspace through the live page route before acquiring Edit", async () => {
    const calls = [];
    const workspace = { slug: "new-workspace", sysId: "workspace-1" };
    const createWorkspace = vi.fn(async () => {
      calls.push("create");
      return { workspace };
    });
    const initializeWorkspace = vi.fn(async ({ workspace: initializedWorkspace }) => {
      calls.push(`initialize:${initializedWorkspace.slug}`);
    });
    const acquireLease = vi.fn(async ({ workspace: leasedWorkspace }) => {
      calls.push(`acquire:${leasedWorkspace.slug}`);
      return { state: "held" };
    });

    const result = await prepareProvisionedWorkspaceForEdit({
      acquireLease,
      createWorkspace,
      initializeWorkspace
    });

    expect(calls).toEqual(["create", "initialize:new-workspace", "acquire:new-workspace"]);
    expect(result.workspace).toEqual(workspace);
  });

  it("uses live page loading for workspace foundation initialization", async () => {
    const listPages = vi.fn(async () => []);
    const workspace = { slug: "workspace-live-load" };

    await initializeWorkspaceFoundationViaLiveLoad({ listPages, workspace });

    expect(listPages).toHaveBeenCalledWith("workspace-live-load", "live");
  });
});
