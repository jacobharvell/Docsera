# RR-030 G2 Accessibility Closeout

**Date:** 2026-10-31
**Status:** Accepted with documented limitations
**Scope:** Cumulative G2 accessibility audit, remediation, regression maintenance, and evidence review on `release/batch-g2-accessibility`.

## Acceptance disposition

G2 is accepted on a risk-based basis. The reviewed corrections resolve the material findings identified in the focused core-path audit:

| Finding | Disposition |
| --- | --- |
| MW-01 - My Workspaces search accessible name | Resolved through the reviewed search-label correction and regression coverage. |
| LR-01 - Live-reader task checkbox name | Resolved through the reviewed task-name correction and regression coverage. |
| VE-01 - keyboard alternatives for page and block reordering | Resolved through reviewed keyboard move actions, boundary handling, announcements, and focus-restoration coverage. |
| AE-01 - Visual-editor textbox accessible name | Resolved through the reviewed `Visual editor content` label and focused regression coverage. |
| AE-02 - Block Actions menu outside a landmark | Closed as a test-harness artifact. Installed-browser landmark inspection found the production menu under the named application `main`; the audit fixture was corrected without changing production portal architecture. |
| VE-02 - precision image resize | Accepted deferred limitation. Keyboard-only authors cannot precisely resize an image; a value-based keyboard width control remains future work. |

The repeatable automated axe audit scanned four representative states - populated My Workspaces, empty My Workspaces, Live reader, and Visual Editor Block Actions - with **zero remaining violations**. The audit still records incomplete checks: `aria-prohibited-attr` in populated My Workspaces and Live reader, and `aria-valid-attr-value` in the Visual Editor. `color-contrast` is excluded because jsdom cannot evaluate rendered layout or palette. These are limitations of the evidence, not passed checks.

Production corrections were independently reviewed and deployed, and live PDI acceptance was reported for the reviewed changes. This closeout relies on that reported acceptance and the recorded source, regression, automated-audit, and installed-browser landmark evidence.

## Evidence reviewed

- `RR-022 G2 Core Keyboard and Semantic Accessibility Audit.md` - source and existing-test inspection that identified MW-01, LR-01, VE-01, and VE-02.
- `RR-027 G2 Automated Accessibility Audit.md` - the four-state axe audit, AE-01 remediation evidence, AE-02 installed-browser landmark disposition, and incomplete-check record.
- Cumulative branch history RR-023 through RR-029 - reviewed corrections for control names, keyboard page/block movement, focus restoration, test maintenance, Visual Editor naming, and the audit fixture.

## Explicit limitations

This acceptance does **not** establish WCAG 2.2 AA conformance. It also does **not** establish accessibility for every Docsera application surface.

The following comprehensive checks were not performed, or were not fully qualified by the available evidence:

- End-to-end keyboard-only verification of all core and non-core workflows, including visible focus and browser-native focus order.
- NVDA (or other screen-reader) verification of reader and authoring workflows, announcements, and overlay behavior.
- Color contrast verification, including rendered light/dark palettes.
- Zoom/reflow and compact-breakpoint verification at 200%/400%.
- Reduced-motion verification.
- Broad browser accessibility-tree verification beyond the installed-browser landmark inspection used to close AE-02.

No unexecuted check is represented as passed. Future accessibility work should retain VE-02 as an explicit known limitation and qualify the unperformed checks before making broader accessibility claims.

## Independent-review summary

Relative to original `main` base `1b2261f507053657c733c399182a776e20d7a9ad`, the cumulative branch is limited to G2 accessibility work:

- focused source audit and automated-audit documentation;
- My Workspaces, Live-reader, Page Tree, Visual Editor, and runtime-shell accessibility corrections;
- targeted regression and axe-audit tests plus their managed-suite registration; and
- two existing implementation notes updated to describe the keyboard move/action behavior.

It contains no SDK metadata, ServiceNow server module, deployment, product-feature, or unrelated release-gate changes. This RR-030 report is the final documentation checkpoint for independent review; it does not authorize merge or additional scope.
