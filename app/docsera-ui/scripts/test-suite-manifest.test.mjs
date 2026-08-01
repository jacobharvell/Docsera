/* @vitest-environment node */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  isSupportedSuiteName,
  supportedSuiteNamePattern,
  testSuites,
  validateSuiteManifest
} from "./test-suite-manifest.mjs";

async function createTempRoot(prefix) {
  const root = await fsMkdtemp(prefix);
  return root;
}

async function fsMkdtemp(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeRelativeFiles(rootDir, files) {
  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "", "utf8");
  }
}

async function removeDir(dir) {
  await rm(dir, { force: true, recursive: true });
}

describe("test suite manifest", () => {
  it("accepts a complete manifest with a stable supported naming contract", async () => {
    const rootDir = await createTempRoot("docsera-manifest-valid-");
    const discoveredFiles = [...new Set(testSuites.flatMap((suite) => suite.files))];
    await writeRelativeFiles(rootDir, discoveredFiles);

    const result = validateSuiteManifest({
      discoveredFiles,
      rootDir,
      suites: testSuites
    });

    expect(result.ok).toBe(true);
    expect(result.discoveredFileCount).toBe(discoveredFiles.length);
    expect(result.assignedFileCount).toBe(discoveredFiles.length);
    expect(result.errors).toEqual([]);
    expect(isSupportedSuiteName("page-model")).toBe(true);
    expect(isSupportedSuiteName("page model")).toBe(false);
    expect(isSupportedSuiteName("page/model")).toBe(false);
    expect(isSupportedSuiteName("--page-model")).toBe(false);
    expect(isSupportedSuiteName("Page Model")).toBe(false);
    expect(supportedSuiteNamePattern.test("shared-runtime")).toBe(true);
    await removeDir(rootDir);
  });

  it("rejects discovered files that are not assigned to a primary suite", async () => {
    const rootDir = await createTempRoot("docsera-manifest-unassigned-");
    await writeRelativeFiles(rootDir, ["src/client/app/App.test.tsx", "test/unassigned.test.ts"]);

    const result = validateSuiteManifest({
      discoveredFiles: ["src/client/app/App.test.tsx", "test/unassigned.test.ts"],
      rootDir,
      suites: [
        {
          name: "workspace-shell",
          description: "shell",
          files: ["src/client/app/App.test.tsx"]
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Discovered Vitest file is not assigned to a suite: test/unassigned.test.ts");
    await removeDir(rootDir);
  });

  it("rejects files assigned to multiple suites", async () => {
    const rootDir = await createTempRoot("docsera-manifest-multi-assign-");
    await writeRelativeFiles(rootDir, ["src/client/app/App.test.tsx"]);

    const result = validateSuiteManifest({
      discoveredFiles: ["src/client/app/App.test.tsx"],
      rootDir,
      suites: [
        {
          name: "workspace-shell",
          description: "shell",
          files: ["src/client/app/App.test.tsx"]
        },
        {
          name: "reader-toc",
          description: "reader",
          files: ["src/client/app/App.test.tsx"]
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Test file src/client/app/App.test.tsx is assigned to multiple suites: workspace-shell and reader-toc"
    );
    await removeDir(rootDir);
  });

  it("rejects suite files that are missing from disk", async () => {
    const rootDir = await createTempRoot("docsera-manifest-missing-");

    const result = validateSuiteManifest({
      discoveredFiles: [],
      rootDir,
      suites: [
        {
          name: "workspace-shell",
          description: "shell",
          files: ["src/client/app/Missing.test.tsx"]
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Suite workspace-shell references a missing file: src/client/app/Missing.test.tsx");
    await removeDir(rootDir);
  });

  it("rejects empty suites, malformed suite entries, malformed file entries, duplicate files, duplicate suite names, and unsupported names", async () => {
    const rootDir = await createTempRoot("docsera-manifest-invalid-");
    await writeRelativeFiles(rootDir, ["src/client/app/App.test.tsx", "src/client/app/Other.test.tsx"]);

    const result = validateSuiteManifest({
      discoveredFiles: ["src/client/app/App.test.tsx", "src/client/app/Other.test.tsx"],
      rootDir,
      suites: [
        null,
        {
          name: "workspace-shell",
          description: "shell",
          files: []
        },
        {
          name: "Workspace Shell",
          description: "bad name",
          files: ["src/client/app/App.test.tsx", "src/client/app/App.test.tsx", null]
        },
        {
          name: "Workspace Shell",
          description: "duplicate name",
          files: ["src/client/app/Other.test.tsx"]
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Malformed suite entry: expected an object.");
    expect(result.errors).toContain("Suite workspace-shell is empty.");
    expect(result.errors).toContain("Unsupported suite name: Workspace Shell. Suite names must use lowercase kebab-case.");
    expect(result.errors).toContain("Suite Workspace Shell contains a duplicate file entry: src/client/app/App.test.tsx");
    expect(result.errors).toContain("Suite Workspace Shell contains a malformed file entry.");
    expect(result.errors).toContain("Duplicate suite name: Workspace Shell");
    await removeDir(rootDir);
  });
});
