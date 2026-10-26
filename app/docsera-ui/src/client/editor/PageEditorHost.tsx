import { useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import type { EditorOutlineItem } from "./documentOutline";
import type { EditorMediaAdapter } from "./contracts";

export type PageEditorHostFailure = {
  kind: "load_failed" | "mount_failed";
  message: string;
};

export type PageEditorRecoverySnapshot = Readonly<{
  envelope: DocseraDocumentEnvelope;
  isDirty: boolean;
  mediaAdapter?: EditorMediaAdapter;
  pageSysId: string;
  savedRevision: number;
  sessionKey: string;
}>;

export type PageEditorCanonicalHandoffResult =
  | { kind: "applied"; nextEnvelope: DocseraDocumentEnvelope }
  | { kind: "unchanged"; nextEnvelope: DocseraDocumentEnvelope }
  | { kind: "unavailable" };

export type PageEditorRecoveredDraftReconciliationResult =
  | { kind: "saved" }
  | { kind: "preserved_local_changes" }
  | { kind: "preserved_conflict" }
  | { kind: "unavailable" };

export type PageEditorStatusState = Readonly<{
  applyCanonicalEnvelope?: (envelope: DocseraDocumentEnvelope) => PageEditorCanonicalHandoffResult;
  discardLocalEdits?: (input: { envelope: DocseraDocumentEnvelope; revision: number }) => boolean;
  reconcileRecoveredDraft?: (input: {
    envelope: DocseraDocumentEnvelope;
    revision: number;
    preserveConflictUnlessTrusted?: boolean;
  }) => PageEditorRecoveredDraftReconciliationResult;
  flush?: () => Promise<boolean>;
  getCanonicalEnvelope?: () => DocseraDocumentEnvelope | null;
  getRecoverySnapshot?: () => PageEditorRecoverySnapshot | null;
  isDirty: boolean;
  isSaving: boolean;
  status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
}>;

type PageEditorHostProps = {
  canEdit: boolean;
  interactionActive?: boolean;
  initialEnvelope: DocseraDocumentEnvelope;
  initialSavedEnvelope?: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onError: (failure: PageEditorHostFailure | null) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onEditorCommandTargetChange?: (target: { editor: Editor | null; sessionKey: string }) => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: PageEditorStatusState) => void;
  mediaAdapter?: EditorMediaAdapter;
  historyControlsMount?: HTMLElement | null;
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
  const publishCommandTarget = useMemo(() => {
    let hasPublished = false;
    let publishedEditor: Editor | null = null;

    return (editor: Editor | null) => {
      if (hasPublished && publishedEditor === editor) {
        return;
      }

      hasPublished = true;
      publishedEditor = editor;
      latestPropsRef.current.onEditorCommandTargetChange?.({ editor, sessionKey: runtimeSessionKey });
    };
  }, [runtimeSessionKey]);

  latestPropsRef.current = props;

  function buildRuntimeProps(entry: HostRuntimeEntry, currentProps: PageEditorHostProps): Parameters<RuntimeModule["mountPageEditorHostRuntime"]>[0]["props"] {
    return {
      canEdit: currentProps.canEdit,
      interactionActive: currentProps.interactionActive ?? true,
      initialEnvelope: currentProps.initialEnvelope,
      initialSavedEnvelope: currentProps.initialSavedEnvelope,
      initialRevision: currentProps.initialRevision,
      onAccessLost: currentProps.onAccessLost,
      onEditorReady: () => {
        currentProps.onReadyStateChange?.(true);
      },
      onEditorCommandTargetChange: publishCommandTarget,
      onOutlineChange: currentProps.onOutlineChange,
      onRuntimeError: () => {
        currentProps.onReadyStateChange?.(false);
        currentProps.onError({
          kind: "mount_failed",
          message: "The editor host could not be mounted."
        });
      },
      onSaveDraft: currentProps.onSaveDraft,
      mediaAdapter: currentProps.mediaAdapter,
      historyControlsMount: currentProps.historyControlsMount ?? null,
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
    publishCommandTarget(null);
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
      publishCommandTarget(null);
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
    props.interactionActive,
    props.initialEnvelope,
    props.initialSavedEnvelope,
    props.initialRevision,
    props.onAccessLost,
    props.onError,
    props.onOutlineChange,
    props.onSaveDraft,
    props.historyControlsMount,
    props.mediaAdapter,
    props.onStatusChange,
    props.pageSysId,
    props.sessionKey,
    props.theme
  ]);

  return (
    <div
      ref={hostRef}
      data-docsera-page-editor-host="true"
      data-docsera-page-editor-interaction-active={props.interactionActive === false ? "false" : "true"}
    />
  );
}
