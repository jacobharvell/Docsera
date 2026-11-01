/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import axe from "axe-core";
import type { AxeResults, RunOptions } from "axe-core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  LauncherIntro,
  LauncherPaginationFooter,
  LauncherSearchToolbar,
  LauncherState,
  WorkspaceList
} from "../features/workspaces/MyWorkspacesScreenSections";
import { PublishedDocumentReader } from "../features/workspaces/PublishedDocumentReader";
import { createMultiItemAccordionDocseraDocumentEnvelope, createSupportedE2DocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import { createEnvelopeFromDocument, renderRuntime } from "../editor/PageEditorHostRuntime.testUtils";

const axeOptions: RunOptions = {
  // jsdom has no layout engine, so color contrast is not a meaningful automated result here.
  rules: {
    "color-contrast": { enabled: false }
  }
};

function reportResults(surface: string, result: AxeResults) {
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary
    }))
  }));
  const incomplete = result.incomplete.map((check) => ({ id: check.id, help: check.help }));

  // This is evidence, not an assertion that a scan is clean. New violations remain visible
  // in the dedicated audit command and must be classified in the repository audit note.
  console.info(`[RR-027 axe] ${surface}: ${JSON.stringify({ violations, incomplete })}`);
}

async function scan(surface: string) {
  const result = await axe.run(document.body, axeOptions);
  reportResults(surface, result);
  expect(result.testEngine.name).toBe("axe-core");
  return result;
}

function createReaderAuditEnvelope(): DocseraDocumentEnvelope {
  const supported = createSupportedE2DocseraDocumentEnvelope();
  const accordion = createMultiItemAccordionDocseraDocumentEnvelope();
  return {
    schemaVersion: supported.schemaVersion,
    document: {
      type: "doc",
      content: [...(supported.document.content ?? []), ...(accordion.document.content ?? [])]
    }
  };
}

describe("RR-027 automated accessibility audit", () => {
  it("scans populated My Workspaces search, navigation, list actions, and pagination", async () => {
    render(
      <main>
        <LauncherIntro canCreateWorkspaces onShowCreateModal={() => undefined} />
        <LauncherSearchToolbar searchText="api" onSearchTextChange={() => undefined} />
        <WorkspaceList
          items={[{
            sysId: "workspace-api",
            slug: "api-docs",
            name: "API Documentation",
            shortDescription: "Reference material for public APIs.",
            roleLabel: "Admin",
            status: "active",
            icon: { type: "builtin", key: "documentation", label: "Documentation" },
            layout: { tocVisible: true },
            canManageSettings: true,
            canManageWorkspaceMembers: true
          }]}
          onOpenWorkspace={() => undefined}
          onOpenWorkspaceSettings={() => undefined}
        />
        <LauncherPaginationFooter canGoNext canGoPrevious={false} onNextPage={() => undefined} onPreviousPage={() => undefined} summary="Showing 1–25 of 30" />
      </main>
    );

    await scan("my-workspaces-populated");
  });

  it("scans the My Workspaces empty state", async () => {
    render(
      <main>
        <LauncherIntro canCreateWorkspaces={false} onShowCreateModal={() => undefined} />
        <LauncherSearchToolbar searchText="unmatched workspace" onSearchTextChange={() => undefined} />
        <LauncherState eyebrow="No results" title="No workspaces found" copy="Try a different workspace name." />
      </main>
    );

    await scan("my-workspaces-empty");
  });

  it("scans a live reader document with headings, links, lists, tasks, and an accordion", async () => {
    render(<main><PublishedDocumentReader envelope={createReaderAuditEnvelope()} pageIdentity="rr-027-reader" /></main>);

    await scan("live-reader");
  });

  it("scans the mounted visual editor and its keyboard-opened Block Actions portal menu", async () => {
    const { container, editorReady, overlayRoot, unmount } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First block" }] },
          { type: "paragraph", content: [{ type: "text", text: "Second block" }] }
        ]
      })
    });
    const main = document.createElement("main");
    main.className = "docsera-main";
    main.setAttribute("aria-labelledby", "docsera-page-title");
    main.innerHTML = '<h1 id="docsera-page-title">Accessibility audit page</h1>';
    document.body.append(main);
    main.append(container, overlayRoot);

    try {
      await waitFor(() => expect(editorReady[0]).toBeDefined());

      await act(async () => {
        editorReady[0]?.commands.setTextSelection(1);
      });
      fireEvent.keyDown(editorReady[0]!.view.dom, { key: "ContextMenu" });
      await screen.findByRole("menu", { name: "Block actions for Text" });

      const result = await scan("visual-editor-block-actions-menu");
      expect(result.violations.map((violation) => violation.id)).not.toContain("aria-input-field-name");
      expect(result.violations.map((violation) => violation.id)).not.toContain("region");
    } finally {
      unmount();
      main.remove();
    }
  });
});
