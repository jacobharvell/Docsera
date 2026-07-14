#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(moduleDir, "..");
export const validationStateRoot = path.join(os.tmpdir(), "docsera-ui-managed-validation");
export const defaultValidationWorkers = 2;
export const defaultValidationTestTimeoutMs = 15 * 60 * 1000;
export const defaultValidationBuildTimeoutMs = 10 * 60 * 1000;
export const defaultValidationCssTimeoutMs = 5 * 60 * 1000;

const vitestEntryPoint = path.join(packageRoot, "node_modules", "vitest", "vitest.mjs");
const sdkEntryPoint = path.join(packageRoot, "node_modules", "@servicenow", "sdk", "bin", "index.js");
const inlineRuntimeCssVerifier = path.join(packageRoot, "scripts", "verify-inline-runtime-css-build.mjs");
const watchdogEntryPoint = path.join(moduleDir, "validation-watchdog.mjs");

function nowIso() {
  return new Date().toISOString();
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

function isWindows() {
  return process.platform === "win32";
}

function toJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readEnvText(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerInterruptHandlers(handler) {
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}

function unregisterInterruptHandlers(handler) {
  process.off("SIGINT", handler);
  process.off("SIGTERM", handler);
}

export function getValidationStateDir(overrideDir) {
  return path.resolve(overrideDir || readEnvText("DOCSERA_VALIDATION_STATE_DIR") || validationStateRoot);
}

export function getValidationLockDir(stateDir) {
  return path.join(stateDir, "run-lock");
}

export function getValidationLockFilePath(stateDir) {
  return path.join(getValidationLockDir(stateDir), "lock.json");
}

async function readTextFile(filePath) {
  return readFile(filePath, "utf8");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  const text = await readTextFile(filePath);
  return toJson(text);
}

async function getProcessStartTime(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  try {
    if (isWindows()) {
      const { stdout } = await execFile(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$p = Get-Process -Id ${pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().ToString("o")`
        ],
        { windowsHide: true, timeout: 5000 }
      );

      return stdout.trim() || null;
    }

    const { stdout } = await execFile("ps", ["-p", String(pid), "-o", "lstart="], {
      windowsHide: true,
      timeout: 5000
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getCurrentProcessStartTime() {
  return getProcessStartTime(process.pid);
}

async function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function inspectProcessIdentity(
  pid,
  {
    getProcessStartTimeImpl = getProcessStartTime,
    isProcessAliveImpl = isProcessAlive
  } = {}
) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return {
      alive: false,
      pid,
      startTime: null,
      status: "dead"
    };
  }

  const alive = await isProcessAliveImpl(pid);
  if (!alive) {
    return {
      alive: false,
      pid,
      startTime: null,
      status: "dead"
    };
  }

  const startTime = await Promise.resolve(getProcessStartTimeImpl(pid)).catch(() => null);
  if (typeof startTime === "string" && startTime.trim()) {
    return {
      alive: true,
      pid,
      startTime: startTime.trim(),
      status: "live"
    };
  }

  return {
    alive: true,
    pid,
    startTime: null,
    status: "live-unverified"
  };
}

export async function verifyProcessIdentity(
  pid,
  expectedStartTime,
  options = {}
) {
  const identity = await inspectProcessIdentity(pid, options);
  if (!identity.alive) {
    return {
      ...identity,
      expectedStartTime,
      matches: false,
      status: "dead"
    };
  }

  if (!expectedStartTime || !identity.startTime) {
    return {
      ...identity,
      expectedStartTime,
      matches: false,
      status: "live-unverified"
    };
  }

  if (identity.startTime !== expectedStartTime) {
    return {
      ...identity,
      expectedStartTime,
      matches: false,
      status: "mismatch"
    };
  }

  return {
    ...identity,
    expectedStartTime,
    matches: true,
    status: "match"
  };
}

async function collectProcessTreePids(rootPid) {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    return [];
  }

  if (isWindows()) {
    try {
      const { stdout } = await execFile(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress"
        ],
        { windowsHide: true, timeout: 10000 }
      );

      const raw = toJson(stdout.trim(), []);
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const byParent = new Map();

      for (const row of rows) {
        const pid = Number(row?.ProcessId);
        const parentPid = Number(row?.ParentProcessId);

        if (!Number.isInteger(pid) || !Number.isInteger(parentPid)) {
          continue;
        }

        const children = byParent.get(parentPid) || [];
        children.push(pid);
        byParent.set(parentPid, children);
      }

      const result = [];
      const visited = new Set();
      const queue = [...(byParent.get(rootPid) || [])];

      while (queue.length > 0) {
        const pid = queue.shift();
        if (!Number.isInteger(pid) || visited.has(pid)) {
          continue;
        }

        visited.add(pid);
        result.push(pid);
        queue.push(...(byParent.get(pid) || []));
      }

      if (await isProcessAlive(rootPid)) {
        result.push(rootPid);
      }

      return [...new Set(result)];
    } catch {
      return (await isProcessAlive(rootPid)) ? [rootPid] : [];
    }
  }

  try {
    const { stdout } = await execFile("ps", ["-eo", "pid=,pgid="], { windowsHide: true, timeout: 10000 });
    const rows = stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
    const pids = [];

    for (const row of rows) {
      const [pidText, pgidText] = row.split(/\s+/u);
      const pid = Number(pidText);
      const pgid = Number(pgidText);
      if (Number.isInteger(pid) && Number.isInteger(pgid) && pgid === rootPid) {
        pids.push(pid);
      }
    }

    return [...new Set(pids)];
  } catch {
    return (await isProcessAlive(rootPid)) ? [rootPid] : [];
  }
}

export async function terminateProcessTree(
  rootPid,
  {
    expectedRootStartTime = null,
    processIdentityOptions = {},
    stageId = null,
    runId = null
  } = {}
) {
  const rootIdentity = await verifyProcessIdentity(rootPid, expectedRootStartTime, processIdentityOptions);
  const canCollectFromRoot = rootIdentity.status === "match" || rootIdentity.status === "dead";
  const targetPids = canCollectFromRoot ? await collectProcessTreePids(rootPid) : [];

  if (rootIdentity.status === "mismatch" || rootIdentity.status === "live-unverified") {
    return {
      attempted: [],
      remaining: [],
      rootIdentity,
      stageId,
      runId,
      terminated: false
    };
  }

  if (targetPids.length === 0) {
    return {
      attempted: [],
      remaining: [],
      rootIdentity,
      stageId,
      runId,
      terminated: false
    };
  }

  if (isWindows()) {
    const pidList = targetPids.join(",");
    try {
      await execFile(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Stop-Process -Id ${pidList} -Force -ErrorAction SilentlyContinue`
        ],
        { windowsHide: true, timeout: 10000 }
      );
    } catch {
      // Ignore cleanup transport errors and verify by polling below.
    }
  } else {
    try {
      process.kill(-rootPid, "SIGTERM");
    } catch {
      // Ignore and fall through to verification.
    }
  }

  const remaining = [];
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const livePids = await collectProcessTreePids(rootPid);
    if (livePids.length === 0) {
      return {
        attempted: targetPids,
        remaining: [],
        rootIdentity,
        stageId,
        runId,
        terminated: true
      };
    }

    remaining.splice(0, remaining.length, ...livePids);

    if (!isWindows()) {
      try {
        process.kill(-rootPid, "SIGKILL");
      } catch {
        // Ignore and keep polling.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    attempted: targetPids,
    remaining,
    rootIdentity,
    stageId,
    runId,
    terminated: false
  };
}

export async function waitForProcessTreeToExit(rootPid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let remaining = await collectProcessTreePids(rootPid);

  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    remaining = await collectProcessTreePids(rootPid);
  }

  return {
    exited: remaining.length === 0,
    remaining
  };
}

function createCommandLine(command, args) {
  return [command, ...args].join(" ");
}

export function buildManagedVitestInvocation({
  forwardedArgs = [],
  workerCount = defaultValidationWorkers
} = {}) {
  const args = ["run"];
  const explicitMaxWorkers =
    forwardedArgs.some((arg) => arg === "--maxWorkers" || arg.startsWith("--maxWorkers=")) ||
    forwardedArgs.some((arg) => arg === "--workers" || arg.startsWith("--workers="));
  const explicitMinWorkers = forwardedArgs.some((arg) => arg === "--minWorkers" || arg.startsWith("--minWorkers="));
  const hasExplicitFileParallelism =
    forwardedArgs.some(
      (arg) =>
        arg === "--fileParallelism" ||
        arg === "--no-file-parallelism" ||
        arg.startsWith("--fileParallelism=") ||
        arg.startsWith("--no-file-parallelism=")
    );

  if (!explicitMaxWorkers) {
    args.push("--maxWorkers", String(workerCount));
  }

  if (!explicitMinWorkers) {
    args.push("--minWorkers", "1");
  }

  if (!hasExplicitFileParallelism) {
    args.push("--no-file-parallelism");
  }

  args.push(...forwardedArgs);

  return {
    command: process.execPath,
    args: [vitestEntryPoint, ...args]
  };
}

export function resolveCommandOverride(envName, defaultCommand) {
  const rawOverride = readEnvText(envName);
  if (!rawOverride) {
    return defaultCommand;
  }

  const parsed = toJson(rawOverride, null);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== "string")) {
    throw new Error(`Environment override ${envName} must be a JSON array of command strings.`);
  }

  return parsed;
}

