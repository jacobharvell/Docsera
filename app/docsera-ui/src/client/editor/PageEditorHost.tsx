import { useEffect, useMemo, useRef } from "react";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import type { EditorOutlineItem } from "./documentOutline";

export type PageEditorHostFailure = {
  kind: "load_failed" | "mount_failed";
  message: string;
};

export type PageEditorRecoverySnapshot = Readonly<{
  envelope: DocseraDocumentEnvelope;
  isDirty: boolean;
  pageSysId: string;
  savedRevision: number;
  sessionKey: string;
}>;

type PageEditorHostProps = {
  canEdit: boolean;
  initialEnvelope: DocseraDocumentEnvelope;
  initialSavedEnvelope?: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onError: (failure: PageEditorHostFailure | null) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: {
    flush?: () => Promise<boolean>;
    getRecoverySnapshot?: () => PageEditorRecoverySnapshot | null;
    isDirty: boolean;
    isSaving: boolean;
    status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
  }) => void;
  pageSysId: string;
  sessionKey: string;
  theme: "dark" | "light";
};

type RuntimeModule = typeof import("./PageEditorHostRuntime");

type HostRuntimeEntry = {
  overlayRoot: HTMLElement;
  runtimeRoot: HTMLElement;
};

function detachOwnedNode(node: HTMLElement): void {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }

  try {
    parent.removeChild(node);
  } catch {
    // Prototype.js can patch element methods in ServiceNow. Cleanup must never
    // make editor teardown observable to the workspace shell.
  }
}

export function PageEditorHost(props: PageEditorHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<HostRuntimeEntry | null>(null);
  const runtimeHandleRef = useRef<import("./PageEditorHostRuntime").PageEditorHostRuntimeHandle | null>(null);
  const runtimeModuleRef = useRef<RuntimeModule | null>(null);
  const latestPropsRef = useRef(props);
  const runtimeSessionKey = useMemo(() => props.sessionKey, [props.sessionKey]);

  latestPropsRef.current = props;

  function buildRuntimeProps(entry: HostRuntimeEntry, currentProps: PageEditorHostProps): Parameters<RuntimeModule["mountPageEditorHostRuntime"]>[0]["props"] {
    return {
      canEdit: currentProps.canEdit,
      initialEnvelope: currentProps.initialEnvelope,
      initialSavedEnvelope: currentProps.initialSavedEnvelope,
      initialRevision: currentProps.initialRevision,
      onAccessLost: currentProps.onAccessLost,
      onEditorReady: () => {
        currentProps.onReadyStateChange?.(true);
      },
      onOutlineChange: currentProps.onOutlineChange,
      onRuntimeError: () => {
        currentProps.onReadyStateChange?.(false);
        currentProps.onError({
          kind: "mount_failed",
          message: "The editor host could not be mounted."
        });
      },
      onSaveDraft: currentProps.onSaveDraft,
      onStatusChange: currentProps.onStatusChange,
      overlayRoot: entry.overlayRoot,
      pageSysId: currentProps.pageSysId,
      sessionKey: currentProps.sessionKey,
      theme: currentProps.theme
    };
  }

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
    const entry = { overlayRoot, runtimeRoot };
    runtimeRef.current = entry;
    props.onReadyStateChange?.(false);
    props.onError(null);

    void import("./PageEditorHostRuntime")
      .then((runtimeModule) => {
        if (!active) {
          return;
        }

        runtimeModuleRef.current = runtimeModule;
        runtimeHandleRef.current = runtimeModule.mountPageEditorHostRuntime({
          props: buildRuntimeProps(entry, latestPropsRef.current),
          runtimeRoot
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        props.onReadyStateChange?.(false);
        props.onError({
          kind: "load_failed",
          message: "The editor runtime could not be loaded."
        });
      });

    return () => {
      active = false;
      const runtimeHandle = runtimeHandleRef.current;
      const mountedEntry = runtimeRef.current;
      runtimeHandleRef.current = null;
      runtimeModuleRef.current = null;
      if (mountedEntry === entry) {
        runtimeRef.current = null;
      }
      props.onReadyStateChange?.(false);
      queueMicrotask(() => {
        runtimeHandle?.destroy();
        detachOwnedNode(runtimeRoot);
        detachOwnedNode(overlayRoot);
      });
    };
  }, [runtimeSessionKey]);

  useEffect(() => {
    if (!runtimeRef.current || !runtimeHandleRef.current) {
      return;
    }

    runtimeHandleRef.current.update(buildRuntimeProps(runtimeRef.current, props));
    props.onError(null);
  }, [
    props.canEdit,
    props.initialEnvelope,
    props.initialSavedEnvelope,
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
