#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  terminateProcessTree,
  waitForProcessTreeToExit
} from "./validation-process.mjs";

const parsedArgs = parseArgs({
  allowPositionals: false,
  args: process.argv.slice(2),
  options: {
    "root-pid": { type: "string" },
    "root-start-time": { type: "string" },
    "run-id": { type: "string" },
    "stage-id": { type: "string" },
    "stage-label": { type: "string" },
    "state-dir": { type: "string" },
    help: { type: "boolean", short: "h" }
  }
});

function parsePid(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

if (parsedArgs.values.help) {
  console.log(
    "Usage: node ./scripts/validation-watchdog.mjs --root-pid <pid> --root-start-time <iso> --run-id <id> --stage-id <id> --stage-label <label> [--state-dir <dir>]"
  );
  process.exit(0);
}

const rootPid = parsePid(parsedArgs.values["root-pid"], "--root-pid");
const rootStartTime = parsedArgs.values["root-start-time"] || null;
const runId = parsedArgs.values["run-id"] || null;
const stageId = parsedArgs.values["stage-id"] || null;
const stageLabel = parsedArgs.values["stage-label"] || "managed stage";
const stateDir = parsedArgs.values["state-dir"] || "";

let stopping = false;

async function cleanAndExit(reason) {
  if (stopping) {
    return;
  }

  stopping = true;

  if (reason === "disconnect") {
    console.log(`[watchdog] parent disconnected for ${stageLabel}; cleaning tree rooted at pid=${rootPid}`);
    const cleanup = await terminateProcessTree(rootPid, {
      expectedRootStartTime: rootStartTime,
      runId,
      stageId
    });
    const treeGone = await waitForProcessTreeToExit(rootPid);
    console.log(
      `[watchdog] cleanup ${
        cleanup.terminated && treeGone.exited
          ? "succeeded"
          : cleanup.rootIdentity?.status === "mismatch" || cleanup.rootIdentity?.status === "live-unverified"
            ? `skipped (${cleanup.rootIdentity.status})`
            : "completed with leftovers"
      } for ${stageLabel}`
    );
  } else {
    console.log(`[watchdog] stop received for ${stageLabel}; exiting`);
  }

  if (stateDir) {
    console.log(`[watchdog] state dir ${stateDir}`);
  }

  process.exit(0);
}

process.on("message", (message) => {
  if (message && typeof message === "object" && message.type === "stop") {
    void cleanAndExit("stop");
  }
});

process.on("disconnect", () => {
  void cleanAndExit("disconnect");
});

process.on("SIGINT", () => {
  void cleanAndExit("stop");
});

process.on("SIGTERM", () => {
  void cleanAndExit("stop");
});

setInterval(() => {}, 1000).unref();