export function buildManagedCommand({ overrideEnvName, defaultCommand, forwardedArgs = [] } = {}) {
  const overrideCommand = resolveCommandOverride(overrideEnvName, null);
  if (overrideCommand) {
    return {
      command: overrideCommand[0],
      args: [...overrideCommand.slice(1), ...forwardedArgs]
    };
  }

  return {
    command: defaultCommand[0],
    args: [...defaultCommand.slice(1), ...forwardedArgs]
  };
}

function ownerMatchesRecord(ownerRecord, record) {
  if (!record || typeof record !== "object") {
    return false;
  }

  return (
    String(record.runId || "") === String(ownerRecord.runId || "") &&
    Number(record.ownerPid ?? record.pid) === Number(ownerRecord.ownerPid ?? ownerRecord.pid) &&
    String(record.ownerStartTime || "") === String(ownerRecord.ownerStartTime || "")
  );
}

export async function releaseRunLock({ stateDir = getValidationStateDir(), ownerRecord }) {
  const lockDir = getValidationLockDir(stateDir);
  const lockPath = getValidationLockFilePath(stateDir);
  const existing = await readJson(lockPath).catch(() => null);

  if (!ownerMatchesRecord(ownerRecord, existing)) {
    return false;
  }

  await rm(lockDir, { force: true, recursive: true }).catch(() => {});
  return true;
}

