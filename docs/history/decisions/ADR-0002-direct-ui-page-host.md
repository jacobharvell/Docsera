# ADR-0002: Standalone Scoped Direct UI Page Host

- Status: Accepted
- Date: July 2, 2026

> Historical status: This record preserves the architectural rationale at the time of its decision. It is not a current implementation specification; use the current documentation index for implemented behavior.

## Decision
At the time of this decision, Docsera's preferred runtime host was a standalone scoped Direct UI Page. The decision's original proof environment used the historical `x_82900_docsera` application scope.

The Direct UI Page owns the document shell, layout, and browser entry point. UI Builder / Next Experience custom-component hosting is not the preferred runtime architecture.

The currently implemented runtime is the scoped `x_2300756_docsera` application defined in [`app/docsera-ui/now.config.json`](../../../app/docsera-ui/now.config.json).

## Context
The initial host investigation established that a standalone Direct UI Page can own the full Docsera shell without the UI Builder/native frame runtime. The abandoned proof-only implementation notes are intentionally not retained as operational guidance; see the current [runtime overview](../../architecture/overview.md) and [ServiceNow runtime reference](../../reference/servicenow-runtime.md) for the implemented host and SDK pipeline.

## Durable Packaging Direction
The runtime host stays a Direct UI Page. The current durable packaging shape is:

- JavaScript and runtime CSS in the SDK-generated `main.jsdbx` bundle
- one injected, Docsera-owned runtime stylesheet before React mounts
- backend calls through scoped Scripted REST APIs

The former UI Builder component package has been removed; it is not part of the current runtime or packaging shape.

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
- Keep the Direct UI Page architecture and its current runtime contracts under review only if this hosting direction is later disproven.
