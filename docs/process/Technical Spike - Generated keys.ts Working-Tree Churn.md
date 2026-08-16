# Technical Spike - Generated keys.ts Working-Tree Churn

Date: 2026-08-16

Status: spike note

## Question

Why does `app/docsera-ui/src/fluent/generated/keys.ts` keep becoming dirty during normal SDK workflows?

## Confirmed Result

The first mutation is the SDK build/save phase that rewrites the generated keys registry:

- `now-sdk build` / `npm run build:sdk-ui-page`
- internal path: `Project#getOutput()` -> `KeysRegistry.commit()` -> `SourceFile.save()`

The build wrapper in `@servicenow/sdk-api/dist/project.js` always commits the keys file after output generation.

## Reproduction

The full `now-sdk build` in this checkout currently stops earlier on unrelated TypeScript diagnostics in server files, so I used a throwaway in-memory SDK project invocation against the current worktree to exercise the same keys commit path without writing to the repo.

Observed on the current checkout:

- repo config: `core.autocrlf=true`
- tracked file state: `git ls-files --eol app/docsera-ui/src/fluent/generated/keys.ts` reports `i/lf  w/crlf`
- raw content hash before regeneration: `e8ad1c62979dddc539d4b31f1f14e97f867507d1fc525f909dc480f72e5fb53f`
- raw content hash after regeneration: `68dae4b7c24f031e6fb9fbef4d0c8c6ae89de08c232c3cc63b8a3ebf48a2032c`
- normalized text comparison: identical
- carriage-return count: `4087 -> 0`

The regenerated blob is the same registry content with LF-only line endings. A second invocation on the regenerated LF text was stable and produced no further change.

## Exact Diff

There is no semantic registry diff. The change is serialization-only:

- every line ending changes from CRLF to LF
- the `keys.ts` body is otherwise unchanged

Representative first-line change:

```diff
-import '@servicenow/sdk/global'\r
+import '@servicenow/sdk/global'\n
```

The same newline-only rewrite applies to the full file.

## Repository And SDK Contract

The bundled ServiceNow SDK docs say `src/fluent/generated/keys.ts` is auto-generated, must be committed, and should be checked with `now-sdk build --frozenKeys` in CI.

The repo also currently tracks this file in Git, so the generated registry is part of source control, not a disposable build artifact.

## Confirmed Root Cause

`keys.ts` is being rewritten by the SDK build/save path with LF line endings, while the checked-out working tree copy on Windows is CRLF. That makes the file appear dirty after build/save even when the registry content itself did not change.

This is not an ordering or semantic key-registry drift. It is a line-ending normalization mismatch.

## Smallest Durable Correction

Keep `keys.ts` tracked, but make its newline contract explicit so the SDK save path and Git agree. The smallest repo-side fix is an explicit `.gitattributes` rule for `app/docsera-ui/src/fluent/generated/keys.ts` that pins the file to LF.

An alternative would be teaching the SDK save path to preserve the file's existing line endings, but that is a broader toolchain change.

## Follow-Up Task

Implement one durable newline policy for `keys.ts`, then rerun the build path and verify the file stays clean after repeated SDK runs.

## Repository Correction

The repository-side newline policy has been implemented in `.gitattributes` for `app/docsera-ui/src/fluent/generated/keys.ts`, pinning the generated registry to LF.
