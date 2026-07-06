import { useEffect, useState } from "react";
import { DocseraAppFrame } from "./DocseraAppFrame";
import { MyWorkspacesScreen } from "../features/workspaces/MyWorkspacesScreen";
import { WorkspaceShell } from "../features/workspaces/WorkspaceShell";
import { buildWorkspaceShellWorkspace } from "../features/workspaces/workspaceViewModels";
import { buildLauncherHref, buildWorkspaceHref, readAppRoute, type DocseraAppRoute } from "../features/workspaces/workspaceRouting";
import type {
  DocseraRuntimeContext,
  PingResult,
  RuntimeProbeState,
  ServiceNowClient,
  WorkspaceCreatePending,
  WorkspaceCreateResult,
  WorkspaceListResult,
  WorkspaceViewRecord
} from "../shared/types/docsera";

type WorkspaceListState =
  | { status: "idle" }
  | { status: "loading" }
  | { data: WorkspaceListResult; status: "success" }
  | { errorMessage: string; status: "error" };

type WorkspaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { errorMessage: string; status: "error" }
  | { data: WorkspaceViewRecord; status: "success" };

const DEFAULT_PAGE_SIZE = 10;

function createInitialPingState(runtime: DocseraRuntimeContext): RuntimeProbeState {
  return runtime.config.backendPingPath ? { status: "loading" } : { status: "idle" };
}

function createInitialRoute(): DocseraAppRoute {
  return readAppRoute(window.location);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return cleanText(error.message) || fallback;
  }

  return cleanText(error) || fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

function navigateTo(href: string, replace = false): void {
  if (replace) {
    window.history.replaceState({}, "", href);
  } else {
    window.history.pushState({}, "", href);
  }
}

