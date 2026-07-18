export function normalizeNumericSiblingOrder(value: unknown, fallback = 1): number {
  if (typeof value !== "number" && typeof value !== "string") {
    return fallback;
  }

  if (typeof value === "string" && !value.trim()) {
    return fallback;
  }

  const order = Number(value);
  return Number.isFinite(order) ? order : fallback;
}
