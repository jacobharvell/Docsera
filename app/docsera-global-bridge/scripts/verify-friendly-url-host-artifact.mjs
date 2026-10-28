#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "update-set", "docsera-global-companion.update-set.json"), "utf8"));
const artifact = readFileSync(path.join(root, "update-set", manifest.artifactFile), "utf8");
const required = [["sys_ui_page", "de3b81474ba94c0a9296d12f9c6bd9cc"], ["sys_security_acl", "879785c448564188a54416cb90d18c14"], ["sys_ux_lib_asset", "271d5363931d4b57ac26212e883ed1ab"], ["sys_ux_lib_asset", "8e4cefdd7fdd40f493c43fd2630de2c8"]];
for (const [table, sysId] of required) {
  if (!manifest.records.some((record) => record.table === table && record.targetSysId === sysId)) throw new Error(`Companion manifest is missing ${table}:${sysId}.`);
}
for (const fragment of ["&lt;name&gt;docsera&lt;/name&gt;", "&lt;direct&gt;true&lt;/direct&gt;", "id=&quot;docsera-root&quot;", "window.DOCSERA_RUNTIME_CONFIG", "import(&quot;/uxasset/externals/x_82900_docsera/main.jsdbx", "answer = gs.isLoggedIn();"]) {
  if (!artifact.includes(fragment)) throw new Error(`Companion artifact is missing required production content: ${fragment}`);
}
if (artifact.includes("gs.getUser().isLoggedIn()")) throw new Error("Companion artifact contains the unsupported GlideUser isLoggedIn() ACL expression.");
if (!artifact.includes("&lt;sys_security_acl_role action=&quot;DELETE&quot;&gt;") || !artifact.includes("sys_security_acl_role_1416f98418e24c18af184b0300f7793c")) throw new Error("Companion must retire the temporary editor-only UI Page ACL role.");
console.log("Docsera production friendly URL host artifact verification passed.");
