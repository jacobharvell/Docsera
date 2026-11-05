#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(root, "output", "update-set");
const manifest = JSON.parse(readFileSync(path.join(generatedRoot, "docsera-global-companion.update-set.json"), "utf8"));
const artifact = readFileSync(path.join(generatedRoot, manifest.artifactFile), "utf8");
const required = [["sys_ui_page", "4bb3dc32dcfc4441a57bfce97db77529"], ["sys_security_acl", "b9d7e176310f447ea61072dc4a9fca11"], ["sys_ux_lib_asset", "377d32f160d24dafa9959f5d346c042d"], ["sys_ux_lib_asset", "7c2ec161a0214744aa75f7d22e6edf59"]];
for (const [table, sysId] of required) {
  if (!manifest.records.some((record) => record.table === table && record.targetSysId === sysId)) throw new Error(`Companion manifest is missing ${table}:${sysId}.`);
}
for (const fragment of ["&lt;name&gt;docsera&lt;/name&gt;", "&lt;direct&gt;true&lt;/direct&gt;", "id=&quot;docsera-root&quot;", "window.DOCSERA_RUNTIME_CONFIG", "import(&quot;/uxasset/externals/x_2300756_docsera/main.jsdbx", "answer = gs.isLoggedIn();"]) {
  if (!artifact.includes(fragment)) throw new Error(`Companion artifact is missing required production content: ${fragment}`);
}
if (artifact.includes("gs.getUser().isLoggedIn()")) throw new Error("Companion artifact contains the unsupported GlideUser isLoggedIn() ACL expression.");
console.log("Docsera production friendly URL host artifact verification passed.");
