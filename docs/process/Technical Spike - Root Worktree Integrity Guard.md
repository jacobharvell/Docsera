# Technical Spike - Root Worktree Integrity Guard

Date: 2026-08-08

## Question Addressed

What is the smallest reliable repository-supported mechanism that can prevent or immediately block accidental task edits in the merge-only root checkout `C:\Dev\Docsera`, while still allowing approved merge and repository-maintenance operations there?

## Demonstrated Failure

The August 6 incident was not a missing policy statement. The repo already had merge-only and dedicated-worktree guidance, yet a fresh Codex session still began from `C:\Dev\Docsera`, modified `PageEditorHostRuntime.tsx` in the root checkout, and left the dedicated task worktree clean. The root state then had to be preserved separately.

Relevant evidence:

- `preserve/root-editor-runtime-mixed-state-2026-08-05`
- `preserve/root-editor-runtime-mixed-state-2026-08-06`
- commit `4bf2d45` preserved the unexpected root editor runtime mixed state
- commit `055323d` added the worktree-branch-discipline wording to `AGENTS.md`

## Current Repo Rules

`AGENTS.md` already says:

- `C:\Dev\Docsera` is merge-only and must stay on clean `main`
- every task must use one dedicated branch and one dedicated worktree
- before implementation begins, the task branch must be created from the stated base ref and verified against that base
- the current worktree must be clean and on the intended task branch before editing

Those rules are necessary, but they are still instruction-layer controls.

## Mechanisms Inspected

### 1. Agent instructions

What they can do:

- define the correct behavior
- tell Codex to move into the dedicated worktree before task inspection or edits
- prevent accidental scope drift when followed

What they cannot do:

- stop a fresh chat from starting in the wrong checkout
- prevent the first file write
- recover after the wrong checkout has already been modified

Conclusion:

- necessary, but insufficient by themselves

### 2. Git hooks

Repo evidence:

- `git config --get core.hooksPath` returns no configured hook path
- `git rev-parse --git-path hooks` resolves to `C:/Dev/Docsera/.git/hooks`
- that directory does not exist in the current environment

What hooks can do:

- `pre-commit` can stop an unsafe commit
- `pre-push` can stop publishing unsafe state

What hooks cannot do:

- they do not run before normal file edits
- they cannot stop the demonstrated failure once the root checkout has already been modified

Conclusion:

- useful as backstop protection, but too late to be the primary fix

### 3. Repository scripts or wrappers

Current repo state:

- there is no existing task-start or task-preflight command
- the repo scripts are validation and SDK wrappers, not worktree-enforcement wrappers

What a small wrapper could verify:

- current repo root
- current worktree path
- current branch
- `HEAD` and merge-base against the stated base
- whether the active path is the merge-only root checkout
- whether the task branch is already checked out in a dedicated worktree

What it can prevent:

- first-write mistakes when the wrapper is the entry point
- accidental use of `C:\Dev\Docsera` for task implementation

What it cannot guarantee alone:

- protection if someone bypasses the wrapper and edits directly

Conclusion:

- this is the smallest practical mechanical guard that can fail early enough

### 4. Repository-local Git configuration

There is no existing repo-local config that makes the root checkout effectively read-only for task work while preserving normal merge operations.

Adding config alone would not solve the issue unless it was paired with an enforced task-start command or hook path.

### 5. Filesystem permissions or read-only flags

Why they are not a good fit:

- they would interfere with legitimate merge work, cleanup, generated files, and ordinary Git operations
- they are brittle across worktrees and developer machines
- they are not a portable repo-native solution

Conclusion:

- not practical here

## Direct Answers

1. The existing rules were insufficient because they were descriptive, not enforced. The session still started in the root checkout and edited files before any branch/worktree verification happened.

2. Mechanical prevention is possible for first-write mistakes only if a preflight check or wrapper is the actual entry point. Instruction-only controls can direct behavior, but they cannot stop a bad initial context. Hooks can detect the problem later, but not before edits.

3. No repo-native mechanism currently exists that automatically detects the wrong checkout before the first task write. A checked-in preflight command could do this if Codex is told to run it first.

4. Git hooks cannot meaningfully solve this alone. `pre-commit` and `pre-push` occur after edits already exist, so they are backstops, not pre-write guards.

5. There is no existing Codex or project configuration in this repo that makes the root checkout inherently merge-only for task work. The repo has rules, not an enforced task launcher.

