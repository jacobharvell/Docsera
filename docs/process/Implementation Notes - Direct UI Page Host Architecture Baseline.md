# Implementation Notes - Direct UI Page Host Architecture Baseline

Date: 2026-07-02

Status: implementation note

## Purpose

Record the repo-side runtime host baseline after the Direct UI Page spike results.

This note summarizes repository behavior only. Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Baseline

- Preferred runtime host: standalone scoped Direct UI Page
- Scope prefix: `x_82900_docsera`
- Proven host URL: `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`
- Historical UI Builder component host: paused, retain only as comparison/fallback until the cleanup task lands

## Durable Packaging Direction

The Direct UI Page host should be treated as the runtime baseline.

Preferred packaging shape:

- JavaScript in scoped UI Script(s)
- CSS in attachment-backed or equivalent same-origin assets
- backend access through scoped Scripted REST APIs

This keeps the host inside the instance while avoiding a return to the UI Builder/native frame as the preferred runtime surface.

## Repo Implications

- planning docs should treat the Direct UI Page as the host baseline
- UI Builder references are historical context unless explicitly marked otherwise
- cleanup or removal of the legacy component host belongs in a later task after the Direct UI Page path is established
