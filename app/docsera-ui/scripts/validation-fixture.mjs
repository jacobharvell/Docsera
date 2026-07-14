#!/usr/bin/env node

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import process from "node:process";

function splitArgs(argv) {
  const result = {
    exitCode: undefined,
    forwarded: [],
    help: false,
    holdMs: undefined,
    ignoreSignals: false,
    mode: "",
    nested: false,
    stateFile: undefined
  };

  if (argv.length > 0) {
    result.mode = argv[0];
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      result.forwarded.push(...argv.slice(index + 1));
      break;
    }

    if (arg === "-h" || arg === "--help") {
      result.help = true;
      continue;
    }

    if (arg.startsWith("--state-file=")) {
      result.stateFile = arg.slice("--state-file=".length);
      continue;
    }

    if (arg === "--state-file") {
      result.stateFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--exit-code=")) {
      result.exitCode = arg.slice("--exit-code=".length);
      continue;
    }

    if (arg === "--exit-code") {
      result.exitCode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--hold-ms=")) {
      result.holdMs = arg.slice("--hold-ms=".length);
      continue;
    }

    if (arg === "--hold-ms") {
      result.holdMs = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--nested") {
      result.nested = true;
      continue;
    }

    if (arg === "--ignore-signals") {
      result.ignoreSignals = true;
      continue;
    }

    result.forwarded.push(arg);
  }

  return result;
}

const parsedArgs = splitArgs(process.argv.slice(2));

function parseInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function writeState(stateFile, patch) {
  if (!stateFile) {
    return;
  }

  await writeFile(stateFile, `${JSON.stringify({ ...patch, pid: process.pid, ppid: process.ppid }, null, 2)}\n`, "utf8");
}

if (parsedArgs.help || !parsedArgs.mode) {
  console.log("Usage: node ./scripts/validation-fixture.mjs <mode> [--state-file <path>] [--nested] [--ignore-signals]");
  process.exit(0);
}

const mode = parsedArgs.mode;
const stateFile = parsedArgs.stateFile;
const exitCode = parseInteger(parsedArgs.exitCode, 0);
const holdMs = parseInteger(parsedArgs.holdMs, 0);
const nested = Boolean(parsedArgs.nested);
const ignoreSignals = Boolean(parsedArgs.ignoreSignals);

let nestedChild = null;

async function record(extra = {}) {
  await writeState(stateFile, {
    mode,
    argv: parsedArgs.forwarded,
    nestedPid: nestedChild?.pid ?? null,
    ...extra
  });
}

if (ignoreSignals) {
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => {});
}

if (mode === "success") {
  await record({ status: "about-to-exit" });
  process.stdout.write(`[fixture] success pid=${process.pid}\n`);
  process.exit(0);
}

if (mode === "failure") {
  await record({ status: "about-to-exit", exitCode });
  process.stdout.write(`[fixture] failure pid=${process.pid}\n`);
  process.exit(exitCode || 17);
}

if (mode === "argv") {
  await record({ status: "recorded" });
  process.stdout.write(`${JSON.stringify({ argv: process.argv.slice(2), pid: process.pid })}\n`);
  process.exit(0);
}

if (mode !== "hold") {
  throw new Error(`Unknown validation fixture mode: ${mode}`);
}

if (nested) {
  nestedChild = spawn(
    process.execPath,
    [
      "-e",
      "setInterval(() => {}, 1000);"
    ],
    {
      detached: false,
      stdio: "ignore",
      windowsHide: true
    }
  );
}

await record({ status: "holding" });
process.stdout.write(`[fixture] hold pid=${process.pid} nested=${nestedChild?.pid ?? "none"}\n`);

if (holdMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  process.exit(0);
}

setInterval(() => {}, 1000);
