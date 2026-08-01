#!/usr/bin/env node

import process from "node:process";
import { testSuites, validateSuiteManifest } from "./test-suite-manifest.mjs";

function printUsage() {
  console.log("Usage: node ./scripts/test-suites.mjs <list|check>");
}

function printList() {
  for (const suite of testSuites) {
    console.log(`${suite.name}\t${suite.files.length}\t${suite.description}`);
  }
}

function printCheck(result) {
  console.log(`Discovered Vitest files: ${result.discoveredFileCount}`);
  console.log(`Manifest assignments: ${result.assignedFileCount}`);
  for (const suite of result.suiteSummaries) {
    console.log(`${suite.name}\t${suite.fileCount}`);
  }
}

const command = (process.argv[2] ?? "").trim();

if (!command || command === "-h" || command === "--help") {
  printUsage();
  process.exit(command ? 0 : 1);
}

if (command === "list") {
  printList();
  process.exit(0);
} else if (command === "check") {
  const result = validateSuiteManifest();
  printCheck(result);

  if (!result.ok) {
    console.error("");
    console.error("Manifest validation failed:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Manifest validation passed.");
    process.exit(0);
  }
} else {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exitCode = 1;
}
