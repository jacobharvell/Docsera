# Implementation Notes - Managed Frontend Validation Lifecycle

## Scope

- `app/docsera-ui/package.json` routes `test` and `validate` through Node-managed runners.
- `npm --prefix app/docsera-ui run test` is the managed Vitest entrypoint.
- `npm --prefix app/docsera-ui run validate` is the managed sequential validation entrypoint.

## Stage Order

`validate` runs these stages in order and stops at the first failure, interruption, or timeout:

1. Vitest
2. ServiceNow SDK build
3. inline-runtime CSS verification

Each stage must settle and finish its scoped cleanup before the next stage begins.

## Worker Defaults And Overrides

- Default Vitest worker maximum: `2`
- Default Vitest worker minimum: `1`
- Default file parallelism: disabled

Managed worker handling is additive, not all-or-nothing:

- no explicit worker flags:
  - add `--maxWorkers 2`
  - add `--minWorkers 1`
- explicit `--minWorkers` only:
  - preserve it
  - still add the default `--maxWorkers`
- explicit `--maxWorkers` only:
  - preserve it
  - still add the default `--minWorkers`
- explicit `--workers` on the managed wrapper:
  - use it as the default maximum unless Vitest `--maxWorkers` is also supplied
- explicit Vitest `--maxWorkers` and `--minWorkers`:
  - preserve both

File parallelism remains disabled unless the caller explicitly overrides it with Vitest flags.

## Timeouts

Default stage timeouts:

- Vitest: `15m`
- SDK build: `10m`
- inline-runtime CSS verification: `5m`

Override them on the managed `validate` command with:

```powershell
npm --prefix app/docsera-ui run validate -- --test-timeout-ms 900000 --build-timeout-ms 600000 --css-timeout-ms 300000
```

The timeouts are stage-specific and are enforced by the managed runner.

## Cooperative Interruption

- `test` and `validate` both install managed `SIGINT` and `SIGTERM` handlers.
- Once a stage session exists, interruption immediately calls that stage session’s `abort()` path.
- The abort path performs scoped stage-tree cleanup, waits for owned descendants to exit, stops the watchdog, releases the owned run lock, and preserves interruption status instead of waiting for the normal stage timeout.
- If interruption lands during stage startup, the runner records the in-flight stage promise and aborts it as soon as the session object resolves.

## Run Lock

- The lock lives under the validation state root as `run-lock/lock.json`.
- Publication is atomic: the runner writes the full owner record into a candidate directory and renames that candidate into place only after the record is complete.
- The owner record includes the run id, owner pid, owner start identity, command label, and creation metadata.

Stale-lock recovery is conservative:

- recover when the recorded owner is positively dead
- recover when the recorded pid is live but its verified start identity does not match the stored owner identity
- fail closed when the pid appears live but process identity cannot be verified
- fail closed when the existing lock cannot be read safely

Transient PowerShell or CIM inspection failure must not start a second managed validation beside a potentially live owner.

## Owner-Checked Release

- `release()` removes the lock only when the current `runId`, owner pid, and owner start identity still match the lock on disk.
- A stale releaser, superseded run, or forged owner record must leave the live lock intact.

## Cleanup Model

- Stages are launched as detached process roots.
- Cleanup is scoped to the managed stage tree, not to all Node processes.
- Before any destructive cleanup, the runner verifies that the live root pid still has the expected start identity.
- If the root pid belongs to a different process, the runner does not terminate it.
- If root identity is unavailable or inconclusive while the pid appears live, the runner prefers not to kill a potentially unrelated process and reports that cleanup could not be safely verified.
- If the original root is gone, cleanup may still remove descendants that remain attributable to the original root pid.

## Watchdog

- Each active stage gets a detached watchdog process.
- The watchdog receives the run id, stage id, root pid, and expected root start identity.
- If the managed parent disappears unexpectedly, the watchdog applies the same identity-checked cleanup rules before terminating the stage tree.
- On normal completion or cooperative interruption, the parent stops the watchdog explicitly and waits for it to exit.

## Failure Diagnostics

When a stage fails, times out, or is interrupted, the runner prints:

- stage start with timeout and command
- stage completion, failure, timeout, or interruption
- whether cleanup removed owned processes
- whether cleanup was skipped because process identity could not be safely verified

For an overlap rejection, the lock message names the live owner pid and command label. For confirmed stale-lock recovery, the next run replaces the stale owner instead of blocking indefinitely.

## Acceptance Evidence

Regression coverage in `app/docsera-ui/scripts/validation-process.test.mjs` covers:

- worker-bound command construction, including partial overrides
- atomic lock publication and overlap handling
- live-owner verification failure
- dead-owner stale recovery
- pid-reuse/start-identity mismatch recovery
- owner-checked release behavior
- cooperative interruption
- timeout cleanup of nested descendants
- forced parent-death watchdog cleanup
- process-identity mismatch protection for unrelated processes
