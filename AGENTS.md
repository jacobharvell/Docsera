# AGENTS.md

This is the canonical agent-guardrail file for this repository.

## Project Purpose

This repository contains a ServiceNow scoped application for a standalone, open-source documentation app inspired by modern product/API documentation platforms.

The intended product direction is:
- Standalone ServiceNow scoped app.
- Standalone scoped Direct UI Page app shell.
- Custom component-based editor.
- Tiptap/ProseMirror editor foundation.
- Block-based authoring with Markdown/source support.
- Polished reader/viewer experience.
- ServiceNow-native security, ownership, records, and publishing/versioning over time.

This project is not intended to become:
- A Notion/Confluence replacement.
- A Service Portal / Employee Center customization project.
- A paid-AI-dependent app.
- A broad enterprise knowledge management platform.

## Current Technical Assumptions

- Primary working environment: VS Code.
- AI coding workflow: Codex inside VS Code.
- ServiceNow environment: PDI unless otherwise stated.
- ServiceNow development path: scoped app + standalone Direct UI Page host + React + TypeScript + Vite frontend source.
- Active frontend runtime source tree: `app/docsera-ui`.
- `app/docsera-shell` is historical migration source material, not the active runtime entry point.
- Editor foundation: Tiptap/ProseMirror unless explicitly changed.
- Initial persistence target: ServiceNow scoped app records.
- External Git sync, AI features, OpenAPI rendering, real-time collaboration, comments, and reactions are deferred unless explicitly approved.

## Source of Truth

Use this hierarchy when making implementation decisions:

1. Accepted Docsera requirements define product behavior, user workflows, access rules, UX expectations, and accepted decisions.
2. The current implementation brief defines the task scope and intended outcome.
3. Existing repository conventions, ServiceNow SDK behavior, and PDI behavior define technical implementation reality.
4. Repo process docs and runbooks define workflow and validation expectations.
5. Prototype and mockup files provide visual and interaction references.
6. Prior chat notes or informal assumptions are secondary unless reflected in accepted requirements or the current implementation brief.

If sources conflict, do not silently choose. Preserve accepted product intent where practical, adapt technical implementation to the repository and platform, and document the conflict in the final summary.

Prototypes are visual and interaction references, especially for layout, spacing, interaction feel, design-system application, modal/overlay behavior, and navigation patterns. They are not exact implementation requirements unless a requirement note or implementation brief explicitly elevates a prototype detail into scope.

## Security and Secrets

- Never commit credentials, passwords, API keys, OAuth secrets, personal access tokens, `.env` files, private certificates, exported credential records, or ServiceNow authentication material.
- Do not place PDI credentials, tokens, or personal instance secrets in source files, documentation, test fixtures, screenshots, or sample configs.
- Use placeholder values in documentation and examples.
- If a task requires secrets or credentials, stop and ask for a safe manual setup path.
- Do not add telemetry, analytics, external network calls, or third-party SaaS dependencies without explicit approval.

## ServiceNow Platform Guardrails

- Keep all application work inside the project scoped app unless explicitly approved.
- Do not modify global-scope artifacts unless the task explicitly requires it.
- Do not modify OOTB ServiceNow records, ACLs, system properties, roles, UI policies, business rules, or platform security settings without explicit approval.
- Do not use OOTB table application-access changes, baseline ACL changes, or other core platform metadata changes as an implementation shortcut.
- Do not add paid ServiceNow plugin dependencies without explicit approval.
- If a protected global resource is required, prefer a narrowly constrained, documented helper or provisioning boundary over changing core platform behavior.
- Any global/helper component must be narrow, justified, documented, and upgrade-safe.
- Prefer local/custom-component development for the editor rather than attempting to force the platform rich text editor into a block-editor role.
- Keep the app PDI-friendly and open-source-friendly.
- For visible UI work, include Jacob-facing manual verification steps when subjective layout, interaction feel, prototype fidelity, drag/drop behavior, editor behavior, or visual polish is affected.

