import { useEffect, useRef, useState } from "react";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import type { DocseraMarkdownConversionFailure } from "../../../shared/editor/markdown";
import type { PageEditorCanonicalHandoffResult } from "../../editor/PageEditorHost";
import type { MarkdownSourceSession, MarkdownSourceSessionSnapshot } from "../../editor/MarkdownSourceSession";
import type { WorkspaceAuthoringSurface } from "./workspaceAuthoringSurface";

type MarkdownSourceStatus = {
  errorMessage: string;
  isUnavailable: boolean;
  isInvalid: boolean;
  pageSysId: string;
};

type WorkspaceMarkdownSourcePanelProps = {
  authoringSurface: WorkspaceAuthoringSurface;
  canonicalEnvelope: DocseraDocumentEnvelope;
  canonicalTitle: string;
  discardNonce: number;
  editable: boolean;
  handoffRetryNonce?: number;
  pageSysId: string;
  visible: boolean;
  onBodyChange?: (envelope: DocseraDocumentEnvelope) => PageEditorCanonicalHandoffResult;
  onDiscardComplete?: () => void;
  onDiscardInvalidDraft?: () => void;
  onInvalidChange?: (state: MarkdownSourceStatus) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onTitleChange?: (title: string) => void;
};

function canonicalKey(title: string, envelope: DocseraDocumentEnvelope): string {
  return JSON.stringify({ envelope, title });
}

function invalidState(pageSysId: string, failure: DocseraMarkdownConversionFailure): MarkdownSourceStatus {
  return {
    errorMessage: failure.message,
    isUnavailable: false,
    isInvalid: true,
    pageSysId
  };
}

function SourceError({
  discardLabel,
  message,
  role,
  title,
  onDiscard
}: {
  discardLabel: string;
  message: string;
  role: "alert" | "status";
  title: string;
  onDiscard: () => void;
}) {
  return (
    <section className="docsera-main__source-error" role={role}>
      <p className="docsera-main__eyebrow">Markdown source</p>
      <h2 className="docsera-main__recovery-title">{title}</h2>
      <p className="docsera-main__lede">{message}</p>
      <button type="button" className="docsera-main__empty-action" onClick={onDiscard}>
        {discardLabel}
      </button>
    </section>
  );
}

