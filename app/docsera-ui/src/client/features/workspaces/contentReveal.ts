import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ContentRevealState = "idle" | "pending" | "enter";
export type ContentRevealIntent<TSurface> = {
  destination: TSurface;
  key: number;
  scope?: "workspace" | "authoring-surface";
} | null;

export const DOCSERA_CONTENT_REVEAL_DURATION_MS = 400;

function readPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(readPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => setReducedMotion(mediaQuery.matches);
    updateReducedMotion();
    mediaQuery.addEventListener?.("change", updateReducedMotion);

    return () => {
      mediaQuery.removeEventListener?.("change", updateReducedMotion);
    };
  }, []);

  return reducedMotion;
}

export function useContentRevealState<TSurface>(
  surface: TSurface,
  ready: boolean,
  workspaceIdentity: string,
  revealIntent: ContentRevealIntent<TSurface> = null
): ContentRevealState {
  const prefersReducedMotion = usePrefersReducedMotion();
  const previousSurfaceRef = useRef(surface);
  const previousRevealIntentKeyRef = useRef(revealIntent?.key ?? 0);
  const previousWorkspaceIdentityRef = useRef(workspaceIdentity);
  const pendingSurfaceRef = useRef<TSurface | null>(revealIntent?.destination ?? null);
  const [state, setState] = useState<ContentRevealState>("idle");

  useLayoutEffect(() => {
    const enterPendingSurface = () => {
      if (prefersReducedMotion) {
        pendingSurfaceRef.current = null;
        setState("idle");
        return undefined;
      }

      if (pendingSurfaceRef.current !== surface) {
        setState("idle");
        return undefined;
      }

      pendingSurfaceRef.current = null;
      setState("enter");

      const timeout = window.setTimeout(() => setState("idle"), DOCSERA_CONTENT_REVEAL_DURATION_MS);
      return () => {
        window.clearTimeout(timeout);
      };
    };

    if (previousWorkspaceIdentityRef.current !== workspaceIdentity) {
      previousWorkspaceIdentityRef.current = workspaceIdentity;
      previousSurfaceRef.current = surface;
      previousRevealIntentKeyRef.current = revealIntent?.key ?? 0;
      pendingSurfaceRef.current = revealIntent?.destination ?? null;
      if (!ready) {
        setState(pendingSurfaceRef.current === surface ? "pending" : "idle");
        return undefined;
      }
      return enterPendingSurface();
    }

    const revealIntentKey = revealIntent?.key ?? 0;
    const revealWasTriggered = previousRevealIntentKeyRef.current !== revealIntentKey;
    previousRevealIntentKeyRef.current = revealIntentKey;
    if (revealWasTriggered) {
      pendingSurfaceRef.current = revealIntent?.destination ?? null;
    }

    if (previousSurfaceRef.current !== surface) {
      previousSurfaceRef.current = surface;
    }

    if (!ready) {
      setState(pendingSurfaceRef.current === surface ? "pending" : "idle");
      return undefined;
    }

    return enterPendingSurface();
  }, [prefersReducedMotion, ready, revealIntent, surface, workspaceIdentity]);

  if (!ready && pendingSurfaceRef.current === surface) {
    return "pending";
  }

  return state;
}
