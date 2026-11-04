import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { instanceUrlsMatch, parseRuntimeVerificationOptions } from "./sdk-runtime-verification-options.mjs";

describe("SDK runtime verification mode", () => {
  it("skips browser proof by default and enables it only with an explicit opt-in", () => {
    expect(parseRuntimeVerificationOptions([]).browserProofEnabled).toBe(false);
    expect(parseRuntimeVerificationOptions(["--browser"]).browserProofEnabled).toBe(true);
  });

  it("preserves --skip-browser compatibility and lets it override --browser", () => {
    expect(parseRuntimeVerificationOptions(["--skip-browser"]).browserProofEnabled).toBe(false);
    expect(parseRuntimeVerificationOptions(["--browser", "--skip-browser"]).browserProofEnabled).toBe(false);
  });

  it("treats a root instance URL's optional trailing slash as equivalent", () => {
    expect(instanceUrlsMatch("https://dev468303.service-now.com/", "https://dev468303.service-now.com")).toBe(true);
    expect(instanceUrlsMatch("https://dev468303.service-now.com", "https://dev468303.service-now.com/")).toBe(true);
  });

  it("rejects a genuinely different instance URL", () => {
    expect(instanceUrlsMatch("https://dev468303.service-now.com/", "https://other.service-now.com/")).toBe(false);
    expect(instanceUrlsMatch("https://dev468303.service-now.com/other", "https://dev468303.service-now.com/")).toBe(false);
  });

  it("runs deployment verification directly instead of relying on nested npm argument propagation", () => {
    const appPackage = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const rootPackage = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "package.json"), "utf8"));

    expect(appPackage.scripts["deploy:sdk"]).toContain("node ./scripts/verify-sdk-runtime.mjs");
    expect(appPackage.scripts["deploy:sdk"]).not.toContain("npm run verify:sdk-runtime");
    expect(appPackage.scripts["deploy:sdk"]).toContain("--canonical-development --auth-alias docsera-dev468303");
    expect(appPackage.scripts["deploy:sdk"]).toContain("now-sdk install --auth docsera-dev468303");
    expect(rootPackage.scripts["deploy:sdk-ui-page"]).toBe("npm --prefix app/docsera-ui run deploy:sdk");
  });

  it("uses the installed development identity as its runtime-verification default", () => {
    const runtimeVerifier = readFileSync(join(process.cwd(), "scripts", "verify-sdk-runtime.mjs"), "utf8");
    expect(runtimeVerifier).toContain('authAlias: "docsera-dev468303"');
    expect(runtimeVerifier).toContain('instanceUrl: "https://dev468303.service-now.com"');
    expect(runtimeVerifier).toContain('pageEndpoint: "x_2300756_docsera_docsera_sdk_runtime.do"');
    expect(runtimeVerifier).toContain('pingPath: "/api/x_2300756_docsera/docsera_runtime/ping"');
  });
});