export async function acquireRunLock({
  stateDir = getValidationStateDir(),
  commandLabel,
  inspectProcessIdentityImpl = inspectProcessIdentity,
  onBeforePublish = null
}) {
  await mkdir(stateDir, { recursive: true });
  const lockDir = getValidationLockDir(stateDir);
  const lockPath = getValidationLockFilePath(stateDir);
  const ownerStartTime = await getCurrentProcessStartTime();
  const ownerRecord = {
    commandLabel,
    createdAt: nowIso(),
    cwd: process.cwd(),
    nodeVersion: process.version,
    ownerPid: process.pid,
    ownerStartTime,
    pid: process.pid,
    runId: `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    script: path.relative(packageRoot, process.argv[1] || "")
  };
  const candidateDir = path.join(stateDir, `run-lock.${ownerRecord.runId}.candidate`);
  const candidateLockPath = path.join(candidateDir, "lock.json");

  async function publishLock() {
    await rm(candidateDir, { force: true, recursive: true }).catch(() => {});
    await mkdir(candidateDir, { recursive: false });
    await writeJson(candidateLockPath, ownerRecord);
    if (typeof onBeforePublish === "function") {
      await onBeforePublish({ candidateDir, candidateLockPath, lockDir, lockPath, ownerRecord });
    }
    await rename(candidateDir, lockDir);
  }

  async function cleanupCandidate() {
    await rm(candidateDir, { force: true, recursive: true }).catch(() => {});
  }

  async function recoverIfStale() {
    const existing = await readJson(lockPath).catch(() => null);
    if (!existing || typeof existing !== "object") {
      throw new Error("An existing managed validation lock could not be read safely.");
    }

    const existingPid = Number(existing.ownerPid ?? existing.pid);
    const existingStartTime = typeof existing.ownerStartTime === "string" ? existing.ownerStartTime : null;
    const identity = await inspectProcessIdentityImpl(existingPid);
    const ownerDescription = [
      `pid=${existingPid}`,
      existing.commandLabel ? `command=${existing.commandLabel}` : null,
      existing.createdAt ? `created=${existing.createdAt}` : null
    ]
      .filter(Boolean)
      .join(" ");

    if (identity.status === "dead") {
      await rm(lockDir, { force: true, recursive: true }).catch(() => {});
      return true;
    }

    if (identity.status === "live-unverified") {
      throw new Error(`Another managed Docsera validation may already be running (${ownerDescription}); the existing owner cannot be safely verified.`);
    }

    if (!existingStartTime || identity.startTime !== existingStartTime) {
      await rm(lockDir, { force: true, recursive: true }).catch(() => {});
      return true;
    }

    throw new Error(`Another managed Docsera validation is already running (${ownerDescription}).`);
  }

  while (true) {
    try {
      await publishLock();
      break;
    } catch (error) {
      await cleanupCandidate();

      if (error && typeof error === "object" && "code" in error && error.code !== "EEXIST" && error.code !== "EPERM") {
        throw error;
      }

      await recoverIfStale();
    }
  }

  return {
    lockPath,
    ownerRecord,
    async release() {
      return releaseRunLock({
        ownerRecord,
        stateDir
      });
    }
  };
}

function parseDurationOverride(rawValue, fallback, label) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number of milliseconds.`);
  }

  return Math.floor(parsed);
}

