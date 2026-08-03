import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = fileURLToPath(new URL("..", import.meta.url));
export const supportedSuiteNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const testSuites = [
  {
    name: "my-workspaces",
    description: "launcher; workspace list; search; filtering; pagination; workspace creation entry points.",
    files: [
      "src/client/features/workspaces/defaultWorkspaceIconAsset.test.ts",
      "src/client/features/workspaces/RecentWorkspacesMenu.test.tsx",
      "src/client/features/workspaces/WorkspacePrimitives.test.tsx",
      "test/App.test.tsx"
    ]
  },
  {
    name: "workspace-shell",
    description: "application shell; header; routing; breadcrumbs; sidebar state; responsive shell behavior.",
    files: [
      "src/client/app/App.workspaceShell.test.tsx",
      "src/client/features/workspaces/DocseraHeader.workspaceShell.test.tsx",
      "src/client/features/workspaces/DocseraHeaderIcons.test.tsx",
      "src/client/features/workspaces/WorkspaceMainPane.test.tsx",
      "src/client/features/workspaces/workspaceViewModels.shell.test.ts",
      "src/client/features/workspaces/workspaceRouting.test.ts"
    ]
  },
  {
    name: "nav-tree",
    description: "hierarchy rendering; page selection; expansion and collapse; drag and drop; movement; ordering; page-tree projection.",
    files: [
      "src/client/features/workspaces/PageTree.test.tsx",
      "src/client/features/workspaces/WorkspaceSidebar.test.tsx",
      "src/client/features/workspaces/pageTreeDropGeometry.test.ts",
      "src/client/features/workspaces/pageTreeDropResolver.test.ts",
      "src/shared/pages/siblingOrder.test.ts"
    ]
  },
  {
    name: "page-settings",
    description: "settings panel; title and slug editing; dismissal; validation; deletion entry points.",
    files: [
      "src/client/app/App.pageSettings.test.tsx",
      "src/server/pages/serviceNowPageSettings.test.ts",
      "src/server/pages/serverPageDomain.test.ts",
      "src/shared/pages/domain.test.ts",
      "test/pageDeleteRoute.test.ts"
    ]
  },
  {
    name: "page-model",
    description: "page creation; hierarchy; ordering; parent selection; page-tree persistence; slug allocation.",
    files: [
      "src/client/app/App.pageModel.test.tsx",
      "src/client/features/workspaces/workspaceViewModels.page-tree.test.ts",
      "src/server/pages/serviceNowPageCreation.page-model.test.ts"
    ]
  },
  {
    name: "editor-contract",
    description: "canonical documents; schema validation; canonicalization; paste sanitization; document fixtures; document round trips.",
    files: [
      "src/client/editor/PageEditorHostRuntime.core.test.tsx",
      "src/shared/editor/document.test.ts",
      "src/shared/editor/schema.test.ts",
      "test/editorDocumentContractParity.test.ts"
    ]
  },
  {
    name: "editor-interactions",
    description: "editor host; editor commands; toolbar behavior; selection; autosave; editor session lifecycle; editor focus; editor overlays.",
    files: [
      "src/client/app/App.editorInteractions.test.tsx",
      "src/client/app/App.editorHostBoundary.test.tsx",
      "src/client/editor/PageEditorHost.test.tsx",
      "src/client/editor/PageEditorHostRuntime.initialization.test.tsx",
      "src/client/editor/PageEditorHostRuntime.commands.test.tsx",
      "src/client/editor/session/editorSessionGeneration.test.ts",
      "src/client/editor/shadowRootContract.test.tsx",
      "src/client/editor/spikes/EditorRuntimeSpikeOutlet.test.tsx",
      "src/client/editor/tiptapRuntimeCompatibility.test.tsx",
      "src/client/features/workspaces/PageBodyEditor.test.tsx"
    ]
  },
  {
    name: "reader-toc",
    description: "lightweight reader; document outline; Table of Contents; anchors; reader rendering.",
    files: [
      "src/client/app/App.readerToc.test.tsx",
      "src/client/editor/documentOutline.test.ts",
      "src/client/features/workspaces/PublishedDocumentReader.test.tsx",
      "src/client/features/workspaces/WorkspaceToc.test.tsx",
      "src/client/features/workspaces/workspaceViewModels.reader-toc.test.ts"
    ]
  },
  {
    name: "publishing-changes",
    description: "Changes Center; Publish; Discard All; individual Undo; pending-change presentation.",
    files: [
      "src/client/app/App.publishingChanges.test.tsx",
      "src/client/features/workspaces/DocseraHeader.test.tsx",
      "src/server/api/docsera-runtime-page-publish.test.ts",
      "src/server/pages/serviceNowPagePublishing.test.ts"
    ]
  },
  {
    name: "workspace-state",
    description: "Live and Edit projections; edit leases; mutation queues; persistence adapters; server-issued generations; server-authoritative workflow state.",
    files: [
      "src/client/app/App.test.tsx",
      "src/client/app/authoringRecovery.test.ts",
      "src/client/app/workspaceLeaseCoordination.test.ts",
      "src/client/app/workspaceLeaseRecovery.test.ts",
      "src/client/app/workspaceMutationQueue.test.ts",
      "src/client/features/workspaces/workspaceViewModels.invalid-projection.test.ts",
      "src/client/platform/servicenow/client.test.ts",
      "src/fluent/scheduled-scripts/docsera-page-edit-lock-cleanup.test.ts",
      "src/fluent/tables/docsera-page-schema.test.ts",
      "src/fluent/tables/docsera-workspace-change-set-schema.test.ts",
      "src/server/api/docsera-runtime-mutation-routes.test.ts",
      "src/server/pages/serviceNowPageDraftPersistence.test.ts",
      "src/server/pages/serviceNowPageListing.test.ts",
      "src/server/pages/serviceNowPagePersistenceAndQueries.test.ts",
      "src/server/pages/serviceNowPageQueries.test.ts",
      "src/server/pages/serviceNowPageRecords.test.ts",
      "src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.test.ts",
      "src/server/workspaces/workspaceChangeSetDomain.test.ts",
      "test/servicenowClient.test.ts"
    ]
  },
  {
    name: "access-security",
    description: "roles; permissions; authorization boundaries; access loss; role-sensitive behavior.",
    files: [
      "src/fluent/tables/docsera-page-edit-lock-schema.test.ts",
      "src/server/api/docsera-runtime-workspace-edit-lease.test.ts",
      "src/server/page-locks/pageEditLockService.test.ts",
      "src/server/pages/serviceNowPageCreation.access-security.test.ts",
      "src/server/workspace-leases/workspaceEditLeaseService.test.ts",
      "test/workspaceDomain.test.ts"
    ]
  },
  {
    name: "shared-runtime",
    description: "shared UI primitives; icons; stylesheet contracts; runtime and build boundaries; infrastructure tests not owned by one feature area.",
    files: [
      "scripts/reset-editor-smoke-data.test.mjs",
      "scripts/run-managed-vitest-suites.test.mjs",
      "scripts/test-suite-manifest.test.mjs",
      "scripts/validation-process.test.ts",
      "scripts/verification-output-safety.test.mjs",
      "scripts/verify-standalone-layout.test.mjs",
      "scripts/workspace-verifier-runtime-sequence.test.mjs",
      "src/client/bootstrap.test.tsx",
      "src/client/diagnostics.test.ts",
      "src/client/main.test.ts",
      "src/client/runtimeLaunch.test.ts",
      "src/client/shared/icons/DocseraIcon.test.tsx",
      "test/runtimeApiErrors.test.ts",
      "test/runtimeStylesheet.test.ts",
      "test/serverModuleBoundaries.test.ts"
    ]
  }
];

