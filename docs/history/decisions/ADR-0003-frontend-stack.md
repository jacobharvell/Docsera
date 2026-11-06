# ADR-0003: Frontend Source Stack - React + TypeScript + Vite

- Status: Accepted
- Date: July 2, 2026

> Historical status: This record preserves the architectural rationale at the time of its decision. It is not a current implementation specification; use the current documentation index for implemented behavior.

## Decision
Docsera's preferred frontend source stack is React + TypeScript + Vite.

The runtime host remains the standalone scoped Direct UI Page established in ADR-0002. The Direct UI Page is the ServiceNow-hosted browser entry point, while the application itself is authored in repo-managed React + TypeScript and built into static browser assets before it is loaded.

## Context
ADR-0002 established that Docsera should run in a standalone scoped Direct UI Page instead of UI Builder / Next Experience custom-component hosting.

That host decision leaves a separate question open: what stack should author the client application that runs inside the page?

Docsera needs a frontend source model that supports:

- component-based UI structure
- TypeScript for stronger contracts and refactors
- editor integration work that will grow over time
- build-time transpilation and asset bundling
- a source tree managed in the repository instead of hand-authored page scripts

## Selected Stack
- Source framework: React
- Language: TypeScript
- Build tool: Vite
- Runtime delivery target: static JS and CSS assets loaded by the Direct UI Page

## Relationship To ADR-0002
ADR-0002 decides where Docsera runs.

This ADR decides how the browser application is authored and built.

The two decisions are intentionally separate:

- ADR-0002: standalone scoped Direct UI Page as the runtime host
- ADR-0003: React + TypeScript + Vite as the preferred source/build stack that feeds that host

## Why React + TypeScript
React + TypeScript is the best fit for Docsera's client application because it gives the project:

- a mature component model for shell, reader, and editor surfaces
- predictable state and prop boundaries for a growing documentation app
- TypeScript-based contracts for editor data, routing state, and backend payloads
- broad ecosystem support for rich editor integrations and UI primitives
- a source structure that is easier to evolve than page-local scripted markup

For Docsera, the source stack needs to support maintainability first. React + TypeScript gives that without forcing a separate runtime server.

## Why Vite
Vite is the preferred build tool because it fits the shape of this app:

- fast local development and rebuilds
- simple production bundling into browser assets
- a clean path from repo-managed source to static files
- less runtime machinery than a full server-rendered framework

Vite matches the need to produce assets that can be loaded by the Direct UI Page without introducing an additional app server layer.

## Why Not Next.js For The MVP Runtime
Next.js is not the preferred MVP runtime for Docsera because:

- Docsera does not need a separate Node or Next server runtime inside ServiceNow
- the useful part of Next.js for this architecture is static React asset generation, which Vite already provides more directly
- server rendering, routing conventions, and app-server behavior would add complexity that does not buy the current ServiceNow-hosted use case

If a later phase needs Next.js-specific behavior, that should be evaluated as a separate decision. It is not the current baseline.

## Why Not Raw Hand-Authored UI Script As The App Source
Raw UI Script authoring is not the preferred application source model because Docsera needs:

- a modern repo-managed codebase
- component decomposition for product UI
- TypeScript and build-time transpilation
- a scalable editor and shell implementation path

UI Script remains a possible ServiceNow-hosted bootstrap or compiled asset target, but not the main authoring model for the application itself.

## ServiceNow Responsibilities
ServiceNow remains responsible for:

- authentication and session handling
- ACLs, records, and scoped backend APIs
- host delivery through the standalone Direct UI Page
- instance-local packaging and deployment targets
- same-origin browser access to Docsera backend endpoints

## Frontend Responsibilities
The repo-managed frontend is responsible for:

- shell layout and routing
- reader and editor UI
- state management
- calling same-origin ServiceNow backend APIs
- generating static browser assets through Vite
- keeping the app source under version control in the repository

## Deferred
This decision does not settle:

- the exact durable ServiceNow asset packaging mechanism
- the exact deploy/package automation
- the final backend auth and ACL implementation details
- UI Builder cleanup or removal
- any future server-rendered or hybrid runtime model

## Consequences
### Positive
- The frontend source stack is now explicit and stable.
- The runtime host and app authoring model are no longer conflated.
- The repo can move toward a normal component-based frontend architecture.
- Build output can be produced as static assets for the Direct UI Page.

### Tradeoffs
- The app now needs a build step before deployment to ServiceNow.
- The packaging path still needs to be finalized.
- UI Script/bootstrap assets may remain part of the ServiceNow delivery story even though they are not the preferred source model.

## Follow-up Tasks
- Define the durable ServiceNow packaging target for Vite output.
- Define the deployment automation that publishes built assets into the instance.
- Keep ADR-0002 as the runtime host baseline while Task 28 removes or quarantines UI Builder baggage.
- Align the shell implementation and repo docs with the React + TypeScript + Vite source stack.