export function WorkspaceMarkdownSourcePanel({
  authoringSurface,
  canonicalEnvelope,
  canonicalTitle,
  discardNonce,
  editable,
  handoffRetryNonce = 0,
  pageSysId,
  visible,
  onBodyChange,
  onDiscardComplete,
  onDiscardInvalidDraft,
  onInvalidChange,
  onReadyStateChange,
  onTitleChange
}: WorkspaceMarkdownSourcePanelProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<MarkdownSourceSession | null>(null);
  const snapshotRef = useRef<MarkdownSourceSessionSnapshot | null>(null);
  const editableRef = useRef(editable);
  const visibleRef = useRef(visible);
  const sourceUnavailableRef = useRef(false);
  const canonicalEnvelopeRef = useRef(canonicalEnvelope);
  const canonicalTitleRef = useRef(canonicalTitle);
  const currentCanonicalKeyRef = useRef(canonicalKey(canonicalTitle, canonicalEnvelope));
  const projectedCanonicalKeyRef = useRef("");
  const lastDiscardNonceRef = useRef(discardNonce);
  const lastHandoffRetryNonceRef = useRef(handoffRetryNonce);
  const sessionLoadRequestIdRef = useRef(0);
  const sessionLoadPromiseRef = useRef<Promise<void> | null>(null);
  const [sessionError, setSessionError] = useState("");
  const callbacksRef = useRef({
    onBodyChange,
    onDiscardComplete,
    onDiscardInvalidDraft,
    onInvalidChange,
    onReadyStateChange,
    onTitleChange,
    pageSysId
  });

  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    canonicalEnvelopeRef.current = canonicalEnvelope;
    canonicalTitleRef.current = canonicalTitle;
    currentCanonicalKeyRef.current = canonicalKey(canonicalTitle, canonicalEnvelope);
  }, [canonicalEnvelope, canonicalTitle]);

  useEffect(() => {
    if (handoffRetryNonce === lastHandoffRetryNonceRef.current) {
      return;
    }

    lastHandoffRetryNonceRef.current = handoffRetryNonce;

    const snapshot = snapshotRef.current;
    const currentStatus = callbacksRef.current;
    if (!snapshot || snapshot.kind === "invalid" || snapshot.isClean || !sourceUnavailableRef.current) {
      return;
    }

    if (!currentStatus.onBodyChange) {
      return;
    }

    const retryResult = currentStatus.onBodyChange(snapshot.envelope);
    if (retryResult?.kind === "unavailable") {
      return;
    }

    sourceUnavailableRef.current = false;
    setSessionError("");
    projectedCanonicalKeyRef.current = canonicalKey(snapshot.title, snapshot.envelope);
    currentStatus.onInvalidChange?.({ errorMessage: "", isUnavailable: false, isInvalid: false, pageSysId: currentStatus.pageSysId });
  }, [handoffRetryNonce]);

  useEffect(() => {
    callbacksRef.current = {
      onBodyChange,
      onDiscardComplete,
      onDiscardInvalidDraft,
      onInvalidChange,
      onReadyStateChange,
      onTitleChange,
      pageSysId
    };
  }, [onBodyChange, onDiscardComplete, onDiscardInvalidDraft, onInvalidChange, onReadyStateChange, onTitleChange, pageSysId]);

  function invalidatePendingSessionLoad(): void {
    sessionLoadRequestIdRef.current += 1;
    sessionLoadPromiseRef.current = null;
  }

  function resetSessionState(): void {
    invalidatePendingSessionLoad();
    setSessionError("");
    snapshotRef.current = null;
    sourceUnavailableRef.current = false;
    callbacksRef.current.onReadyStateChange?.(false);
    sessionRef.current?.destroy();
    sessionRef.current = null;
  }

  function startSessionLoadIfNeeded(): void {
    if (!visibleRef.current || !mountRef.current || sessionRef.current || sessionLoadPromiseRef.current) {
      return;
    }

    const requestId = ++sessionLoadRequestIdRef.current;
    setSessionError("");
    const loadPromise = (async () => {
      try {
        const { createMarkdownSourceSession } = await import("../../editor/MarkdownSourceSession");
        const mount = mountRef.current;
        if (requestId !== sessionLoadRequestIdRef.current || !mount || !visibleRef.current) {
          return;
        }

        const result = createMarkdownSourceSession({
          mount,
          onStateChange: (snapshot) => {
            const {
              onBodyChange: currentOnBodyChange,
              onInvalidChange: currentOnInvalidChange,
              onTitleChange: currentOnTitleChange,
              pageSysId: currentPageSysId
            } = callbacksRef.current;
            snapshotRef.current = snapshot;

            if (snapshot.kind === "invalid") {
              sourceUnavailableRef.current = false;
              currentOnInvalidChange?.(invalidState(currentPageSysId, snapshot.failure));
              return;
            }

            if (!sourceUnavailableRef.current) {
              currentOnInvalidChange?.({ errorMessage: "", isUnavailable: false, isInvalid: false, pageSysId: currentPageSysId });
            }

            const nextSnapshotKey = canonicalKey(snapshot.title, snapshot.envelope);
            if (snapshot.isClean) {
              sourceUnavailableRef.current = false;
              projectedCanonicalKeyRef.current = nextSnapshotKey;
              setSessionError("");
              return;
            }

            if (snapshot.title !== canonicalTitleRef.current) {
              currentOnTitleChange?.(snapshot.title);
            }
            if (JSON.stringify(snapshot.envelope) !== JSON.stringify(canonicalEnvelopeRef.current)) {
              const bodyChangeResult = currentOnBodyChange?.(snapshot.envelope);
              if (bodyChangeResult?.kind === "unavailable") {
                sourceUnavailableRef.current = true;
                setSessionError("Markdown source is waiting for the visual editor to become available.");
                currentOnInvalidChange?.({
                  errorMessage: "Markdown source is waiting for the visual editor to become available.",
                  isUnavailable: true,
                  isInvalid: false,
                  pageSysId: currentPageSysId
                });
                return;
              }
            }

            sourceUnavailableRef.current = false;
            setSessionError("");
            projectedCanonicalKeyRef.current = nextSnapshotKey;
          },
          editable: editableRef.current,
          title: canonicalTitleRef.current,
          envelope: canonicalEnvelopeRef.current
        });

        if (requestId !== sessionLoadRequestIdRef.current || !mountRef.current || !visibleRef.current) {
          if (result.ok) {
            result.session.destroy();
          }
          return;
        }

        if (!result.ok) {
          setSessionError(result.failure.message);
          callbacksRef.current.onInvalidChange?.(invalidState(callbacksRef.current.pageSysId, result.failure));
          callbacksRef.current.onReadyStateChange?.(true);
          return;
        }

        sessionRef.current = result.session;
        projectedCanonicalKeyRef.current = currentCanonicalKeyRef.current;
        callbacksRef.current.onReadyStateChange?.(true);
      } catch {
        if (requestId !== sessionLoadRequestIdRef.current) {
          return;
        }

        const message = "Markdown source editor failed to load.";
        sourceUnavailableRef.current = true;
        setSessionError(message);
        callbacksRef.current.onInvalidChange?.({
          errorMessage: message,
          isUnavailable: true,
          isInvalid: false,
          pageSysId: callbacksRef.current.pageSysId
        });
        callbacksRef.current.onReadyStateChange?.(true);
      }
    })();

    sessionLoadPromiseRef.current = loadPromise;
    loadPromise.finally(() => {
      if (sessionLoadPromiseRef.current === loadPromise) {
        sessionLoadPromiseRef.current = null;
      }
    });
  }

  useEffect(() => {
    resetSessionState();
    projectedCanonicalKeyRef.current = currentCanonicalKeyRef.current;
    if (visibleRef.current) {
      startSessionLoadIfNeeded();
    }

    return () => {
      resetSessionState();
    };
  }, [pageSysId]);

  useEffect(() => {
    if (!visible) {
      return () => {
        invalidatePendingSessionLoad();
      };
    }

    if (!sessionRef.current) {
      startSessionLoadIfNeeded();
      return () => {
        invalidatePendingSessionLoad();
      };
    }

    callbacksRef.current.onReadyStateChange?.(true);

    return () => {
      invalidatePendingSessionLoad();
    };
  }, [visible]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    session.setEditable(editable);
    if (!editable) {
      return;
    }

    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.kind === "invalid" || snapshot.isClean || !sourceUnavailableRef.current) {
      return;
    }

    const currentStatus = callbacksRef.current;
    if (!currentStatus.onBodyChange) {
      return;
    }

    const result = currentStatus.onBodyChange(snapshot.envelope);
    if (result.kind !== "unavailable") {
      sourceUnavailableRef.current = false;
      setSessionError("");
      currentStatus.onInvalidChange?.({ errorMessage: "", isUnavailable: false, isInvalid: false, pageSysId: currentStatus.pageSysId });
      projectedCanonicalKeyRef.current = canonicalKey(snapshot.title, snapshot.envelope);
    }
  }, [editable]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    if (discardNonce === lastDiscardNonceRef.current) {
      return;
    }

    lastDiscardNonceRef.current = discardNonce;
    const replacement = session.replaceFromCanonical({
      envelope: canonicalEnvelopeRef.current,
      title: canonicalTitleRef.current
    });

    if (!replacement.ok) {
      setSessionError(replacement.message);
      callbacksRef.current.onInvalidChange?.(invalidState(callbacksRef.current.pageSysId, replacement));
      return;
    }

    sourceUnavailableRef.current = false;
    setSessionError("");
    projectedCanonicalKeyRef.current = currentCanonicalKeyRef.current;
    callbacksRef.current.onInvalidChange?.({ errorMessage: "", isUnavailable: false, isInvalid: false, pageSysId: callbacksRef.current.pageSysId });
    callbacksRef.current.onDiscardComplete?.();
  }, [discardNonce]);

  useEffect(() => {
    const session = sessionRef.current;
    const snapshot = snapshotRef.current;
    if (!session || !snapshot || !visible) {
      return;
    }

    if (snapshot.kind === "invalid") {
      return;
    }

    if (!editableRef.current) {
      return;
    }

    if (sourceUnavailableRef.current) {
      return;
    }

    const snapshotKey = canonicalKey(snapshot.title, snapshot.envelope);
    if (snapshotKey !== projectedCanonicalKeyRef.current) {
      return;
    }

    if (projectedCanonicalKeyRef.current === currentCanonicalKeyRef.current) {
      return;
    }

    const replacement = session.replaceFromCanonical({
      envelope: canonicalEnvelopeRef.current,
      title: canonicalTitleRef.current
    });

    if (!replacement.ok) {
      setSessionError(replacement.message);
      callbacksRef.current.onInvalidChange?.(invalidState(callbacksRef.current.pageSysId, replacement));
      return;
    }

    sourceUnavailableRef.current = false;
    setSessionError("");
    projectedCanonicalKeyRef.current = currentCanonicalKeyRef.current;
    callbacksRef.current.onInvalidChange?.({ errorMessage: "", isUnavailable: false, isInvalid: false, pageSysId: callbacksRef.current.pageSysId });
  }, [canonicalEnvelope, canonicalTitle, visible]);

  const invalidSnapshot = snapshotRef.current?.kind === "invalid" ? snapshotRef.current : null;
  const statusMessage = invalidSnapshot?.failure.message || sessionError;

  return (
    <section
      className="docsera-main__source"
      aria-label="Markdown source editor"
      hidden={!visible}
      data-docsera-markdown-source="true"
      data-docsera-markdown-surface={authoringSurface}
    >
      <div className="docsera-main__source-editor" ref={mountRef} />
      {invalidSnapshot ? (
        <SourceError
          discardLabel="Discard invalid draft"
          message={statusMessage}
          role="alert"
          title="Invalid source"
          onDiscard={onDiscardInvalidDraft ?? (() => undefined)}
        />
      ) : sourceUnavailableRef.current ? (
        <SourceError
          discardLabel="Discard retained draft"
          message={statusMessage || "Markdown source is waiting for the visual editor to become available."}
          role="status"
          title="Source unavailable"
          onDiscard={onDiscardInvalidDraft ?? (() => undefined)}
        />
      ) : null}
    </section>
  );
}
