import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  glide: {
    gs: {
      error: vi.fn()
    }
  },
  service: {
    getWorkspaceMediaFile: vi.fn(),
    listWorkspaceMedia: vi.fn(),
    uploadWorkspaceMedia: vi.fn()
  }
}));

vi.mock("../workspaces/serviceNowWorkspaceMedia.ts", () => ({
  createServiceNowWorkspaceMediaService: () => mocks.service
}));

vi.mock("@servicenow/glide", () => ({
  gs: mocks.glide.gs
}));

import { process as processWorkspaceMediaFile } from "./docsera-runtime-workspace-media-file.ts";
import { process as processWorkspaceMediaList } from "./docsera-runtime-workspace-media.ts";
import { process as processWorkspaceMediaUpload } from "./docsera-runtime-workspace-media-upload.ts";

function createResponseRecorder() {
  const writer = {
    writeStream: vi.fn()
  };

  return {
    body: undefined as unknown,
    headers: undefined as Record<string, string> | undefined,
    status: undefined as number | undefined,
    writer,
    getStreamWriter() {
      return writer;
    },
    setBody(payload: unknown) {
      this.body = payload;
    },
    setHeaders(headers: Record<string, string>) {
      this.headers = headers;
    },
    setStatus(status: number) {
      this.status = status;
    }
  };
}

