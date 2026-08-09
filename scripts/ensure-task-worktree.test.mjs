import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";

const repoRoot = process.cwd();
const guardScriptPath = path.join(repoRoot, "scripts", "ensure-task-worktree.mjs");
const packageJsonPath = path.join(repoRoot, "package.json");

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`git ${args.join(" ")} failed${details ? `:\n${details}` : "."}`);
  }

  return String(result.stdout ?? "").trim();
}

function runGuardWithNode(cwd, args) {
  const result = spawnSync(process.execPath, [guardScriptPath, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });

  return {
    code: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? ""
  };
}

function runGuardWithNpm(cwd, args) {
  return runGuardWithNpmInShell(cwd, args, process.platform === "win32" ? "cmd" : "direct");
}

function runGuardWithNpmInShell(cwd, args, shell) {
  const npmCommand = `npm run ensure:task-worktree -- ${args.join(" ")}`;
  let result;

  if (shell === "cmd") {
    result = spawnSync("cmd.exe", ["/d", "/s", "/c", npmCommand], {
      cwd,
      encoding: "utf8",
      windowsHide: true
    });
  } else if (shell === "powershell") {
    result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", npmCommand], {
      cwd,
      encoding: "utf8",
      windowsHide: true
    });
  } else {
    result = spawnSync("npm", ["run", "ensure:task-worktree", "--", ...args], {
      cwd,
      encoding: "utf8",
      windowsHide: true
    });
  }

  return {
    code: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? ""
  };
}

function snapshotWorktree(cwd) {
  return {
    branch: runGit(cwd, ["branch", "--show-current"]),
    head: runGit(cwd, ["rev-parse", "HEAD"]),
    status: runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]),
    worktrees: runGit(cwd, ["worktree", "list", "--porcelain"])
  };
}

async function cleanupFixture(baseDir) {
  await rm(baseDir, { force: true, recursive: true });
}

async function copyWrapperFiles(targetDir) {
  await mkdir(path.join(targetDir, "scripts"), { recursive: true });
  await copyFile(packageJsonPath, path.join(targetDir, "package.json"));
  await copyFile(guardScriptPath, path.join(targetDir, "scripts", "ensure-task-worktree.mjs"));
}

async function createRepoFixture({
  branchName = "fix/task-worktree-preflight-guard",
  copyWrapperFilesToRepo = false,
  createTaskWorktree = true
} = {}) {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "docsera-task-worktree-guard-"));
  const repoRoot = path.join(baseDir, "repo");
  const taskWorktree = path.join(baseDir, "task");

  await mkdir(repoRoot, { recursive: true });
  runGit(repoRoot, ["init", "-b", "main"]);
  runGit(repoRoot, ["config", "user.name", "Docsera Test"]);
  runGit(repoRoot, ["config", "user.email", "docsera@example.com"]);
  await writeFile(path.join(repoRoot, "README.md"), "base\n", "utf8");
  runGit(repoRoot, ["add", "README.md"]);
  runGit(repoRoot, ["commit", "-m", "base"]);
  let baseHead = runGit(repoRoot, ["rev-parse", "HEAD"]);

  if (copyWrapperFilesToRepo) {
    await copyWrapperFiles(repoRoot);
    runGit(repoRoot, ["add", "package.json", "scripts/ensure-task-worktree.mjs"]);
    runGit(repoRoot, ["commit", "-m", "add task worktree guard wrapper"]);
    baseHead = runGit(repoRoot, ["rev-parse", "HEAD"]);
  }

  if (createTaskWorktree) {
    runGit(repoRoot, ["worktree", "add", "-b", branchName, taskWorktree, baseHead]);
  }

  return {
    baseDir,
    baseHead,
    cleanup: () => cleanupFixture(baseDir),
    repoRoot,
    taskWorktree
  };
}

function createOrphanBaseCommit(repoRoot) {
  const refName = "refs/heads/scratch-base";
  const tree = runGit(repoRoot, ["write-tree"]);
  const head = runGit(repoRoot, ["commit-tree", tree, "-m", "orphan"]);
  runGit(repoRoot, ["update-ref", refName, head]);

  return { head };
}

