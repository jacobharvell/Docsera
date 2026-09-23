import { describe, expect, it, vi } from "vitest";
import { process } from "./docsera-runtime-ping";

vi.mock("@servicenow/glide", () => ({
  GlideDateTime: class {
    getDisplayValue() {
      return "2026-09-07 10:15:00";
    }
  },
  gs: {
    getUserDisplayName: () => "Priya Writer",
    getUserID: () => "6816f79cc0a8016401c5a33be04be441",
    getUserName: () => "pwriter"
  }
}));

describe("docsera runtime ping", () => {
  it("returns the authenticated ServiceNow user display name with the existing username and sys_id contract", () => {
    const setBody = vi.fn();

    process({}, { setBody });

    expect(setBody).toHaveBeenCalledWith({
      result: {
        authenticated: true,
        scope: "x_82900_docsera",
        status: "ok",
        timestamp: "2026-09-07 10:15:00",
        userDisplayName: "Priya Writer",
        userName: "pwriter",
        userSysId: "6816f79cc0a8016401c5a33be04be441"
      }
    });
  });

  it("does not call scoped-unsafe GlideUser avatar APIs", () => {
    const setBody = vi.fn();

    process({}, { setBody });

    expect(setBody).toHaveBeenCalledOnce();
  });
});
