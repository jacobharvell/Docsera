import { useEffect, useState } from "react";

export const DOCSERA_PANEL_TRANSITION_MS = 200;

export function usePanelTransitionPresence(open: boolean) {
  const [present, setPresent] = useState(open);
  const [active, setActive] = useState(open);

  useEffect(() => {
    const frames: number[] = [];

    if (open) {
      setPresent(true);
      frames.push(
        window.requestAnimationFrame(() => {
          frames.push(window.requestAnimationFrame(() => setActive(true)));
        })
      );
      return () => frames.forEach((frame) => window.cancelAnimationFrame(frame));
    }

    setActive(false);
    const timer = window.setTimeout(() => setPresent(false), DOCSERA_PANEL_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { active, present };
}
