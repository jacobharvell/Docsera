## Status

Accepted validation reference.

## Summary

This note defines Docsera’s testing and validation strategy for repo implementation work.

It is intended for Codex and future development agents working in the Docsera repository. It provides validation guidance, not a rigid test-suite checklist.

Codex is responsible for selecting, creating, updating, removing, and running the tests or checks that are appropriate for the actual implementation.

## Current Decision

Docsera will use a flexible, Codex-managed validation model.

Validation should be selected based on the actual code change, ServiceNow platform behavior, available repo test patterns, and implementation risk.

Validation may include:

* local unit or component tests
* build, lint, or type checks
* ServiceNow Automated Test Framework where practical
* server-side or scripted checks
* manual verification when automation is unavailable, impractical, or brittle

Validation area IDs are reference labels, not mandatory test suites. They are used to describe common validation concerns and help Codex reason about what should be checked.

## Goals

* Ensure each implementation is validated appropriately.
* Let Codex manage tests naturally as it codes.
* Avoid forcing every task into a rigid test-suite structure.
* Encourage ServiceNow ATF where it provides useful platform validation.
* Allow local tests, scripted checks, and manual verification when more appropriate.
* Keep validation guidance lightweight and practical for MVP development.

## Non-Goals

* This document does not define a complete automated test harness.
* This document does not require every feature task to create new tests.
* This document does not require every validation area to be checked for every task.
* This document does not replace accepted product requirements.
* This document does not define release certification or production deployment gates.

## Validation Principles

### Codex Owns Task Validation

Codex should determine the appropriate validation approach for each implementation task.

Depending on the change, Codex may:

* create new tests
* update existing tests
* remove obsolete tests
* run existing tests
* run build, lint, type, or platform checks
* perform scripted validation
* document manual verification steps

Codex should not skip validation silently.

### Validation Areas Are Not Mandatory Suites

Validation area IDs are reference labels, not fixed checklists.

A task does not automatically require every validation area that could possibly be related. Codex should use judgment based on the actual implementation, accepted requirements, and risk.

Implementation briefs may call out specific validation expectations when product behavior is critical or easy to miss, but Codex remains responsible for selecting the final validation approach.

## Named Logical Suites

Docsera also uses named Vitest suites as practical execution groups.

These suites are a convenience for the common inner loop. They do not replace task-specific judgment, exact file slices, platform verification, or full validation when those are warranted.

Current suite names and package commands:

- `my-workspaces` - `npm --prefix app/docsera-ui run test:my-workspaces`
- `workspace-shell` - `npm --prefix app/docsera-ui run test:workspace-shell`
- `nav-tree` - `npm --prefix app/docsera-ui run test:nav-tree`
- `page-settings` - `npm --prefix app/docsera-ui run test:page-settings`
- `page-model` - `npm --prefix app/docsera-ui run test:page-model`
- `editor-contract` - `npm --prefix app/docsera-ui run test:editor-contract`
- `editor-interactions` - `npm --prefix app/docsera-ui run test:editor-interactions`
- `reader-toc` - `npm --prefix app/docsera-ui run test:reader-toc`
- `publishing-changes` - `npm --prefix app/docsera-ui run test:publishing-changes`
- `workspace-state` - `npm --prefix app/docsera-ui run test:workspace-state`
- `access-security` - `npm --prefix app/docsera-ui run test:access-security`
- `shared-runtime` - `npm --prefix app/docsera-ui run test:shared-runtime`
- Generic selection - `npm --prefix app/docsera-ui run test:suite -- publishing-changes workspace-state page-settings`

Use `publishing-changes` for Publish, Changes Center, Discard, Undo, and pending-change presentation or refresh checks when the user-facing workflow is the primary concern.
Use `page-settings` for Page Settings editing, dismissal, save behavior, reopening, rebinding, and restoration UX.
Use `workspace-state` for lease, generation, queue ordering, recovery, and other authority or persistence transitions.
Cross-cutting changes may legitimately run multiple suites when one behavior spans both the workflow surface and the authority boundary.

The complete `npm --prefix app/docsera-ui run test` path remains the authoritative broad test run and should be treated as an integration checkpoint, not the normal inner loop.

### Prefer Existing Patterns

Codex should prefer existing repo and ServiceNow testing patterns when available.

Do not introduce a new test framework, major test harness, or broad validation architecture unless the current task requires it or the implementation reveals a durable project need.

### ServiceNow-Aware Validation

