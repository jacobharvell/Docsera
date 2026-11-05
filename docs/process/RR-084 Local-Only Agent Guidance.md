# RR-084 Local-Only AGENTS.md

The repository-root `AGENTS.md` is local Codex guidance, not public repository
content. RR-084 removes it from Git tracking and adds `/AGENTS.md` to the root
`.gitignore`. The file is deliberately retained in the task worktree; no
guidance content is changed by this task.

## Safe main-checkout synchronization after squash merge

The primary checkout at `C:\Dev\Docsera` may still have a tracked `AGENTS.md`
when the squash merge arrives. Preserve that local file before updating `main`,
because the merge deletes the tracked path:

1. From `C:\Dev\Docsera`, make a temporary copy outside the repository, for
   example: `Copy-Item -LiteralPath AGENTS.md -Destination ..\Docsera-AGENTS.md.rr-084-backup`.
2. Perform the approved `main` synchronization/merge workflow.
3. Restore the copy: `Copy-Item -LiteralPath ..\Docsera-AGENTS.md.rr-084-backup -Destination AGENTS.md`.
4. Confirm `AGENTS.md` is readable and ignored with
   `Get-Content -Raw AGENTS.md` and `git check-ignore -v AGENTS.md`.
5. Remove the temporary external backup only after those checks succeed.

The restored root file remains local-only and must not be staged or committed.

## New worktrees

Git does not materialize ignored local guidance into newly created worktrees.
Each new task worktree therefore needs its own local `AGENTS.md` copy (copied
from a trusted local source) or an equivalent locally configured Codex guidance
mechanism before task work begins.
