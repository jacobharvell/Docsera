import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gsError: vi.fn(),
  getWorkspaceIconFile: vi.fn(),
  getWorkspaceSettingsIconPreviewFile: vi.fn(),
  uploadWorkspaceIcon: vi.fn()
}));

vi.mock("@servicenow/glide", () => ({ gs: { error: mocks.gsError } }));
vi.mock("../workspaces/serviceNowWorkspaceIcons.ts", () => ({
  createServiceNowWorkspaceIconService: () => ({
    getWorkspaceIconFile: mocks.getWorkspaceIconFile,
    getWorkspaceSettingsIconPreviewFile: mocks.getWorkspaceSettingsIconPreviewFile,
    uploadWorkspaceIcon: mocks.uploadWorkspaceIcon,
    cleanupStagedWorkspaceSettingsIcon: vi.fn()
  })
}));

import { process as processWorkspaceIconFile } from "./docsera-runtime-workspace-icon-file.ts";
import { process as processWorkspaceIconUpload } from "./docsera-runtime-workspace-icon-upload.ts";

function responseRecorder() {
  return {
    body: undefined as unknown,
    status: undefined as number | undefined,
    getStreamWriter: () => ({ writeStream: vi.fn() }),
    setBody(payload: unknown) { this.body = payload; },
    setStatus(status: number) { this.status = status; }
  };
}

describe("workspace icon error logging", () => {
  beforeEach(() => {
    mocks.gsError.mockReset();
    mocks.getWorkspaceIconFile.mockReset();
    mocks.getWorkspaceSettingsIconPreviewFile.mockReset();
    mocks.uploadWorkspaceIcon.mockReset();
  });

  it("redacts raw icon query data while retaining bounded exception metadata", async () => {
    mocks.getWorkspaceIconFile.mockRejectedValue(new Error("icon file failure"));
    mocks.uploadWorkspaceIcon.mockRejectedValue(new Error("icon upload failure"));
    const request = {
      headers: { "Content-Type": "image/png" },
      queryString: "assetKey=QUERY-ASSET-MARKER&workspaceSysId=QUERY-WORKSPACE-MARKER&fileName=QUERY-FILE-MARKER&unexpected=UNEXPECTED-QUERY-MARKER"
    };

    const fileResponse = responseRecorder();
    const uploadResponse = responseRecorder();
    await processWorkspaceIconFile(request, fileResponse);
    await processWorkspaceIconUpload(request, uploadResponse);

    expect([fileResponse.status, uploadResponse.status]).toEqual([500, 500]);
    const logs = mocks.gsError.mock.calls.map(([entry]) => String(entry)).join("\n");
    expect(logs).toContain("\"assetKeyLength\":18");
    expect(logs).toContain("\"workspaceSysIdLength\":22");
    expect(logs).toContain("\"fileNameLength\":17");
    expect(logs).toContain("\"contentTypePresent\":true");
    expect(logs).not.toContain("QUERY-ASSET-MARKER");
    expect(logs).not.toContain("QUERY-WORKSPACE-MARKER");
    expect(logs).not.toContain("QUERY-FILE-MARKER");
    expect(logs).not.toContain("UNEXPECTED-QUERY-MARKER");
  });
});
