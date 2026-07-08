# Implementation Notes - Workspace Empty State Sidebar Persistence

Status: implementation note

## Purpose

This note records the repo-side workspace shell fix that keeps the sidebar and create-page affordances visible when a workspace has no pages.

Accepted product requirements remain the source of truth in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Summary

The workspace shell now distinguishes between "no selected page" and "no pages in the workspace".

Implemented behavior:

- the workspace sidebar remains mounted even when the page list is empty
- the page tree area can render an empty-state message without removing the sidebar shell
- the sidebar Add Page affordance remains visible and usable with zero pages
- the main content area shows an explicit empty-workspace state when no page exists yet
- creating the first page from the empty state adds it to the workspace tree and selects it using the existing page creation route flow
- page settings controls continue to appear for the selected page when the user is authorized

## Shell Integration

Current repo-side behavior:

- the shell no longer treats `selectedPage === null` as a reason to remove the entire workspace navigation surface
- empty-workspace rendering is localized to the sidebar tree and main content pane
- the page creation modal remains the same workflow entry point used for non-empty workspaces
- live ServiceNow persistence and runtime CSS baseline behavior remain unchanged by this fix

## Validation Notes

The local validation harness for this change should cover:

- empty-workspace sidebar visibility
- empty-workspace create-page flow
- post-create tree selection
- selected-page settings gear visibility for authorized users

## Non-Goals

This note does not add:

- visual redesign of the workspace shell
- runtime CSS asset emission
- `/uxta` runtime shell CSS requests
- editor behavior changes beyond empty-workspace creation entry points
