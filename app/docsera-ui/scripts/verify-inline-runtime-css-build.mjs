#!/usr/bin/env node

import {
  collectLocalInlineRuntimeCssBuild,
  runtimeStyleIdentity
} from "./inline-runtime-css.mjs";

function printCheck(ok, label, detail) {
  const prefix = ok ? "[pass]" : "[fail]";
  console.log(`${prefix} ${label}`);

  if (detail) {
    console.log(`       ${detail}`);
  }
}

try {
  const localBuild = collectLocalInlineRuntimeCssBuild();
  const noThemeAssets = localBuild.runtimeThemeAssets.length === 0;
  const noRuntimeCssFiles = localBuild.emittedRuntimeCssFiles.length === 0;
  const noRuntimeKeys = !/runtime-shell/i.test(localBuild.keysSource);
  const noCssAssetUrl = !/\/uxta\/[^"'`\s)]+\.assetx\?path=[^"'`\s)]+\.css/i.test(localBuild.bundleSource);

  printCheck(true, "main.jsdbx contains the runtime style injection marker");
  printCheck(
    true,
    "main.jsdbx contains the inlined runtime CSS probe",
    `${runtimeStyleIdentity.probeCssProperty}: ${localBuild.probeValue}`
  );
  printCheck(
    noThemeAssets,
    "No runtime-shell sys_ux_theme_asset XML was emitted",
    localBuild.runtimeThemeAssets.map((entry) => entry.fileName).join(", ")
  );
  printCheck(
    noRuntimeCssFiles,
    "No runtime-shell CSS file was emitted under dist/static",
    localBuild.emittedRuntimeCssFiles.join(", ")
  );
  printCheck(noRuntimeKeys, "Generated keys.ts has no runtime-shell explicit asset entries");
  printCheck(noCssAssetUrl, "main.jsdbx contains no runtime CSS asset URL");

  const allChecksPassed = noThemeAssets && noRuntimeCssFiles && noRuntimeKeys && noCssAssetUrl;

  console.log("");
  console.log(`Result: ${allChecksPassed ? "pass" : "fail"}`);

  if (!allChecksPassed) {
    process.exitCode = 1;
  }
} catch (error) {
  printCheck(false, "Local inline runtime CSS build invariant", error instanceof Error ? error.message : String(error));
  console.log("");
  console.log("Result: fail");
  process.exitCode = 1;
}
