import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const configPath = path.join(packageRoot, "now.config.json");
const placeholderScopeId = "00000000000000000000000000000000";
const canonicalDevelopmentIdentity = {
  authAlias: "docsera-dev468303",
  instanceUrl: "https://dev468303.service-now.com",
  scope: "x_2300756_docsera",
  scopeId: "e6e43323accd4c7fb9271525a343850e"
};

const config = JSON.parse(await readFile(configPath, "utf8"));

if (config.scopeId === placeholderScopeId) {
  throw new Error(
    [
      "Refusing SDK install because app/docsera-ui/now.config.json still uses the placeholder scopeId.",
      "Sync the real Docsera application identity from the target instance before installing.",
      "Expected follow-up once SDK auth exists: npx @servicenow/sdk transform --auth <alias>."
    ].join(" ")
  );
}

function authProfileMatches(authList, alias, instanceUrl) {
  const lines = authList.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const aliasMatch = lines[index].trim().match(/^\*?\[([^\]]+)\]$/);
    if (!aliasMatch || aliasMatch[1] !== alias) continue;
    for (let detailIndex = index + 1; detailIndex < lines.length && !lines[detailIndex].trim().match(/^\*?\[[^\]]+\]$/); detailIndex += 1) {
      const hostMatch = lines[detailIndex].match(/^\s*host\s*=\s*(\S+)\s*$/);
      if (hostMatch) return hostMatch[1].replace(/\/$/, "").toLowerCase() === instanceUrl.toLowerCase();
    }
    return false;
  }
  return false;
}

if (process.argv.includes("--canonical-development")) {
  const aliasIndex = process.argv.indexOf("--auth-alias");
  const authAlias = aliasIndex === -1 ? undefined : process.argv[aliasIndex + 1];
  if (authAlias !== canonicalDevelopmentIdentity.authAlias) {
    throw new Error(`Canonical development deployment requires SDK auth alias ${canonicalDevelopmentIdentity.authAlias}.`);
  }
  if (config.scope !== canonicalDevelopmentIdentity.scope || config.scopeId !== canonicalDevelopmentIdentity.scopeId) {
    throw new Error(`Canonical development deployment requires ${canonicalDevelopmentIdentity.scope} (${canonicalDevelopmentIdentity.scopeId}); now.config.json does not match.`);
  }

  const sdk = path.join(packageRoot, "node_modules", ".bin", process.platform === "win32" ? "now-sdk.cmd" : "now-sdk");
  const authList = spawnSync(sdk, ["auth", "--list"], { encoding: "utf8", shell: process.platform === "win32" });
  if (authList.error || authList.status !== 0 || !authProfileMatches(`${authList.stdout ?? ""}\n${authList.stderr ?? ""}`, authAlias, canonicalDevelopmentIdentity.instanceUrl)) {
    throw new Error(`Canonical development deployment requires alias ${authAlias} to resolve to ${canonicalDevelopmentIdentity.instanceUrl}; correct the local SDK auth profile before installing.`);
  }
}
