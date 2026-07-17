import { describe, expect, it } from "vitest";
import { redactForOutput, safeDetail, safeErrorMessage } from "./verification-output-safety.mjs";

describe("verification output safety", () => {
  it("redacts representative token, password, cookie, and keyring fields recursively", () => {
    expect(redactForOutput({
      cookieHeader: "abc",
      details: {
        keyringService: "ServiceNow",
        leaseToken: "workspace-lease-token",
        nested: [{ password: "super-secret" }]
      },
      userToken: "user-token"
    })).toEqual({
      cookieHeader: "[redacted]",
      details: {
        keyringService: "[redacted]",
        leaseToken: "[redacted]",
        nested: [{ password: "[redacted]" }]
      },
      userToken: "[redacted]"
    });
  });

  it("redacts plain lease-token strings before truncating them", () => {
    expect(safeDetail("leaseToken=secret")).toBe("leaseToken=[redacted]");
    expect(safeDetail("leaseToken=secret")).not.toContain("secret");
  });

  it("redacts plain password and cookie strings", () => {
    expect(safeDetail("password=super-secret; cookie=session-token")).toBe("password=[redacted]; cookie=[redacted]");
    expect(safeDetail("password=super-secret; cookie=session-token")).not.toContain("super-secret");
    expect(safeDetail("password=super-secret; cookie=session-token")).not.toContain("session-token");
  });

  it("redacts other plain secret-labeled strings", () => {
    expect(safeDetail("sessionToken=abc; loginToken=def; userToken=ghi; pageLockToken=jkl; authorization=Bearer token; keyring=service-key; secret=top-secret")).toBe("sessionToken=[redacted]; loginToken=[redacted]; userToken=[redacted]; pageLockToken=[redacted]; authorization=[redacted]; keyring=[redacted]; secret=[redacted]");
  });

  it("keeps ordinary plain text readable", () => {
    expect(safeDetail("plain verification note")).toBe("plain verification note");
  });

  it("redacts JSON string details before printing", () => {
    expect(safeDetail(JSON.stringify({
      holderDisplayName: "Priya Writer",
      leaseToken: "workspace-lease-token"
    }))).toBe(JSON.stringify({
      holderDisplayName: "Priya Writer",
      leaseToken: "[redacted]"
    }));
  });

  it("does not leak raw error objects", () => {
    expect(safeErrorMessage(new Error("leaseToken=workspace-lease-token"), "fallback")).toContain("message");
    expect(safeErrorMessage(new Error("leaseToken=workspace-lease-token"), "fallback")).not.toContain("workspace-lease-token");
  });

  it("redacts non-Error thrown strings", () => {
    expect(safeErrorMessage("cookie=session-token", "fallback")).toBe("cookie=[redacted]");
    expect(safeErrorMessage("cookie=session-token", "fallback")).not.toContain("session-token");
  });
});
