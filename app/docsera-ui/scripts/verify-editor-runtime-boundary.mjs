#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const staticRoot = path.join(appRoot, "dist", "static");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function printCheck(ok, label, detail = "") {
  console.log(`${ok ? "[pass]" : "[fail]"} ${label}`);
  if (detail) {
    console.log(`       ${detail}`);
  }
}

function getSourceEntry(map, suffix) {
  const index = map.sources.findIndex((source) => source.endsWith(suffix));
  if (index === -1) {
    return null;
  }

  return {
    content: map.sourcesContent?.[index] ?? "",
    source: map.sources[index]
  };
}

function getSourceOwners(suffix) {
  return chunkMaps.flatMap((chunk) => {
    const index = chunk.map.sources.findIndex((source) => source.endsWith(suffix));
    if (index === -1) {
      return [];
    }

    return [
      {
        chunk: chunk.chunk,
        content: chunk.map.sourcesContent?.[index] ?? "",
        source: chunk.map.sources[index]
      }
    ];
  });
}

const mainChunkPath = path.join(staticRoot, "main.jsdbx");
const mainMapPath = path.join(staticRoot, "main.jsdbx.map");
const runtimeChunkPath = path.join(staticRoot, "PageEditorHostRuntime.jsdbx");
const runtimeMapPath = path.join(staticRoot, "PageEditorHostRuntime.jsdbx.map");
const chunkMaps = fs
  .readdirSync(staticRoot)
  .filter((file) => file.endsWith(".jsdbx.map"))
  .map((mapFile) => {
    const chunkFile = mapFile.slice(0, -4);
    return {
      chunk: chunkFile,
      map: readJson(path.join(staticRoot, mapFile))
    };
  });

const mainChunk = readText(mainChunkPath);
const runtimeChunk = readText(runtimeChunkPath);
const mainMap = readJson(mainMapPath);
const runtimeMap = readJson(runtimeMapPath);

const hostSourceSuffix = "src/client/editor/PageEditorHost.tsx";
const runtimeSourceSuffix = "src/client/editor/PageEditorHostRuntime.tsx";
const markdownSourceSessionSuffix = "src/client/editor/MarkdownSourceSession.ts";
const readerSourceSuffix = "src/client/features/workspaces/PublishedDocumentReader.tsx";
const workspaceMainPaneSourceSuffix = "src/client/features/workspaces/WorkspaceMainPane.tsx";
const workspaceMarkdownSourcePanelSuffix = "src/client/features/workspaces/WorkspaceMarkdownSourcePanel.tsx";

const hostSourceInMain = getSourceEntry(mainMap, hostSourceSuffix);
const hostSourceInRuntime = getSourceEntry(runtimeMap, hostSourceSuffix);
const runtimeSourceInMain = getSourceEntry(mainMap, runtimeSourceSuffix);
const runtimeSourceInRuntime = getSourceEntry(runtimeMap, runtimeSourceSuffix);
const markdownSourceSessionInMain = getSourceEntry(mainMap, markdownSourceSessionSuffix);
const readerSourceInMain = getSourceEntry(mainMap, readerSourceSuffix);
const workspaceMainPaneSourceInMain = getSourceEntry(mainMap, workspaceMainPaneSourceSuffix);
const workspaceMarkdownSourcePanelInMain = getSourceEntry(mainMap, workspaceMarkdownSourcePanelSuffix);
const workspaceMarkdownSourcePanelOwners = getSourceOwners(workspaceMarkdownSourcePanelSuffix);
const markdownSourceSessionOwners = getSourceOwners(markdownSourceSessionSuffix);

const readerBoundaryNeedles = [
  "TipTap",
  "ProseMirror",
  "@tiptap",
  "PageEditorHostRuntime",
  "createRoot(",
  "EditorContent",
  "useEditor(",
  "mountPageEditorHostRuntime",
  "@codemirror",
  "MarkdownSourceSession"
];