function isVitestFile(fileName) {
  return /\.(?:test|spec)\.[^.]+$/i.test(fileName);
}

export function isSupportedSuiteName(name) {
  return typeof name === "string" && supportedSuiteNamePattern.test(name);
}

function toRelativePath(filePath) {
  return relative(packageRoot, resolve(filePath)).split(sep).join("/");
}

export function discoverVitestFiles(rootDir = packageRoot) {
  const discovered = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
          continue;
        }

        walk(join(currentDir, entry.name));
        continue;
      }

      if (entry.isFile() && isVitestFile(entry.name)) {
        discovered.push(toRelativePath(join(currentDir, entry.name)));
      }
    }
  }

  walk(rootDir);
  discovered.sort();
  return discovered;
}

export function validateSuiteManifest({
  discoveredFiles = discoverVitestFiles(),
  rootDir = packageRoot,
  suites = testSuites
} = {}) {
  const errors = [];
  const discoveredSet = new Set(discoveredFiles);
  const assignedFiles = new Map();
  const suiteSummaries = [];
  const suiteNames = new Set();

  for (const suite of suites) {
    if (!suite || typeof suite !== "object" || Array.isArray(suite)) {
      errors.push("Malformed suite entry: expected an object.");
      continue;
    }

    const { name, description, files } = suite;
    if (typeof name !== "string" || !name.trim()) {
      errors.push("Malformed suite entry: missing suite name.");
      continue;
    }

    if (suiteNames.has(name)) {
      errors.push(`Duplicate suite name: ${name}`);
    } else {
      suiteNames.add(name);
    }

    if (!isSupportedSuiteName(name)) {
      errors.push(`Unsupported suite name: ${name}. Suite names must use lowercase kebab-case.`);
    }

    if (typeof description !== "string" || !description.trim()) {
      errors.push(`Suite ${name} is missing a description.`);
    }

    if (!Array.isArray(files)) {
      errors.push(`Suite ${name} has a malformed files list.`);
      continue;
    }

    if (files.length === 0) {
      errors.push(`Suite ${name} is empty.`);
      continue;
    }

    const localSeen = new Set();
    let validCount = 0;

    for (const rawFile of files) {
      if (typeof rawFile !== "string" || !rawFile.trim()) {
        errors.push(`Suite ${name} contains a malformed file entry.`);
        continue;
      }

      const normalized = rawFile.replaceAll("\\", "/");
      if (localSeen.has(normalized)) {
        errors.push(`Suite ${name} contains a duplicate file entry: ${normalized}`);
        continue;
      }
      localSeen.add(normalized);

      const absolutePath = resolve(rootDir, normalized);
      if (!statSync(absolutePath, { throwIfNoEntry: false })) {
        errors.push(`Suite ${name} references a missing file: ${normalized}`);
        continue;
      }

      if (!discoveredSet.has(normalized)) {
        errors.push(`Suite ${name} references a non-Vitest file: ${normalized}`);
        continue;
      }

      const existingSuite = assignedFiles.get(normalized);
      if (existingSuite) {
        errors.push(`Test file ${normalized} is assigned to multiple suites: ${existingSuite} and ${name}`);
        continue;
      }

      assignedFiles.set(normalized, name);
      validCount += 1;
    }

    suiteSummaries.push({
      description: description ?? "",
      fileCount: validCount,
      name
    });
  }

  for (const file of discoveredFiles) {
    if (!assignedFiles.has(file)) {
      errors.push(`Discovered Vitest file is not assigned to a suite: ${file}`);
    }
  }

  if (assignedFiles.size !== discoveredFiles.length) {
    errors.push(`Manifest assigned ${assignedFiles.size} test files but discovered ${discoveredFiles.length}.`);
  }

  return {
    assignedFileCount: assignedFiles.size,
    discoveredFileCount: discoveredFiles.length,
    discoveredFiles,
    errors,
    ok: errors.length === 0,
    suiteSummaries
  };
}

