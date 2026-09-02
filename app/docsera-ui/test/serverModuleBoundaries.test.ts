import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoots = [join(packageRoot, "src", "server"), join(packageRoot, "src", "server", "api")];
const forbiddenSharedImportPattern = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;
const sharedDocumentWrapperPath = join(packageRoot, "src", "shared", "editor", "document.ts");
const serverDocumentWrapperPath = join(packageRoot, "src", "server", "pages", "serverEditorDocument.ts");
const sharedWorkspaceIconCatalogWrapperPath = join(packageRoot, "src", "shared", "workspaces", "workspaceIconCatalog.ts");
const serverWorkspaceIconCatalogPath = join(packageRoot, "src", "server", "workspaces", "serverWorkspaceIconCatalog.ts");
const serverWorkspaceDomainPath = join(packageRoot, "src", "server", "workspaces", "serverWorkspaceDomain.ts");
const explicitSourceExtensionPattern = /\.(?:ts|tsx)$/;

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

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
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
              file: relative(packageRoot, file),
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

  it("keeps the authoritative workspace icon catalog inside the deployable server module graph", () => {
    expect(existsSync(serverWorkspaceIconCatalogPath)).toBe(true);

    const serverWorkspaceDomainSource = readFileSync(serverWorkspaceDomainPath, "utf8");
    expect(serverWorkspaceDomainSource).toContain("./serverWorkspaceIconCatalog.ts");
    expect(serverWorkspaceDomainSource).not.toContain("../../shared/workspaces/workspaceIconCatalog");

    const sharedWrapperSource = readFileSync(sharedWorkspaceIconCatalogWrapperPath, "utf8");
    expect(sharedWrapperSource).toContain("../../server/workspaces/serverWorkspaceIconCatalog");
  });

  it("keeps server runtime imports on explicit source-file specifiers", () => {
    const offenders: Array<{ file: string; specifier: string }> = [];

    for (const root of serverRoots) {
      for (const file of collectFiles(root)) {
        const sourceText = readFileSync(file, "utf8");
        for (const match of sourceText.matchAll(forbiddenSharedImportPattern)) {
          const specifier = (match[1] ?? match[2] ?? "").trim();
          if (!specifier || !isRelativeImport(specifier)) {
            continue;
          }

          if (!explicitSourceExtensionPattern.test(specifier)) {
            offenders.push({
              file: relative(packageRoot, file),
              specifier
            });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps page publish and discard paths free of media deletion behavior", () => {
    const guardedFiles = [
      join(packageRoot, "src", "server", "api", "docsera-runtime-page-delete.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-page-delete-action.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-page-publish.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-workspace-discard-all.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-workspace-discard-page.ts")
    ];

    const offenders = guardedFiles.filter((file) => {
      const sourceText = readFileSync(file, "utf8");
      return sourceText.includes("deleteAttachment") || sourceText.includes("workspace-media");
    });

    expect(offenders).toEqual([]);
  });
});
