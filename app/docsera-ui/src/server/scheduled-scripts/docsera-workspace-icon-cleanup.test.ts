import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("abandoned workspace icon scheduled cleanup", () => {
  const source = readFileSync(join(process.cwd(), "src/server/scheduled-scripts/docsera-workspace-icon-cleanup.js"), "utf8");

  it("processes eligible interrupted cleanup claims before aged staged uploads within one fifty-record batch", () => {
    expect(source).toContain("7 * 24 * 60 * 60");
    expect(source).toContain("var BATCH_SIZE = 50");
    expect(source).toContain("var processed = 0");
    expect(source).toContain("while (processed < BATCH_SIZE && candidates.next())");
    expect(source).toContain("cleaningCandidates.addQuery('state', 'cleaning')");
    expect(source).toContain("cleaningCandidates.setLimit(BATCH_SIZE)");
    expect(source).toContain("stagedCandidates.addQuery('state', 'staged')");
    expect(source).toContain("stagedCandidates.addQuery('sys_updated_on', '<', cutoff.getValue())");
    expect(source).toContain("stagedCandidates.setLimit(BATCH_SIZE - processed)");
    expect(source.indexOf("cleanCandidates(cleaningCandidates)")).toBeLessThan(source.indexOf("cleanCandidates(stagedCandidates)"));
  });

  it("revalidates retention during the staged claim and preserves successful and interrupted cleanup behavior", () => {
    expect(source).toContain("claim.addQuery('state', 'staged')");
    expect(source).toContain("claim.addQuery('provision_request', '')");
    expect(source).toContain("claim.addQuery('sys_updated_on', '<', cutoff.getValue())");
    expect(source).toContain("String(asset.getValue('state') || '') !== 'cleaning'");
    expect(source).toContain("attachment.getValue('table_name')");
    expect(source).toContain("attachment.getValue('table_sys_id')");
    expect(source).toContain("if (absent.get('sys_id', attachmentId)) continue");
    expect(source).toContain("remove.addQuery('state', 'cleaning')");
    expect(source).toContain("catch (error)");
  });
});
