#!/usr/bin/env node

import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  defaultValidationWorkers,
  getValidationStateDir,
  runManagedVitest
} from "./validation-process.mjs";
import { resolveSuiteSelection, testSuites, validateSuiteManifest } from "./test-suite-manifest.mjs";

export function parseManagedVitestSuiteArgs(argv) {
  const result = {
    forwarded: [],
    help: false,
    stateDir: undefined,
    suites: [],
    workers: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      result.forwarded.push(...argv.slice(index + 1));
      break;
    }

    if (arg === "-h" || arg === "--help") {
      result.help = true;
      continue;
    }

    if (arg.startsWith("--state-dir=")) {
      result.stateDir = arg.slice("--state-dir=".length);
      continue;
    }

    if (arg === "--state-dir") {
      result.stateDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--workers=")) {
      result.workers = arg.slice("--workers=".length);
      continue;
    }

    if (arg === "--workers") {
      result.workers = argv[index + 1];
      index += 1;
      continue;
    }

    result.suites.push(arg);
  }

  return result;
}

function printUsage() {
  console.log(
    "Usage: node ./scripts/run-managed-vitest-suites.mjs [--state-dir <dir>] [--workers <count>] <suite> [<suite> ...] [-- vitest args...]"
  );
  console.log(`Available suites: ${testSuites.map((suite) => suite.name).join(", ")}`);
}

async function main(argv = process.argv.slice(2)) {
  const parsedArgs = parseManagedVitestSuiteArgs(argv);

  if (parsedArgs.help) {
    printUsage();
    return 0;
  }

  const manifest = validateSuiteManifest();
  if (!manifest.ok) {
    console.error("Test suite manifest is invalid:");
    for (const error of manifest.errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  let selected;
  try {
    selected = resolveSuiteSelection(parsedArgs.suites);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  console.log(`Selected suites: ${selected.suites.map((suite) => suite?.name).join(", ")}`);
  console.log(`Selected test files: ${selected.files.length}`);

  const workerCount = parsedArgs.workers ? Number(parsedArgs.workers) : defaultValidationWorkers;
  const result = await runManagedVitest({
    forwardedArgs: [...selected.files, ...parsedArgs.forwarded],
    stateDir: getValidationStateDir(parsedArgs.stateDir),
    workerCount
  });

  if (!result.ok) {
    return process.exitCode ?? 1;
  }

  return 0;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const exitCode = await main();
  process.exit(exitCode);
}

export { main };
