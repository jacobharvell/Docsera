import { useEffect, useRef, useState } from "react";
import type { WorkspaceMediaLoader } from "../types/docsera";

export type WorkspaceMediaObjectUrlState = Readonly<{
  objectUrl: string | null;
  status: "idle" | "loading" | "ready" | "unavailable";
}>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function revokeWorkspaceMediaObjectUrl(objectUrl: string | null | undefined): void {
  if (!objectUrl || typeof URL.revokeObjectURL !== "function") {
    return;
  }

  URL.revokeObjectURL(objectUrl);
}

function createObjectUrlFromBlob(blob: Blob): string | null {
  if (typeof URL.createObjectURL !== "function") {
    return null;
  }

  return URL.createObjectURL(blob);
}

export function useWorkspaceMediaObjectUrl(input: {
  loadMedia?: WorkspaceMediaLoader;
  mediaId: string | null | undefined;
  invalidateKey?: string | number;
}): WorkspaceMediaObjectUrlState {
  const [state, setState] = useState<WorkspaceMediaObjectUrlState>({
    objectUrl: null,
    status: cleanText(input.mediaId) ? "loading" : "idle"
  });
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const mediaId = cleanText(input.mediaId);
    const loadMedia = input.loadMedia;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    revokeWorkspaceMediaObjectUrl(objectUrlRef.current);
    objectUrlRef.current = null;

    if (!mediaId || !loadMedia) {
      setState({
        objectUrl: null,
        status: mediaId ? "unavailable" : "idle"
      });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({
      objectUrl: null,
      status: "loading"
    });

    void loadMedia({ mediaId, signal: controller.signal })
      .then((blob) => {
        if (!active || controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        if (!blob) {
          setState({
            objectUrl: null,
            status: "unavailable"
          });
          return;
        }

        const objectUrl = createObjectUrlFromBlob(blob);
        if (!objectUrl) {
          setState({
            objectUrl: null,
            status: "unavailable"
          });
          return;
        }

        objectUrlRef.current = objectUrl;
        setState({
          objectUrl,
          status: "ready"
        });
      })
      .catch(() => {
        if (!active || controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setState({
          objectUrl: null,
          status: "unavailable"
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [input.invalidateKey, input.loadMedia, input.mediaId]);

  useEffect(() => {
    return () => {
      revokeWorkspaceMediaObjectUrl(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, []);

  return state;
}