export function App({ runtime, serviceNowClient }: { runtime: DocseraRuntimeContext; serviceNowClient: ServiceNowClient }) {
  const [route, setRoute] = useState<DocseraAppRoute>(createInitialRoute);
  const [pingState, setPingState] = useState<RuntimeProbeState>(() => createInitialPingState(runtime));
  const [launcherSearchText, setLauncherSearchText] = useState("");
  const [launcherPage, setLauncherPage] = useState(1);
  const [launcherRefreshToken, setLauncherRefreshToken] = useState(0);
  const [launcherState, setLauncherState] = useState<WorkspaceListState>({ status: "idle" });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({ status: "idle" });
  const [workspaceSettingsNotice, setWorkspaceSettingsNotice] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState("overview");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalPhase, setCreateModalPhase] = useState<"idle" | "submitting" | "polling">("idle");
  const [createModalError, setCreateModalError] = useState<string | undefined>();
  const currentWorkspaceSlug = route.mode === "workspace" ? route.workspaceSlug : "";
  const currentWorkspaceSettingsIntent = route.mode === "workspace" ? route.settingsIntent : false;
  const loadedWorkspaceSlug = workspaceState.status === "success" ? workspaceState.data.slug : "";

  useEffect(() => {
    if (!runtime.config.backendPingPath) {
      setPingState({ status: "idle" });
      return;
    }

    let canceled = false;

    serviceNowClient
      .ping()
      .then((payload: PingResult) => {
        if (!canceled) {
          setPingState({ status: "success", payload });
        }
      })
      .catch((error: unknown) => {
        if (!canceled) {
          setPingState({ status: "error", message: getErrorMessage(error, "Unknown ping failure") });
        }
      });

    return () => {
      canceled = true;
    };
  }, [runtime.config.backendPingPath, serviceNowClient]);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(readAppRoute(window.location));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (route.mode !== "launcher") {
      return;
    }

    let canceled = false;
    setLauncherState({ status: "loading" });

    serviceNowClient
      .listWorkspaces({
        searchText: launcherSearchText,
        page: launcherPage,
        pageSize: DEFAULT_PAGE_SIZE
      })
      .then((data) => {
        if (!canceled) {
          setLauncherState({ status: "success", data });
        }
      })
      .catch((error: unknown) => {
        if (!canceled) {
          setLauncherState({
            errorMessage: "Unable to load workspaces.",
            status: "error"
          });
        }
      });

    return () => {
      canceled = true;
    };
  }, [launcherPage, launcherRefreshToken, launcherSearchText, route.mode, serviceNowClient]);

  useEffect(() => {
    if (route.mode !== "workspace") {
      setWorkspaceSettingsNotice(false);
      return;
    }

    if (loadedWorkspaceSlug === currentWorkspaceSlug) {
      setWorkspaceSettingsNotice(currentWorkspaceSettingsIntent && Boolean(workspaceState.status === "success" && workspaceState.data.canManageSettings));

      if (currentWorkspaceSettingsIntent) {
        navigateTo(buildWorkspaceHref(currentWorkspaceSlug, false), true);
        setRoute(readAppRoute(window.location));
      }

      return;
    }

    let canceled = false;
    setWorkspaceState({ status: "loading" });
    setWorkspaceSettingsNotice(false);

    serviceNowClient
      .getWorkspace(currentWorkspaceSlug)
      .then((result) => {
        if (canceled) {
          return;
        }

        if (!result.workspace) {
          setWorkspaceState({
            errorMessage: "Workspace could not be found.",
            status: "error"
          });
          setWorkspaceSettingsNotice(false);
          return;
        }

        setWorkspaceState({ data: result.workspace, status: "success" });
        setWorkspaceSettingsNotice(currentWorkspaceSettingsIntent && result.workspace.canManageSettings);

        if (currentWorkspaceSettingsIntent) {
          navigateTo(buildWorkspaceHref(currentWorkspaceSlug, false), true);
          setRoute(readAppRoute(window.location));
        }
      })
      .catch((error: unknown) => {
        if (!canceled) {
          setWorkspaceState({
            errorMessage: "Unable to load workspace.",
            status: "error"
          });
          setWorkspaceSettingsNotice(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [currentWorkspaceSettingsIntent, currentWorkspaceSlug, loadedWorkspaceSlug, route.mode, serviceNowClient, workspaceState.status]);

  useEffect(() => {
    if (route.mode !== "launcher") {
      setCreateModalOpen(false);
      setCreateModalPhase("idle");
      return;
    }
  }, [route.mode]);

  function commitRoute(href: string, replace = false) {
    navigateTo(href, replace);
    setRoute(readAppRoute(window.location));
  }

  function openLauncher() {
    setWorkspaceSettingsNotice(false);
    commitRoute(buildLauncherHref());
  }

  function openWorkspace(workspaceSlug: string, settingsIntent = false) {
    setWorkspaceSettingsNotice(settingsIntent);
    commitRoute(buildWorkspaceHref(workspaceSlug, settingsIntent));
  }

  function openCreateModal() {
    if (route.mode !== "launcher") {
      openLauncher();
    }

    setCreateModalError(undefined);
    setCreateModalPhase("idle");
    setCreateModalOpen(true);
  }

  async function submitWorkspaceCreation(input: { name: string; shortDescription: string }) {
    setCreateModalError(undefined);
    setCreateModalPhase("submitting");

    try {
      const result = await serviceNowClient.createWorkspace({
        name: input.name,
        shortDescription: input.shortDescription || null
      });

      if (result.state === "failed") {
        setCreateModalError(result.errorMessage);
        setCreateModalPhase("idle");
        return;
      }

      if (result.state === "pending") {
        await resolvePendingProvisioning(result);
        return;
      }

      await finalizeWorkspaceCreation(result.workspace);
    } catch (error: unknown) {
      setCreateModalError("Something went wrong while creating the workspace. The workspace was not created. Please try again.");
      setCreateModalPhase("idle");
    }
  }

  async function resolvePendingProvisioning(initialResult: WorkspaceCreatePending) {
    let currentResult: WorkspaceCreateResult = initialResult;
    let currentStatusPath = initialResult.statusPath;

    setCreateModalPhase("polling");

    while (currentResult.state === "pending") {
      await delay(currentResult.pollAfterMs);
      currentResult = await serviceNowClient.getWorkspaceProvisioningStatus(currentStatusPath);

      if (currentResult.state === "pending" && currentResult.statusPath) {
        currentStatusPath = currentResult.statusPath;
      }
    }

    if (currentResult.state === "failed") {
      setCreateModalError(currentResult.errorMessage);
      setCreateModalPhase("idle");
      return;
    }

    await finalizeWorkspaceCreation(currentResult.workspace);
  }

  async function finalizeWorkspaceCreation(workspace: WorkspaceViewRecord) {
    setCreateModalOpen(false);
    setCreateModalError(undefined);
    setCreateModalPhase("idle");
    setLauncherRefreshToken((value) => value + 1);
    setWorkspaceState({ data: workspace, status: "success" });
    openWorkspace(workspace.slug);
  }

  const launcherList = launcherState.status === "success" ? launcherState.data : null;

  if (route.mode === "workspace") {
    if (workspaceState.status === "loading" || workspaceState.status === "idle") {
      return (
        <DocseraAppFrame
          contextLabel="Workspace"
          contextDescription="Loading the selected workspace"
        >
          <section className="docsera-shell__empty-state" role="status">
            <p className="docsera-shell__eyebrow">Workspace</p>
            <h2 className="docsera-shell__empty-title">Loading workspace</h2>
            <p className="docsera-shell__empty-copy">Fetching the selected workspace from ServiceNow.</p>
            <button type="button" className="docsera-launcher-state__secondary" onClick={openLauncher}>
              Return to My Workspaces
            </button>
          </section>
        </DocseraAppFrame>
      );
    }

    if (workspaceState.status === "error" || !workspaceState.data) {
      return (
        <DocseraAppFrame
          contextLabel="Workspace"
          contextDescription="The selected workspace could not be loaded"
        >
          <section className="docsera-shell__empty-state" role="status">
            <p className="docsera-shell__eyebrow">Workspace</p>
            <h2 className="docsera-shell__empty-title">Workspace unavailable</h2>
            <p className="docsera-shell__empty-copy">{workspaceState.status === "error" ? workspaceState.errorMessage : "The requested workspace could not be found."}</p>
            <button type="button" className="docsera-launcher-state__secondary" onClick={openLauncher}>
              Return to My Workspaces
            </button>
          </section>
        </DocseraAppFrame>
      );
    }

    return (
      <DocseraAppFrame
        contextLabel={workspaceState.data.name}
        contextDescription={workspaceState.data.shortDescription ?? "Workspace shell"}
      >
        <WorkspaceShell
          runtime={runtime}
          onOpenWorkspaceSettings={() => openWorkspace(route.workspaceSlug, true)}
          workspace={buildWorkspaceShellWorkspace(workspaceState.data)}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          pingState={pingState}
          onOpenMyWorkspaces={openLauncher}
          workspaceSettingsNotice={workspaceSettingsNotice}
        />
      </DocseraAppFrame>
    );
  }

  const listState = {
    hasError: launcherState.status === "error",
    isEmptyState: launcherState.status === "success" && launcherList !== null && launcherList.totalCount === 0 && !launcherList.searchText,
    isLoading: launcherState.status === "loading" || launcherState.status === "idle",
    isNoResultsState:
      launcherState.status === "success" && launcherList !== null && launcherList.totalCount === 0 && Boolean(launcherList.searchText),
    items: launcherList?.items ?? [],
    page: launcherList?.page ?? launcherPage,
    pageSize: launcherList?.pageSize ?? DEFAULT_PAGE_SIZE,
    totalCount: launcherList?.totalCount ?? 0,
    workspaceListErrorMessage: launcherState.status === "error" ? launcherState.errorMessage : undefined
  };

  return (
    <DocseraAppFrame
      contextLabel="My Workspaces"
      contextDescription="Workspace catalog and creation"
    >
      <MyWorkspacesScreen
        createModal={{
          errorMessage: createModalError,
          onClose: () => {
            setCreateModalOpen(false);
            setCreateModalError(undefined);
            setCreateModalPhase("idle");
          },
          onSubmit: submitWorkspaceCreation,
          open: createModalOpen,
          phase: createModalPhase
        }}
        onNextPage={() => setLauncherPage((value) => value + 1)}
        onOpenWorkspace={(workspaceSlug) => openWorkspace(workspaceSlug)}
        onOpenWorkspaceSettings={(workspaceSlug) => openWorkspace(workspaceSlug, true)}
        onPreviousPage={() => setLauncherPage((value) => Math.max(1, value - 1))}
        onRefresh={() => setLauncherRefreshToken((value) => value + 1)}
        onSearchTextChange={(value) => {
          setLauncherSearchText(value);
          setLauncherPage(1);
        }}
        onShowCreateModal={openCreateModal}
        hasError={listState.hasError}
        isEmptyState={listState.isEmptyState}
        isLoading={listState.isLoading}
        isNoResultsState={listState.isNoResultsState}
        items={listState.items}
        page={listState.page}
        pageSize={listState.pageSize}
        searchText={launcherSearchText}
        totalCount={listState.totalCount}
        workspaceListErrorMessage={listState.workspaceListErrorMessage}
      />
    </DocseraAppFrame>
  );
}
