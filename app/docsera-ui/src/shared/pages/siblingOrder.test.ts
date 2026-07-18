import { describe, expect, it } from "vitest";
import { normalizeNumericSiblingOrder } from "./siblingOrder";

describe("sibling order normalization", () => {
  it.each([
    ["zero", 0, 0],
    ["persisted zero string", "0", 0],
    ["negative", -2, -2],
    ["persisted negative string", "-2", -2],
    ["fractional", 1.5, 1.5],
    ["persisted fractional string", "1.5", 1.5],
    ["null", null, 1],
    ["missing", undefined, 1],
    ["empty string", "", 1],
    ["whitespace", "   ", 1],
    ["nonnumeric", "abc", 1],
    ["true", true, 1],
    ["false", false, 1],
    ["array", [0], 1],
    ["object", { value: 0 }, 1],
    ["infinite", Infinity, 1],
    ["nan", Number.NaN, 1]
  ])("preserves finite numeric ranks and falls back for %s", (_label, input, expected) => {
    expect(normalizeNumericSiblingOrder(input)).toBe(expected);
  });
});
