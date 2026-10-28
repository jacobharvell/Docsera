#!/usr/bin/env node
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateFriendlyUrlHostOwnership, requireSuccessfulQueryRecords } from "./friendly-url-host-preflight-contract.mjs";

const sdkCli = fileURLToPath(new URL("../node_modules/@servicenow/sdk/bin/index.js", import.meta.url));
const { values } = parseArgs({ options: { "auth-alias": { type: "string" } } });
if (!values["auth-alias"]?.trim()) throw new Error("Usage: node ./scripts/preflight-friendly-url-host.mjs --auth-alias <configured-sdk-alias>");
const result = spawnSync(process.execPath, [sdkCli, "query", "sys_ui_page", "-a", values["auth-alias"], "-q", "name=docsera^sys_scope=global", "-f", "sys_id,name,sys_scope,direct,description", "-o", "json"], { cwd: process.cwd(), encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || "UI Page collision query failed.");
const ownership = evaluateFriendlyUrlHostOwnership(requireSuccessfulQueryRecords(JSON.parse(result.stdout)));
console.log(ownership === "empty" ? "PASS: no Global docsera UI Page exists; companion import can create its owned host." : "PASS: the existing Global docsera UI Page is Docsera-owned; companion upgrade is permitted.");
