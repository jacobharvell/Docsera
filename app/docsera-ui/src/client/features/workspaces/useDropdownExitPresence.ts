import { useEffect, useState } from "react";

export function useDropdownExitPresence<T>(active: T | null, exitMs = 130): { item: T | null; open: boolean } {
  const [retained, setRetained] = useState<T | null>(active);

  useEffect(() => {
    if (active !== null) {
      setRetained(active);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRetained(null);
      return;
    }
    const timer = setTimeout(() => setRetained(null), exitMs);
    return () => clearTimeout(timer);
  }, [active, exitMs]);

  return { item: active ?? retained, open: active !== null };
}