async function spawnWatchdog({ rootPid, rootStartTime, runId, stageId, stageLabel, stateDir }) {
  const child = spawn(
    process.execPath,
    [
      watchdogEntryPoint,
      "--root-pid",
      String(rootPid),
      "--root-start-time",
      String(rootStartTime || ""),
      "--run-id",
      String(runId || ""),
      "--stage-id",
      String(stageId || ""),
      "--stage-label",
      stageLabel,
      "--state-dir",
      stateDir
    ],
    {
      cwd: packageRoot,
      detached: true,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      windowsHide: true
    }
  );

  child.unref();
  return child;
}

async function stopWatchdog(child) {
  if (!child) {
    return;
  }

  const exitPromise = new Promise((resolve) => {
    child.once("exit", resolve);
  });

  try {
    if (child.connected) {
      child.send({ type: "stop" });
    }
  } catch {
    // Ignore IPC shutdown errors.
  }

  try {
    child.disconnect();
  } catch {
    // Ignore.
  }

  const gracefulExit = await Promise.race([
    exitPromise.then(() => true),
    sleep(1500).then(() => false)
  ]);

  if (gracefulExit) {
    return;
  }

  try {
    process.kill(child.pid, "SIGKILL");
  } catch {
    // Ignore final watchdog cleanup errors.
  }
}