describe("workspace media routes", () => {
  beforeEach(() => {
    mocks.glide.gs.error.mockReset();
    mocks.service.getWorkspaceMediaFile.mockReset();
    mocks.service.listWorkspaceMedia.mockReset();
    mocks.service.uploadWorkspaceMedia.mockReset();
  });

  it("lists workspace media through the shared service boundary", async () => {
    mocks.service.listWorkspaceMedia.mockResolvedValue({
      kind: "succeeded",
      items: [
        {
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png",
          sizeBytes: 1024,
          createdOn: "2026-08-19 09:00:00",
          updatedOn: "2026-08-19 09:00:00"
        }
      ]
    });

    const response = createResponseRecorder();

    await processWorkspaceMediaList(
      {
        queryString: "workspaceSysId=workspace-001"
      },
      response
    );

    expect(mocks.service.listWorkspaceMedia).toHaveBeenCalledWith({
      workspaceSysId: "workspace-001"
    });
    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({
      result: {
        items: [
          {
            mediaId: "media-001",
            fileName: "diagram.png",
            contentType: "image/png",
            sizeBytes: 1024,
            createdOn: "2026-08-19 09:00:00",
            updatedOn: "2026-08-19 09:00:00"
          }
        ]
      }
    });
  });

  it("uploads raw request streams and the lease header through the media service", async () => {
    mocks.service.uploadWorkspaceMedia.mockResolvedValue({
      kind: "succeeded",
      media: {
        mediaId: "media-001",
        fileName: "diagram.png",
        contentType: "image/png",
        sizeBytes: 1024,
        createdOn: "2026-08-19 09:00:00",
        updatedOn: "2026-08-19 09:00:00"
      }
    });

    const response = createResponseRecorder();

    await processWorkspaceMediaUpload(
      {
        body: {
          data: {
            ignored: true
          },
          dataStream: "raw-image-stream"
        },
        headers: {
          "Content-Type": "image/png",
          "X-Docsera-Workspace-Lease-Token": "lease-token"
        },
        queryString: "workspaceSysId=workspace-001&fileName=diagram.png"
      },
      response
    );

    expect(mocks.service.uploadWorkspaceMedia).toHaveBeenCalledWith({
      contentLengthBytes: null,
      contentType: "image/png",
      dataStream: "raw-image-stream",
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: "workspace-001"
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      result: {
        media: {
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png",
          sizeBytes: 1024,
          createdOn: "2026-08-19 09:00:00",
          updatedOn: "2026-08-19 09:00:00"
        }
      }
    });
  });

  it("streams validated media bytes with the attachment MIME type on retrieval", async () => {
    mocks.service.getWorkspaceMediaFile.mockResolvedValue({
      kind: "succeeded",
      contentStream: "validated-binary-stream",
      contentType: "image/png",
      media: {
        mediaId: "media-001",
        fileName: "diagram.png",
        contentType: "image/png",
        sizeBytes: 1024,
        createdOn: "2026-08-19 09:00:00",
        updatedOn: "2026-08-19 09:00:00"
      }
    });

    const response = createResponseRecorder();

    await processWorkspaceMediaFile(
      {
        queryString: "workspaceSysId=workspace-001&mediaId=media-001"
      },
      response
    );

    expect(mocks.service.getWorkspaceMediaFile).toHaveBeenCalledWith({
      mediaId: "media-001",
      workspaceSysId: "workspace-001"
    });
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({
      "Content-Type": "image/png"
    });
    expect(response.writer.writeStream).toHaveBeenCalledWith("validated-binary-stream");
    expect(response.body).toBeUndefined();
  });

  it("surfaces missing attachment content as a safe 404 without streaming bytes", async () => {
    mocks.service.getWorkspaceMediaFile.mockResolvedValue({
      kind: "failed",
      status: 404,
      errorMessage: "Media could not be found."
    });

    const response = createResponseRecorder();

    await processWorkspaceMediaFile(
      {
        queryString: "workspaceSysId=workspace-001&mediaId=media-001"
      },
      response
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        message: "Media could not be found."
      }
    });
    expect(response.writer.writeStream).not.toHaveBeenCalled();
  });

  it("surfaces media service failures as safe REST errors", async () => {
    mocks.service.uploadWorkspaceMedia.mockResolvedValue({
      kind: "failed",
      status: 403,
      errorMessage: "A valid workspace edit lease is required to upload media."
    });

    const response = createResponseRecorder();

    await processWorkspaceMediaUpload(
      {
        body: {
          dataStream: "raw-image-stream"
        },
        headers: {
          "Content-Type": "image/png",
          "X-Docsera-Workspace-Lease-Token": "lease-token"
        },
        queryString: "workspaceSysId=workspace-001&fileName=diagram.png"
      },
      response
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        message: "A valid workspace edit lease is required to upload media."
      }
    });
  });

  it("redacts query data while retaining bounded metadata for list, retrieval, and upload exceptions", async () => {
    mocks.service.listWorkspaceMedia.mockRejectedValue(new Error("list failure"));
    mocks.service.getWorkspaceMediaFile.mockRejectedValue(new Error("file failure"));
    mocks.service.uploadWorkspaceMedia.mockRejectedValue(new Error("upload failure"));
    const request = {
      body: { dataStream: "raw-image-stream" },
      headers: { "Content-Type": "image/png", "X-Docsera-Workspace-Lease-Token": "LEASE-TOKEN-MARKER" },
      queryString: "workspaceSysId=QUERY-WORKSPACE-MARKER&mediaId=QUERY-MEDIA-MARKER&fileName=QUERY-FILE-MARKER&unexpected=UNEXPECTED-QUERY-MARKER"
    };

    await processWorkspaceMediaList(request, createResponseRecorder());
    await processWorkspaceMediaFile(request, createResponseRecorder());
    await processWorkspaceMediaUpload(request, createResponseRecorder());

    const logs = mocks.glide.gs.error.mock.calls.map(([entry]) => String(entry)).join("\n");
    expect(logs).toContain("\"workspaceSysIdLength\":22");
    expect(logs).toContain("\"mediaIdLength\":18");
    expect(logs).toContain("\"fileNameLength\":17");
    expect(logs).toContain("\"contentTypePresent\":true");
    expect(logs).not.toContain("QUERY-WORKSPACE-MARKER");
    expect(logs).not.toContain("QUERY-MEDIA-MARKER");
    expect(logs).not.toContain("QUERY-FILE-MARKER");
    expect(logs).not.toContain("UNEXPECTED-QUERY-MARKER");
    expect(logs).not.toContain("LEASE-TOKEN-MARKER");
  });
});
