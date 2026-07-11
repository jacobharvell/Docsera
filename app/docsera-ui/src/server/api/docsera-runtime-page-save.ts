import { gs } from "@servicenow/glide";
import { createServiceNowPageBodySaveService } from "../pages/serviceNowPageDraftPersistence.ts";

type RequestLike = {
  body?: unknown;
  data?: unknown;
};

type ResponseLike = {
  setBody: (payload: unknown) => void;
  setStatus?: (status: number) => void;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRequestBody(request: RequestLike): Record<string, unknown> {
  const rawBody = request?.body ?? request?.data;

  if (rawBody && typeof rawBody === "object" && "data" in rawBody && rawBody.data && typeof rawBody.data === "object") {
    return rawBody.data as Record<string, unknown>;
  }

  return rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : {};
}

function summarizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  const draftBodyText = cleanText(body.draftBodyText);

  return {
    workspaceSlug: cleanText(body.workspaceSlug) || undefined,
    workspaceSysId: cleanText(body.workspaceSysId) || undefined,
    pageSysId: cleanText(body.pageSysId) || undefined,
    pageSlug: cleanText(body.pageSlug) || undefined,
    draftBodyTextPresent: Boolean(draftBodyText),
    draftBodyTextLength: draftBodyText.length,
    expectedRevision: Number.isSafeInteger(Number(body.expectedRevision)) ? Number(body.expectedRevision) : undefined
  };
}

function logUnexpectedPageSaveError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page save failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page save] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowPageBodySaveService();
    const body = readRequestBody(request);
    const result = await service.savePageBody({
      workspaceSlug: cleanText(body.workspaceSlug),
      workspaceSysId: cleanText(body.workspaceSysId),
      pageSysId: cleanText(body.pageSysId),
      pageSlug: cleanText(body.pageSlug),
      draftBodyText: cleanText(body.draftBodyText) || "",
      draftContentJson: body.draftContentJson,
      expectedRevision: Number.isSafeInteger(Number(body.expectedRevision)) ? Number(body.expectedRevision) : undefined
    });

    if (result.kind === "forbidden") {
      response.setStatus?.(403);
      response.setBody({
        error: {
          message: result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "failed") {
      response.setStatus?.(result.status);
      response.setBody({
        error: {
          message: result.errorMessage
        }
      });
      return;
    }

    if (result.kind === "conflict") {
      response.setStatus?.(409);
      response.setBody({
        error: {
          code: "draft_revision_conflict",
          message: result.errorMessage,
          currentRevision: result.currentRevision
        }
      });
      return;
    }

    response.setStatus?.(200);
    response.setBody({
      result: {
        mode: "servicenow",
        page: result.page
      }
    });
  } catch (error) {
    const body = readRequestBody(request);
    response.setStatus?.(500);
    logUnexpectedPageSaveError(error, summarizeRequestBody(body));
    response.setBody({
      error: {
        message: "Something went wrong while saving the page body. Please try again."
      }
    });
  }
}
