import type { DemoWorkspace } from "../../shared/types/docsera";

export const demoWorkspace: DemoWorkspace = {
  id: "workspace-api-guides",
  title: "API Guides",
  summary:
    "Seeded demo data keeps the runtime baseline visible without claiming live ServiceNow workspace persistence.",
  pages: [
    { id: "page-intro", title: "Getting Started", slug: "/getting-started" },
    { id: "page-auth", title: "Authentication", slug: "/authentication" },
    { id: "page-errors", title: "Errors", slug: "/errors" }
  ]
};