## Technical Implementation Authority

Use the actual repository, ServiceNow SDK behavior, PDI behavior, and existing project conventions as the source of truth for technical implementation details.

Implementation briefs describe intended product behavior and task scope. They may include technical suggestions, but those suggestions are not binding if the repository or platform indicates a better implementation path.

Do not treat speculative file paths, module names, SDK behavior, or architecture notes as requirements.

Do not ask for confirmation on routine technical implementation choices. Use repository conventions, ServiceNow SDK/PDI behavior, and technical judgment.

Pause or report a blocker only when proceeding would change accepted product behavior, require broad out-of-scope work, depend on missing credentials/environment access, conflict with a ServiceNow platform constraint, or require choosing between materially different product/UX interpretations.

## Product Scope Guardrails

- Build a focused product/API documentation experience.
- Keep v1 focused on proving and polishing the core authoring and reader workflow.
- Avoid expanding into real-time collaboration, comments/reactions, AI assistant, Git sync, OpenAPI rendering, Confluence migration, or broad KM replacement unless explicitly approved.
- Preserve content portability: editor content should support source/Markdown-style viewing or export where feasible.
- Do not lock content into opaque rich text if a structured representation is available.

## Editor Guardrails

- Treat the editor as the core product surface.
- Preserve the block-based model.
- Prefer small, well-tested editor behaviors over broad incomplete functionality.
- Do not casually replace Tiptap/ProseMirror without explicit approval.
- Be careful with complex editor features such as tables, columns, drag/drop, slash commands, image handling, and Markdown round-tripping.
- When adding editor behavior, document expected keyboard/mouse interactions and edge cases.

## Root Cause Discipline

- Do not patch symptoms when the true cause is unknown.
- Before changing code, identify the likely root cause and explain the evidence.
- If the root cause is uncertain, say so and propose the smallest investigation that will distinguish between plausible causes.
- Prefer fixing the underlying model, data flow, state ownership, or integration boundary over adding defensive patches around observed symptoms.
- Do not add retries, guards, fallbacks, delays, or special cases unless they address a confirmed failure mode or are explicitly justified.
- When a fix is made, include why it resolves the root cause and what targeted validation proves it.

## Validation Depth Policy

Validation should match change risk and surface area.

- Docs-only edits:
  - Do not run builds or PDI deployment by default.
- Configuration or metadata-only edits:
  - Run the smallest relevant validation available.
- Custom component/editor changes:
  - Run local build/type/lint checks if available.
  - Deploy to the PDI only when runtime behavior must be verified.
- For manual browser/PDI smoke tests, use Playwright CLI from the terminal when a usable in-app browser backend is not attached; establish the authenticated PDI session first and record the fallback in validation notes.
- ServiceNow table/API/security changes:
  - Verify role/ACL behavior and save/load behavior in the PDI.
- Broad/high-risk editor or persistence changes:
  - Run focused regression around editor load/save, mode switching, rendering, and permissions.

For each change, report concisely:
- material commands/validation run
- material validation intentionally skipped
- current blocker or confidence level

For validation guidance, use `docs/process/Test Strategy and Validation Areas.md` as the project reference when deciding which tests/checks to create, update, remove, or run.

Codex is responsible for validating each implementation using the most appropriate available tests and checks. Depending on the change, this may include local tests, build/lint/type checks, ServiceNow ATF, server-side/scripted checks, PDI verification, or manual verification.

If automated validation is not practical, document why and provide repeatable manual verification steps with expected results.

Do not remove failing tests just to make checks pass. Tests may be updated or removed only when accepted requirements or the current implementation brief intentionally change the expected behavior. Explain any removed or materially changed tests in the final summary.

### Regression Coverage Is Required

Regression coverage is part of the definition of done for coded behavior changes.