Docsera runs on ServiceNow, so validation should account for platform behavior.

Use ServiceNow Automated Test Framework where practical for:

* platform workflows
* role and permission behavior
* record behavior
* form or UI workflows that ATF can exercise reliably
* end-to-end ServiceNow behavior

Use local tests or scripted checks where they are more appropriate for:

* isolated utilities
* component behavior
* rendering logic
* data transformation
* local build quality
* non-platform-specific code

### Manual Verification Is Acceptable When Appropriate

Manual verification is acceptable when automated validation is unavailable, impractical, or too brittle.

When manual verification is used, Codex must document:

* why automated validation was not used
* repeatable manual steps
* expected result for each step

Manual verification should be specific enough that the user or a future agent can repeat it.

### Do Not Remove Tests Just to Pass

Codex may update or remove obsolete tests when accepted requirements or the current implementation brief intentionally change expected behavior.

Codex must not remove failing tests simply to make checks pass.

Any removed or materially changed tests must be explained in the final implementation summary.

## Validation Areas

### VA-BUILD-CHECKS — Build, Lint, and Static Checks

Purpose:

Validate that the project still builds and basic code quality checks pass.

Applies to:

* build configuration changes
* dependency changes
* TypeScript or JavaScript changes
* component changes
* server-side script changes where local checks exist

Preferred validation:

* existing build command
* existing lint command
* existing type check command
* smallest relevant check available

Fallback:

* document why local checks could not be run
* provide manual or platform verification steps if relevant

### VA-UI-SMOKE — UI Smoke Behavior

Purpose:

Validate that key UI surfaces render and basic interactions work.

Applies to:

* page layout changes
* modal or overlay behavior
* navigation changes
* settings panels
* workspace and page list views
* theme/layout behavior where applicable

Preferred validation:

* existing component tests if available
* local UI interaction tests if available
* ServiceNow UI validation when behavior depends on platform rendering

Fallback:

* manual browser/PDI verification with repeatable steps and expected results

### VA-WORKSPACE-CORE — Workspace Core Behavior

Purpose:

Validate core workspace creation and workspace metadata behavior.

Applies to:

* workspace creation
* workspace name and description handling
* workspace icon handling
* default workspace values
* creator assignment behavior
* workspace record persistence

Preferred validation:

* ServiceNow ATF for end-to-end workspace creation where practical
* server-side or scripted checks for record validation
* local tests for isolated validation logic where available

Fallback:

* manual PDI verification with record inspection and expected results

### VA-WORKSPACE-ACCESS — Workspace Access and Role Behavior

Purpose:

Validate workspace-level permissions, visible actions, and role-sensitive behavior.

Applies to:

* Docsera Admin behavior
* Workspace Admin behavior
* Workspace Editor behavior
* settings visibility
* create/edit/delete permissions
* group or role assignment behavior

Preferred validation:

* ServiceNow ATF using users or roles where practical
* server-side permission checks
* ACL or role validation scripts where available

Fallback:

* manual impersonation or role-based PDI verification with expected results

### VA-PAGE-MODEL — Page Model and Hierarchy

Purpose:

Validate page records, workspace ownership, parent-child rules, and ordering behavior.

Applies to:

* page creation
* parent page assignment
* workspace scoping
* sibling ordering
* moving pages
* deleting pages with children
* page tree persistence

Preferred validation:

* server-side or scripted checks for data integrity
* ServiceNow ATF where platform workflow validation is practical
* local tests for isolated page model logic where available

Fallback:

* manual record and UI verification with expected results

### VA-PAGE-SLUGS — Page Slug Behavior

Purpose:

Validate page slug uniqueness, allowed values, collision handling, and slug persistence.

Applies to:

* page creation
* page rename/settings behavior
* slug field editing
* slug uniqueness rules
* slug collision handling
* URL/breadcrumb behavior where applicable

Preferred validation:

* server-side or scripted checks for slug rules
* local tests for slug helper logic where available
* ServiceNow ATF for UI workflow where practical

Fallback:

* manual page creation/editing verification with expected results

### VA-NAV-TREE — Navigation Tree Behavior

Purpose:

Validate the workspace page tree and navigation interactions.

Applies to:

* page tree rendering
* active page state
* expand/collapse behavior
* create child page actions
* page settings gear visibility
* drag/drop reordering
* drop-inside, drop-before, and drop-after behavior
* persisted page order

Preferred validation:

* component or UI tests where practical
* ServiceNow ATF for durable workflow validation where practical
* server-side checks for persisted order and hierarchy