function printStageHeader(commandName, stageLabel, timeoutMs, detail) {
  console.log(
    `[${commandName}] ${stageLabel} starting at ${nowIso()} (timeout ${formatDuration(timeoutMs)})${detail ? ` - ${detail}` : ""}`
  );
}

function printStageCompletion(commandName, stageLabel, elapsedMs, detail) {
  console.log(`[${commandName}] ${stageLabel} completed in ${formatDuration(elapsedMs)}${detail ? ` - ${detail}` : ""}`);
}

function printStageFailure(commandName, stageLabel, elapsedMs, detail) {
  console.log(`[${commandName}] ${stageLabel} failed after ${formatDuration(elapsedMs)}${detail ? ` - ${detail}` : ""}`);
}

function printStageTimeout(commandName, stageLabel, elapsedMs, detail) {
  console.log(`[${commandName}] ${stageLabel} timed out after ${formatDuration(elapsedMs)}${detail ? ` - ${detail}` : ""}`);
}

function resolveManagedExitCode(result) {
  if (result.kind === "timeout") {
    return 124;
  }

  if (result.kind === "interrupted") {
    return process.exitCode ?? (result.signal === "SIGTERM" ? 143 : 130);
  }

  return result.exitCode ?? 1;
}

async function runManagedStage({
  commandName,
  stageLabel,
  command,
  args,
  timeoutMs,
  stateDir = getValidationStateDir(),
  env = {},
  cleanupLabel = stageLabel,
  runId = null
}) {
  const startedAt = Date.now();
  const stageId = `${runId || commandName}:${stageLabel}:${startedAt}`;
  const stageEnv = {
    ...process.env,
    ...env,
    DOCSERA_MANAGED_STAGE_LABEL: stageLabel,
    DOCSERA_MANAGED_RUN_STARTED_AT: String(startedAt),
    DOCSERA_MANAGED_STATE_DIR: stateDir
  };

  printStageHeader(commandName, stageLabel, timeoutMs, createCommandLine(command, args));

  const child = spawn(command, args, {
    cwd: packageRoot,
    detached: true,
    env: stageEnv,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true
  });
  const exitPromise = new Promise((resolve) => {
    child.once("exit", (exitCode, signal) => {
      resolve({ exitCode, signal });
    });
  });

  child.unref();
  const rootIdentity = await inspectProcessIdentity(child.pid);
  const watchdog = await spawnWatchdog({
    rootPid: child.pid,
    rootStartTime: rootIdentity.startTime,
    runId,
    stageId,
    stageLabel,
    stateDir
  });

  console.log(`[${commandName}] ${stageLabel} watchdog pid=${watchdog.pid} stage pid=${child.pid}`);

  let settled = false;
  let timeoutHandle;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  async function finalize(result) {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeoutHandle);

    const cleanup = await terminateProcessTree(child.pid, {
      expectedRootStartTime: rootIdentity.startTime,
      runId,
      stageId
    });
    const treeGone = await waitForProcessTreeToExit(child.pid);
    await stopWatchdog(watchdog);

    const durationMs = Date.now() - startedAt;
    const finishedResult = {
      ...result,
      cleanup,
      durationMs,
      treeGone
    };

    if (result.kind === "success") {
      printStageCompletion(commandName, cleanupLabel, durationMs, cleanup.terminated ? `cleanup removed ${cleanup.attempted.length} process(es)` : "tree already clear");
    } else if (result.kind === "timeout") {
      printStageTimeout(
        commandName,
        cleanupLabel,
        durationMs,
        cleanup.terminated
          ? `cleanup removed ${cleanup.attempted.length} process(es)`
          : cleanup.rootIdentity?.status === "mismatch" || cleanup.rootIdentity?.status === "live-unverified"
            ? `cleanup skipped because the stage identity could not be safely verified (${cleanup.rootIdentity.status})`
            : `cleanup left ${cleanup.remaining.length} process(es) for a later stale-lock recovery`
      );
    } else if (result.kind === "interrupted") {
      printStageFailure(
        commandName,
        cleanupLabel,
        durationMs,
        cleanup.terminated
          ? `cleanup removed ${cleanup.attempted.length} process(es)`
          : cleanup.rootIdentity?.status === "mismatch" || cleanup.rootIdentity?.status === "live-unverified"
            ? `cleanup skipped because the stage identity could not be safely verified (${cleanup.rootIdentity.status})`
            : `cleanup left ${cleanup.remaining.length} process(es) for a later stale-lock recovery`
      );
    } else {
      printStageFailure(
        commandName,
        cleanupLabel,
        durationMs,
        cleanup.terminated
          ? `cleanup removed ${cleanup.attempted.length} process(es)`
          : cleanup.rootIdentity?.status === "mismatch" || cleanup.rootIdentity?.status === "live-unverified"
            ? `cleanup skipped because the stage identity could not be safely verified (${cleanup.rootIdentity.status})`
            : `cleanup left ${cleanup.remaining.length} process(es) for a later stale-lock recovery`
      );
    }

    resolveDone(finishedResult);
  }

  timeoutHandle = setTimeout(() => {
    void finalize({
      kind: "timeout",
      exitCode: null,
      signal: null,
      stagePid: child.pid,
      watchdogPid: watchdog.pid
    });
  }, timeoutMs);

  void (async () => {
    const { exitCode, signal } = await exitPromise;
    if (settled) {
      return;
    }

    if (exitCode === 0 && !signal) {
      await finalize({
        kind: "success",
        exitCode,
        signal,
        stagePid: child.pid,
        watchdogPid: watchdog.pid
      });
      return;
    }

    const isInterrupted = signal === "SIGINT" || signal === "SIGTERM";
    await finalize({
      kind: isInterrupted ? "interrupted" : "failure",
      exitCode,
      signal,
      stagePid: child.pid,
      watchdogPid: watchdog.pid
    });
  })();

  return {
    childPid: child.pid,
    done,
    rootStartTime: rootIdentity.startTime,
    stageId,
    abort: async (reason = "interrupted") => {
      if (settled) {
        return done;
      }

      await finalize({
        kind: reason,
        exitCode: null,
        signal: reason === "interrupted" ? "SIGINT" : null,
        stagePid: child.pid,
        watchdogPid: watchdog.pid
      });

      return done;
    }
  };
}