- Every coded behavior change must add regression coverage or update existing regression coverage to match the new behavior.
- New feature work must include tests for the new behavior.
- Bug fixes must include a regression test that would have failed before the fix.
- Stale tests should be updated when behavior changes intentionally; do not leave obsolete assumptions in place.
- Manual PDI testing is final live verification, not the primary regression test suite.
- If a regression is found manually in the PDI, the next fix must add or update a test that would have caught it.
- Merge readiness should include a short summary of which regression tests were added or updated and what behavior they protect.
- Coverage should be proportional: test the behavior being changed and the nearby workflows most likely to regress, not every possible test type.

## Git Branch and Merge Discipline

- Do not push directly to `main`.
- Work on `feature/*` or `fix/*` branches.
- Treat `main` as stable.
- Keep changes focused and reviewable.
- Do not include unrelated cleanup in feature changes.
- Do not auto-commit uncommitted changes unless explicitly asked.
- Do not auto-merge.
- Ask for explicit user approval before merge.
- Default merge method is squash merge unless explicitly overridden.

## Project Runbooks

Before troubleshooting ServiceNow custom component deployment, UI Builder runtime behavior, or editor mount failures, consult:

- `internal/runbooks/PDI_UI_COMPONENT_DEPLOYMENT.md`
- `internal/runbooks/RUNTIME_EDITOR_DIAGNOSTICS.md`
- `docs/decisions/ADR-0001-editor-architecture.md`

Do not re-run broad dependency/version experiments until the relevant runbook diagnostics have been applied.

## Agent Behavior

- Prefer concise implementation plans before large changes.
- Ask before making architectural changes.
- Do not over-engineer.
- Do not introduce new dependencies unless they materially reduce complexity or are required by the chosen architecture.
- Before adding a new dependency, explain why native/platform options are insufficient.
- Preserve existing project decisions unless there is a clear reason to revisit them.
- When uncertain, make the smallest reversible change that advances the current task.
- Keep status reports concise. Do not repeat unchanged project context, full command inventories, or prior tool findings unless they affect the current decision, blocker, or validation result.
- Every implementation task should end with a concise structured summary covering files created, files modified, behavior implemented, tests/checks run, validation notes, manual verification needed, requirement deviations or platform constraints, and known risks/follow-ups.

## Repo Documentation

- When a task introduces or changes durable implementation behavior, domain contracts, adapter boundaries, persistence assumptions, platform wiring gaps, or workflow state transitions, update or create a compact implementation note under `docs/process`.
- Implementation notes summarize repo-side behavior only.
- Accepted product requirements remain in the Obsidian requirements notes and must not be replaced or contradicted by repo documentation.
- Do not create implementation notes for trivial changes that do not alter durable behavior.
- For ServiceNow SDK Direct UI Page runtime asset behavior, keep guidance aligned with `docs/process/Implementation Notes - Workspace Data Model and Group Provisioning.md` and avoid inferring critical asset URLs from `main.jsdbx` or sibling `/uxasset/externals/...` paths.

## Docsera Local References

When a task references Obsidian requirements, design system notes, prototypes, screenshots, or visual attachments, use these local paths:

- Obsidian vault root: `C:\Users\jacob\OneDrive\Documents\Obsidian Vault`
- Attachments, prototypes, and images: `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Attachments`

Accepted requirements in the Obsidian vault are the source of truth for product behavior.

Prototype HTML files, screenshots, and visual attachments are visual/interaction references only unless the accepted requirements or current task brief explicitly elevate a detail to a requirement.

## Task Completion

For implementation tasks:

- Commit completed changes to the task branch.
- Push the task branch to the remote repository.
- Final summaries must include branch, commit SHA, files created, files modified, behavior implemented, tests/checks run, validation notes, manual verification needed, requirement deviations/platform constraints, and known risks/follow-ups.

## Platform Wiring Notes

It is acceptable to use local adapters, fake services, or demo data while live ServiceNow/PDI wiring is not available, but the boundary must be explicit.

Do not claim live ServiceNow persistence, routing, ACLs, or group/role enforcement is complete unless it has been implemented and verified against the instance.