const checks = [
  {
    detail: hostSourceInMain?.source ?? "",
    label: "PageEditorHost source is owned by main.jsdbx",
    ok: Boolean(hostSourceInMain)
  },
  {
    label: "PageEditorHost source is not emitted into PageEditorHostRuntime.jsdbx",
    ok: hostSourceInRuntime === null
  },
  {
    detail: runtimeSourceInRuntime?.source ?? "",
    label: "PageEditorHostRuntime source is owned by PageEditorHostRuntime.jsdbx",
    ok: Boolean(runtimeSourceInRuntime)
  },
  {
    label: "PageEditorHostRuntime source is not emitted into main.jsdbx",
    ok: runtimeSourceInMain === null
  },
  {
    label: "MarkdownSourceSession source is not emitted into main.jsdbx",
    ok: markdownSourceSessionInMain === null
  },
  {
    label: "PageEditorHost source no longer creates the child React root",
    ok:
      Boolean(hostSourceInMain) &&
      !hostSourceInMain.content.includes("createRoot(") &&
      hostSourceInMain.content.includes("runtimeModule.mountPageEditorHostRuntime(")
  },
  {
    label: "PageEditorHost source no longer renders the lazy component through the parent renderer",
    ok:
      Boolean(hostSourceInMain) &&
      !hostSourceInMain.content.includes("<runtimeModule.PageEditorHostRuntime") &&
      !hostSourceInMain.content.includes("entry.reactRoot.render(")
  },
  {
    label: "PageEditorHostRuntime source owns child root creation and lifecycle",
    ok:
      Boolean(runtimeSourceInRuntime) &&
      runtimeSourceInRuntime.content.includes('import { createRoot, type Root } from "react-dom/client";') &&
      runtimeSourceInRuntime.content.includes("function renderRuntimeRoot(") &&
      runtimeSourceInRuntime.content.includes("function mountPageEditorHostRuntime(") &&
      runtimeSourceInRuntime.content.includes("reactRoot.unmount()")
  },
  {
    label: "PageEditorHostRuntime.jsdbx exports the imperative runtime API",
    ok: runtimeChunk.includes("mountPageEditorHostRuntime")
  },
  {
    label: "main.jsdbx keeps the editor runtime boundary import path",
    ok: mainChunk.includes('import("./PageEditorHostRuntime.jsdbx")')
  },
  {
    label: "main.jsdbx stays free of CodeMirror authoring runtime code",
    ok: !mainChunk.includes("@codemirror")
  },
  {
    detail: workspaceMarkdownSourcePanelInMain?.source ?? "",
    label: "WorkspaceMarkdownSourcePanel source is owned by main.jsdbx",
    ok: Boolean(workspaceMarkdownSourcePanelInMain) && workspaceMarkdownSourcePanelOwners.length === 1 && workspaceMarkdownSourcePanelOwners[0]?.chunk === "main.jsdbx"
  },
  {
    label: "WorkspaceMarkdownSourcePanel source is not emitted into a lazy chunk",
    ok: workspaceMarkdownSourcePanelOwners.every((owner) => owner.chunk === "main.jsdbx")
  },
  {
    label: "WorkspaceMarkdownSourcePanel is no longer lazy-loaded from the main pane",
    ok: !mainChunk.includes('import("./WorkspaceMarkdownSourcePanel")')
  },
  {
    label: "MarkdownSourceSession source is not emitted into main.jsdbx",
    ok: markdownSourceSessionInMain === null && markdownSourceSessionOwners.every((owner) => owner.chunk !== "main.jsdbx")
  },
  {
    label: "MarkdownSourceSession source is emitted from a lazy chunk",
    ok: markdownSourceSessionOwners.length > 0 && markdownSourceSessionOwners.some((owner) => owner.chunk !== "main.jsdbx")
  },
  {
    detail: readerSourceInMain?.source ?? "",
    label: "PublishedDocumentReader source is owned by main.jsdbx",
    ok: Boolean(readerSourceInMain)
  },
  {
    label: "PublishedDocumentReader source stays TipTap/ProseMirror-free",
    ok: Boolean(readerSourceInMain) && readerBoundaryNeedles.every((needle) => !readerSourceInMain.content.includes(needle))
  },
  {
    label: "WorkspaceMainPane source uses the published reader component in Live mode",
    ok:
      Boolean(workspaceMainPaneSourceInMain) &&
      workspaceMainPaneSourceInMain.content.includes("PublishedDocumentReader") &&
      !workspaceMainPaneSourceInMain.content.includes(
        "The selected page is using the published reader representation."
      )
  }
];

for (const check of checks) {
  printCheck(check.ok, check.label, check.detail);
}

const passed = checks.every((check) => check.ok);
console.log("");
console.log(`Result: ${passed ? "pass" : "fail"}`);

if (!passed) {
  process.exitCode = 1;
}
