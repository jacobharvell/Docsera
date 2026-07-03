import type { DemoPage, DemoWorkspace } from "../../shared/types/docsera";

export const demoWorkspace: DemoWorkspace = {
  id: "workspace-api-guides",
  title: "API Guides",
  subtitle: "Docsera workspace shell baseline",
  summary:
    "Demo workspace content keeps the SDK-native runtime visible while future ServiceNow adapters remain behind a narrow boundary.",
  status: "Demo-backed and adapter-ready",
  routeLabel: "SDK-native Direct UI Page",
  defaultPageId: "workspace-overview",
  pages: [
    {
      id: "workspace-overview",
      title: "Workspace overview",
      slug: "overview",
      summary: "What the first screen shows and why the shell exists.",
      body:
        "Docsera now opens into a real workspace shell: branded header, left navigation, selected page content, and a secondary runtime probe. The page is backed by explicit demo data so the visual structure is stable before live persistence lands.",
      sections: [
        {
          id: "workspace-identity",
          title: "Workspace identity",
          body:
            "The header and sidebar identify the current workspace before any page content becomes the focus."
        },
        {
          id: "workspace-navigation",
          title: "Navigation",
          body:
            "The page tree stays readable and selectable without introducing CRUD or drag-and-drop behavior."
        },
        {
          id: "workspace-content",
          title: "Main content",
          body:
            "The central column renders the selected page title, summary, and supporting body content."
        }
      ]
    },
    {
      id: "reader-shell",
      title: "Reader shell",
      slug: "reader-shell",
      summary: "The stable three-column workspace layout and its responsibilities.",
      body:
        "The left rail owns navigation, the center column owns the selected page, and the right rail holds table-of-contents and runtime probe details. That keeps the product surface clear while the runtime stays demo-backed.",
      sections: [
        {
          id: "left-rail",
          title: "Left rail",
          body:
            "The sidebar is the entry point for page selection and workspace orientation."
        },
        {
          id: "center-column",
          title: "Center column",
          body:
            "The primary reading area shows the selected page without requiring any persistence or editor state."
        },
        {
          id: "right-rail",
          title: "Right rail",
          body:
            "The contextual panel keeps the table of contents and platform probe visible, but secondary."
        }
      ],
      children: [
        {
          id: "reader-shell-sidebar",
          title: "Sidebar",
          slug: "sidebar",
          summary: "Workspace identity and the demo page tree.",
          body:
            "The sidebar frames the workspace and lets the user switch between demo pages without navigation churn.",
          sections: [
            {
              id: "tree-structure",
              title: "Tree structure",
              body:
                "The page tree is explicit demo data and can later be swapped for a live adapter."
            },
            {
              id: "current-selection",
              title: "Current selection",
              body:
                "The selected page is highlighted so the relationship between tree and content stays obvious."
            }
          ]
        },
        {
          id: "reader-shell-content",
          title: "Content area",
          slug: "content-area",
          summary: "The selected page reading surface.",
          body:
            "The content pane is deliberately calm. It presents the title, summary, prose, and section anchors needed for a usable baseline.",
          sections: [
            {
              id: "reader-title",
              title: "Title and summary",
              body:
                "The selected page headline should be the strongest element in the content column."
            },
            {
              id: "reader-prose",
              title: "Supporting prose",
              body:
                "Body copy remains concise so the shell reads like a product surface, not a marketing page."
            }
          ]
        }
      ]
    },
    {
      id: "runtime-probe",
      title: "Runtime probe",
      slug: "runtime-probe",
      summary: "ServiceNow connectivity is visible, but it does not define the shell.",
      body:
        "The REST ping is a runtime and platform probe. It proves the same-origin path when available and can fail without taking the workspace shell down.",
      sections: [
        {
          id: "sdk-assets",
          title: "SDK assets",
          body:
            "The UI continues to load through SDK-managed assets rather than manual attachment publishing."
        },
        {
          id: "same-origin-ping",
          title: "Same-origin ping",
          body:
            "The backend probe confirms the host wiring and authentication context, but not the product data model."
        },
        {
          id: "failure-tolerance",
          title: "Failure tolerance",
          body:
            "If the ping fails, the workspace remains visible and the error stays in the secondary rail."
        }
      ]
    },
    {
      id: "future-boundaries",
      title: "Future boundaries",
      slug: "future-boundaries",
      summary: "What this task intentionally leaves out.",
      body:
        "Live persistence, page CRUD, editor integration, publishing, and permission enforcement remain future tasks. This baseline only proves the shell shape and the demo/adaptor boundary.",
      sections: [
        {
          id: "future-persistence",
          title: "Persistence",
          body:
            "The demo data stays isolated so later ServiceNow adapters can replace it cleanly."
        },
        {
          id: "future-editor",
          title: "Editor boundary",
          body:
            "The shell does not introduce TipTap or source/Markdown round-tripping in this task."
        }
      ]
    }
  ]
};

export function findDemoPage(pages: DemoPage[], pageId: string): DemoPage | null {
  for (const page of pages) {
    if (!page) {
      continue;
    }

    if (page.id === pageId) {
      return page;
    }

    const childMatch = page.children ? findDemoPage(page.children, pageId) : null;
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

export function getFirstDemoPage(pages: DemoPage[]): DemoPage | null {
  for (const page of pages) {
    if (!page) {
      continue;
    }

    return page;
  }

  return null;
}

export function flattenDemoPages(pages: DemoPage[]): DemoPage[] {
  const flattened: DemoPage[] = [];

  for (const page of pages) {
    if (!page) {
      continue;
    }

    flattened.push(page);
    if (Array.isArray(page.children) && page.children.length > 0) {
      flattened.push(...flattenDemoPages(page.children));
    }
  }

  return flattened;
}

