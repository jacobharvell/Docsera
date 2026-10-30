# RR-021 E9 Publishing and Workspace-State Qualification

Status: qualified from focused automated regression evidence; no production changes.

## Scope and evidence

This qualification used the publishing and workspace-mutation implementation notes plus the current App integration and ServiceNow change-set persistence tests. It did not add tests or code because the requested material contracts were already exercised.

| Focused selection | Result |
| --- | --- |
| `App.publishingChanges.test.tsx` publish/change selection | 5 passed, 19 skipped |
| `serviceNowWorkspaceChangeSetPersistence.test.ts` persistence selection | 7 passed, 155 skipped |
| `App.test.tsx` mode/recovery selection | 3 passed, 49 skipped |
| Total | 15 passed, 223 skipped; 3 files passed |

## Qualified contracts

- **Publish:** the mixed pending set is promoted as one server-side workspace transition. The persistence selection proves a pre-selector-switch failure preserves the prior Live selectors and pending changes. The client selection proves a retryable Publish reuses its command id, while a separate later publish receives a new identity.
- **Discard All:** a mixed pending set is atomically restored to the selected published snapshot. The persistence selection covers completed-command replay and mutation blocking during durable discard recovery. The client selection confirms recovery continues to block writes after Cancel or reload and uses the recovery command only after explicit Retry.
- **Individual Undo:** modified-row restoration and Added-subtree removal are derived from authoritative workspace state. The server selection covers both cases; the client selection rebinds the selected editor, Page Settings, and route to the returned authoritative projection without history push. Valid-page fallback is covered by the selected App tests.
- **Live/Edit isolation and selection:** focused App coverage preserves page identity across mode switches, falls back to a nearest visible ancestor when needed, and keeps server-returned projection/authority as the client source of truth.
- **Transition ownership:** the implementation notes and selected tests jointly evidence exact server-issued change-set checks, stable command identities, no automatic replay of non-idempotent transitions, and recovery gating until durable discard cleanup is complete.

## Findings

No demonstrated defect with meaningful shipped-product impact was found in the requested focused executions. No speculative hardening or correction is proposed.

## Evidence boundaries and live acceptance

The qualification is local automated evidence only. Per task scope, no SDK build, deployment, PDI mutation, or interactive browser testing was run. Existing notes identify live verification of mixed-set publish, Edit/Live projection isolation, pending clearing, lease retention, stale/no-lease failure behavior, and Undo variants; an independent reviewer may use those established PDI verifiers for release acceptance if live confirmation is required.

## Commands run

```bash
npm --prefix app/docsera-ui run test -- src/client/app/App.publishingChanges.test.tsx -t "reuses the publish command ID|discards all pending changes|rebinds the selected editor|falls back to a valid page"
npm --prefix app/docsera-ui run test -- src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.test.ts -t "publishes a mixed pending set|preserves Live selectors and pending changes when publish fails|atomically discards a mixed pending set|replays the same completed discard-all command|blocks later mutations during discard recovery|discards a modified page row|discards an Added subtree"
npm --prefix app/docsera-ui run test -- src/client/app/App.test.tsx -t "preserves the current page identity across mode switches|falls back to the nearest visible ancestor|keeps discard recovery blocking writes"
```
