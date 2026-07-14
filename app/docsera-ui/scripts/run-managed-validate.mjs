#!/usr/bin/env node

import process from "node:process";
import {
  defaultValidationWorkers,
  defaultValidationBuildTimeoutMs,
  defaultValidationCssTimeoutMs,
  defaultValidationTestTimeoutMs,
  getValidationStateDir,
  parseDurationOverride,
  runManagedValidation
} from "./validation-process.mjs";

function splitArgs(argv) {
  const result = {
    buildTimeoutMs: undefined,
    cssTimeoutMs: undefined,
    forwarded: [],
    help: false,
    stateDir: undefined,
    testTimeoutMs: undefined,
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

    if (arg.startsWith("--build-timeout-ms=")) {
      result.buildTimeoutMs = arg.slice("--build-timeout-ms=".length);
      continue;
    }

    if (arg === "--build-timeout-ms") {
      result.buildTimeoutMs = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--css-timeout-ms=")) {
      result.cssTimeoutMs = arg.slice("--css-timeout-ms=".length);
      continue;
    }

    if (arg === "--css-timeout-ms") {
      result.cssTimeoutMs = argv[index + 1];
      index += 1;
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

    if (arg.startsWith("--test-timeout-ms=")) {
      result.testTimeoutMs = arg.slice("--test-timeout-ms=".length);
      continue;
    }

    if (arg === "--test-timeout-ms") {
      result.testTimeoutMs = argv[index + 1];
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
  console.log(
    "Usage: node ./scripts/run-managed-validate.mjs [--state-dir <dir>] [--workers <count>] [--test-timeout-ms <ms>] [--build-timeout-ms <ms>] [--css-timeout-ms <ms>] [vitest args...]"
  );
  process.exit(0);
}

const workerCount = parsedArgs.workers ? Number(parsedArgs.workers) : defaultValidationWorkers;
const result = await runManagedValidation({
  buildTimeoutMs: parseDurationOverride(parsedArgs.buildTimeoutMs, defaultValidationBuildTimeoutMs, "build-timeout-ms"),
  cssTimeoutMs: parseDurationOverride(parsedArgs.cssTimeoutMs, defaultValidationCssTimeoutMs, "css-timeout-ms"),
  forwardedVitestArgs: parsedArgs.forwarded,
  stateDir: getValidationStateDir(parsedArgs.stateDir),
  testTimeoutMs: parseDurationOverride(parsedArgs.testTimeoutMs, defaultValidationTestTimeoutMs, "test-timeout-ms"),
  workerCount
});

if (!result.ok) {
  process.exitCode = process.exitCode ?? 1;
}
