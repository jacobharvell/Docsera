# ADR-0001: Editor Architecture Baseline (Gate 2)

- Status: Accepted
- Date: May 26, 2026

## Decision
Use a ProseMirror-first editor implementation as the Gate 2 continuation baseline.

For the thin editor/autosave slice, this is the accepted implementation boundary. TipTap integration remains intentionally deferred until the controlled compatibility matrix is approved.

## Context
Gate 2 troubleshooting repeatedly hit runtime/build incompatibility signals on the Tiptap `@tiptap/pm` path, including runtime mount failures and externalized asset conflicts. The ProseMirror-first implementation produced a stable runtime mount and passed Gate 2 behavior checks.

## Consequences
### Positive
- Stable runtime editor mount in PDI.
- Gate 2 checks pass for edit/preview, toolbar behavior, and theme switching.
- Clear diagnostic path for deployment vs runtime failures.

### Tradeoff
- Wrapper-level Tiptap ergonomics are postponed until compatibility is proven on a controlled matrix.
- The current shell slice should be treated as ProseMirror-first baseline plumbing, not the final editor abstraction.

## Guardrails
- Do not re-open Tiptap path or run broad dependency/version experiments until:
  1. Runbook diagnostics are fully applied.
  2. A controlled compatibility matrix plan is explicitly approved.
