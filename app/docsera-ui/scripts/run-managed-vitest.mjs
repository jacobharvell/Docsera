#!/usr/bin/env node

import process from "node:process";
import {
  defaultValidationWorkers,
  getValidationStateDir,
  runManagedVitest
} from "./validation-process.mjs";

function splitArgs(argv) {
  const result = {
    forwarded: [],
    help: false,
    stateDir: undefined,
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

    result.forwarded.push(arg);
  }

  return result;
}

const parsedArgs = splitArgs(process.argv.slice(2));

if (parsedArgs.help) {
  console.log("Usage: node ./scripts/run-managed-vitest.mjs [--state-dir <dir>] [--workers <count>] [vitest args...]");
  process.exit(0);
}

const workerCount = parsedArgs.workers ? Number(parsedArgs.workers) : defaultValidationWorkers;
const result = await runManagedVitest({
  forwardedArgs: parsedArgs.forwarded,
  stateDir: getValidationStateDir(parsedArgs.stateDir),
  workerCount
});

if (!result.ok) {
  process.exitCode = process.exitCode ?? 1;
}
