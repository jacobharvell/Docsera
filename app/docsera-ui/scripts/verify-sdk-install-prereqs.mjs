import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const configPath = path.join(packageRoot, "now.config.json");
const placeholderScopeId = "00000000000000000000000000000000";

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