function createSuiteByNameMap(suites) {
  return new Map(suites.map((suite) => [suite.name, suite]));
}

export function resolveSuiteSelection(requestedNames, suites = testSuites) {
  const suiteByName = createSuiteByNameMap(suites);

  if (!Array.isArray(requestedNames) || requestedNames.length === 0) {
    throw new Error(`No suite names were provided. Available suites: ${suites.map((suite) => suite.name).join(", ")}`);
  }

  const uniqueNames = [];
  const seenNames = new Set();

  for (const rawName of requestedNames) {
    const name = String(rawName ?? "").trim();
    if (!name) {
      continue;
    }

    if (!suiteByName.has(name)) {
      throw new Error(`Unknown suite: ${name}. Available suites: ${suites.map((suite) => suite.name).join(", ")}`);
    }

    if (!seenNames.has(name)) {
      uniqueNames.push(name);
      seenNames.add(name);
    }
  }

  if (uniqueNames.length === 0) {
    throw new Error(`No suite names were provided. Available suites: ${suites.map((suite) => suite.name).join(", ")}`);
  }

  const files = [];
  const seenFiles = new Set();

  for (const name of uniqueNames) {
    const suite = suiteByName.get(name);
    if (!suite) {
      throw new Error(`Unknown suite: ${name}. Available suites: ${suites.map((suite) => suite.name).join(", ")}`);
    }

    for (const rawFile of suite.files) {
      const normalized = rawFile.replaceAll("\\", "/");
      if (seenFiles.has(normalized)) {
        continue;
      }

      seenFiles.add(normalized);
      files.push(normalized);
    }
  }

  return {
    files,
    suites: uniqueNames.map((name) => suiteByName.get(name))
  };
}
