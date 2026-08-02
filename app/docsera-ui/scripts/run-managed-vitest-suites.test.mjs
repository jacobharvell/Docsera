/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { parseManagedVitestSuiteArgs } from "./run-managed-vitest-suites.args.mjs";
import { resolveSuiteSelection } from "./test-suite-manifest.mjs";

const suites = [
  {
    name: "workspace-shell",
    description: "shell",
    files: ["src/client/app/App.test.tsx", "src/client/features/workspaces/DocseraHeader.test.tsx"]
  },
  {
    name: "reader-toc",
    description: "reader",
    files: ["src/client/features/workspaces/WorkspaceToc.test.tsx", "src/client/app/App.test.tsx"]
  },
  {
    name: "page-model",
    description: "page model",
    files: ["src/server/pages/serverPageDomain.test.ts", "src/server/pages/serviceNowPageCreation.page-model.test.ts"]
  }
];

describe("managed vitest suite selection", () => {
  it("parses one suite and multiple suites", () => {
    expect(parseManagedVitestSuiteArgs(["workspace-shell"])).toEqual({
      forwarded: [],
      help: false,
      stateDir: undefined,
      suites: ["workspace-shell"],
      workers: undefined
    });

    expect(parseManagedVitestSuiteArgs(["workspace-shell", "reader-toc"])).toEqual({
      forwarded: [],
      help: false,
      stateDir: undefined,
      suites: ["workspace-shell", "reader-toc"],
      workers: undefined
    });
  });

  it("parses runner options, deduplicates suite names, and preserves forwarded vitest args after the boundary", () => {
    expect(
      parseManagedVitestSuiteArgs([
        "--state-dir",
        "C:/temp/state",
        "--workers=4",
        "workspace-shell",
        "workspace-shell",
        "reader-toc",
        "--",
        "--reporter",
        "dot",
        "--maxWorkers",
        "1"
      ])
    ).toEqual({
      forwarded: ["--reporter", "dot", "--maxWorkers", "1"],
      help: false,
      stateDir: "C:/temp/state",
      suites: ["workspace-shell", "workspace-shell", "reader-toc"],
      workers: "4"
    });
  });

  it("deduplicates selected file lists across suites and rejects unknown or missing selections", () => {
    expect(resolveSuiteSelection(["workspace-shell", "reader-toc"], suites).files).toEqual([
      "src/client/app/App.test.tsx",
      "src/client/features/workspaces/DocseraHeader.test.tsx",
      "src/client/features/workspaces/WorkspaceToc.test.tsx"
    ]);

    expect(resolveSuiteSelection(["workspace-shell", "workspace-shell"], suites).suites.map((suite) => suite?.name)).toEqual([
      "workspace-shell"
    ]);

    expect(() => resolveSuiteSelection([], suites)).toThrow("No suite names were provided.");
    expect(() => resolveSuiteSelection(["unknown"], suites)).toThrow("Unknown suite: unknown.");
  });
});