function assertGuardFailure(result, expectedText) {
  assert.notEqual(result.code, 0);
  assert.match(result.stdout + result.stderr, expectedText instanceof RegExp ? expectedText : new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

describe("ensure-task-worktree", () => {
  it("rejects the primary/root checkout for task validation", async () => {
    const fixture = await createRepoFixture({ createTaskWorktree: false });
    const before = snapshotWorktree(fixture.repoRoot);

    try {
      const result = runGuardWithNode(fixture.repoRoot, [
        "--task-branch",
        "main",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "new"
      ]);
      assertGuardFailure(result, /primary\/root checkout/i);
      assert.match(result.stdout + result.stderr, /dedicated linked worktree/i);
      assert.deepEqual(snapshotWorktree(fixture.repoRoot), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("passes a clean new-task linked worktree at the stated base", async () => {
    const fixture = await createRepoFixture();
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      const result = runGuardWithNode(fixture.taskWorktree, [
        "--task-branch",
        "fix/task-worktree-preflight-guard",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "new"
      ]);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /Task worktree guard passed\./);
      assert.match(result.stdout, /mode: new/);
      assert.match(
        result.stdout,
        new RegExp(`active worktree: ${fixture.taskWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")
      );
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("passes a clean continuation worktree ahead of base when the expected HEAD matches", async () => {
    const fixture = await createRepoFixture();
    await writeFile(path.join(fixture.taskWorktree, "content.txt"), "continuation\n", "utf8");
    runGit(fixture.taskWorktree, ["add", "content.txt"]);
    runGit(fixture.taskWorktree, ["commit", "-m", "continuation"]);
    const expectedHead = runGit(fixture.taskWorktree, ["rev-parse", "HEAD"]);
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      const result = runGuardWithNode(fixture.taskWorktree, [
        "--task-branch",
        "fix/task-worktree-preflight-guard",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        expectedHead,
        "--mode",
        "continuation"
      ]);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /Task worktree guard passed\./);
      assert.match(result.stdout, /mode: continuation/);
      assert.match(result.stdout, new RegExp(`expected head: ${expectedHead}`));
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects a continuation when the expected HEAD is stale", async () => {
    const fixture = await createRepoFixture();
    await writeFile(path.join(fixture.taskWorktree, "content.txt"), "continuation\n", "utf8");
    runGit(fixture.taskWorktree, ["add", "content.txt"]);
    runGit(fixture.taskWorktree, ["commit", "-m", "continuation"]);
    const currentHead = runGit(fixture.taskWorktree, ["rev-parse", "HEAD"]);
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      const result = runGuardWithNode(fixture.taskWorktree, [
        "--task-branch",
        "fix/task-worktree-preflight-guard",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "continuation"
      ]);
      assertGuardFailure(result, /explicitly supplied expected head/i);
      assert.match(result.stdout + result.stderr, new RegExp(`current head: ${currentHead}`));
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects a wrong task branch even when the worktree is clean", async () => {
    const fixture = await createRepoFixture();
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      const result = runGuardWithNode(fixture.taskWorktree, [
        "--task-branch",
        "fix/wrong-task-branch",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "new"
      ]);
      assertGuardFailure(result, /current branch does not match the intended task branch/i);
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects a dirty task worktree without mutating repository state", async () => {
    const fixture = await createRepoFixture();
    await writeFile(path.join(fixture.taskWorktree, "content.txt"), "dirty\n", "utf8");
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      const result = runGuardWithNode(fixture.taskWorktree, [
        "--task-branch",
        "fix/task-worktree-preflight-guard",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "new"
      ]);
      assertGuardFailure(result, /task worktree must be clean/i);
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an invalid original merge-base relationship", async () => {
    const fixture = await createRepoFixture();
    const unrelated = createOrphanBaseCommit(fixture.repoRoot);
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      assert.equal(runGit(fixture.repoRoot, ["cat-file", "-t", unrelated.head]), "commit");
      const result = runGuardWithNode(fixture.taskWorktree, [
        "--task-branch",
        "fix/task-worktree-preflight-guard",
        "--original-base",
        unrelated.head,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "continuation"
      ]);
      assertGuardFailure(result, /git merge-base .* failed/i);
      assert.doesNotMatch(result.stdout + result.stderr, /not a valid (object|commit)/i);
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("exposes the same guard behavior through the repository npm wrapper", async () => {
    const fixture = await createRepoFixture({ copyWrapperFilesToRepo: true });
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      const result = runGuardWithNpm(fixture.taskWorktree, [
        "--task-branch",
        "fix/task-worktree-preflight-guard",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "new"
      ]);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /Task worktree guard passed\./);
      assert.match(result.stdout, /mode: new/);
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("accepts the PowerShell-forwarded positional npm wrapper arguments used by real Windows task worktrees", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const fixture = await createRepoFixture({ copyWrapperFilesToRepo: true });
    const before = snapshotWorktree(fixture.taskWorktree);

    try {
      const result = runGuardWithNpmInShell(fixture.taskWorktree, [
        "--task-branch",
        "fix/task-worktree-preflight-guard",
        "--original-base",
        fixture.baseHead,
        "--expected-head",
        fixture.baseHead,
        "--mode",
        "new"
      ], "powershell");
      assert.equal(result.code, 0);
      assert.match(result.stdout, /Task worktree guard passed\./);
      assert.match(result.stdout, /mode: new/);
      assert.deepEqual(snapshotWorktree(fixture.taskWorktree), before);
    } finally {
      await fixture.cleanup();
    }
  });
});
