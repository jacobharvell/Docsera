# Historical UI Builder Metadata

Date: 2026-07-02

Status: archived historical evidence

## Purpose

This folder preserves the old UI Builder / Next Experience component registration metadata for `x-82900-docsera-shell`.

It is retained as historical evidence and migration reference only.

## Current classification

- `now-ui.json` is not the preferred runtime host metadata for Docsera.
- The accepted runtime host is the standalone scoped Direct UI Page documented in `docs/decisions/ADR-0002-direct-ui-page-host.md`.
- The accepted frontend source/build stack is React + TypeScript + Vite documented in `docs/decisions/ADR-0003-frontend-stack.md`.
- Future runtime work should target Direct UI Page packaging and built static assets, not renewed UI Builder placement.

## Why this remains in the repo

- It records the exact historical component identifier and scope metadata used during the paused UI Builder path.
- It provides evidence for prior deployability and runtime investigations.
- It helps future migration work map old shell behavior and package history without making UI Builder the active runtime target again.
