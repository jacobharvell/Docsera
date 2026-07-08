# Regression Testing Strategy

## Status

Accepted process guidance.

## Purpose

Regression coverage is part of Docsera's definition of done for coded behavior changes.

This note keeps the rule compact and practical. It is not a mandate to run every test type on every task.

## Core Rule

- Every coded behavior change must add regression coverage or update existing regression coverage to match the new behavior.
- New feature work must include tests for the new behavior.
- Bug fixes must include a regression test that would have failed before the fix.
- Stale tests should be updated when behavior changes intentionally.
- Manual PDI testing is final live verification, not the primary regression test suite.
- If Jacob finds a regression manually in the PDI, the next fix must add or update a test that would have caught it.
- Merge readiness should include both `tests passed` and a short summary of the regression tests added or updated and the behavior they protect.

## Coverage Style

- Keep coverage proportional to the change.
- Test the behavior being changed and the nearby workflows most likely to regress.
- Do not require every task to add every test type.
- Prefer updating an existing test over leaving an obsolete assumption in place.

## Critical Workflow Examples

Regression coverage should be considered for these common Docsera workflows when they are touched:

- create page persists after refresh or list reload
- delete page disappears immediately and stays gone after refresh
- empty workspace still shows sidebar and Add Page
- page body save persists after refresh
- Page Settings title, slug, and delete behavior
- selected page URL routing by `page_id`
- server module boundary safety
- inline runtime CSS architecture staying intact

## Practical Outcome

When a task changes coded behavior, the test work should answer:

- what new behavior is now protected
- what old assumption was removed or updated
- what nearby workflow is most likely to regress if this changes again

That is enough for most tasks. Keep the process lightweight, but do not treat regression coverage as optional.