6. A repository preflight/task-worktree script would materially reduce risk. The invariant should be: the active path is the intended dedicated task worktree, the branch matches the stated task branch, the branch is exactly at the stated base before work begins for a new task, and `C:\Dev\Docsera` is rejected for task edits by the task guard. For an existing-task continuation, the same guard should require the current HEAD to match an explicitly supplied expected task HEAD and should not require the branch to be reset to the original base.

7. Filesystem permissions are not practical because they would be too coarse and would get in the way of normal Git work.

8. The durable correction should be instruction plus script/tooling, not either one alone.

9. The smallest independently implementable follow-up is a checked-in `task-start` or `ensure-task-worktree` script that fails fast when run from `C:\Dev\Docsera` for a task branch and prints the exact worktree it expects.

## Recommended Smallest Durable Correction

Add a lightweight repo script, then make the task brief and/or `AGENTS.md` require running it before any task inspection or edits.

Minimal behavior:

- reject task execution from the primary/root checkout
- verify the intended task branch exists and is checked out in a dedicated worktree
- verify the worktree is clean and that current HEAD matches the explicitly supplied expected HEAD while the merge base remains the stated original base
- keep the guard semantically narrow so merge and deliberate repository-maintenance operations simply do not invoke it

The follow-up implementation should determine the repository's primary/root worktree from Git's own worktree or common-directory information where practical, while still reporting the resolved path clearly. `C:\Dev\Docsera` is the demonstrated current environment, not a portable identifier.

The follow-up interface needs enough explicit input to distinguish at least:

- intended task branch
- original base
- expected current HEAD

For a new task, expected HEAD equals base. For a continuation, expected HEAD may be ahead of base. The script should validate those values, not infer or repair them.

### New-task mode

For a newly created task branch/worktree, the guard should verify:

- active worktree is the intended dedicated task worktree
- current branch is the intended task branch
- current HEAD equals the stated base
- merge base with the stated base equals that same base
- task branch is zero commits ahead and zero commits behind the stated base
- task worktree is clean

### Existing-task continuation mode

For a continuation, the guard should verify:

- active worktree is the existing intended task worktree
- current branch is the intended task branch
- current HEAD equals an explicitly supplied expected task HEAD
- merge base with the task's original stated base remains that original base
- task worktree is clean
- current HEAD must not be required to equal the original base

The continuation must fail if the actual HEAD differs from the explicitly expected HEAD.

### Root checkout behavior

For task invocations:

- the primary/root checkout must always be rejected
- do not add an `--allow-root`, `--merge`, `--maintenance`, or equivalent bypass to this guard

That combination addresses the actual failure mode without inventing a larger workflow framework.

## Proposed Observable Validation

The follow-up should be validated by two checks:

- running the guard from `C:\Dev\Docsera` for a task branch should fail before any file writes
- running the guard from the dedicated task worktree should pass when the worktree is clean and on the stated base

## Exact Follow-Up Implementation Task

Create `scripts/ensure-task-worktree.mjs` and a narrow repo script wrapper for it, then update the task-start instructions so Codex runs that guard before inspecting or editing task files.

## Implemented Contract

The guard is now exposed through the repository command surface as:

- `npm run ensure:task-worktree -- --task-branch <branch> --original-base <full-base-sha> --expected-head <full-head-sha> [--mode new|continuation]`

Behavior:

- primary/root checkout detection uses Git worktree metadata, not a literal filesystem path check;
- the primary/root checkout is rejected for task validation;
- `--mode new` requires the current branch to equal the intended task branch, the current HEAD to equal the stated base, the merge base to equal that base, the branch to be zero commits ahead and behind the base, and the worktree to be clean;
- `--mode continuation` requires the current branch to equal the intended task branch, the current HEAD to equal the explicitly supplied expected head, the merge base with the original base to remain that original base, and the worktree to be clean;
- failures are read-only and do not repair branches, reset HEAD, clean the index, or register worktrees;
- successful output reports the active worktree, primary worktree, branch, original base, expected head, current head, and merge base for auditability.

Validation evidence:

- disposable Git fixtures covered primary/root rejection, clean new-task pass, clean continuation pass, stale expected head failure, wrong-branch failure, dirty-worktree failure, invalid merge-base failure, and the npm wrapper path;
- the Docsera root checkout remained clean during validation.