async function runPipelineStage({
  commandName,
  stageLabel,
  command,
  args,
  timeoutMs,
  stateDir,
  env
}) {
  const session = await runManagedStage({
    commandName,
    stageLabel,
    command,
    args,
    timeoutMs,
    stateDir,
    env
  });

  return session.done;
}

export async function runManagedVitest({
  forwardedArgs = [],
  stateDir = getValidationStateDir(),
  timeoutMs = parseDurationOverride(readEnvText("DOCSERA_VITEST_STAGE_TIMEOUT_MS"), defaultValidationTestTimeoutMs, "DOCSERA_VITEST_STAGE_TIMEOUT_MS"),
  workerCount = Number(readEnvText("DOCSERA_VITEST_WORKERS") || defaultValidationWorkers),
  registerSignalHandlers = registerInterruptHandlers,
  unregisterSignalHandlers = unregisterInterruptHandlers
} = {}) {
  if (!Number.isInteger(workerCount) || workerCount <= 0) {
    throw new Error("DOCSERA_VITEST_WORKERS must be a positive integer.");
  }

  const lock = await acquireRunLock({
    commandLabel: "test",
    stateDir
  });
  const runContext = {
    currentStage: null,
    currentStagePromise: null
  };
  let cancellationSignal = null;

  const interruptHandler = (signal) => {
    cancellationSignal = signal;
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    if (runContext.currentStage) {
      void runContext.currentStage.abort("interrupted");
      return;
    }

    if (runContext.currentStagePromise) {
      void runContext.currentStagePromise.then((stage) => stage.abort("interrupted")).catch(() => {});
    }
  };

  registerSignalHandlers(interruptHandler);

  const stageResults = [];

  if (cancellationSignal) {
    await lock.release();
    process.off("SIGINT", interruptHandler);
    process.off("SIGTERM", interruptHandler);
    return {
      ok: false,
      stageResults: []
    };
  }

  const vitestOverride = resolveCommandOverride("DOCSERA_VITEST_COMMAND_JSON", null);
  const invocation = vitestOverride
    ? {
        command: vitestOverride[0],
        args: [...vitestOverride.slice(1), ...forwardedArgs]
      }
    : buildManagedVitestInvocation({
        forwardedArgs,
        workerCount
      });

  try {
    runContext.currentStagePromise = runManagedStage({
      commandName: "test",
      stageLabel: "vitest",
      command: invocation.command,
      args: invocation.args,
      timeoutMs,
      stateDir,
      runId: lock.ownerRecord.runId,
      env: {
        DOCSERA_VITEST_WORKERS: String(workerCount)
      }
    });
    runContext.currentStage = await runContext.currentStagePromise;
    const result = await runContext.currentStage.done;
    stageResults.push({ stage: "vitest", ...result });
    if (result.kind !== "success") {
      process.exitCode = resolveManagedExitCode(result);
      return {
        ok: false,
        stageResults
      };
    }

    return {
      ok: true,
      stageResults
    };
  } finally {
    unregisterSignalHandlers(interruptHandler);
    await lock.release();
  }
}

