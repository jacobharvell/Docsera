import { useEffect, useState } from "react";
import { DocseraAppFrame } from "./DocseraAppFrame";
import { MyWorkspacesScreen } from "../features/workspaces/MyWorkspacesScreen";
import { PageCreateModal } from "../features/workspaces/PageCreateModal";
import { WorkspaceShell } from "../features/workspaces/WorkspaceShell";
import { buildWorkspaceShellPages, buildWorkspaceShellWorkspace } from "../features/workspaces/workspaceViewModels";
import { buildLauncherHref, buildWorkspaceHref, readAppRoute, type DocseraAppRoute } from "../features/workspaces/workspaceRouting";
import type {
  DocseraRuntimeContext,
  PageListResult,
  PingResult,
  RuntimeProbeState,
  ServiceNowClient,
  WorkspaceCreatePending,
  WorkspaceCreateResult,
  WorkspaceListResult,
  WorkspacePageRecord,
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

type WorkspacePagesState =
  | { status: "idle" }
  | { status: "loading"; workspaceSlug: string }
  | { errorMessage: string; status: "error"; workspaceSlug: string }
  | { data: WorkspacePageRecord[]; status: "success"; totalCount: number; workspaceSlug: string };

const DEFAULT_PAGE_SIZE = 10;
const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";
type SavedPageBodyResult = Awaited<ReturnType<ServiceNowClient["savePageBody"]>>;

function createInitialPingState(runtime: DocseraRuntimeContext): RuntimeProbeState {
  return runtime.config.backendPingPath ? { status: "loading" } : { status: "idle" };
}

function createInitialRoute(): DocseraAppRoute {
  return readAppRoute(window.location);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getFirstWorkspacePage(pages: WorkspacePageRecord[]): WorkspacePageRecord | null {
  return pages[0] ?? null;
}

function findWorkspacePageBySysId(pages: WorkspacePageRecord[], pageSysId: string): WorkspacePageRecord | null {
  const normalizedPageSysId = cleanText(pageSysId);
  if (!normalizedPageSysId) {
    return null;
  }

  return pages.find((page) => cleanText(page.sysId) === normalizedPageSysId) ?? null;
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
  const [workspacePagesState, setWorkspacePagesState] = useState<WorkspacePagesState>({ status: "idle" });
  const [workspaceSettingsNotice, setWorkspaceSettingsNotice] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState("overview");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalPhase, setCreateModalPhase] = useState<"idle" | "submitting" | "polling">("idle");
  const [createModalError, setCreateModalError] = useState<string | undefined>();
  const [createPageModalOpen, setCreatePageModalOpen] = useState(false);
  const [createPageModalPhase, setCreatePageModalPhase] = useState<"idle" | "submitting">("idle");
  const [createPageModalError, setCreatePageModalError] = useState<string | undefined>();

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
      .catch(() => {
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
      .catch(() => {
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
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      setWorkspacePagesState({ status: "idle" });
      return;
    }

    let canceled = false;
    setWorkspacePagesState({ status: "loading", workspaceSlug: currentWorkspaceSlug });

    serviceNowClient
      .listPages({ workspaceSlug: currentWorkspaceSlug })
      .then((result: PageListResult) => {
        if (canceled) {
          return;
        }

        const pages = result.items;
        setWorkspacePagesState({
          data: pages,
          status: "success",
          totalCount: result.totalCount,
          workspaceSlug: result.workspaceSlug || currentWorkspaceSlug
        });

        setSelectedPageId((currentSelectedPageId) => {
          const selectedPage = findWorkspacePageBySysId(pages, currentSelectedPageId);
          if (selectedPage) {
            return currentSelectedPageId;
          }

          return getFirstWorkspacePage(pages)?.sysId ?? currentSelectedPageId;
        });
      })
      .catch((error: unknown) => {
        if (!canceled) {
          setWorkspacePagesState({
            errorMessage: getErrorMessage(error, "Unable to load pages."),
            status: "error",
            workspaceSlug: currentWorkspaceSlug
          });
        }
      });

    return () => {
      canceled = true;
    };
  }, [currentWorkspaceSlug, loadedWorkspaceSlug, route.mode, serviceNowClient, workspaceState.status]);

  useEffect(() => {
    if (route.mode !== "launcher") {
      setCreateModalOpen(false);
      setCreateModalPhase("idle");
      return;
    }
  }, [route.mode]);

  useEffect(() => {
    if (route.mode !== "workspace") {
      setCreatePageModalOpen(false);
      setCreatePageModalPhase("idle");
      setCreatePageModalError(undefined);
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

  function openCreatePageModal() {
    if (route.mode !== "workspace") {
      return;
    }

    setCreatePageModalError(undefined);
    setCreatePageModalPhase("idle");
    setCreatePageModalOpen(true);
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
    } catch {
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

  async function submitPageCreation(input: { title: string }) {
    if (workspaceState.status !== "success") {
      setCreatePageModalError("The selected workspace is not ready yet.");
      return;
    }

    setCreatePageModalError(undefined);
    setCreatePageModalPhase("submitting");

    try {
      const result = await serviceNowClient.createPage({
        title: input.title,
        workspaceSlug: workspaceState.data.slug
      });

      if (result.state === "failed") {
        setCreatePageModalError(result.errorMessage);
        setCreatePageModalPhase("idle");
        return;
      }

      finalizePageCreation(result.page);
    } catch {
      setCreatePageModalError("Something went wrong while creating the page. The page was not created. Please try again.");
      setCreatePageModalPhase("idle");
    }
  }

  function finalizePageCreation(page: WorkspacePageRecord) {
    const currentWorkspace = workspaceState.status === "success" ? workspaceState.data.slug : currentWorkspaceSlug;

    setCreatePageModalOpen(false);
    setCreatePageModalError(undefined);
    setCreatePageModalPhase("idle");
    setWorkspacePagesState((current) => {
      if (current.status !== "success" || current.workspaceSlug !== currentWorkspace) {
        return current;
      }

      return {
        ...current,
        data: [...current.data, page],
        totalCount: current.totalCount + 1
      };
    });
    window.setTimeout(() => {
      setSelectedPageId(cleanText(page.sysId) || selectedPageId);
    }, 0);
  }

  const launcherList = launcherState.status === "success" ? launcherState.data : null;
  const workspacePagesLoaded =
    workspacePagesState.status === "success" && workspacePagesState.workspaceSlug === currentWorkspaceSlug;
  const workspacePagesLoading =
    workspacePagesState.status === "loading" ||
    (workspacePagesState.status === "success" && workspacePagesState.workspaceSlug !== currentWorkspaceSlug) ||
    (workspacePagesState.status === "error" && workspacePagesState.workspaceSlug !== currentWorkspaceSlug);
  const livePagesForCurrentWorkspace = workspacePagesLoaded ? workspacePagesState.data : [];
  const workspaceShellWorkspace =
    workspaceState.status === "success" && workspacePagesLoaded
      ? buildWorkspaceShellWorkspace(workspaceState.data, buildWorkspaceShellPages(livePagesForCurrentWorkspace))
      : null;
  const workspaceShellDescription =
    workspaceState.status === "success" ? workspaceState.data.shortDescription ?? "Workspace shell" : "Workspace shell";
  const canCreatePage = Boolean(workspaceState.status === "success" && workspaceState.data.roleLabel);
  const isCreatingPage = createPageModalOpen || createPageModalPhase !== "idle";
  const selectedWorkspacePage =
    workspacePagesLoaded && livePagesForCurrentWorkspace.length > 0
      ? findWorkspacePageBySysId(livePagesForCurrentWorkspace, selectedPageId) ??
        getFirstWorkspacePage(livePagesForCurrentWorkspace)
      : null;

  async function savePageBody(input: { pageSysId: string; draftBodyText: string }): Promise<WorkspacePageRecord> {
    if (workspaceState.status !== "success") {
      throw new Error(SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE);
    }

    let result!: SavedPageBodyResult;
    try {
      result = await serviceNowClient.savePageBody({
        workspaceSlug: workspaceState.data.slug,
        workspaceSysId: workspaceState.data.sysId,
        pageSysId: input.pageSysId,
        draftBodyText: input.draftBodyText
      });
    } catch {
      throw new Error(SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE);
    }

    if (result.state === "failed") {
      throw new Error(result.errorMessage);
    }

    setWorkspacePagesState((current) => {
      if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug) {
        return current;
      }

      return {
        ...current,
        data: current.data.map((page) => (cleanText(page.sysId) === cleanText(result.page.sysId) ? result.page : page))
      };
    });

    return result.page;
  }

  if (route.mode === "workspace") {
    if (workspaceState.status === "loading" || workspaceState.status === "idle") {
      return (
        <DocseraAppFrame contextLabel="Workspace" contextDescription="Loading the selected workspace">
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

    if (workspaceState.status === "error") {
      return (
        <DocseraAppFrame
          contextLabel="Workspace"
          contextDescription="The selected workspace could not be loaded"
        >
          <section className="docsera-shell__empty-state" role="status">
            <p className="docsera-shell__eyebrow">Workspace</p>
            <h2 className="docsera-shell__empty-title">Workspace unavailable</h2>
            <p className="docsera-shell__empty-copy">{workspaceState.errorMessage}</p>
            <button type="button" className="docsera-launcher-state__secondary" onClick={openLauncher}>
              Return to My Workspaces
            </button>
          </section>
        </DocseraAppFrame>
      );
    }

    if (workspacePagesLoading || workspacePagesState.status === "idle") {
      return (
        <DocseraAppFrame
          contextLabel={workspaceState.data.name}
          contextDescription="Loading pages for the selected workspace"
        >
          <section className="docsera-shell__empty-state" role="status">
            <p className="docsera-shell__eyebrow">Workspace</p>
            <h2 className="docsera-shell__empty-title">Loading pages</h2>
            <p className="docsera-shell__empty-copy">Fetching live page records from ServiceNow.</p>
            <button type="button" className="docsera-launcher-state__secondary" onClick={openLauncher}>
              Return to My Workspaces
            </button>
          </section>
        </DocseraAppFrame>
      );
    }

    if (workspacePagesState.status === "error" && workspacePagesState.workspaceSlug === currentWorkspaceSlug) {
      return (
        <DocseraAppFrame
          contextLabel={workspaceState.data.name}
          contextDescription="The workspace loaded, but its page tree could not be loaded"
        >
          <section className="docsera-shell__empty-state" role="status">
            <p className="docsera-shell__eyebrow">Workspace</p>
            <h2 className="docsera-shell__empty-title">Pages unavailable</h2>
            <p className="docsera-shell__empty-copy">{workspacePagesState.errorMessage}</p>
            <button type="button" className="docsera-launcher-state__secondary" onClick={openLauncher}>
              Return to My Workspaces
            </button>
          </section>
        </DocseraAppFrame>
      );
    }

    if (!workspaceShellWorkspace) {
      return (
        <DocseraAppFrame
          contextLabel="Workspace"
          contextDescription="The selected workspace could not be rendered"
        >
          <section className="docsera-shell__empty-state" role="status">
            <p className="docsera-shell__eyebrow">Workspace</p>
            <h2 className="docsera-shell__empty-title">Workspace unavailable</h2>
            <p className="docsera-shell__empty-copy">The selected workspace could not be rendered.</p>
            <button type="button" className="docsera-launcher-state__secondary" onClick={openLauncher}>
              Return to My Workspaces
            </button>
          </section>
        </DocseraAppFrame>
      );
    }

    return (
      <DocseraAppFrame contextLabel={workspaceShellWorkspace.title} contextDescription={workspaceShellDescription}>
        <WorkspaceShell
          runtime={runtime}
          onOpenWorkspaceSettings={() => openWorkspace(route.workspaceSlug, true)}
          workspace={workspaceShellWorkspace}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          pingState={pingState}
          onOpenMyWorkspaces={openLauncher}
          workspaceSettingsNotice={workspaceSettingsNotice}
          canCreatePage={canCreatePage}
          isCreatingPage={isCreatingPage}
          onShowCreatePage={openCreatePageModal}
          selectedWorkspacePage={selectedWorkspacePage}
          onSavePageBody={savePageBody}
        />
        <PageCreateModal
          errorMessage={createPageModalError}
          onClose={() => {
            setCreatePageModalOpen(false);
            setCreatePageModalError(undefined);
            setCreatePageModalPhase("idle");
          }}
          onSubmit={submitPageCreation}
          open={createPageModalOpen}
          phase={createPageModalPhase}
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
    <DocseraAppFrame contextLabel="My Workspaces" contextDescription="Workspace catalog and creation">
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
