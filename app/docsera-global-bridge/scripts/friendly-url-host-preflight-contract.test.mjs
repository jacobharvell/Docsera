import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFriendlyUrlHostOwnership, friendlyUrlHostPageId, legacyProofDescription, productionHostDescription, requireSuccessfulQueryRecords } from "./friendly-url-host-preflight-contract.mjs";

test("allows a clean install and both safe Docsera-owned upgrade identities", () => {
  assert.equal(evaluateFriendlyUrlHostOwnership(requireSuccessfulQueryRecords({ ok: true, records: [] })), "empty");
  for (const description of [legacyProofDescription, productionHostDescription]) {
    assert.equal(evaluateFriendlyUrlHostOwnership([{ sys_id: friendlyUrlHostPageId, name: "docsera", direct: "true", description }]), "owned");
  }
});

test("fails closed for a non-Docsera page or malformed collision response", () => {
  assert.throws(() => evaluateFriendlyUrlHostOwnership([{ sys_id: "other", name: "docsera", direct: "true", description: productionHostDescription }]), /collision/i);
  assert.throws(() => requireSuccessfulQueryRecords({ ok: false, records: [] }), /unsuccessful or malformed/i);
});
