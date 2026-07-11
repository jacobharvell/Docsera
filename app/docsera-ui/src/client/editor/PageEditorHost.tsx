import { createRoot, type Root } from "react-dom/client";
import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import type { EditorOutlineItem } from "./documentOutline";

export type PageEditorHostFailure = {
  kind: "load_failed" | "mount_failed";
  message: string;
};

type PageEditorHostProps = {
  canEdit: boolean;
  initialEnvelope: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onError: (failure: PageEditorHostFailure | null) => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: { isDirty: boolean; isSaving: boolean }) => void;
  pageSysId: string;
  sessionKey: string;
  theme: "dark" | "light";
};

type RuntimeModule = typeof import("./PageEditorHostRuntime");

type HostRuntimeEntry = {
  overlayRoot: HTMLElement;
  reactRoot: Root;
  runtimeRoot: HTMLElement;
};

type RuntimeBoundaryProps = {
  children: ReactNode;
  onRuntimeError: (error: unknown) => void;
  resetKey: string;
};

type RuntimeBoundaryState = {
  hasError: boolean;
};

class RuntimeBoundary extends Component<RuntimeBoundaryProps, RuntimeBoundaryState> {
  state: RuntimeBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RuntimeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onRuntimeError(error);
  }

  componentDidUpdate(prevProps: RuntimeBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function renderRuntime(
  entry: HostRuntimeEntry,
  runtimeModule: RuntimeModule,
  props: PageEditorHostProps
): void {
  entry.reactRoot.render(
    <RuntimeBoundary
      resetKey={props.sessionKey}
      onRuntimeError={(error) => {
        props.onError({
          kind: "mount_failed",
          message: "The editor host could not be mounted."
        });
      }}
    >
      <runtimeModule.PageEditorHostRuntime
        canEdit={props.canEdit}
        initialEnvelope={props.initialEnvelope}
        initialRevision={props.initialRevision}
        onAccessLost={props.onAccessLost}
        onOutlineChange={props.onOutlineChange}
        onSaveDraft={props.onSaveDraft}
        onStatusChange={props.onStatusChange}
        overlayRoot={entry.overlayRoot}
        pageSysId={props.pageSysId}
        theme={props.theme}
      />
    </RuntimeBoundary>
  );
}

export function PageEditorHost(props: PageEditorHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<HostRuntimeEntry | null>(null);
  const runtimeModuleRef = useRef<RuntimeModule | null>(null);
  const runtimeSessionKey = useMemo(
    () => `${props.sessionKey}:${props.canEdit ? "editable" : "readonly"}`,
    [props.canEdit, props.sessionKey]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let active = true;
    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const runtimeRoot = document.createElement("div");
    const overlayRoot = document.createElement("div");
    overlayRoot.dataset.docseraEditorOverlayRoot = "true";
    shadowRoot.replaceChildren(runtimeRoot, overlayRoot);
    const reactRoot = createRoot(runtimeRoot);
    const entry = { overlayRoot, reactRoot, runtimeRoot };
    runtimeRef.current = entry;
    props.onError(null);

    void import("./PageEditorHostRuntime")
      .then((runtimeModule) => {
        if (!active) {
          return;
        }

        runtimeModuleRef.current = runtimeModule;
        renderRuntime(entry, runtimeModule, props);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        props.onError({
          kind: "load_failed",
          message: "The editor runtime could not be loaded."
        });
      });

    return () => {
      active = false;
      runtimeModuleRef.current = null;
      runtimeRef.current = null;
      queueMicrotask(() => {
        reactRoot.unmount();
        runtimeRoot.remove();
        overlayRoot.remove();
      });
    };
  }, [runtimeSessionKey]);

  useEffect(() => {
    if (!runtimeRef.current || !runtimeModuleRef.current) {
      return;
    }

    renderRuntime(runtimeRef.current, runtimeModuleRef.current, props);
    props.onError(null);
  }, [
    props.canEdit,
    props.initialEnvelope,
    props.initialRevision,
    props.onAccessLost,
    props.onError,
    props.onOutlineChange,
    props.onSaveDraft,
    props.onStatusChange,
    props.pageSysId,
    props.sessionKey,
    props.theme
  ]);

  return <div ref={hostRef} data-docsera-page-editor-host="true" />;
}
