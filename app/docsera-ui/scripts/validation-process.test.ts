/* @vitest-environment node */

import { spawn } from "child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import process from "process";
import { describe, expect, it } from "vitest";
import {
  acquireRunLock,
  buildManagedVitestInvocation,
  buildManagedSpawnOptions,
  getValidationLockFilePath,
  inspectProcessIdentity,
  isProcessAlive,
  releaseRunLock,
  runManagedStage,
  terminateProcessTree,
  waitForProcessTreeToExit
} from "./validation-process.mjs";

const packageRoot = process.cwd();
const scriptDir = path.join(packageRoot, "scripts");
const fixtureScript = path.join(packageRoot, "scripts", "validation-fixture.mjs");
const runManagedVitestScript = path.join(packageRoot, "scripts", "run-managed-vitest.mjs");
const runManagedValidateScript = path.join(packageRoot, "scripts", "run-managed-validate.mjs");

function createTempDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function spawnNodeProcess(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let stdout = "";
  let stderr = "";
  const exitPromise = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return {
    child,
    async output() {
      const { code, signal } = await exitPromise;
      return { code, signal, stderr, stdout };
    },
    stdoutRef: () => stdout,
    stderrRef: () => stderr
  };
}

async function waitFor(predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition.");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function waitForLockCleared(stateDir, timeoutMs = 15000) {
  const lockPath = getValidationLockFilePath(stateDir);
  return waitFor(() => !existsSync(lockPath), timeoutMs);
}

