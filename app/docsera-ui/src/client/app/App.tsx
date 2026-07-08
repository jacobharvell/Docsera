import { useEffect, useRef, useState } from "react";
import { DocseraAppFrame } from "./DocseraAppFrame";
import { MyWorkspacesScreen } from "../features/workspaces/MyWorkspacesScreen";
import { PageCreateModal } from "../features/workspaces/PageCreateModal";
import { PageSettingsDeleteDialog } from "../features/workspaces/PageSettingsDeleteDialog";
import { PageSettingsOverlay } from "../features/workspaces/PageSettingsOverlay";
import { WorkspaceShell } from "../features/workspaces/WorkspaceShell";
import { buildWorkspaceShellPages, buildWorkspaceShellWorkspace } from "../features/workspaces/workspaceViewModels";
import { buildLauncherHref, buildWorkspaceHref, readAppRoute, type DocseraAppRoute } from "../features/workspaces/workspaceRouting";
import {
  collectPageSubtreeSysIds,
  pickNextVisiblePageAfterDelete,
  removePageSubtree,
  validatePageSettingsSlug,
  validatePageSettingsTitle
} from "../../shared/pages/domain";
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

type PageSettingsField = "title" | "slug";

type PageSettingsState = {
  activeField: PageSettingsField | "";
  deleteError: string;
  deleteOpen: boolean;
  deletePending: boolean;
  generalError: string;
  pageSysId: string;
  slug: string;
  slugSnapshot: string;
  slugError: string;
  title: string;
  titleError: string;
  titleSnapshot: string;
  open: boolean;
};

function createEmptyPageSettingsState(): PageSettingsState {
  return {
    activeField: "",
    deleteError: "",
    deleteOpen: false,
    deletePending: false,
    generalError: "",
    pageSysId: "",
    slug: "",
    slugSnapshot: "",
    slugError: "",
    title: "",
    titleError: "",
    titleSnapshot: "",
    open: false
  };
}

function isPageSettingsStateEmpty(state: PageSettingsState): boolean {
  return (
    !state.open &&
    !state.activeField &&
    !state.deleteError &&
    !state.deleteOpen &&
    !state.deletePending &&
    !state.generalError &&
    !state.pageSysId &&
    !state.slug &&
    !state.slugSnapshot &&
    !state.slugError &&
    !state.title &&
    !state.titleError &&
    !state.titleSnapshot
  );
}

function createPageSettingsStateFromPage(page: WorkspacePageRecord): PageSettingsState {
  const title = cleanText(page.draftTitle || page.publishedTitle || "");
  const slug = cleanText(page.draftSlug || page.publishedSlug || "");

  return {
    ...createEmptyPageSettingsState(),
    pageSysId: cleanText(page.sysId),
    title,
    titleSnapshot: title,
    slug,
    slugSnapshot: slug,
    open: true,
    activeField: "title"
  };
}

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

