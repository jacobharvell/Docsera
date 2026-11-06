#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const maintenanceSourcePath = path.join(
  appRoot,
  "src",
  "fluent",
  "maintenance",
  "docsera-retired-editor-spike-assets.now.ts"
);
const electiveUpdateDirectory = path.join(appRoot, "dist", "app", "author_elective_update");

export const retiredEditorSpikeAssets = [
  "c58dabe08ad142cca3f1909a68b0a713",
  "a03da8513bc94a398b3a3dafcca17dc8"
];

export function deleteCallFor(sysId) {
  return `Now.del("sys_ux_lib_asset", "${sysId}");`;
}

export function collectRetiredEditorSpikeAssetCleanup({
  source = fs.readFileSync(maintenanceSourcePath, "utf8"),
} = {}) {
  const expectedGeneratedFileNames = retiredEditorSpikeAssets.map(
    (sysId) => `sys_ux_lib_asset_${sysId}.xml`
  );
  const scopedAssetDeletes = [...source.matchAll(/Now\.del\("sys_ux_lib_asset", "([0-9a-f]{32})"\);/g)]
    .map((match) => match[1]);
  const deleteCalls = retiredEditorSpikeAssets.map((sysId) => source.includes(deleteCallFor(sysId)));
  const generatedDeletes = expectedGeneratedFileNames.map((fileName) => {
    const generatedPath = path.join(electiveUpdateDirectory, fileName);
    return fs.existsSync(generatedPath)
      && fs.readFileSync(generatedPath, "utf8").includes('sys_ux_lib_asset action="DELETE"');
  });

  return { deleteCalls, expectedGeneratedFileNames, generatedDeletes, scopedAssetDeletes };
}

export function verifyRetiredEditorSpikeAssetCleanup() {
  const result = collectRetiredEditorSpikeAssetCleanup();
  const checks = [
    [result.deleteCalls.every(Boolean) && result.scopedAssetDeletes.join(",") === retiredEditorSpikeAssets.join(","), "maintenance source declares only the two targeted UX Asset deletions"],
    [result.generatedDeletes.every(Boolean), "SDK build emits DELETE elective updates for both retired UX Assets"]
  ];

  for (const [passed, message] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}: ${message}`);
  }

  return checks.every(([passed]) => passed);
}

if (process.argv[1] === fileURLToPath(import.meta.url) && !verifyRetiredEditorSpikeAssetCleanup()) {
  process.exitCode = 1;
}
