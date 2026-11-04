# RR-059 — Repeatable SDK Identity Conversion

Date: 2026-11-03
Status: **Local conversion workflow implemented; independent review is required before any real identity conversion or installation.**

## Purpose

`npm run convert:sdk-identity -- ...` creates a disposable, target-specific copy
of the canonical Docsera source for a developer-owned ServiceNow company prefix.
It does not contact a PDI, invoke `now-sdk install`, create an application, or
modify the canonical worktree. It converts the scoped source and the Global
companion source together. Frozen release artifacts, including
`app/docsera-global-bridge/update-set`, are intentionally excluded.

The canonical identity is deliberately pinned as the required source:

```text
scope:   x_82900_docsera
scopeId: 6997f092c3fd8310c569bf0d0501314d
```

The tool refuses another source identity so it cannot accidentally be used as a
general-purpose record-ID rewrite utility.

## Required scaffold and conversion

First create a **new local SDK scaffold**, outside this repository, for the
target scope. Use the repository-pinned SDK 4.8.1 and an explicit alias only
when the separate application-creation task has been approved. RR-058 verified
the future `dev468303` form:

```powershell
now-sdk init --appName Docsera --packageName docsera-direct-ui-page-runtime `
  --scopeName x_2300756_docsera --template typescript.react `
  --auth docsera-dev468303
```

The 4.8.1 CLI's `init --help` is authoritative for this procedure. A local
4.8.1 CLI check confirmed it lists `typescript.react`; do not use the
`partial.typescript.react` name recorded in RR-058. The scaffold's
`now.config.json` supplies the target scope and the `scopeId` to carry into
the conversion. Do not copy or invent an ID.

Then run the local conversion, with an empty, absolute output directory:

```powershell
npm run convert:sdk-identity -- `
  --company-code 2300756 `
  --scaffold C:\safe\docsera-sdk-scaffold `
  --output C:\safe\docsera-converted `
  --confirm-source x_82900_docsera
```

Before it writes output, the converter reads the canonical
`app/docsera-ui/now.config.json` and requires both source identity fields to
equal the pinned `x_82900_docsera` / `6997f092c3fd8310c569bf0d0501314d`
pair. It also requires the target scaffold's `now.config.json` to declare a
non-empty name and a relative `tsconfigPath` resolving inside the scaffold,
and requires a root `package.json` that pins `@servicenow/sdk` to `4.8.1`.
These checks distinguish the expected local SDK project shape from a bare or
arbitrary configuration file; they do not prove that the directory was created
by the SDK or that its `scopeId` was issued by the SDK.

The scope is derived as `x_<company-code>_docsera`; it must exactly match the
scaffold and fit the SDK scope limit. The manifest is written to
`<output>/conversion-manifest.json` and records all copied/converted files,
the source/target identities, omitted generated registries, frozen artifact
exclusions, and unresolved/unsupported reference findings. A non-empty output,
an output inside the source or scaffold, an invalid scope/ID, or an unexpected
source confirmation is rejected.

## Generated identity review

The converter deliberately omits both generated `keys.ts` registries. These
files are ServiceNow record-identity registries, not templates: retaining the
canonical IDs would update or collide with the old application records.

In the converted output, install local dependencies and run the pinned SDK
build separately for each app. That supported build path regenerates the
registries from the converted Fluent source. Review the new registry diffs,
then run the scoped module-key verification. The Global companion must be
built and reviewed after the scoped application because its privileges target
the new scoped identity. The converter intentionally does not build, install,
or generate a Global update set.

Only after independent review of the manifest and generated registries may a
separate, explicitly approved task establish or install the real target
application. That pre-install review must independently verify the target
application/scope record and its `scopeId` against the intended PDI using the
approved SDK alias; a locally well-formed scaffold cannot establish that
provenance. Installation prerequisites still include a verified company code,
scope collision inventory, explicit SDK credential alias, and the scoped-app-
before-Global-companion order.

## Validation

Focused fixtures exercise the verified target scope `x_2300756_docsera` and a
second valid prefix. They use synthetic 32-character values only, not installed
application IDs. The tests verify non-destructive operation, canonical-source
scope and `scopeId` refusal before output creation, SDK-scaffold-shape refusal,
reference conversion, generated-registry omission, repeatability, input
rejection, and unsupported-reference reporting.

This task resolved RR-058's template-name discrepancy with the actual local
SDK 4.8.1 `init --help` output: the supported choice is `typescript.react`.
This task does not prove the resulting generated registry contents: that
requires an approved target application scaffold and an SDK build. The
converter therefore makes the regeneration boundary explicit rather than
fabricating output metadata.
