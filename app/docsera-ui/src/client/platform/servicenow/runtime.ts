import type { DocseraRuntimeConfig, DocseraRuntimeContext } from "../../shared/types/docsera";

declare global {
  interface Window {
    DOCSERA_RUNTIME_CONFIG?: Partial<DocseraRuntimeConfig>;
  }
}

const defaultConfig: DocseraRuntimeConfig = {
  backendPingPath: undefined,
  cssPath: undefined,
  scriptPath: undefined
};

export function resolveRuntimeContext(): DocseraRuntimeContext {
  const mountNodeId = "docsera-root";
  const mountNode = document.getElementById(mountNodeId);
  const config = {
    ...defaultConfig,
    ...window.DOCSERA_RUNTIME_CONFIG
  };

  return {
    mountNode,
    mountNodeId,
    config
  };
}
