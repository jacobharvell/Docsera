import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return readFileSync(path.resolve(process.cwd(), name.includes("/") ? `src/fluent/${name}` : `src/fluent/tables/${name}`), "utf8");
}

function fieldDefinition(sourceText: string, fieldName: string) {
  const start = sourceText.indexOf(`${fieldName}: ReferenceColumn({`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sourceText.indexOf("\n    }),", start);
  expect(end).toBeGreaterThan(start);
  return sourceText.slice(start, end);
}

describe("workspace change-set metadata contract", () => {
  it("keeps workflow tables scoped, package-private, and outside generic web-service access", () => {
    for (const name of [
      "docsera-workspace-edit-lease.now.ts",
      "docsera-workspace-change-set.now.ts",
      "docsera-workspace-snapshot-set.now.ts",
      "docsera-workspace-page-snapshot.now.ts",
      "docsera-workspace-change-entry.now.ts",
      "docsera-workspace-mutation-claim.now.ts",
      "docsera-workspace-removal-batch.now.ts",
      "docsera-workspace-removal-member.now.ts"
    ]) {
      const text = source(name);
      expect(text).toContain('accessibleFrom: "package_private"');
      expect(text).toContain("createAccessControls: false");
      expect(text).toContain("allowWebServiceAccess: false");
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

  it("keeps mutation claims bounded, owned, and phase-aware", () => {
    const claim = source("docsera-workspace-mutation-claim.now.ts");
    expect(claim).toContain('mutation_key: StringColumn({ label: "Mutation key", mandatory: true, maxLength: 64 })');
    expect(claim).toContain("claim_owner_key");
    expect(claim).toContain("owner_expires_on");
    expect(claim).toContain("execution_phase");
    expect(claim).toContain("target_page_sys_id");
    expect(claim).toContain("target_next_page_sys_id");
    expect(claim).toContain("target_removal_batch_key");
    expect(claim).toContain("mutation_payload_json");
    expect(claim).toContain("mutation_result_json");
    expect(claim).toContain("result_change_set_revision");
    expect(claim).toContain("change_set_advancing");
    expect(claim).toContain("result_persisted");
    expect(claim).toContain("finalized");
  });

  it("allows global group deletion validation commands in the member mutation queue", () => {
    expect(source("docsera-workspace-member-mutation-command.now.ts")).toContain('validate_workspace_group_deletion: "Validate workspace group deletion"');
  });

  it("keeps the privileged provisioning queue outside direct web-service access while preserving worker table actions", () => {
    const requestQueue = source("docsera-workspace-provision-request.now.ts");

    expect(requestQueue).toContain('actions: ["read", "update"]');
    expect(requestQueue).toContain("allowWebServiceAccess: false");
  });

  it("supports inactive workspace tombstones without generated access group references", () => {
    const workspace = source("docsera-workspace.now.ts");

    expect(fieldDefinition(workspace, "admin_group")).not.toContain("mandatory: true");
    expect(fieldDefinition(workspace, "editor_group")).not.toContain("mandatory: true");
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

  it("denies generic CRUD across the workspace lease and workflow tables", () => {
    const acl = source("security/docsera-workspace-foundation-table-access.now.ts");
    const protectedTables = [
      "x_2300756_docsera_workspace_edit_lease",
      "x_2300756_docsera_workspace_change_set",
      "x_2300756_docsera_workspace_snapshot_set",
      "x_2300756_docsera_workspace_page_snapshot",
      "x_2300756_docsera_workspace_change_entry",
      "x_2300756_docsera_workspace_mutation_claim",
      "x_2300756_docsera_workspace_removal_batch",
      "x_2300756_docsera_workspace_removal_member",
      "x_2300756_docsera_workspace_icon_asset",
      "x_2300756_docsera_workspace_member_mutation_command",
      "x_2300756_docsera_workspace_provision_request"
    ];
    for (const table of protectedTables) {
      expect(acl).toContain(table);
    }
    const expectedAclCount = protectedTables.length * 4;
    expect(acl.match(/decisionType: "deny"/g)).toHaveLength(expectedAclCount);
    expect(acl.match(/adminOverrides: false/g)).toHaveLength(expectedAclCount);
    expect(acl.match(/script: "return false;"/g)).toHaveLength(expectedAclCount);
  });

  it("declares a stable Deny-Unless ACL for every provisioning queue CRUD operation", () => {
    const acl = source("security/docsera-workspace-foundation-table-access.now.ts");

    for (const operation of ["create", "read", "write", "delete"]) {
      expect(acl).toContain(`Now.ID["docsera_workspace_provision_request_${operation}_deny"]`);
      expect(acl).toContain(`table: "x_2300756_docsera_workspace_provision_request", operation: "${operation}", decisionType: "deny", adminOverrides: false, script: "return false;"`);
    }
  });
});
