export type DocseraDiagnosticEvent = {
  data: Record<string, unknown>;
  event: string;
  runtimeId: string;
  seq: number;
  timestamp: string;
};

export type DocseraDiagnosticsExport = {
  enabled: boolean;
  events: DocseraDiagnosticEvent[];
  runtimeId: string;
  schemaVersion: 1;
};

type DiagnosticsApi = {
  clearTrace: () => DocseraDiagnosticsExport;
  disable: () => DocseraDiagnosticsExport;
  enable: () => DocseraDiagnosticsExport;
  exportTrace: () => DocseraDiagnosticsExport;
  record: (event: string, data?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    __DOCSERA_DIAGNOSTICS__?: DiagnosticsApi;
  }
}

const DIAGNOSTIC_FLAG_KEY = "docsera.diagnostics.enabled";
const DIAGNOSTIC_TRACE_KEY = "docsera.diagnostics.trace.v1";
const DIAGNOSTIC_SESSION_KEY = "docsera.diagnostics.session.v1";
const MAX_TRACE_EVENTS = 400;
const SCHEMA_VERSION = 1;
const CONSOLE_PREFIX = "[Docsera diagnostics]";

const runtimeId = createRuntimeId();
let enabled = false;
let sequence = 0;

export function initializeDocseraDiagnostics(): void {
  enabled = resolveEnabledFlag();
  installApi();
  if (enabled) {
    trySetSessionState();
    recordDocseraDiagnosticEvent("bootstrap", collectBootstrapTrace());
  }
}

export function recordDocseraDiagnosticEvent(event: string, data: Record<string, unknown> = {}): void {
  if (!enabled) {
    return;
  }

  const entry: DocseraDiagnosticEvent = {
    data: sanitizeDiagnosticValue(data) as Record<string, unknown>,
    event,
    runtimeId,
    seq: nextSequence(),
    timestamp: new Date().toISOString()
  };

  const events = readTrace();
  events.push(entry);
  writeTrace(events.slice(-MAX_TRACE_EVENTS));

  try {
    console.debug(CONSOLE_PREFIX, entry);
  } catch {
    // Diagnostic logging must never affect runtime behavior.
  }
}

export function fingerprintDiagnosticSecret(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  if (!text) {
    return "";
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fp:${(hash >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}

export function getDocseraDiagnosticsRuntimeId(): string {
  return runtimeId;
}

function installApi(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.__DOCSERA_DIAGNOSTICS__ = {
    clearTrace: () => {
      writeTrace([]);
      sequence = 0;
      recordDocseraDiagnosticEvent("trace.clear", {});
      return exportTrace();
    },
    disable: () => {
      setPersistentFlag(false);
      enabled = false;
      return exportTrace();
    },
    enable: () => {
      setPersistentFlag(true);
      enabled = true;
      trySetSessionState();
      recordDocseraDiagnosticEvent("diagnostics.enabled", collectBootstrapTrace());
      return exportTrace();
    },
    exportTrace,
    record: recordDocseraDiagnosticEvent
  };
}

function exportTrace(): DocseraDiagnosticsExport {
  return {
    enabled,
    events: readTrace(),
    runtimeId,
    schemaVersion: SCHEMA_VERSION
  };
}

function resolveEnabledFlag(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  const queryFlag = params.get("docsera_diagnostics");
  if (queryFlag === "1" || queryFlag === "true") {
    setPersistentFlag(true);
    return true;
  }
  if (queryFlag === "0" || queryFlag === "false") {
    setPersistentFlag(false);
    return false;
  }

  return readPersistentFlag();
}

function collectBootstrapTrace(): Record<string, unknown> {
  const navigation = typeof performance !== "undefined" && typeof performance.getEntriesByType === "function"
    ? performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    : undefined;
  const frameElement = readFrameElement();
  const topLocation = readRelatedLocation("top");
  const parentLocation = readRelatedLocation("parent");

  return {
    documentReadyState: typeof document === "undefined" ? "unavailable" : document.readyState,
    frameElementExists: Boolean(frameElement.element),
    frameElementId: frameElement.id,
    frameElementName: frameElement.name,
    initialWindowName: readWindowName(),
    localStorageAvailable: storageAvailable("localStorage"),
    localStorageFlagExists: storageKeyExists("localStorage", DIAGNOSTIC_FLAG_KEY),
    locationHash: safeLocationPart("hash"),
    locationHref: safeLocationPart("href"),
    locationOrigin: safeLocationPart("origin"),
    locationPathname: safeLocationPart("pathname"),
    locationSearch: safeLocationPart("search"),
    navigationType: navigation?.type ?? "unknown",
    parentLocationHref: parentLocation.href,
    parentLocationReadable: parentLocation.readable,
    parentLocationSearch: parentLocation.search,
    parentLocationThrows: parentLocation.throws,
    performanceTimeOrigin: typeof performance !== "undefined" ? performance.timeOrigin : null,
    referrer: typeof document === "undefined" ? "" : document.referrer,
    runtimeId,
    schemaVersion: SCHEMA_VERSION,
    sessionStorageAvailable: storageAvailable("sessionStorage"),
    sessionStorageStateExists: storageKeyExists("sessionStorage", DIAGNOSTIC_SESSION_KEY),
    topLocationHref: topLocation.href,
    topLocationReadable: topLocation.readable,
    topLocationSearch: topLocation.search,
    topLocationThrows: topLocation.throws,
    windowIsParent: typeof window !== "undefined" ? window === window.parent : false,
    windowIsTop: typeof window !== "undefined" ? window === window.top : false
  };
}

function sanitizeDiagnosticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/token|cookie|password|credential|secret|keyring/i.test(key) && !/fingerprint|exists|presence/i.test(key)) {
      sanitized[key] = typeof child === "string" && child ? "[redacted]" : child;
      continue;
    }
    sanitized[key] = sanitizeDiagnosticValue(child);
  }
  return sanitized;
}

