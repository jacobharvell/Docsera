import { useEffect, useMemo, useRef } from "react";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  PageBodySaveResult,
  PageEditLockAcquireResult,
  PageEditLockHeartbeatResult,
  PageEditLockReleaseResult,
  PageEditLockStatusResult
} from "../shared/types/docsera";
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
  onReadyStateChange?: (ready: boolean) => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    lockToken?: string;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onAcquireEditLock?: (input: { lockToken?: string; pageSysId: string }) => Promise<PageEditLockAcquireResult>;
  onHeartbeatEditLock?: (input: { lockToken: string; pageSysId: string }) => Promise<PageEditLockHeartbeatResult>;
  onRefreshEditLock?: (input: { lockToken?: string; pageSysId: string }) => Promise<PageEditLockStatusResult>;
  onReleaseEditLock?: (input: { keepalive?: boolean; lockToken: string; pageSysId: string }) => Promise<PageEditLockReleaseResult>;
  onStatusChange: (state: {
    flush?: () => Promise<boolean>;
    release?: (options?: { keepalive?: boolean }) => Promise<void>;
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
      initialRevision: currentProps.initialRevision,
      onAccessLost: currentProps.onAccessLost,
      onEditorReady: () => {
        currentProps.onReadyStateChange?.(true);
      },
      onOutlineChange: currentProps.onOutlineChange,
      onAcquireEditLock: currentProps.onAcquireEditLock,
      onHeartbeatEditLock: currentProps.onHeartbeatEditLock,
      onRefreshEditLock: currentProps.onRefreshEditLock,
      onReleaseEditLock: currentProps.onReleaseEditLock,
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
      runtimeHandleRef.current = null;
      runtimeModuleRef.current = null;
      runtimeRef.current = null;
      props.onReadyStateChange?.(false);
      queueMicrotask(() => {
        runtimeHandle?.destroy();
        runtimeRoot.remove();
        overlayRoot.remove();
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
    props.initialRevision,
    props.onAccessLost,
    props.onAcquireEditLock,
    props.onError,
    props.onHeartbeatEditLock,
    props.onOutlineChange,
    props.onRefreshEditLock,
    props.onReleaseEditLock,
    props.onSaveDraft,
    props.onStatusChange,
    props.pageSysId,
    props.sessionKey,
    props.theme
  ]);

  return <div ref={hostRef} data-docsera-page-editor-host="true" />;
}
