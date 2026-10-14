import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRuntimeVerificationOptions } from "./sdk-runtime-verification-options.mjs";

describe("SDK runtime verification mode", () => {
  it("skips browser proof by default and enables it only with an explicit opt-in", () => {
    expect(parseRuntimeVerificationOptions([]).browserProofEnabled).toBe(false);
    expect(parseRuntimeVerificationOptions(["--browser"]).browserProofEnabled).toBe(true);
  });

  it("preserves --skip-browser compatibility and lets it override --browser", () => {
    expect(parseRuntimeVerificationOptions(["--skip-browser"]).browserProofEnabled).toBe(false);
    expect(parseRuntimeVerificationOptions(["--browser", "--skip-browser"]).browserProofEnabled).toBe(false);
  });

  it("runs deployment verification directly instead of relying on nested npm argument propagation", () => {
    const appPackage = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const rootPackage = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "package.json"), "utf8"));

    expect(appPackage.scripts["deploy:sdk"]).toContain("node ./scripts/verify-sdk-runtime.mjs");
    expect(appPackage.scripts["deploy:sdk"]).not.toContain("npm run verify:sdk-runtime");
    expect(rootPackage.scripts["deploy:sdk-ui-page"]).toBe("npm --prefix app/docsera-ui run deploy:sdk");
  });
});
