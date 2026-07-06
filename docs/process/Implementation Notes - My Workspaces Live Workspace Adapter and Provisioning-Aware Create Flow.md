# Implementation Notes - My Workspaces Live Workspace Adapter and Provisioning-Aware Create Flow

Status: implementation note

## Purpose

This note captures the repo-side behavior added to connect My Workspaces to live workspace data and to support provisioning-aware workspace creation.

Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Live Launcher Data

- The My Workspaces launcher now reads workspace rows from the ServiceNow-backed runtime adapter instead of relying on demo-only launcher state.
- The launcher filters to accessible active workspaces, preserves the current user's role label, and exposes a settings entry point only when the workspace is manageable.
- Workspace rows continue to open the app shell in the same Direct UI Page runtime.

## Live Workspace Shell Boundary

- Opening a workspace now resolves the workspace record from the live catalog adapter and uses that record to populate the shell title, icon, and current user role label.
- The existing page tree and reader/source shell content remain the current editor-side boundary; this task only replaces the workspace identity and access surface with live data.

## Shared App Frame

- My Workspaces, Workspace Shell, and workspace loading/unavailable states now render inside the same Docsera app frame so route changes feel like context changes inside one SPA shell.
- The launcher and shell still swap their route-specific content, but the shared top-level app chrome remains stable where practical.

## Provisioning-Aware Creation

- Creating a workspace now uses the ServiceNow runtime adapter and handles both immediate success and pending provisioning responses.
- When provisioning is pending, the launcher polls the provisioning status endpoint until the workspace is ready or fails.
- A successful create refreshes the launcher list and opens the newly provisioned workspace.

## Safe Runtime Errors

- The runtime API handlers now log detailed unexpected failures internally while returning stable user-safe error messages to the client.
- The workspace list/lookup, workspace creation, and provisioning-status endpoints no longer forward raw caught exception text to the client for unexpected failures.

## ServiceNow Response Envelopes

- Live ServiceNow runtime responses on the PDI may arrive as nested `result` envelopes instead of a single wrapper.
- The browser client now normalizes a bounded nested envelope shape before interpreting Docsera ping, list, lookup, create, and provisioning payloads.
- This transport normalization does not change accepted product behavior or workspace lifecycle semantics.

## Runtime Routes

- The runtime exposes a list-and-lookup workspace endpoint for the launcher and workspace shell.
- The runtime also exposes the provisioning status endpoint used by the create flow.
