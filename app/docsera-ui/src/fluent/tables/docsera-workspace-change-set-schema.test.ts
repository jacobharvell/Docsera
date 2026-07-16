import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return readFileSync(path.resolve(process.cwd(), name.includes("/") ? `src/fluent/${name}` : `src/fluent/tables/${name}`), "utf8");
}

describe("workspace change-set metadata contract", () => {
  it("keeps workflow tables scoped, package-private, and outside generic web-service access", () => {
    for (const name of [
      "docsera-workspace-change-set.now.ts",
      "docsera-workspace-snapshot-set.now.ts",
      "docsera-workspace-page-snapshot.now.ts",
      "docsera-workspace-change-entry.now.ts",
      "docsera-workspace-removal-batch.now.ts",
      "docsera-workspace-removal-member.now.ts"
    ]) {
      const text = source(name);
      expect(text).toContain('accessibleFrom: "package_private"');
      expect(text).toContain("createAccessControls: false");
      expect(text).not.toContain("allowWebServiceAccess: true");
    }
  });

  it("adds separate selector, hierarchy, sequence, and immutable membership contracts", () => {
    expect(source("docsera-workspace.now.ts")).toContain("pending_change_set");
    expect(source("docsera-workspace.now.ts")).toContain("published_snapshot_set");
    expect(source("docsera-workspace.now.ts")).toContain("workspace_state_revision");
    expect(source("docsera-page.now.ts")).toContain("draft_parent_page");
    expect(source("docsera-page.now.ts")).toContain("draft_sibling_order");
    expect(source("docsera-workspace-change-entry.now.ts")).toContain("generation_page_key_unique");
    expect(source("docsera-workspace-removal-member.now.ts")).toContain("batch_page_key_unique");
    expect(source("docsera-workspace-removal-member.now.ts")).toContain("first_pending_sequence");
    expect(source("docsera-workspace-page-snapshot.now.ts")).toContain("snapshot_page_key");
    expect(source("docsera-workspace-page-snapshot.now.ts")).toContain("snapshot_page_key_unique");
    expect(source("docsera-workspace-snapshot-set.now.ts")).toContain("source_change_set");
    expect(source("docsera-workspace-snapshot-set.now.ts")).toContain("source_change_set_revision");
    expect(source("docsera-workspace-snapshot-set.now.ts")).toContain("command_kind");
    expect(source("docsera-page.now.ts")).toContain('StringColumn({');
  });

  it("keeps persisted sibling ordering as a string/rank value and protects server-owned page fields", () => {
    expect(source("docsera-page.now.ts")).toContain("draft_sibling_order: StringColumn");
    expect(source("docsera-workspace-page-snapshot.now.ts")).toContain("sibling_order: StringColumn");
    const acl = source("security/docsera-page-server-owned-fields.now.ts");
    for (const field of ["draft_parent_page", "draft_sibling_order", "draft_removed", "last_draft_changed_on", "last_draft_changed_by"]) expect(acl).toContain(field);
    expect(acl.match(/script: "return false;"/g)).toHaveLength(5);
    expect(acl.match(/adminOverrides: false/g)).toHaveLength(5);
    expect(acl).toContain('decisionType: "deny"');
  });
});
