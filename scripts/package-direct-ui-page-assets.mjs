import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "app", "docsera-ui");
const frontendDist = path.join(frontendRoot, "dist");
const outputRoot = path.join(repoRoot, "output", "direct-ui-page-baseline");

const runtimeScriptName = "docsera-runtime.js";
const runtimeCssName = "docsera-runtime.css";
const uiScriptApiName = "x_82900_docsera.docsera_runtime_bootstrap";

async function buildFrontend() {
  await execAsync("npm --prefix app/docsera-ui run build", {
    cwd: repoRoot,
    windowsHide: true
  });
}

function createHostHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Docsera Runtime Baseline</title>
  <link rel="stylesheet" href="/sys_attachment.do?sys_id=<DOCSERA_RUNTIME_CSS_ATTACHMENT_SYS_ID>" />
  <script>
    window.DOCSERA_RUNTIME_CONFIG = {
      cssPath: "/sys_attachment.do?sys_id=<DOCSERA_RUNTIME_CSS_ATTACHMENT_SYS_ID>",
      scriptPath: "/${uiScriptApiName}.jsdbx",
      backendPingPath: "/api/x_82900_docsera/docsera_host_spike/ping"
    };
  </script>
</head>
<body>
  <div id="docsera-root"></div>
  <script src="/${uiScriptApiName}.jsdbx"></script>
</body>
</html>
`;
}

async function writeManifest() {
  const script = await readFile(path.join(frontendDist, runtimeScriptName), "utf8");
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourcePackage: "app/docsera-ui",
    directUiPage: {
      mountNodeId: "docsera-root",
      hostTemplate: "direct-ui-page-host.example.html",
      configGlobal: "window.DOCSERA_RUNTIME_CONFIG"
    },
    assets: {
      script: {
        file: runtimeScriptName,
        intendedRecordType: "Scoped UI Script",
        apiNamePlaceholder: uiScriptApiName,
        servedPathExample: `/${uiScriptApiName}.jsdbx`,
        bytes: Buffer.byteLength(script, "utf8")
      },
      css: {
        file: runtimeCssName,
        intendedRecordType: "same-origin attachment-backed CSS asset",
        servedPathPlaceholder: "/sys_attachment.do?sys_id=<DOCSERA_RUNTIME_CSS_ATTACHMENT_SYS_ID>"
      }
    },
    deferredGaps: [
      "Final on-instance automation that publishes the built assets into ServiceNow records.",
      "Final scoped REST auth and ACL policy beyond the spike-friendly backend ping.",
      "Replacement of demo workspace seed data with live ServiceNow persistence."
    ]
  };

  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  await buildFrontend();
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await cp(path.join(frontendDist, runtimeScriptName), path.join(outputRoot, runtimeScriptName));
  await cp(path.join(frontendDist, runtimeCssName), path.join(outputRoot, runtimeCssName));
  await writeFile(path.join(outputRoot, "direct-ui-page-host.example.html"), createHostHtml(), "utf8");
  await writeManifest();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
