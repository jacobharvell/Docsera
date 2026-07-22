export type StandaloneLaunchPreparation =
  | {
      kind: "continue";
      targetUrl: string;
    }
  | {
      kind: "redirected";
      targetUrl: string;
    }
  | {
      currentUrl: string;
      details: Record<string, unknown>;
      kind: "failed";
      message: string;
      targetUrl: string;
    };

type LaunchLocation = Pick<Location, "hash" | "href" | "pathname" | "search"> & {
  replace?: (url: string) => void;
};

type LaunchWindow = {
  location: LaunchLocation;
  self: unknown;
  top: unknown;
};

type LaunchDocument = Pick<Document, "body" | "createElement" | "title">;

type LaunchConsole = Pick<Console, "error">;

type LaunchEnvironment = {
  console: LaunchConsole;
  document: LaunchDocument;
  window: LaunchWindow;
};

const DOCSERA_LAUNCH_FAILURE_ROOT_ID = "docsera-launch-failure";

export function prepareStandaloneRuntimeLaunch(environment: LaunchEnvironment = defaultEnvironment()): StandaloneLaunchPreparation {
  const currentUrl = readCurrentUrl(environment.window);
  const targetUrl = buildDirectRuntimeUrl(environment.window);
  const frameState = readFrameState(environment.window);

  if (!frameState.framed) {
    return {
      kind: "continue",
      targetUrl
    };
  }

  if (!frameState.topAccessible || !frameState.topWindow) {
    return {
      currentUrl,
      details: {
        frameCheckError: frameState.errorMessage,
        topAccessible: frameState.topAccessible
      },
      kind: "failed",
      message: "Docsera could not open outside the ServiceNow navigator frame.",
      targetUrl
    };
  }

  try {
    frameState.topWindow.location.replace(targetUrl);
    return {
      kind: "redirected",
      targetUrl
    };
  } catch (error) {
    return {
      currentUrl,
      details: {
        redirectError: error instanceof Error ? error.message : String(error)
      },
      kind: "failed",
      message: "Docsera could not switch this launch into the standalone runtime.",
      targetUrl
    };
  }
}

export function renderStandaloneLaunchFailure(result: Extract<StandaloneLaunchPreparation, { kind: "failed" }>, environment: LaunchEnvironment = defaultEnvironment()): void {
  const { document, console } = environment;
  const body = document.body;
  if (!body) {
    return;
  }

  body.innerHTML = "";
  document.title = "Docsera Launch Failed";

  const root = document.createElement("main");
  root.id = DOCSERA_LAUNCH_FAILURE_ROOT_ID;
  root.setAttribute(
    "style",
    "font-family:Segoe UI,Arial,sans-serif;max-width:40rem;margin:8vh auto;padding:2rem 1.5rem;background:#fff;border:1px solid #d6dce5;border-radius:16px;box-shadow:0 12px 32px rgba(15,23,42,.08);color:#122033;line-height:1.5;"
  );

  const heading = document.createElement("h1");
  heading.textContent = "Open Docsera in a full page";
  heading.setAttribute("style", "margin:0 0 .75rem;font-size:1.5rem;line-height:1.2;");
  root.appendChild(heading);

  const message = document.createElement("p");
  message.textContent = result.message;
  message.setAttribute("style", "margin:0 0 1rem;");
  root.appendChild(message);

  const action = document.createElement("a");
  action.href = result.targetUrl;
  action.target = "_top";
  action.textContent = "Open the standalone runtime";
  action.setAttribute(
    "style",
    "display:inline-block;padding:.7rem 1rem;border-radius:999px;background:#0f5cc0;color:#fff;text-decoration:none;font-weight:600;"
  );
  root.appendChild(action);

  const detail = document.createElement("details");
  detail.setAttribute("style", "margin-top:1rem;");
  const summary = document.createElement("summary");
  summary.textContent = "Launch diagnostics";
  summary.setAttribute("style", "cursor:pointer;font-weight:600;");
  detail.appendChild(summary);
  const detailBody = document.createElement("pre");
  detailBody.textContent = JSON.stringify(
    {
      ...result.details,
      currentUrl: result.currentUrl,
      targetUrl: result.targetUrl
    },
    null,
    2
  );
  detailBody.setAttribute("style", "white-space:pre-wrap;word-break:break-word;margin-top:.75rem;background:#f6f8fb;padding:1rem;border-radius:12px;");
  detail.appendChild(detailBody);
  root.appendChild(detail);

  body.appendChild(root);

  console.error("[Docsera launch]", result.message, {
    ...result.details,
    currentUrl: result.currentUrl,
    targetUrl: result.targetUrl
  });
}

function buildDirectRuntimeUrl(targetWindow: LaunchWindow): string {
  return `${targetWindow.location.pathname}${targetWindow.location.search}${targetWindow.location.hash}`;
}

function readCurrentUrl(targetWindow: LaunchWindow): string {
  try {
    return targetWindow.location.href;
  } catch {
    return buildDirectRuntimeUrl(targetWindow);
  }
}

function readFrameState(targetWindow: LaunchWindow): { errorMessage: string; framed: boolean; topAccessible: boolean; topWindow: { location: { replace: (url: string) => void } } | null } {
  try {
    const topWindow = targetWindow.top as { location?: { replace?: (url: string) => void } } | null | undefined;
    if (!topWindow || typeof topWindow !== "object" || typeof topWindow.location?.replace !== "function") {
      return {
        errorMessage: "Top-level window replacement is unavailable.",
        framed: targetWindow.top !== targetWindow.self,
        topAccessible: false,
        topWindow: null
      };
    }
    return {
      errorMessage: "",
      framed: topWindow !== targetWindow.self,
      topAccessible: true,
      topWindow: topWindow as { location: { replace: (url: string) => void } }
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : String(error),
      framed: true,
      topAccessible: false,
      topWindow: null
    };
  }
}

function defaultEnvironment(): LaunchEnvironment {
  return {
    console,
    document,
    window
  };
}