function resolveWorkspacePageSelection(
  pages: WorkspacePageRecord[],
  pageSysId: string
): { page: WorkspacePageRecord | null; pageId: string } {
  const page = findWorkspacePageBySysId(pages, pageSysId) ?? getFirstWorkspacePage(pages);

  return {
    page,
    pageId: cleanText(page?.sysId)
  };
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalPhase, setCreateModalPhase] = useState<"idle" | "submitting" | "polling">("idle");
  const [createModalError, setCreateModalError] = useState<string | undefined>();
  const [createPageModalOpen, setCreatePageModalOpen] = useState(false);
  const [createPageModalPhase, setCreatePageModalPhase] = useState<"idle" | "submitting">("idle");
  const [createPageModalError, setCreatePageModalError] = useState<string | undefined>();
  const [pageSettingsState, setPageSettingsState] = useState<PageSettingsState>(createEmptyPageSettingsState);
  const pageSettingsStateRef = useRef<PageSettingsState>(createEmptyPageSettingsState());
  const pageSettingsPanelRef = useRef<HTMLElement>(null);
  const pageSettingsCloseTargetRef = useRef("");
  const pageSettingsCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    pageSettingsStateRef.current = pageSettingsState;
  }, [pageSettingsState]);

  useEffect(() => {
    return () => {
      if (pageSettingsCloseTimerRef.current !== null) {
        window.clearTimeout(pageSettingsCloseTimerRef.current);
        pageSettingsCloseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pageSettingsState.open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const panel = pageSettingsPanelRef.current;
      if (!panel) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest("[data-docsera-page-settings-trigger='true']")) {
        return;
      }

      if (target instanceof Element && target.closest("[data-docsera-delete-dialog='true']")) {
        return;
      }

      if (target instanceof Node && panel.contains(target)) {
        return;
      }

      requestClosePageSettingsPanel(pageSettingsStateRef.current.pageSysId);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [pageSettingsState.open]);

  const currentWorkspaceSlug = route.mode === "workspace" ? route.workspaceSlug : "";
  const currentWorkspaceSettingsIntent = route.mode === "workspace" ? route.settingsIntent : false;
  const currentWorkspacePageId = route.mode === "workspace" ? route.pageId : "";
  const loadedWorkspaceSlug = workspaceState.status === "success" ? workspaceState.data.slug : "";
  const workspaceStateData = workspaceState.status === "success" ? workspaceState.data : null;
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
      ? resolveWorkspacePageSelection(livePagesForCurrentWorkspace, currentWorkspacePageId).page
      : null;
  const selectedWorkspacePageId = cleanText(selectedWorkspacePage?.sysId) || currentWorkspacePageId;
  const canManagePageSettings = Boolean(workspaceState.status === "success" && workspaceState.data.roleLabel);
  const pageSettingsPage =
    workspacePagesLoaded && pageSettingsState.open ? findWorkspacePageBySysId(livePagesForCurrentWorkspace, pageSettingsState.pageSysId) : null;
  const pageSettingsHasDescendants = Boolean(
    pageSettingsPage && collectPageSubtreeSysIds(livePagesForCurrentWorkspace, cleanText(pageSettingsPage.sysId)).length > 1
  );

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
        navigateTo(buildWorkspaceHref(currentWorkspaceSlug, false, currentWorkspacePageId), true);
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
          navigateTo(buildWorkspaceHref(currentWorkspaceSlug, false, currentWorkspacePageId), true);
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
  }, [currentWorkspacePageId, currentWorkspaceSettingsIntent, currentWorkspaceSlug, loadedWorkspaceSlug, route.mode, serviceNowClient, workspaceState.status]);

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

  useEffect(() => {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      setPageSettingsState((current) => {
        if (isPageSettingsStateEmpty(current)) {
          return current;
        }

        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return;
    }

    if (!pageSettingsState.open) {
      return;
    }

    if (workspacePagesLoaded && !findWorkspacePageBySysId(livePagesForCurrentWorkspace, pageSettingsState.pageSysId)) {
      setPageSettingsState((current) => {
        if (isPageSettingsStateEmpty(current)) {
          return current;
        }

        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
    }
  }, [
    currentWorkspaceSlug,
    livePagesForCurrentWorkspace,
    pageSettingsState.open,
    pageSettingsState.pageSysId,
    route.mode,
    workspacePagesLoaded,
    workspaceStateData,
    workspaceState.status
  ]);

  useEffect(() => {
    if (!pageSettingsState.open || route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      return;
    }

    if (pageSettingsState.pageSysId && pageSettingsState.pageSysId !== currentWorkspacePageId) {
      setPageSettingsState((current) => {
        if (isPageSettingsStateEmpty(current)) {
          return current;
        }

        const nextState = createEmptyPageSettingsState();
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
    }
  }, [currentWorkspacePageId, currentWorkspaceSlug, pageSettingsState.open, pageSettingsState.pageSysId, route.mode, workspaceStateData, workspaceState.status]);

  function commitRoute(href: string, replace = false) {
    navigateTo(href, replace);
    setRoute(readAppRoute(window.location));
  }

  function openLauncher() {
    setWorkspaceSettingsNotice(false);
    commitRoute(buildLauncherHref());
  }

  function openWorkspace(workspaceSlug: string, settingsIntent = false, pageId = "") {
    setWorkspaceSettingsNotice(settingsIntent);
    commitRoute(buildWorkspaceHref(workspaceSlug, settingsIntent, pageId));
  }

  function openWorkspacePage(pageId: string) {
    if (route.mode !== "workspace") {
      return;
    }

    const nextPageId = cleanText(pageId);
    if (!nextPageId || route.pageId === nextPageId) {
      return;
    }

    if (pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId !== nextPageId) {
      requestClosePageSettingsPanel(nextPageId);
      return;
    }

    commitRoute(buildWorkspaceHref(currentWorkspaceSlug, false, nextPageId));
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

  function openPageSettings(pageSysId: string) {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || !workspacePagesLoaded || !canManagePageSettings) {
      return;
    }

    if (pageSettingsCloseTimerRef.current !== null) {
      window.clearTimeout(pageSettingsCloseTimerRef.current);
      pageSettingsCloseTimerRef.current = null;
    }
    pageSettingsCloseTargetRef.current = "";

    const page = findWorkspacePageBySysId(livePagesForCurrentWorkspace, pageSysId);
    if (!page) {
      return;
    }

    const nextState = createPageSettingsStateFromPage(page);
    pageSettingsStateRef.current = nextState;
    setPageSettingsState(nextState);
  }

  function requestTogglePageSettings(pageSysId: string) {
    if (pageSettingsStateRef.current.open && pageSettingsStateRef.current.pageSysId === pageSysId) {
      requestClosePageSettingsPanel(pageSysId);
      return;
    }

    openPageSettings(pageSysId);
  }

  function updatePageSettingsField(field: PageSettingsField, value: string) {
    setPageSettingsState((current) => {
      if (!current.open) {
        return current;
      }

      const nextErrorKey = field === "title" ? "titleError" : "slugError";
      const nextState: PageSettingsState = {
        ...current,
        [field]: value,
        [nextErrorKey]: "",
        generalError: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  function startPageSettingsField(field: PageSettingsField) {
    if (!pageSettingsState.open) {
      return;
    }

    if (pageSettingsState.activeField && pageSettingsState.activeField !== field) {
      if (!finishPageSettingsField(pageSettingsState.activeField)) {
        return;
      }
    }

    const currentValue = field === "title" ? pageSettingsState.title : pageSettingsState.slug;
    setPageSettingsState((current) => {
      const nextState = {
        ...current,
        activeField: field,
        titleSnapshot: field === "title" ? currentValue : current.titleSnapshot,
        slugSnapshot: field === "slug" ? currentValue : current.slugSnapshot,
        titleError: field === "title" ? "" : current.titleError,
        slugError: field === "slug" ? "" : current.slugError,
        generalError: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  function finishPageSettingsField(field: PageSettingsField): boolean {
    if (!pageSettingsState.open) {
      return true;
    }

    if (field === "title") {
      const validation = validatePageSettingsTitle(pageSettingsState.title);
      if (!validation.valid) {
        setPageSettingsState((current) => {
          const nextState: PageSettingsState = {
            ...current,
            titleError: validation.error,
            activeField: "title",
            generalError: ""
          };
          pageSettingsStateRef.current = nextState;
          return nextState;
        });
        return false;
      }

      setPageSettingsState((current) => {
        const nextState: PageSettingsState = {
          ...current,
          title: validation.value,
          titleError: "",
          activeField: ""
        };
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return true;
    }

    const validation = validatePageSettingsSlug(
      pageSettingsState.slug,
      livePagesForCurrentWorkspace,
      workspaceState.status === "success" ? workspaceState.data.sysId ?? "" : "",
      pageSettingsState.pageSysId
    );

    if (!validation.valid) {
      setPageSettingsState((current) => {
        const nextState: PageSettingsState = {
          ...current,
          slugError: validation.error,
          activeField: "slug",
          generalError: ""
        };
        pageSettingsStateRef.current = nextState;
        return nextState;
      });
      return false;
    }

    setPageSettingsState((current) => {
      const nextState: PageSettingsState = {
        ...current,
        slug: validation.value,
        slugError: "",
        activeField: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
    return true;
  }

  function cancelPageSettingsField(field: PageSettingsField) {
    if (!pageSettingsState.open) {
      return;
    }

    setPageSettingsState((current) => {
      const nextState: PageSettingsState = {
        ...current,
        title: field === "title" ? current.titleSnapshot : current.title,
        slug: field === "slug" ? current.slugSnapshot : current.slug,
        titleError: field === "title" ? "" : current.titleError,
        slugError: field === "slug" ? "" : current.slugError,
        activeField: "",
        generalError: ""
      };
      pageSettingsStateRef.current = nextState;
      return nextState;
    });
  }

  async function closePageSettingsPanel(nextSelectedPageId = pageSettingsStateRef.current.pageSysId): Promise<boolean> {
    const currentPageSettingsState = pageSettingsStateRef.current;

    if (!currentPageSettingsState.open || workspaceState.status !== "success" || !workspacePagesLoaded) {
      return true;
    }

    const page = findWorkspacePageBySysId(livePagesForCurrentWorkspace, currentPageSettingsState.pageSysId);
    if (!page) {
      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);
      return true;
    }

    const titleValidation = validatePageSettingsTitle(currentPageSettingsState.title);
    const slugValidation = validatePageSettingsSlug(
      currentPageSettingsState.slug,
      livePagesForCurrentWorkspace,
      workspaceState.data.sysId ?? "",
      page.sysId ?? currentPageSettingsState.pageSysId
    );

    if (!titleValidation.valid || !slugValidation.valid) {
      setPageSettingsState((current) => ({
        ...current,
        titleError: titleValidation.valid ? "" : titleValidation.error,
        slugError: slugValidation.valid ? "" : slugValidation.error,
        activeField: !titleValidation.valid ? "title" : "slug",
        generalError: ""
      }));
      return false;
    }

    const normalizedTitle = titleValidation.value;
    const normalizedSlug = slugValidation.normalizedValue;
    const currentTitle = cleanText(currentPageSettingsState.titleSnapshot);
    const currentSlug = cleanText(currentPageSettingsState.slugSnapshot).toLowerCase();
    const hasChanges = normalizedTitle !== currentTitle || normalizedSlug !== currentSlug;

    if (!hasChanges) {
      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);
      const nextPageId = cleanText(nextSelectedPageId);
      if (nextPageId && nextPageId !== currentPageSettingsState.pageSysId) {
        commitRoute(buildWorkspaceHref(currentWorkspaceSlug, false, nextPageId));
      }
      return true;
    }

    setPageSettingsState((current) => ({
      ...current,
      titleError: "",
      slugError: "",
      generalError: ""
    }));

    try {
      const result = await serviceNowClient.savePageSettings({
        workspaceSlug: workspaceState.data.slug,
        workspaceSysId: workspaceState.data.sysId ?? "",
        pageSysId: page.sysId ?? currentPageSettingsState.pageSysId,
        title: normalizedTitle,
        slug: normalizedSlug
      });

      if (result.state === "failed") {
        setPageSettingsState((current) => ({
          ...current,
          generalError: result.errorMessage
        }));
        return false;
      }

      setWorkspacePagesState((current) => {
        if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug) {
          return current;
        }

        return {
          ...current,
          data: current.data.map((pageRecord) =>
            cleanText(pageRecord.sysId) === cleanText(result.page.sysId) ? result.page : pageRecord
          )
        };
      });

      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);
      const nextPageId = cleanText(nextSelectedPageId);
      if (nextPageId && nextPageId !== cleanText(result.page.sysId)) {
        commitRoute(buildWorkspaceHref(currentWorkspaceSlug, false, nextPageId));
      }
      return true;
    } catch {
      setPageSettingsState((current) => ({
        ...current,
        generalError: "Something went wrong while saving page settings. Your changes were not saved. Please try again."
      }));
      return false;
    }
  }

  function requestClosePageSettingsPanel(nextSelectedPageId = pageSettingsStateRef.current.pageSysId) {
    pageSettingsCloseTargetRef.current = cleanText(nextSelectedPageId) || pageSettingsStateRef.current.pageSysId;

    if (pageSettingsCloseTimerRef.current !== null) {
      return;
    }

    pageSettingsCloseTimerRef.current = window.setTimeout(() => {
      pageSettingsCloseTimerRef.current = null;
      void closePageSettingsPanel(pageSettingsCloseTargetRef.current);
    }, 0);
  }

  function requestOpenDeletePageSettings() {
    if (!pageSettingsStateRef.current.open || !canManagePageSettings || !pageSettingsPage) {
      return;
    }

    setPageSettingsState((current) => ({
      ...current,
      deleteOpen: true,
      deletePending: false,
      deleteError: ""
    }));
  }

  function requestCloseDeletePageSettings() {
    setPageSettingsState((current) => {
      if (current.deletePending) {
        return current;
      }

      return {
        ...current,
        deleteOpen: false,
        deleteError: ""
      };
    });
  }

  async function confirmDeletePageSettings() {
    const currentPageSettingsState = pageSettingsStateRef.current;
    if (!currentPageSettingsState.open || !currentPageSettingsState.deleteOpen) {
      return;
    }

    if (!canManagePageSettings || !workspacePagesLoaded || workspaceState.status !== "success") {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Unable to delete this page right now. Please reopen Page Settings and try again."
      }));
      return;
    }

    const currentPage = findWorkspacePageBySysId(livePagesForCurrentWorkspace, currentPageSettingsState.pageSysId);
    if (!currentPage) {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Unable to delete this page right now. Please reopen Page Settings and try again."
      }));
      return;
    }

    const deletedPageSysId = cleanText(currentPage.sysId) || currentPageSettingsState.pageSysId;
    const nextPageIdFallback = pickNextVisiblePageAfterDelete(livePagesForCurrentWorkspace, deletedPageSysId);

    setPageSettingsState((current) => ({
      ...current,
      deletePending: true,
      deleteError: ""
    }));

    try {
      const result = await serviceNowClient.deletePage({
        workspaceSlug: workspaceState.data.slug,
        workspaceSysId: workspaceState.data.sysId ?? "",
        pageSysId: deletedPageSysId
      });

      if (result.state === "failed") {
        setPageSettingsState((current) => ({
          ...current,
          deletePending: false,
          deleteError: result.errorMessage
        }));
        return;
      }

      setWorkspacePagesState((current) => {
        if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug) {
          return current;
        }

        const nextPages = removePageSubtree(current.data, deletedPageSysId) as WorkspacePageRecord[];
        return {
          ...current,
          data: nextPages,
          totalCount: nextPages.length
        };
      });

      try {
        const refreshedPages = await serviceNowClient.listPages({
          workspaceSlug: workspaceState.data.slug
        });

        setWorkspacePagesState((current) => {
          if (current.status !== "success" || current.workspaceSlug !== workspaceState.data.slug) {
            return current;
          }

          return {
            ...current,
            data: refreshedPages.items,
            totalCount: refreshedPages.totalCount
          };
        });
      } catch {
        // Keep the optimistic subtree removal if the refresh fails.
      }

      const nextState = createEmptyPageSettingsState();
      pageSettingsStateRef.current = nextState;
      setPageSettingsState(nextState);

      const nextPageId = cleanText(result.nextPageSysId) || nextPageIdFallback;
      commitRoute(buildWorkspaceHref(currentWorkspaceSlug, false, nextPageId));
    } catch {
      setPageSettingsState((current) => ({
        ...current,
        deletePending: false,
        deleteError: "Something went wrong while deleting the page. The page was not deleted. Please try again."
      }));
    }
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
    commitRoute(buildWorkspaceHref(currentWorkspaceSlug, false, cleanText(page.sysId)), false);
  }

  const launcherList = launcherState.status === "success" ? launcherState.data : null;

  useEffect(() => {
    if (route.mode !== "workspace" || workspaceState.status !== "success" || workspaceState.data.slug !== currentWorkspaceSlug) {
      return;
    }

    if (!workspacePagesLoaded || livePagesForCurrentWorkspace.length === 0) {
      return;
    }

    const { pageId } = resolveWorkspacePageSelection(livePagesForCurrentWorkspace, currentWorkspacePageId);
    if (!pageId || pageId === currentWorkspacePageId) {
      return;
    }

    commitRoute(buildWorkspaceHref(currentWorkspaceSlug, false, pageId), true);
  }, [
    currentWorkspacePageId,
    currentWorkspaceSlug,
    livePagesForCurrentWorkspace,
    route.mode,
    workspacePagesLoaded,
    loadedWorkspaceSlug,
    workspaceState.status
  ]);

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
          onOpenWorkspaceSettings={() => openWorkspace(route.workspaceSlug, true, selectedWorkspacePageId)}
          workspace={workspaceShellWorkspace}
          selectedPageId={selectedWorkspacePageId}
          onSelectPage={openWorkspacePage}
          canManagePageSettings={canManagePageSettings}
          pageSettingsOpenPageId={pageSettingsState.open ? pageSettingsState.pageSysId : ""}
          onTogglePageSettings={requestTogglePageSettings}
          pingState={pingState}
          onOpenMyWorkspaces={openLauncher}
          workspaceSettingsNotice={workspaceSettingsNotice}
          canCreatePage={canCreatePage}
          isCreatingPage={isCreatingPage}
          onShowCreatePage={openCreatePageModal}
          selectedWorkspacePage={selectedWorkspacePage}
          onSavePageBody={savePageBody}
        />
        <PageSettingsOverlay
          activeField={pageSettingsState.activeField}
          canManagePageSettings={canManagePageSettings}
          generalError={pageSettingsState.generalError}
          hasDescendants={pageSettingsHasDescendants}
          open={pageSettingsState.open}
          panelRef={pageSettingsPanelRef}
          pageSlug={pageSettingsState.slug}
          pageTitle={pageSettingsState.title}
          slugError={pageSettingsState.slugError}
          titleError={pageSettingsState.titleError}
          onCancelField={cancelPageSettingsField}
          onChangeField={updatePageSettingsField}
          onFinishField={finishPageSettingsField}
          onRequestClose={() => {
            requestClosePageSettingsPanel(pageSettingsStateRef.current.pageSysId);
          }}
          onRequestDelete={requestOpenDeletePageSettings}
          onStartField={startPageSettingsField}
        />
        <PageSettingsDeleteDialog
          errorMessage={pageSettingsState.deleteError}
          hasDescendants={pageSettingsHasDescendants}
          open={pageSettingsState.deleteOpen}
          pageTitle={pageSettingsState.title || pageSettingsPage?.draftTitle || "page"}
          pending={pageSettingsState.deletePending}
          onConfirm={confirmDeletePageSettings}
          onRequestClose={requestCloseDeletePageSettings}
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
