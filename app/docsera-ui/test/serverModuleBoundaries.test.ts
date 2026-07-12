import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const serverRoots = [join(repoRoot, "src", "server"), join(repoRoot, "src", "server", "api")];
const forbiddenSharedImportPattern = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;
const sharedDocumentWrapperPath = join(repoRoot, "src", "shared", "editor", "document.ts");
const serverDocumentWrapperPath = join(repoRoot, "src", "server", "pages", "serverEditorDocument.ts");

function collectFiles(dir: string): string[] {
  const entries: string[] = [];
  for (const child of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, child.name);
    if (child.isDirectory()) {
      entries.push(...collectFiles(absolute));
      continue;
    }

    if (child.isFile() && /\.(?:ts|tsx)$/.test(child.name) && !/\.test\.(?:ts|tsx)$/.test(child.name)) {
      entries.push(absolute);
    }
  }

  return entries;
}

function isForbiddenSharedImport(specifier: string): boolean {
  return (
    specifier === "../shared" ||
    specifier === "../../shared" ||
    specifier.startsWith("../shared/") ||
    specifier.startsWith("../../shared/")
  );
}

function isAllowedSharedImport(file: string, specifier: string): boolean {
  return false;
}

describe("server module boundaries", () => {
  it("keeps server runtime imports out of shared helper paths", () => {
    const offenders: Array<{ file: string; specifier: string }> = [];

    for (const root of serverRoots) {
      for (const file of collectFiles(root)) {
        const sourceText = readFileSync(file, "utf8");
        for (const match of sourceText.matchAll(forbiddenSharedImportPattern)) {
          const specifier = (match[1] ?? match[2] ?? "").trim();
          if (specifier && isForbiddenSharedImport(specifier) && !isAllowedSharedImport(file, specifier)) {
            offenders.push({
              file: relative(repoRoot, file),
              specifier
            });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the authoritative document contract inside the deployable server module graph", () => {
    expect(existsSync(serverDocumentWrapperPath)).toBe(true);

    const serverWrapperSource = readFileSync(serverDocumentWrapperPath, "utf8");
    expect(serverWrapperSource).not.toContain("../editor/docseraDocumentContract.ts");

    const sharedWrapperSource = readFileSync(sharedDocumentWrapperPath, "utf8");
    expect(sharedWrapperSource).toContain("../../server/pages/serverEditorDocument");
  });
});
