# Implementation Notes - E8-T4 Integrated Source Hardening and Closeout

Date: 2026-08-31

Status: implementation note

## Purpose

This note records the final repository-side hardening pass for the accepted E8 Visual/Markdown Source workflow. Accepted product behavior remains authoritative in `Requirements/40 Editor.md`.

## Boundaries Validated

- Normal Visual/Markdown switching remains covered by the workspace shell and editor interaction suites, including workspace-scoped surface selection and no false lock from persisted pending-change rows.
- Source title/body handoff remains covered through the App interaction tests and the shared canonical editor handoff contract.
- Source-local state, invalid text preservation, canonical reprojection, and unavailable-source recovery remain covered by `WorkspaceMarkdownSourcePanel.test.tsx`, `MarkdownSourceSession.test.ts`, and the App interaction tests.
- The Markdown conversion and round-trip boundary remains covered by the `editor-contract` suite, including the representative Markdown corpus.
- Live runtime separation remains verified by `verify:editor-runtime-boundary`: Live reader code stays TipTap/ProseMirror-free, `main.jsdbx` stays free of CodeMirror runtime code, and `MarkdownSourceSession` remains in a lazy chunk.

## Hardening Added

- App-level invalid Source navigation coverage now verifies that same-workspace navigation is blocked while the active page has invalid Source and that explicit discard releases the navigation while preserving the workspace's Markdown authoring-surface selection.
- App-level publishing coverage now verifies that active-page invalid or unavailable Source disables Publish, Discard all, and individual Undo command buttons and prevents those workspace command dispatches.
- App-level publishing coverage now verifies that a settled saved Source state does not remain falsely blocked merely because persisted draft changes still await workspace Publish.
- `DocseraHeader.test.tsx` now reads multiline CSS selector blocks in a CRLF/LF-tolerant way so the existing stylesheet contract is not coupled to checkout line endings.

## Confirmed Defects Corrected

No production behavior defects were confirmed during E8-T4. The only code changes are regression coverage and a test-contract newline tolerance fix.

## Known Unrelated Baseline Failure

The requested `editor-contract` suite still exposes the known clean-base autosave retry failure:

- `src/client/editor/PageEditorHostRuntime.core.test.tsx`
- `PageEditorHostRuntime > stops after four automatic retries, preserves content, and lets a new edit reset the sequence`
- Expected `onSaveDraft` to be called 5 times, observed 6 calls.

This is unrelated autosave retry debt and was not expanded into E8-T4.

## Post-MVP Boundary

Markdown file Import/Export remains post-MVP. E8-T4 did not add file import/export behavior or a second parser/serializer policy.

## Closeout Assessment

Repository evidence supports closing E8 for the accepted MVP Visual/Markdown Source workflow: conversion, Source handoff, invalid/unavailable recovery, workspace-scoped surface ownership, command readiness, and runtime separation are covered, with only unrelated autosave retry debt remaining.
