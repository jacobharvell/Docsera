#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundledRawReactScriptElementLiteral,
  bundledSerializedReactScriptElementLiteral
} from "../serviceNowSafeMarkupPlugin.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const staticDirectory = path.join(appRoot, "dist", "static");
const updateDirectory = path.join(appRoot, "dist", "app", "update");
const mainBundlePath = path.join(staticDirectory, "main.jsdbx");
const mainMapPath = path.join(staticDirectory, "main.jsdbx.map");
const { scope } = JSON.parse(fs.readFileSync(path.join(appRoot, "now.config.json"), "utf8"));
// Keep this sentinel composition separate from the source identity literal: the
// SDK conversion utility deliberately rewrites literal scope references.
const canonicalScope = ["x", "2300756", "docsera"].join("_");
const canonicalAssetIds = {
  main: "f058e74bbed44dbfad24e6b661817a56",
  mainMap: "7fee0b502705422e8a9854324554faf8"
};

export function assetIdentityForScope(assetScope) {
  const canonicalIds = assetScope === canonicalScope ? canonicalAssetIds : {};
  return {
    main: { name: `${assetScope}/main`, ...(canonicalIds.main ? { sysId: canonicalIds.main } : {}) },
    mainMap: { name: `${assetScope}/main.js.map`, ...(canonicalIds.mainMap ? { sysId: canonicalIds.mainMap } : {}) }
  };
}

export const { main: mainAssetIdentity, mainMap: mainMapAssetIdentity } = assetIdentityForScope(scope);

export function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

export function assetXmlPath(identity, directory = updateDirectory) {
  if (identity.sysId) {
    const canonicalPath = path.join(directory, `sys_ux_lib_asset_${identity.sysId}.xml`);
    if (!fs.existsSync(canonicalPath)) {
      throw new Error(`Missing generated UX Asset metadata for canonical ${identity.name} (${identity.sysId}).`);
    }
    return canonicalPath;
  }

  const matchingPath = fs.readdirSync(directory)
    .filter((fileName) => /^sys_ux_lib_asset_[0-9a-f]{32}\.xml$/i.test(fileName))
    .map((fileName) => path.join(directory, fileName))
    .find((filePath) => fs.readFileSync(filePath, "utf8").includes(`<name>${identity.name}</name>`));
  if (!matchingPath) throw new Error(`Missing generated UX Asset metadata for ${identity.name}.`);
  return matchingPath;
}

function readAsset(identity) {
  const source = fs.readFileSync(assetXmlPath(identity), "utf8");
  const name = source.match(/<name>([^<]+)<\/name>/)?.[1];
  const checksum = source.match(/<checksum>([^<]+)<\/checksum>/)?.[1];
  const content = source.match(/<content><!\[CDATA\[([\s\S]*)\]\]><\/content>/)?.[1];
  const attachment = /<is_attachment>true<\/is_attachment>/.test(source);

  if (name !== identity.name || !checksum || (content === undefined && !attachment)) {
    throw new Error(`Malformed generated UX Asset metadata for ${identity.name}.`);
  }

  return { attachment, checksum, content, name };
}

export function collectSdkBundleSerializationBuild() {
  const bundle = fs.readFileSync(mainBundlePath, "utf8");
  const sourceMapText = fs.readFileSync(mainMapPath, "utf8");
  const sourceMap = JSON.parse(sourceMapText);
  const mainAsset = readAsset(mainAssetIdentity);
  const mainMapAsset = readAsset(mainMapAssetIdentity);

  return { bundle, mainAsset, mainMapAsset, sourceMap, sourceMapText };
}

export function verifySdkBundleSerializationBuild() {
  const { bundle, mainAsset, mainMapAsset, sourceMap, sourceMapText } = collectSdkBundleSerializationBuild();
  const checks = [
    [!bundle.includes(bundledRawReactScriptElementLiteral), "main.jsdbx omits the raw React DOM <script> literal"],
    [bundle.includes(bundledSerializedReactScriptElementLiteral), "main.jsdbx contains the equivalent serialization-safe React DOM literal"],
    [mainAsset.content === bundle, "main UX Asset metadata content matches main.jsdbx"],
    [mainAsset.checksum === md5(bundle), "main UX Asset metadata checksum matches main.jsdbx"],
    [mainMapAsset.attachment, "main map UX Asset metadata stores main.jsdbx.map as its SDK attachment"],
    [mainMapAsset.checksum === md5(sourceMapText), "main map UX Asset metadata checksum matches main.jsdbx.map"],
    [sourceMap.file === "main.jsdbx", "main.jsdbx.map identifies main.jsdbx"],
    [Array.isArray(sourceMap.sources) && sourceMap.sources.includes("../../node_modules/react-dom/cjs/react-dom.production.min.js"), "main.jsdbx.map retains the React DOM source identity"],
    [typeof sourceMap.mappings === "string" && sourceMap.mappings.length > 0, "main.jsdbx.map retains generated mappings"],
    [bundle.endsWith("//# sourceMappingURL=main.js.map.jsdbx\n"), "main.jsdbx retains its generated source-map reference"]
  ];

  return checks;
}

function main() {
  const checks = verifySdkBundleSerializationBuild();
  for (const [ok, label] of checks) console.log(`[${ok ? "pass" : "fail"}] ${label}`);
  if (checks.some(([ok]) => !ok)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
