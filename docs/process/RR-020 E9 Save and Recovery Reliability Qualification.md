# RR-020 E9 Save and Recovery Reliability Qualification

Date: October 30, 2026
Scope: production authoring save and recovery contracts only; no production code or test changes.

## Outcome

No Blocking or meaningful Should-fix production defect was demonstrated by this qualification. The focused regression evidence supports the accepted bounded autosave, stale-authority/lease, and recoverable-authoring-input contracts.

## Evidence

- `workspaceMutationQueue.test.ts` (10 passing) verifies one-at-a-time dispatch; authority propagation in queue order; obsolete queued-operation cancellation; stale recovery blocking; no non-idempotent create replay; and rejection of authority, stale recovery, and recovery-failure effects after lease/context replacement.
- `workspaceLeaseRecovery.test.ts` (8 passing) verifies recovery is scoped and shared only within its exact scope, retries only the qualifying rejected-token operation, prevents a retry if replacement scope changes, and caps a lease-loss path at two mutation attempts.
- `authoringRecovery.test.ts` (9 passing) verifies body, settings, and inline-create snapshots are identity-scoped; newer captures replace older ones; and stale captures cannot clear newer recoverable input or cross workspace/page boundaries.
- `App.editorInteractions.test.tsx` (16 passing) verifies pending source title/body work is flushed before navigation, older completion cannot replace the latest draft, unavailable/invalid Markdown handoff blocks silent navigation, and explicit discard is required for invalid source input.

These results cover the accepted protections against lost recoverable input, obsolete mutation completion effects, unintended replay of non-idempotent commands, and cross-page/session authoring leakage.

## Historical E8-T4 autosave retry observation

The historical case was rerun in isolation and passed. It proves an initial save plus exactly four automatic retries (five attempts total), no further retry after a further 120 seconds, retention of the editor text, `Changes not saved` status, and reset of the finite retry sequence after a meaningful new edit.

The earlier retry-count failure does not reproduce in the current test harness. On current evidence it is a historical harness/test-state issue rather than a demonstrated production defect; no correction is warranted from RR-020. This qualification does not make a broader claim about untested browser or network behavior.

## Commands and results

```text
npm --prefix app/docsera-ui run test -- src/client/app/workspaceMutationQueue.test.ts src/client/app/workspaceLeaseRecovery.test.ts src/client/app/authoringRecovery.test.ts src/client/app/App.editorInteractions.test.tsx
# PASS: 4 files, 43 tests

npm --prefix app/docsera-ui run test -- src/client/editor/PageEditorHostRuntime.core.test.tsx -t "stops after four automatic retries"
# PASS: 1 selected test (61 skipped)
```

The first command emitted four React `act(...)` warnings in existing Markdown-source retry/navigation tests; all assertions passed. They are outside this bounded qualification and do not demonstrate persisted-state, repeated-mutation, or recovery failure.

## Intentionally not run

No full frontend suite, broad workspace-state tests, managed frontend validation, SDK build, deployment, ServiceNow record manipulation, or interactive PDI/browser testing was run, per the brief.

## Jacob-owned live PDI checks

If live acceptance is scheduled separately, verify with normal user interaction that a real transient save outage retains the active page's text and stops automatic retries after the four-delay sequence; terminal save failure does not retry; a page/mode transition cannot install a late prior-page save result; and a stale lease/generation response refreshes current authority without replaying create, move, delete, publish, discard, or undo. These are not completed by RR-020.
