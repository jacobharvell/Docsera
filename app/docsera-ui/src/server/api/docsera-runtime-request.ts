type RequestLike = {
  body?: unknown;
  getHeader?: (name: string) => unknown;
  headers?: unknown;
  queryParams?: unknown;
  queryString?: string;
  requestHeaders?: unknown;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readValueFromQuery(value: unknown): string {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const text = cleanText(candidate);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return cleanText(record.value) || cleanText(record.sys_id);
  }

  return cleanText(value);
}

export function readQueryParam(request: RequestLike | undefined, key: string): string {
  const queryString = cleanText(request?.queryString);
  if (queryString) {
    const normalizedQuery = queryString.startsWith("?") ? queryString.slice(1) : queryString;
    for (const entry of normalizedQuery.split("&")) {
      if (!entry) {
        continue;
      }

      const [rawKey, ...rawValueParts] = entry.split("=");
      if (cleanText(decodeURIComponent(rawKey || "")) !== key) {
        continue;
      }

      const rawValue = rawValueParts.join("=");
      if (!rawValue) {
        return "";
      }

      return cleanText(decodeURIComponent(rawValue.replace(/\+/g, " ")));
    }
  }

  const queryParams = request?.queryParams;
  if (queryParams && typeof queryParams === "object") {
    return readValueFromQuery((queryParams as Record<string, unknown>)[key]);
  }

  return "";
}

function readHeaderValue(value: unknown): string {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const text = cleanText(candidate);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return cleanText(record.value) || cleanText(record.headerValue) || cleanText(record.content) || cleanText(record[0]);
  }

  return cleanText(value);
}

export function readHeader(request: RequestLike | undefined, key: string): string {
  if (!request) {
    return "";
  }

  const lowerKey = key.toLowerCase();
  const upperKey = key.toUpperCase();
  const candidates: unknown[] = [];

  if (typeof request.getHeader === "function") {
    candidates.push(request.getHeader(key), request.getHeader(lowerKey), request.getHeader(upperKey));
  }

  if (request.headers && typeof request.headers === "object") {
    const headers = request.headers as Record<string, unknown>;
    candidates.push(headers[key], headers[lowerKey], headers[upperKey]);
  }

  if (request.requestHeaders && typeof request.requestHeaders === "object") {
    const headers = request.requestHeaders as Record<string, unknown>;
    candidates.push(headers[key], headers[lowerKey], headers[upperKey]);
  }

  for (const candidate of candidates) {
    const text = readHeaderValue(candidate);
    if (text) {
      return text;
    }
  }

  return "";
}

export function readNumericHeader(request: RequestLike | undefined, key: string): number | null {
  const header = readHeader(request, key);
  if (!header) {
    return null;
  }

  const parsed = Number(header);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function readRequestBodyDataStream(request: RequestLike | undefined): unknown {
  const body = request?.body;
  if (!body || typeof body !== "object") {
    return undefined;
  }

  return (body as Record<string, unknown>).dataStream;
}