function readTrace(): DocseraDiagnosticEvent[] {
  try {
    const raw = window.localStorage.getItem(DIAGNOSTIC_TRACE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_TRACE_EVENTS) as DocseraDiagnosticEvent[] : [];
  } catch {
    return [];
  }
}

function writeTrace(events: DocseraDiagnosticEvent[]): void {
  try {
    window.localStorage.setItem(DIAGNOSTIC_TRACE_KEY, JSON.stringify(events.slice(-MAX_TRACE_EVENTS)));
  } catch {
    // Console logging still preserves the event when storage is unavailable.
  }
}

function nextSequence(): number {
  const current = readTrace().reduce((max, event) => Math.max(max, Number(event.seq) || 0), sequence);
  sequence = current + 1;
  return sequence;
}

function readPersistentFlag(): boolean {
  try {
    return window.localStorage.getItem(DIAGNOSTIC_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

function setPersistentFlag(value: boolean): void {
  try {
    if (value) {
      window.localStorage.setItem(DIAGNOSTIC_FLAG_KEY, "true");
    } else {
      window.localStorage.removeItem(DIAGNOSTIC_FLAG_KEY);
    }
  } catch {
    // Opt-in persistence is best effort.
  }
}

function trySetSessionState(): void {
  try {
    window.sessionStorage.setItem(DIAGNOSTIC_SESSION_KEY, runtimeId);
  } catch {
    // Best effort only.
  }
}

function storageAvailable(storageName: "localStorage" | "sessionStorage"): boolean {
  try {
    const storage = window[storageName];
    const key = `docsera.diagnostics.probe.${runtimeId}`;
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function storageKeyExists(storageName: "localStorage" | "sessionStorage", key: string): boolean {
  try {
    return window[storageName].getItem(key) !== null;
  } catch {
    return false;
  }
}

function readWindowName(): string {
  try {
    return typeof window.name === "string" ? window.name : "";
  } catch {
    return "";
  }
}

function safeLocationPart(part: "hash" | "href" | "origin" | "pathname" | "search"): string {
  try {
    return window.location[part];
  } catch {
    return "";
  }
}

function readFrameElement(): { element: boolean; id: string; name: string } {
  try {
    const frame = window.frameElement as (Element & { name?: string }) | null;
    return {
      element: Boolean(frame),
      id: typeof frame?.id === "string" ? frame.id : "",
      name: typeof frame?.name === "string" ? frame.name : ""
    };
  } catch {
    return { element: false, id: "", name: "" };
  }
}

function readRelatedLocation(target: "parent" | "top"): { href: string; readable: boolean; search: string; throws: boolean } {
  try {
    const relatedWindow = target === "top" ? window.top : window.parent;
    const location = relatedWindow?.location;
    return {
      href: location?.href ?? "",
      readable: Boolean(location),
      search: location?.search ?? "",
      throws: false
    };
  } catch {
    return {
      href: "",
      readable: false,
      search: "",
      throws: true
    };
  }
}

function createRuntimeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
