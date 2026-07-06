import { gs } from "@servicenow/glide";
import { createServiceNowPageCreationService } from "../pages/serviceNowPageCreation.ts";

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

function logUnexpectedPageCreationError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page creation failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page creation] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

export async function process(request: RequestLike, response: ResponseLike) {
  try {
    const service = createServiceNowPageCreationService();
    const body = readRequestBody(request);
    const result = await service.createPage({
      title: cleanText(body.title),
      workspaceSlug: cleanText(body.workspaceSlug),
      parentPageSysId: cleanText(body.parentPageSysId) || null
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
      response.setStatus?.(400);
      response.setBody({
        error: {
          message: result.errorMessage
        }
      });
      return;
    }

    response.setStatus?.(201);
    response.setBody({
      result: {
        mode: "servicenow",
        page: result.page
      }
    });
  } catch (error) {
    response.setStatus?.(500);
    logUnexpectedPageCreationError(error, {
      requestBody: readRequestBody(request)
    });
    response.setBody({
      error: {
        message: "Something went wrong while creating the page. The page was not created. Please try again."
      }
    });
  }
}