export async function runManagedValidation({
  forwardedVitestArgs = [],
  stateDir = getValidationStateDir(),
  testTimeoutMs = parseDurationOverride(readEnvText("DOCSERA_VALIDATE_TEST_TIMEOUT_MS"), defaultValidationTestTimeoutMs, "DOCSERA_VALIDATE_TEST_TIMEOUT_MS"),
  buildTimeoutMs = parseDurationOverride(readEnvText("DOCSERA_VALIDATE_BUILD_TIMEOUT_MS"), defaultValidationBuildTimeoutMs, "DOCSERA_VALIDATE_BUILD_TIMEOUT_MS"),
  cssTimeoutMs = parseDurationOverride(readEnvText("DOCSERA_VALIDATE_CSS_TIMEOUT_MS"), defaultValidationCssTimeoutMs, "DOCSERA_VALIDATE_CSS_TIMEOUT_MS"),
  workerCount = Number(readEnvText("DOCSERA_VITEST_WORKERS") || defaultValidationWorkers),
  registerSignalHandlers = registerInterruptHandlers,
  unregisterSignalHandlers = unregisterInterruptHandlers
} = {}) {
  if (!Number.isInteger(workerCount) || workerCount <= 0) {
    throw new Error("DOCSERA_VITEST_WORKERS must be a positive integer.");
  }

  const lock = await acquireRunLock({
    commandLabel: "validate",
    stateDir
  });

  const runContext = {
    currentStage: null,
    currentStagePromise: null
  };
  let cancellationSignal = null;

  const interruptHandler = (signal) => {
    cancellationSignal = signal;
    if (!runContext.currentStage) {
      process.exitCode = signal === "SIGINT" ? 130 : 143;
      if (runContext.currentStagePromise) {
        void runContext.currentStagePromise.then((stage) => stage.abort("interrupted")).catch(() => {});
      }
      return;
    }

    process.exitCode = signal === "SIGINT" ? 130 : 143;
    void runContext.currentStage.abort("interrupted");
  };

  registerSignalHandlers(interruptHandler);

  const stageResults = [];

  try {
    if (cancellationSignal) {
      return {
        ok: false,
        stageResults
      };
    }

    const vitestOverride = resolveCommandOverride("DOCSERA_VITEST_COMMAND_JSON", null);
    const testInvocation = vitestOverride
      ? {
          command: vitestOverride[0],
          args: [...vitestOverride.slice(1), ...forwardedVitestArgs]
        }
      : buildManagedVitestInvocation({
          forwardedArgs: forwardedVitestArgs,
          workerCount
        });

    runContext.currentStagePromise = runManagedStage({
      commandName: "validate",
      stageLabel: "vitest",
      command: testInvocation.command,
      args: testInvocation.args,
      timeoutMs: testTimeoutMs,
      stateDir,
      runId: lock.ownerRecord.runId,
      env: {
        DOCSERA_VITEST_WORKERS: String(workerCount)
      }
    });
    runContext.currentStage = await runContext.currentStagePromise;
    const testResult = await runContext.currentStage.done;
    stageResults.push({ stage: "vitest", ...testResult });

    if (testResult.kind !== "success") {
      process.exitCode = resolveManagedExitCode(testResult);
      return {
        ok: false,
        stageResults
      };
    }

    if (cancellationSignal) {
      process.exitCode = cancellationSignal === "SIGINT" ? 130 : 143;
      return {
        ok: false,
        stageResults
      };
    }

    const buildInvocation = buildManagedCommand({
      defaultCommand: [process.execPath, sdkEntryPoint, "build"],
      overrideEnvName: "DOCSERA_VALIDATE_BUILD_COMMAND_JSON"
    });
    runContext.currentStagePromise = runManagedStage({
      commandName: "validate",
      stageLabel: "sdk build",
      command: buildInvocation.command,
      args: buildInvocation.args,
      timeoutMs: buildTimeoutMs,
      stateDir,
      runId: lock.ownerRecord.runId
    });
    runContext.currentStage = await runContext.currentStagePromise;
    const buildResult = await runContext.currentStage.done;
    stageResults.push({ stage: "sdk build", ...buildResult });
    if (buildResult.kind !== "success") {
      process.exitCode = resolveManagedExitCode(buildResult);
      return {
        ok: false,
        stageResults
      };
    }

    if (cancellationSignal) {
      process.exitCode = cancellationSignal === "SIGINT" ? 130 : 143;
      return {
        ok: false,
        stageResults
      };
    }

    const cssInvocation = buildManagedCommand({
      defaultCommand: [process.execPath, inlineRuntimeCssVerifier],
      overrideEnvName: "DOCSERA_VALIDATE_CSS_COMMAND_JSON"
    });
    runContext.currentStagePromise = runManagedStage({
      commandName: "validate",
      stageLabel: "inline-runtime-css verification",
      command: cssInvocation.command,
      args: cssInvocation.args,
      timeoutMs: cssTimeoutMs,
      stateDir,
      runId: lock.ownerRecord.runId
    });
    runContext.currentStage = await runContext.currentStagePromise;
    const cssResult = await runContext.currentStage.done;
    stageResults.push({ stage: "inline-runtime-css verification", ...cssResult });
    if (cssResult.kind !== "success") {
      process.exitCode = resolveManagedExitCode(cssResult);
      return {
        ok: false,
        stageResults
      };
    }

    return {
      ok: true,
      stageResults
    };
  } finally {
    unregisterSignalHandlers(interruptHandler);
    await lock.release();
  }
}

export async function checkLockState({ stateDir = getValidationStateDir() } = {}) {
  const lockPath = getValidationLockFilePath(stateDir);
  const record = await readJson(lockPath).catch(() => null);
  return {
    lockPath,
    record
  };
}

export {
  formatDuration,
  getProcessStartTime,
  isProcessAlive,
  parseDurationOverride,
  printStageCompletion,
  printStageFailure,
  printStageHeader,
  printStageTimeout,
  readJson,
  readTextFile,
  runManagedStage,
  stopWatchdog,
  toJson,
  writeJson
};
