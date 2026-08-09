import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

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

function canonicalPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return canonicalPath(left) === canonicalPath(right);
}

function parseWorktreeList(text) {
  const entries = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") {
      if (current) {
        entries.push(current);
        current = null;
      }
      continue;
    }

    const spaceIndex = line.indexOf(" ");
    const key = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
    const value = spaceIndex === -1 ? "" : line.slice(spaceIndex + 1);

    if (key === "worktree") {
      if (current) {
        entries.push(current);
      }
      current = {
        branch: null,
        detached: false,
        head: null,
        locked: null,
        worktree: value
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (key === "branch") {
      current.branch = value;
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "detached") {
      current.detached = true;
    } else if (key === "locked") {
      current.locked = value || "";
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

function parseCountPair(text) {
  const [leftText, rightText] = text.trim().split(/\s+/);
  const left = Number(leftText);
  const right = Number(rightText);

  if (!Number.isInteger(left) || !Number.isInteger(right)) {
    throw new Error(`Unexpected commit count output: ${text}`);
  }

  return { left, right };
}

function parseArgs(argv) {
  const options = {
    mode: "new"
  };
  const positionalArgs = [];
  let sawNamedOption = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--continuation") {
      sawNamedOption = true;
      options.mode = "continuation";
      continue;
    }

    if (arg === "--new-task") {
      sawNamedOption = true;
      options.mode = "new";
      continue;
    }

    if (arg === "--mode") {
      sawNamedOption = true;
      index += 1;
      options.mode = argv[index];
      continue;
    }

    if (arg.startsWith("--mode=")) {
      sawNamedOption = true;
      options.mode = arg.slice("--mode=".length);
      continue;
    }

    if (arg === "--task-branch" || arg === "--branch") {
      sawNamedOption = true;
      index += 1;
      options.taskBranch = argv[index];
      continue;
    }

    if (arg.startsWith("--task-branch=")) {
      sawNamedOption = true;
      options.taskBranch = arg.slice("--task-branch=".length);
      continue;
    }

    if (arg.startsWith("--branch=")) {
      sawNamedOption = true;
      options.taskBranch = arg.slice("--branch=".length);
      continue;
    }

    if (arg === "--original-base" || arg === "--base") {
      sawNamedOption = true;
      index += 1;
      options.originalBase = argv[index];
      continue;
    }

    if (arg.startsWith("--original-base=")) {
      sawNamedOption = true;
      options.originalBase = arg.slice("--original-base=".length);
      continue;
    }

    if (arg.startsWith("--base=")) {
      sawNamedOption = true;
      options.originalBase = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--expected-head" || arg === "--head" || arg === "--expected-current-head") {
      sawNamedOption = true;
      index += 1;
      options.expectedHead = argv[index];
      continue;
    }

    if (arg.startsWith("--expected-head=")) {
      sawNamedOption = true;
      options.expectedHead = arg.slice("--expected-head=".length);
      continue;
    }

    if (arg.startsWith("--expected-current-head=")) {
      sawNamedOption = true;
      options.expectedHead = arg.slice("--expected-current-head=".length);
      continue;
    }

    if (arg.startsWith("--head=")) {
      sawNamedOption = true;
      options.expectedHead = arg.slice("--head=".length);
      continue;
    }

    if (!arg.startsWith("--")) {
      positionalArgs.push(arg);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (positionalArgs.length > 0) {
    if (sawNamedOption || options.help) {
      throw new Error("Positional task-worktree arguments cannot be mixed with named options.");
    }

    if (positionalArgs.length !== 4) {
      throw new Error(
        "Expected four positional task-worktree arguments in branch/base/head/mode order."
      );
    }

    [options.taskBranch, options.originalBase, options.expectedHead, options.mode] = positionalArgs;
  }

  if (!options.mode) {
    options.mode = "new";
  }

  if (!["new", "continuation"].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }

  return options;
}

function formatFailure(message, details = []) {
  const lines = ["Task worktree guard failed.", message, ...details.filter(Boolean)];
  return lines.join("\n");
}

function validateRequiredOption(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function ensureTaskWorktree({
  cwd = process.cwd(),
  expectedHead,
  mode = "new",
  originalBase,
  taskBranch
} = {}) {
  const repoRoot = canonicalPath(runGit(cwd, ["rev-parse", "--show-toplevel"]));
  const worktrees = parseWorktreeList(runGit(cwd, ["worktree", "list", "--porcelain"]));
  const primaryWorktree = worktrees[0];

  if (!primaryWorktree?.worktree) {
    throw new Error("Unable to determine the primary repository worktree from git.");
  }

  if (samePath(repoRoot, primaryWorktree.worktree)) {
    throw new Error(
      formatFailure("The primary/root checkout is reserved for merge and maintenance work only.", [
        `active worktree: ${repoRoot}`,
        `primary worktree: ${canonicalPath(primaryWorktree.worktree)}`,
        "Task implementation must use a dedicated linked worktree."
      ])
    );
  }

  const activeEntry = worktrees.find((entry) => samePath(entry.worktree, repoRoot));
  if (!activeEntry) {
    throw new Error(`The active worktree ${repoRoot} is not registered in git worktree list.`);
  }

  const currentBranch = runGit(cwd, ["branch", "--show-current"]);
  if (!currentBranch) {
    throw new Error(
      formatFailure("Detached HEAD is not allowed for task worktree validation.", [
        `active worktree: ${repoRoot}`
      ])
    );
  }

  const resolvedTaskBranch = validateRequiredOption(taskBranch, "task branch");
  const resolvedOriginalBase = validateRequiredOption(originalBase, "original base");
  const resolvedExpectedHead = validateRequiredOption(expectedHead, "expected head");

  if (currentBranch !== resolvedTaskBranch) {
    throw new Error(
      formatFailure("The current branch does not match the intended task branch.", [
        `active worktree: ${repoRoot}`,
        `current branch: ${currentBranch}`,
        `expected branch: ${resolvedTaskBranch}`
      ])
    );
  }

  const expectedBranchRef = `refs/heads/${resolvedTaskBranch}`;
  if (activeEntry.branch !== expectedBranchRef) {
    throw new Error(
      formatFailure("The intended task branch is checked out in a different worktree.", [
        `active worktree: ${repoRoot}`,
        `current branch: ${currentBranch}`,
        `checked-out branch worktree: ${activeEntry.branch ?? "(detached)"}`
      ])
    );
  }

  if (!samePath(activeEntry.worktree, repoRoot)) {
    throw new Error(
      formatFailure("The active worktree does not own the intended task branch.", [
        `active worktree: ${repoRoot}`,
        `branch worktree: ${canonicalPath(activeEntry.worktree)}`
      ])
    );
  }

  const status = runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.trim()) {
    throw new Error(
      formatFailure("The task worktree must be clean before validation passes.", [
        `active worktree: ${repoRoot}`,
        "git status --porcelain=v1 --untracked-files=all reported changes."
      ])
    );
  }

  const currentHead = runGit(cwd, ["rev-parse", "HEAD"]);
  const mergeBase = runGit(cwd, ["merge-base", currentHead, resolvedOriginalBase]);

  if (mergeBase !== resolvedOriginalBase) {
    throw new Error(
      formatFailure("The current branch no longer has the original base as its merge base.", [
        `active worktree: ${repoRoot}`,
        `original base: ${resolvedOriginalBase}`,
        `merge base: ${mergeBase}`
      ])
    );
  }

  if (mode === "new") {
    if (currentHead !== resolvedOriginalBase) {
      throw new Error(
        formatFailure("A new task must start from the stated base commit.", [
          `active worktree: ${repoRoot}`,
          `current head: ${currentHead}`,
          `stated base: ${resolvedOriginalBase}`
        ])
      );
    }

    if (resolvedExpectedHead !== resolvedOriginalBase) {
      throw new Error(
        formatFailure("New-task validation expects the supplied expected head to match the base commit.", [
          `expected head: ${resolvedExpectedHead}`,
          `stated base: ${resolvedOriginalBase}`
        ])
      );
    }

    const counts = parseCountPair(runGit(cwd, ["rev-list", "--left-right", "--count", `${resolvedOriginalBase}...${currentHead}`]));
    if (counts.left !== 0 || counts.right !== 0) {
      throw new Error(
        formatFailure("A new task branch must be zero commits ahead and zero commits behind the stated base.", [
          `ahead: ${counts.right}`,
          `behind: ${counts.left}`
        ])
      );
    }
  } else {
    if (currentHead !== resolvedExpectedHead) {
      throw new Error(
        formatFailure("Continuation validation requires the current HEAD to match the explicitly supplied expected HEAD.", [
          `active worktree: ${repoRoot}`,
          `current head: ${currentHead}`,
          `expected head: ${resolvedExpectedHead}`
        ])
      );
    }
  }

  return {
    activeWorktree: repoRoot,
    currentBranch,
    currentHead,
    mergeBase,
    mode,
    originalBase: resolvedOriginalBase,
    primaryWorktree: canonicalPath(primaryWorktree.worktree),
    taskBranch: resolvedTaskBranch,
    expectedHead: resolvedExpectedHead
  };
}

function printSuccess(result) {
  console.log("Task worktree guard passed.");
  console.log(`mode: ${result.mode}`);
  console.log(`active worktree: ${result.activeWorktree}`);
  console.log(`primary worktree: ${result.primaryWorktree}`);
  console.log(`branch: ${result.taskBranch}`);
  console.log(`current branch: ${result.currentBranch}`);
  console.log(`original base: ${result.originalBase}`);
  console.log(`expected head: ${result.expectedHead}`);
  console.log(`current head: ${result.currentHead}`);
  console.log(`merge base: ${result.mergeBase}`);
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  node scripts/ensure-task-worktree.mjs --task-branch <branch> --original-base <sha> --expected-head <sha> [--mode new|continuation]",
      "",
      "Required options:",
      "  --task-branch, --branch           Intended task branch name.",
      "  --original-base, --base           Original base commit for the task.",
      "  --expected-head, --head           Expected current HEAD for the active worktree.",
      "",
      "Mode:",
      "  --mode new                        New-task validation. Requires HEAD to equal the original base and the branch to be zero commits ahead and behind.",
      "  --mode continuation               Existing-task continuation validation. Requires HEAD to equal the explicitly supplied expected head.",
      "",
      "Aliases:",
      "  --continuation                    Shorthand for --mode continuation.",
      "  --new-task                        Shorthand for --mode new."
    ].join("\n")
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const result = ensureTaskWorktree(options);
  printSuccess(result);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (invokedPath && import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { ensureTaskWorktree, parseArgs, parseCountPair, parseWorktreeList };