async function writeLockRecord(stateDir, record) {
  const lockDir = path.join(stateDir, "run-lock");
  await rm(lockDir, { force: true, recursive: true }).catch(() => {});
  await mkdir(lockDir, { recursive: true });
  await writeFile(path.join(lockDir, "lock.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

async function waitForProcessGone(pid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isProcessAlive(pid))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function forceKillProcess(pid) {
  if (!pid || pid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("exit", () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Ignore.
  }
}

function extractStagePid(text, stageLabel) {
  const match = text.match(new RegExp(`\\[.*?\\] ${stageLabel} watchdog pid=(\\d+) stage pid=(\\d+)`));
  if (!match) {
    return null;
  }

  return {
    stagePid: Number(match[2]),
    watchdogPid: Number(match[1])
  };
}

async function writeStaleLock(stateDir) {
  await writeLockRecord(stateDir, {
    commandLabel: "stale-test",
    createdAt: "2000-01-01T00:00:00.000Z",
    ownerPid: 999999,
    ownerStartTime: "2000-01-01T00:00:00.000Z",
    pid: 999999,
    runId: "stale-run"
  });
}

async function getCurrentProcessIdentity() {
  const identity = await inspectProcessIdentity(process.pid);
  if (!identity.alive || !identity.startTime) {
    throw new Error("Current process identity was unavailable during the test.");
  }
  return identity;
}

describe("validation-process", () => {
  it("bounds Vitest workers and file parallelism by default", () => {
    const invocation = buildManagedVitestInvocation();
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args.slice(0, 4)).toEqual([
      path.join(packageRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--maxWorkers",
      "2"
    ]);
    expect(invocation.args).toContain("--minWorkers");
    expect(invocation.args).toContain("1");
    expect(invocation.args).toContain("--no-file-parallelism");
  });

  it("adds the default max worker bound when only minWorkers is supplied", () => {
    const invocation = buildManagedVitestInvocation({
      forwardedArgs: ["--minWorkers", "1"]
    });
    expect(invocation.args).toContain("--maxWorkers");
    expect(invocation.args).toContain("2");
    expect(invocation.args.slice(-2)).toEqual(["--minWorkers", "1"]);
  });

  it("adds the default minimum worker bound when only maxWorkers is supplied", () => {
    const invocation = buildManagedVitestInvocation({
      forwardedArgs: ["--maxWorkers", "1"]
    });
    expect(invocation.args).toEqual([
      path.join(packageRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--minWorkers",
      "1",
      "--no-file-parallelism",
      "--maxWorkers",
      "1"
    ]);
  });

  it("preserves explicit max and min worker arguments", () => {
    const invocation = buildManagedVitestInvocation({
      forwardedArgs: ["--maxWorkers", "3", "--minWorkers", "2"]
    });
    expect(invocation.args).toEqual([
      path.join(packageRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--no-file-parallelism",
      "--maxWorkers",
      "3",
      "--minWorkers",
      "2"
    ]);
  });

  it("uses the managed workers flag as the default maximum when Vitest maxWorkers is not supplied", () => {
    const invocation = buildManagedVitestInvocation({
      forwardedArgs: ["src/client/app/App.test.tsx", "-t", "navigation", "--reporter", "dot"],
      workerCount: 4
    });
    expect(invocation.args).toEqual([
      path.join(packageRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--maxWorkers",
      "4",
      "--minWorkers",
      "1",
      "--no-file-parallelism",
      "src/client/app/App.test.tsx",
      "-t",
      "navigation",
      "--reporter",
      "dot"
    ]);
  });

  it("keeps managed stages attached on Windows and detached on POSIX without exposing a console", () => {
    const windowsOptions = buildManagedSpawnOptions({
      platform: "win32",
      stdio: ["ignore", "inherit", "inherit"]
    });
    expect(windowsOptions).toMatchObject({
      cwd: packageRoot,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true
    });
    expect(windowsOptions).not.toHaveProperty("detached");

    expect(
      buildManagedSpawnOptions({
        platform: "linux",
        stdio: ["ignore", "inherit", "inherit"]
      })
    ).toMatchObject({
      cwd: packageRoot,
      detached: true,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true
    });
  });

  it("preserves an explicit Vitest maxWorkers override over the managed workers flag", () => {
    const invocation = buildManagedVitestInvocation({
      forwardedArgs: ["src/client/app/App.test.tsx", "--maxWorkers", "1"],
      workerCount: 4
    });
    expect(invocation.args).toEqual([
      path.join(packageRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--minWorkers",
      "1",
      "--no-file-parallelism",
      "src/client/app/App.test.tsx",
      "--maxWorkers",
      "1"
    ]);
  });

  it("allows only one acquisition when two contenders race during atomic publication", async () => {
    const stateDir = await createTempDir("docsera-lock-race-");
    let candidatePublished = null;
    const firstCandidateReady = new Promise((resolve) => {
      candidatePublished = resolve;
    });
    let releaseFirstPublish = null;
    const firstPublishBlocked = new Promise((resolve) => {
      releaseFirstPublish = resolve;
    });

    const firstAttempt = acquireRunLock({
      commandLabel: "test",
      onBeforePublish: async () => {
        candidatePublished();
        await firstPublishBlocked;
      },
      stateDir
    }).then(
      (lock) => ({ kind: "success", lock }),
      (error) => ({ error, kind: "error" })
    );

    await firstCandidateReady;

    const secondLock = await acquireRunLock({ commandLabel: "validate", stateDir });
    releaseFirstPublish();

    const firstResult = await firstAttempt;
    expect(firstResult.kind).toBe("error");
    expect(String(firstResult.error)).toContain("already running");

    const lockState = await readJson(secondLock.lockPath);
    expect(lockState.commandLabel).toBe("validate");
    await secondLock.release();
  });

  it("fails closed when a live owner cannot be safely verified", async () => {
    const stateDir = await createTempDir("docsera-lock-live-unverified-");
    const currentIdentity = await getCurrentProcessIdentity();
    await writeLockRecord(stateDir, {
      commandLabel: "test",
      createdAt: "2000-01-01T00:00:00.000Z",
      ownerPid: currentIdentity.pid,
      ownerStartTime: currentIdentity.startTime,
      pid: currentIdentity.pid,
      runId: "live-owner"
    });

    await expect(
      acquireRunLock({
        commandLabel: "validate",
        inspectProcessIdentityImpl: async () => ({
          alive: true,
          pid: currentIdentity.pid,
          startTime: null,
          status: "live-unverified"
        }),
        stateDir
      })
    ).rejects.toThrow("cannot be safely verified");

    expect(await readJson(getValidationLockFilePath(stateDir))).toMatchObject({
      runId: "live-owner"
    });
  });

  it("recovers a stale lock when the recorded owner is confirmed dead", async () => {
    const stateDir = await createTempDir("docsera-lock-stale-dead-");
    await writeStaleLock(stateDir);

    const lock = await acquireRunLock({ commandLabel: "test", stateDir });
    const lockState = await readJson(lock.lockPath);
    expect(lockState.commandLabel).toBe("test");
    await lock.release();
  });

  it("recovers a stale lock when the pid is live but the start identity does not match", async () => {
    const stateDir = await createTempDir("docsera-lock-stale-mismatch-");
    const currentIdentity = await getCurrentProcessIdentity();
    await writeLockRecord(stateDir, {
      commandLabel: "test",
      createdAt: "2000-01-01T00:00:00.000Z",
      ownerPid: currentIdentity.pid,
      ownerStartTime: "1999-01-01T00:00:00.000Z",
      pid: currentIdentity.pid,
      runId: "stale-reused-pid"
    });

    const lock = await acquireRunLock({ commandLabel: "validate", stateDir });
    const lockState = await readJson(lock.lockPath);
    expect(lockState.commandLabel).toBe("validate");
    await lock.release();
  });

  it("releases the lock only for the actual owner", async () => {
    const stateDir = await createTempDir("docsera-lock-release-owner-");
    const lock = await acquireRunLock({ commandLabel: "test", stateDir });
    expect(await lock.release()).toBe(true);
    await waitForLockCleared(stateDir);
  });

  it("does not release a newer lock when an old owner tries again", async () => {
    const stateDir = await createTempDir("docsera-lock-release-old-");
    const firstLock = await acquireRunLock({ commandLabel: "test", stateDir });
    expect(await firstLock.release()).toBe(true);

    const secondLock = await acquireRunLock({ commandLabel: "validate", stateDir });
    expect(await firstLock.release()).toBe(false);
    expect(await readJson(secondLock.lockPath)).toMatchObject({
      runId: secondLock.ownerRecord.runId
    });
    await secondLock.release();
  });

  it("leaves the live lock intact when release uses a different run identity", async () => {
    const stateDir = await createTempDir("docsera-lock-release-different-");
    const lock = await acquireRunLock({ commandLabel: "test", stateDir });
    expect(
      await releaseRunLock({
        ownerRecord: {
          ...lock.ownerRecord,
          runId: `${lock.ownerRecord.runId}-different`
        },
        stateDir
      })
    ).toBe(false);
    expect(await readJson(lock.lockPath)).toMatchObject({
      runId: lock.ownerRecord.runId
    });
    await lock.release();
  });

  it("leaves the live lock intact when release uses a non-owner pid identity", async () => {
    const stateDir = await createTempDir("docsera-lock-release-non-owner-");
    const lock = await acquireRunLock({ commandLabel: "test", stateDir });
    expect(
      await releaseRunLock({
        ownerRecord: {
          ...lock.ownerRecord,
          ownerPid: lock.ownerRecord.ownerPid + 1,
          pid: lock.ownerRecord.pid + 1
        },
        stateDir
      })
    ).toBe(false);
    expect(await readJson(lock.lockPath)).toMatchObject({
      runId: lock.ownerRecord.runId
    });
    await lock.release();
  });

  it("runs a successful stage and cleans up the tree", async () => {
    const stateDir = await createTempDir("docsera-stage-success-");
    const fixtureState = path.join(stateDir, "success.json");
    const session = await runManagedStage({
      commandName: "test",
      stageLabel: "fixture-success",
      command: process.execPath,
      args: [fixtureScript, "success", "--state-file", fixtureState],
      timeoutMs: 10000,
      stateDir
    });

    const result = await session.done;
    expect(result.kind).toBe("success");
    expect(result.cleanup.terminated).toBe(false);
    expect(await waitForProcessGone(session.childPid)).toBe(true);
  });

  it("fails a stage with the child exit code and leaves no descendants", async () => {
    const stateDir = await createTempDir("docsera-stage-failure-");
    const fixtureState = path.join(stateDir, "failure.json");
    const session = await runManagedStage({
      commandName: "test",
      stageLabel: "fixture-failure",
      command: process.execPath,
      args: [fixtureScript, "failure", "--state-file", fixtureState, "--exit-code", "17"],
      timeoutMs: 10000,
      stateDir
    });

    const result = await session.done;
    expect(result.kind).toBe("failure");
    expect(result.exitCode).toBe(17);
    expect(await waitForProcessGone(session.childPid)).toBe(true);
  });

  it("times out a nested child stage and removes both the child and descendant", async () => {
    const stateDir = await createTempDir("docsera-stage-timeout-");
    const fixtureState = path.join(stateDir, "timeout.json");
    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
      cwd: packageRoot,
      stdio: "ignore",
      windowsHide: true
    });

    const session = await runManagedStage({
      commandName: "validate",
      stageLabel: "fixture-timeout",
      command: process.execPath,
      args: [fixtureScript, "hold", "--state-file", fixtureState, "--nested", "--ignore-signals"],
      timeoutMs: 500,
      stateDir
    });

    const state = await waitFor(() => readJson(fixtureState).catch(() => null));
    const result = await session.done;
    expect(result.kind).toBe("timeout");
    expect(state.nestedPid).toBeGreaterThan(0);
    expect(await waitForProcessTreeToExit(session.childPid)).toEqual({ exited: true, remaining: [] });
    expect(await waitForProcessGone(session.childPid)).toBe(true);
    expect(await waitForProcessGone(state.nestedPid)).toBe(true);
    expect(await isProcessAlive(unrelated.pid)).toBe(true);
    await forceKillProcess(unrelated.pid);
    await waitForProcessGone(unrelated.pid);
  });

  it("forwards targeted Vitest arguments to the managed test command", async () => {
    const stateDir = await createTempDir("docsera-vitest-forward-");
    const fixtureState = path.join(stateDir, "argv.json");
    const runner = spawnNodeProcess(
      [runManagedVitestScript, "src/client/app/App.test.tsx", "-t", "navigation", "--reporter", "dot", "--testTimeout", "1234", "--maxWorkers", "1"],
      {
        DOCSERA_VALIDATION_STATE_DIR: stateDir,
        DOCSERA_VITEST_COMMAND_JSON: JSON.stringify([
          process.execPath,
          fixtureScript,
          "argv",
          "--state-file",
          fixtureState
        ])
      }
    );

    const output = await runner.output();
    expect(output.code).toBe(0);
    const state = await readJson(fixtureState);
    expect(state.argv).toEqual([
      "src/client/app/App.test.tsx",
      "-t",
      "navigation",
      "--reporter",
      "dot",
      "--testTimeout",
      "1234",
      "--maxWorkers",
      "1"
    ]);
  });

  it("rejects overlapping managed test invocations", async () => {
    const stateDir = await createTempDir("docsera-overlap-");
    const firstState = path.join(stateDir, "first.json");
    const first = spawnNodeProcess(
      [runManagedVitestScript, "--state-dir", stateDir],
      {
        DOCSERA_VITEST_COMMAND_JSON: JSON.stringify([
          process.execPath,
          fixtureScript,
          "hold",
          "--state-file",
          firstState,
          "--nested",
          "--ignore-signals"
        ])
      }
    );

    await waitFor(() => readJson(firstState).catch(() => null));

    const second = spawnNodeProcess(
      [runManagedVitestScript, "--state-dir", stateDir],
      {
        DOCSERA_VITEST_COMMAND_JSON: JSON.stringify([
          process.execPath,
          fixtureScript,
          "success"
        ])
      }
    );

    const secondOutput = await second.output();
    expect(secondOutput.code).not.toBe(0);
    expect(secondOutput.stdout + secondOutput.stderr).toContain("already running");

    const firstStateRecord = await readJson(firstState);
    await forceKillProcess(first.child.pid);
    await waitForProcessTreeToExit(first.child.pid);
    await waitForProcessGone(first.child.pid);
    if (firstStateRecord?.nestedPid) {
      await waitForProcessGone(firstStateRecord.nestedPid);
    }
  }, 15000);

  it("cleans up after cooperative interruption", async () => {
    const stateDir = await createTempDir("docsera-interrupt-");
    const fixtureState = path.join(stateDir, "interrupt.json");
    const registeredHandlers = new Map();
    const previousExitCode = process.exitCode;
    process.env.DOCSERA_VITEST_COMMAND_JSON = JSON.stringify([
      process.execPath,
      fixtureScript,
      "hold",
      "--state-file",
      fixtureState,
      "--nested",
      "--ignore-signals"
    ]);
    const runPromise = import("./validation-process.mjs").then(({ runManagedVitest }) =>
      runManagedVitest({
        registerSignalHandlers(handler) {
          registeredHandlers.set("SIGINT", handler);
          registeredHandlers.set("SIGTERM", handler);
        },
        stateDir,
        timeoutMs: 60000,
        unregisterSignalHandlers() {
          registeredHandlers.clear();
        }
      })
    );
    const state = await waitFor(() => readJson(fixtureState).catch(() => null));
    const startedAt = Date.now();
    registeredHandlers.get("SIGINT")?.("SIGINT");
    const result = await runPromise;
    const elapsedMs = Date.now() - startedAt;

    expect(result.ok).toBe(false);
    expect(process.exitCode).toBe(130);
    expect(elapsedMs).toBeLessThan(10000);
    expect(result.stageResults.at(-1)?.kind).toBe("interrupted");
    expect(await waitForProcessGone(state.nestedPid)).toBe(true);
    expect(await waitForLockCleared(stateDir)).toBe(true);
    process.exitCode = previousExitCode;
    delete process.env.DOCSERA_VITEST_COMMAND_JSON;
  }, 15000);

  it("releases the watchdog and cleans up after forced parent death", async () => {
    const stateDir = await createTempDir("docsera-parent-death-");
    const fixtureState = path.join(stateDir, "death.json");
    const runner = spawnNodeProcess(
      [runManagedValidateScript, "--state-dir", stateDir, "--test-timeout-ms", "60000", "--build-timeout-ms", "60000", "--css-timeout-ms", "60000"],
      {
        DOCSERA_VITEST_COMMAND_JSON: JSON.stringify([
          process.execPath,
          fixtureScript,
          "hold",
          "--state-file",
          fixtureState,
          "--nested",
          "--ignore-signals"
        ]),
        DOCSERA_VALIDATE_BUILD_COMMAND_JSON: JSON.stringify([
          process.execPath,
          fixtureScript,
          "success"
        ]),
        DOCSERA_VALIDATE_CSS_COMMAND_JSON: JSON.stringify([
          process.execPath,
          fixtureScript,
          "success"
        ])
      }
    );

    const output = await waitFor(() => {
      const text = runner.stdoutRef();
      return text.includes("watchdog pid=") ? text : null;
    });
    const pids = extractStagePid(output, "vitest");
    expect(pids).not.toBeNull();

    const state = await waitFor(() => readJson(fixtureState).catch(() => null));
    await forceKillProcess(runner.child.pid);

    expect(await waitForProcessGone(runner.child.pid)).toBe(true);
    expect(await waitForProcessGone(pids.stagePid)).toBe(true);
    expect(await waitForProcessGone(pids.watchdogPid)).toBe(true);
    expect(await waitForProcessGone(state.nestedPid)).toBe(true);
  });

  it("does not kill an unrelated process when the expected stage identity mismatches", async () => {
    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
      cwd: packageRoot,
      stdio: "ignore",
      windowsHide: true
    });

    const cleanup = await terminateProcessTree(unrelated.pid, {
      expectedRootStartTime: "1999-01-01T00:00:00.000Z",
      runId: "test-run",
      stageId: "test-stage"
    });

    expect(cleanup.terminated).toBe(false);
    expect(cleanup.rootIdentity.status).toBe("mismatch");
    expect(await isProcessAlive(unrelated.pid)).toBe(true);

    await forceKillProcess(unrelated.pid);
    await waitForProcessGone(unrelated.pid);
  });

  it("preserves unrelated Node processes during cleanup", async () => {
    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
      cwd: packageRoot,
      stdio: "ignore",
      windowsHide: true
    });

    const stateDir = await createTempDir("docsera-unrelated-");
    const session = await runManagedStage({
      commandName: "test",
      stageLabel: "fixture-unrelated",
      command: process.execPath,
      args: [fixtureScript, "hold", "--nested", "--ignore-signals"],
      timeoutMs: 500,
      stateDir
    });

    const result = await session.done;
    expect(result.kind).toBe("timeout");
    expect(await isProcessAlive(unrelated.pid)).toBe(true);
    await forceKillProcess(unrelated.pid);
    await waitForProcessGone(unrelated.pid);
  });
});
