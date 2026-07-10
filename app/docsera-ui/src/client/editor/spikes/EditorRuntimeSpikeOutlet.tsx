import { useEffect, useRef, useState } from "react";

type SpikeStatus = "loading" | "ready" | "failed";

export function EditorRuntimeSpikeOutlet() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<SpikeStatus>("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const runtimeRoot = document.createElement("div");
    const overlayRoot = document.createElement("div");
    overlayRoot.dataset.docseraEditorOverlayRoot = "true";
    shadowRoot.replaceChildren(runtimeRoot, overlayRoot);
    let active = true;
    let unmount: (() => void) | null = null;

    void import("./mountEditorRuntimeSpike")
      .then((runtime) => {
        if (!active) {
          return;
        }

        unmount = runtime.mountEditorRuntimeSpike({ runtimeRoot, overlayRoot });
        setStatus("ready");
        window.dispatchEvent(new CustomEvent("docsera-editor-runtime-spike-ready"));
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setStatus("failed");
        runtimeRoot.textContent = "The editor runtime spike could not be loaded.";
      });

    return () => {
      active = false;
      const unmountRuntime = unmount;
      queueMicrotask(() => {
        unmountRuntime?.();
        runtimeRoot.remove();
        overlayRoot.remove();
      });
    };
  }, []);

  return (
    <aside className="docsera-editor-runtime-spike" aria-label="Editor runtime E1 spike">
      <div className="docsera-editor-runtime-spike__header">
        <strong>E1 editor runtime spike</strong>
        <span role="status">{status}</span>
      </div>
      <div ref={hostRef} data-docsera-editor-spike-host="true" />
    </aside>
  );
}