Fallback:

* manual UI verification, especially for drag/drop interactions that may be brittle to automate early

### VA-PAGE-SETTINGS — Page Settings Overlay Behavior

Purpose:

Validate the page settings overlay, field validation, and delete behavior for authorized users.

Applies to:

* page settings gear visibility
* page settings overlay entry points
* title field editing
* slug field editing
* inline validation errors
* same-workspace slug conflict handling
* delete confirmation and subtree deletion
* post-delete selection behavior
* viewer-only access hiding

Preferred validation:

* scripted checks for page-settings helpers where practical
* component or UI tests for panel interactions where practical
* ServiceNow ATF for durable workflow validation where practical

Fallback:

* manual UI verification for overlay and commit-on-close behavior

### VA-PUBLISHING — Publishing and Draft Behavior

Purpose:

Validate draft, published, unpublished changes, and publish/discard behavior.

Applies to:

* draft page creation
* publish action
* unpublished changes
* editor-visible changes
* published content visibility
* discard or undo behavior where implemented
* publish state transitions

Preferred validation:

* server-side or scripted checks for state transitions
* ServiceNow ATF for publish workflows where practical
* local tests for publish-state helpers where available

Fallback:

* manual workflow verification with record inspection and expected results

### VA-EDITOR-SHELL — Authoring and Editor Shell

Purpose:

Validate the surrounding authoring experience, excluding deep editor block behavior unless the task specifically includes it.

Applies to:

* editor loading
* title editing
* autosave indicator behavior
* editor shell layout
* mode state
* basic save/persistence behavior
* editor access behavior

Preferred validation:

* component or UI tests where practical
* ServiceNow UI/ATF validation for platform-integrated workflows
* scripted checks for persistence

Fallback:

* manual editor workflow verification with expected results

### VA-REGRESSION — Regression Coverage

Purpose:

Validate previously broken or high-risk behavior remains fixed.

Applies to:

* bug fixes
* previously unstable workflows
* areas affected by refactors
* repeated Codex or implementation failure points

Preferred validation:

* targeted regression test for the specific bug or failure path
* existing test update if behavior changed intentionally

Fallback:

* manual reproduction steps showing the original failure no longer occurs

## Suite Selection Matrix

Representative examples:

- My Workspaces filtering change -> `my-workspaces`
- Header or route change -> `workspace-shell`
- Drag-and-drop hierarchy change -> `nav-tree`, plus `page-model` when page allocation or sibling-order contracts change, plus `workspace-state` when persistence or projection changes
- Page creation or page hierarchy change -> `page-model`, plus `workspace-state` when server authority or recovery changes
- Toolbar-only visual interaction -> `editor-interactions`
- New canonical mark or node -> `editor-contract`, `reader-toc`, and affected editor tests
- Publish, Discard, or Undo change -> `publishing-changes`, plus `workspace-state` when server workflow changes
- Shared permission change -> `access-security`, plus affected consumer suites
- Global stylesheet or runtime primitive change -> `shared-runtime`, plus visibly affected product suites

## Task-Type Guidance

### Feature Implementation

Feature tasks should validate the new behavior and the highest-risk adjacent behavior.

Codex should prefer focused validation over broad test runs unless the change is risky or cross-cutting.

### Bug Fix

Bug fixes should validate the failure path.

Codex should identify the likely root cause before changing code and add or update regression coverage where practical.

### Technical Spike

Technical spikes are discovery-oriented.

Validation should support the findings, but production tests are not required unless the spike explicitly includes implementation.

Exploratory code changes should be identified clearly and either reverted or recommended as follow-up work.

### Refactor

Refactors should preserve behavior.

Codex should run relevant existing tests/checks and add regression coverage only if the refactor exposes an untested risk.

### Documentation

Documentation-only changes may not require automated testing.

Codex should still check links, references, filenames, or formatting where practical.

## Final Summary Expectations

When reporting validation work, Codex should summarize:

* tests or checks created
* tests or checks updated
* tests or checks removed
* commands or platform checks run
* results
* validation areas considered when useful
* manual verification needed
* reason automation was not used, if applicable
* risks or gaps that remain

If a validation gap appears durable across future tasks, Codex may update this document and report that process-doc change in the final summary.

## Future Considerations

Possible future additions:

* search validation area
* attachments/media validation area
* import/export validation area
* version history validation area
* review automation runbook
* release validation checklist
* PR template
