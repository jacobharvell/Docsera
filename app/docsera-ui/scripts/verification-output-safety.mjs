const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN = /(password|token|cookie|authorization|keyring|secret)/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactString(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value
    .replace(/((?:lease|lock|page[-_\s]?lock|session|login|user)\s*token\s*[=:]\s*)([^,;]+)/gi, `$1${REDACTED}`)
    .replace(/((?:password|cookie|authorization|keyring|secret)\s*[=:]\s*)([^,;]+)/gi, `$1${REDACTED}`);
}

export function redactForOutput(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactForOutput(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactForOutput(entry)
      ])
    );
  }
  return redactString(value);
}

export function safeDetail(detail) {
  if (detail === undefined || detail === null || detail === "") {
    return "";
  }
  if (typeof detail === "string") {
    try {
      return JSON.stringify(redactForOutput(JSON.parse(detail)));
    } catch {
      return redactString(detail).slice(0, 400);
    }
  }
  return JSON.stringify(redactForOutput(detail));
}

export function safeErrorMessage(error, fallback) {
  if (error instanceof Error) {
    return safeDetail({ message: error.message, name: error.name }) || fallback;
  }
  return safeDetail(error) || fallback;
}
