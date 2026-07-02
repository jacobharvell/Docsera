# ADR-0002: Standalone Scoped Direct UI Page Host

- Status: Accepted
- Date: July 2, 2026

## Decision
Docsera's preferred runtime host is a standalone scoped Direct UI Page in the `x_82900_docsera` application scope.

The Direct UI Page owns the document shell, layout, and browser entry point. UI Builder / Next Experience custom-component hosting is paused and is not the preferred runtime architecture.

## Context
Two manual PDI spikes established that:

- the standalone Direct UI Page rendered full-page Docsera-owned content at `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`
- the page did not load `macroponent-root`, `sn-polaris-layout`, `now-appshell`, or the UI Builder transformed bundle path
- scoped UI Script JavaScript loaded successfully
- attachment-backed CSS loaded successfully
- same-origin Scripted REST access worked from the page
- the earlier UI Builder host path showed runtime interference before Docsera content owned the shell

Those spikes are documented in:

- `docs/process/Implementation Notes - Standalone Scoped UI Page Host Spike.md`
- `docs/process/Implementation Notes - Direct UI Page Assets and Backend Ping Spike.md`

## Durable Packaging Direction
The runtime host stays a Direct UI Page. The first durable packaging shape is:

- JavaScript in scoped UI Script(s)
- CSS in instance-hosted assets such as attachment-backed styles until a better same-origin asset record is proven
- backend calls through scoped Scripted REST APIs

The UI Builder component package may remain as paused historical scaffolding until a later cleanup task removes or repurposes it.

## Consequences
### Positive
- Docsera owns the document shell and bootstrap surface.
- The host does not depend on the UI Builder/native frame runtime.
- Same-origin browser behavior is simpler to reason about.
- The packaging path stays inside the ServiceNow instance and scope.

### Tradeoffs
- The host is lower-level and requires explicit page/bootstrap assembly.
- Runtime and packaging records must be created and maintained on-instance.
- Security, ACLs, and auth behavior must be documented and verified separately.

## Follow-up
- Do not start UI Builder cleanup/removal work until this ADR and the runtime host proof notes are the documented baseline.
- Keep the UI Builder component path paused unless the Direct UI Page direction is later disproven.
