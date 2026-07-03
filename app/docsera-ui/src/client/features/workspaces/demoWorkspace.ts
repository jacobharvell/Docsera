import type { DemoPage, DemoWorkspace } from "../../shared/types/docsera";

export const demoWorkspace: DemoWorkspace = {
  id: "workspace-platform-docs",
  title: "OpenDocs Main",
  iconLabel: "△",
  homeLabel: "Project Portfolio",
  roleLabel: "Editor",
  defaultPageId: "overview",
  pages: [
    {
      id: "overview",
      title: "Overview",
      slug: "overview",
      body:
        "Hello there, I'm Jacob and welcome to my central documentation hub. This workspace is seeded locally so the SDK-native shell can prove layout, navigation, and reading rhythm before live ServiceNow wiring is introduced.",
      sections: [
        {
          id: "workspace-shell",
          title: "Workspace shell",
          body:
            "The baseline shell keeps the left tree, content well, and right-side context visible without letting runtime diagnostics dominate the product surface."
        },
        {
          id: "reading-rhythm",
          title: "Reading rhythm",
          body:
            "Content stays centered inside a readable column so longer page bodies still feel like documentation instead of a dashboard."
        },
        {
          id: "next-steps",
          title: "Next steps",
          body:
            "Future tasks can swap in live workspace and page records without changing the shell structure established here."
        }
      ]
    },
    {
      id: "ai-fundamentals",
      title: "AI Fundamentals eCourse & Certification",
      slug: "ai-fundamentals-ecourse-certification",
      body:
        "This parent page demonstrates how longer portfolio-style entries still fit the tighter tree row treatment without turning into stacked cards or multi-line metadata blocks.",
      sections: [
        {
          id: "project-scope",
          title: "Project scope",
          body:
            "The visual shell keeps hierarchy obvious while letting individual pages own the heavier descriptive content."
        },
        {
          id: "delivery-assets",
          title: "Delivery assets",
          body:
            "Use nested pages for curriculum detail, rollout planning, and supporting technical documentation."
        }
      ],
      children: [
        {
          id: "certification-delivery-model",
          title: "Certification Delivery Model",
          slug: "certification-delivery-model",
          body:
            "This nested page exists to validate breadcrumbs, indentation, and selected-state treatment against the tighter prototype-inspired navigation.",
          sections: [
            {
              id: "curriculum-map",
              title: "Curriculum map",
              body:
                "Break the program into short modules so learners can see progression without a heavy course shell."
            },
            {
              id: "assessment-flow",
              title: "Assessment flow",
              body:
                "Assessment checkpoints should feel integrated into the learning path rather than bolted on at the end."
            },
            {
              id: "launch-sequence",
              title: "Launch sequence",
              body:
                "The launch sequence notes what has to be true before the program moves from draft material to active delivery."
            }
          ]
        },
        {
          id: "enterprise-rollout-plan",
          title: "Enterprise Rollout Plan",
          slug: "enterprise-rollout-plan",
          body:
            "A second nested page keeps the tree deep enough to validate hover affordances and breadcrumb navigation against real hierarchy.",
          sections: [
            {
              id: "pilot-scope",
              title: "Pilot scope",
              body:
                "Start with a narrow pilot so the documentation can stabilize before wider enablement begins."
            },
            {
              id: "adoption-metrics",
              title: "Adoption metrics",
              body:
                "Measure comprehension, completion, and operational readiness instead of only seat count."
            }
          ]
        }
      ]
    },
    {
      id: "specialty-coffee-brand",
      title: "Specialty Coffee Brand & Online Store",
      slug: "specialty-coffee-brand-online-store",
      body:
        "Long page titles are intentional here. They force the page tree to behave like the prototype, with compact truncation and without any invented secondary description rows.",
      sections: [
        {
          id: "brand-system",
          title: "Brand system",
          body:
            "The content well supports broader narrative copy without changing the surrounding shell density."
        },
        {
          id: "storefront-direction",
          title: "Storefront direction",
          body:
            "This page is useful for checking readable line length and section spacing in the main pane."
        }
      ]
    },
    {
      id: "figma-portal-mockup",
      title: "Figma: IT Service Portal Mockup",
      slug: "figma-it-service-portal-mockup",
      body:
        "Prototype-aligned typography and spacing should keep shorter pages feeling intentional instead of sparse.",
      sections: [
        {
          id: "screen-map",
          title: "Screen map",
          body:
            "The screen map section verifies the right rail against a smaller outline."
        },
        {
          id: "handoff-notes",
          title: "Handoff notes",
          body:
            "Handoff notes confirm section spacing still reads cleanly when the page is brief."
        }
      ]
    },
    {
      id: "internal-runbook",
      title: "Internal Runbook",
      slug: "internal-runbook",
      body:
        "Runbooks should focus on repeatable checks, known failure modes, and the smallest actions needed to distinguish product bugs from host-environment issues.",
      sections: [
        {
          id: "triage",
          title: "Triage",
          body:
            "Start with install integrity, asset loading, and runtime console errors before touching product behavior."
        },
        {
          id: "rollback",
          title: "Rollback",
          body:
            "Keep rollback guidance short and concrete so maintainers can recover the shell quickly when an install regresses."
        }
      ]
    },
    {
      id: "release-notes",
      title: "Release Notes",
      slug: "release-notes",
      body:
        "Release notes validate a flatter page type where the layout still needs to feel like a product documentation surface rather than an app dashboard.",
      sections: [
        {
          id: "highlights",
          title: "Highlights",
          body:
            "Lead with user-visible behavior changes and keep implementation detail secondary."
        },
        {
          id: "follow-ups",
          title: "Follow-ups",
          body:
            "Use the closing section to point readers toward deeper guides or known gaps."
        }
      ]
    }
  ]
};

export function findDemoPage(pages: DemoPage[], pageId: string): DemoPage | null {
  for (const page of pages) {
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
  return pages[0] ?? null;
}

export function flattenDemoPages(pages: DemoPage[]): DemoPage[] {
  return pages.flatMap((page) => [page, ...(page.children ? flattenDemoPages(page.children) : [])]);
}

export function findDemoPagePath(pages: DemoPage[], pageId: string): DemoPage[] {
  for (const page of pages) {
    if (page.id === pageId) {
      return [page];
    }

    if (page.children) {
      const childPath = findDemoPagePath(page.children, pageId);
      if (childPath.length > 0) {
        return [page, ...childPath];
      }
    }
  }

  return [];
}
