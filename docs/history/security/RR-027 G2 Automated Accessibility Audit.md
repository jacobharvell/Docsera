# RR-027 G2 Automated Accessibility Audit

**Date:** 2026-10-31
**Commit audited:** `388c08aad03e55762ae2057a43135fc38f9d125f` (audit implementation was added on this continuation branch after this baseline)
**Environment:** Windows, Node.js 22, Vitest 2.1.9, React Testing Library 16.0.1, jsdom 25.0.1, axe-core 4.11.0.

## Repeatable command

Run from `app/docsera-ui`:

```powershell
npm run test:accessibility-audit
```

This is deliberately a separate managed Vitest suite, not part of ordinary product-regression execution. It runs `src/client/accessibility/RR027AutomatedAccessibilityAudit.test.tsx`. Each scan writes every axe violation to the test output with its rule ID, impact, help text, CSS target, affected HTML, and axe failure summary. A scan failure fails the suite. Violations are reported rather than suppressed so they remain reviewable evidence and require a disposition in this note.

## Surface coverage

Four representative rendered states were scanned using existing React Testing Library/jsdom fixtures and production components:

| State | Representative content |
| --- | --- |
| My Workspaces — populated | Heading, workspace search, New Workspace, workspace navigation link, Settings link, role, and pagination actions. |
| My Workspaces — empty | Heading, active workspace search, and the no-results state. |
| Live reader | Existing supported E2 fixture plus existing multi-item Accordion fixture: headings, external links, ordered/bullet/task lists, task checkboxes, and accordion controls. |
| Visual editor — Block Actions | Real `PageEditorHostRuntime` with two text blocks; the menu is opened with the keyboard Context Menu key so the mounted ProseMirror editing surface, portal root, Block Actions menu, and keyboard Move up/Move down controls are present. |

The reader and editor fixtures are canonical Docsera document fixtures, rather than synthetic standalone markup. The editor test utility creates the same test overlay/portal root used by current editor tests. The Visual Editor audit relocates the utility's returned editor container and overlay root beneath a representative `<main class="docsera-main" aria-labelledby="docsera-page-title">`, matching the landmark ownership confirmed in the installed application; the scan covers `document.body` so that root remains included.

## Rule coverage and exclusions

axe-core's normal jsdom-applicable rules were enabled. `color-contrast` is explicitly disabled because jsdom has no layout, computed visual palette, or rendering engine; treating that result as evidence would be misleading. This is an execution-environment exclusion, not a product finding suppression. No product rule IDs were disabled.

The command does not ignore violations: it prints them in full. It also reports axe `incomplete` checks, which are not counted as violations because axe could not decide them in jsdom.

## Results

### Historical result before fixture correction

The original command passed execution and scanned **four** states. It recorded two axe violations, both in the visual-editor state.

| State | Violations | Incomplete checks |
| --- | ---: | --- |
| My Workspaces — populated | 0 | `aria-prohibited-attr` |
| My Workspaces — empty | 0 | none |
| Live reader | 0 | `aria-prohibited-attr` |
| Visual editor — Block Actions | 2 | `aria-valid-attr-value` |

### AE-01 — Visual editor text input has no accessible name

| Item | Evidence |
| --- | --- |
| Axe rule / impact | `aria-input-field-name` / **serious** |
| Affected element | `.tiptap` (`<div contenteditable="true" role="textbox" ...>`) |
| Axe failure | No `aria-label`, valid nonempty `aria-labelledby`, or `title` is present. |
| User impact | A screen-reader user can encounter the primary Visual-editor editing textbox without a stable name identifying it as the page’s editor/content surface. |
| Classification | **Should-fix** |
| Reproduction | Run the command above; the `visual-editor-block-actions-menu` scan logs the element and full failure summary. |
| Recommended disposition | Add an appropriate contextual accessible name at the editor-host boundary, then retain this scan and add a focused role/name regression assertion. This task does not remediate it. |

This is a confirmed DOM-semantic finding in the mounted editor test surface. The axe impact rating is not automatically treated as release-blocking: the editor remains reachable and operable, but its missing name is material assistive-technology context.

### AE-02 — Block Actions portal is outside the test page landmark

| Item | Evidence |
| --- | --- |
| Axe rule / impact | `region` / **moderate** |
| Affected element | The portal-rendered `<div role="menu" aria-label="Block actions for Text" data-surface="block-actions">` under test-created overlay root `#\:r2\:`. |
| Axe failure | The menu is not contained by a landmark. |
| User impact | If the installed page likewise places the overlay root outside its app landmarks, landmark navigation may not group this menu with the application content. |
| Classification | **Deferred pending browser confirmation** |
| Reproduction | Run the command above; the same visual-editor scan logs the portal target and failure summary. |
| Recommended disposition | Inspect the installed Direct UI Page DOM and accessibility tree before changing portal/landmark ownership. The test utility mounts its overlay root directly under `document.body`, outside the `<main>` wrapper that would exist in a complete application shell, so this can be a fixture topology artifact rather than a deployed-product defect. |

### Updated result after fixture correction

Jacob inspected the installed application's Block Actions menu in Chrome DevTools. The menu has `role="menu"` and an accessible name, and its DOM ancestors reach `<main class="docsera-main" aria-labelledby="docsera-page-title">`. AE-02 was therefore **not reproduced** in the installed application's landmark structure.

The original `region` violation came from the test overlay-root topology: `renderRuntime()` initially appends its overlay root directly to `document.body`. The audit fixture now moves both the returned editor container and overlay root into a representative `docsera-main` landmark, then explicitly unmounts the editor and removes that fixture landmark after the scan. This changes no production portal architecture or shared test utility.

**Verification result (2026-10-31):** the four-state accessibility-audit command passes with AE-01 (`aria-input-field-name`) and AE-02 (`region`) absent from the Visual Editor scan. The Visual Editor scan continues to report `aria-valid-attr-value` as incomplete. The populated My Workspaces and Live reader scans continue to report `aria-prohibited-attr` as incomplete. No axe violations remain in the four audited states.

AE-02 is closed as a **test-harness artifact**, not as a production accessibility remediation.

## RR-028 remediation and verification

RR-028 adds `aria-label="Visual editor content"` through the Visual Editor's existing TipTap `editorProps.attributes`. The attribute is applied directly to the mounted ProseMirror `contenteditable` textbox; it does not depend on the surrounding `Draft editor` section landmark.

The focused editable-surface regression now confirms that the mounted `editor.view.dom` is discoverable as `role="textbox"` with the accessible name **Visual editor content**. The repeatable four-state axe audit also asserts that the Visual Editor scan has no `aria-input-field-name` violation while continuing to report all violations and incomplete checks. Its corrected representative landmark fixture also asserts that `region` is absent.

**Historical verification result (2026-10-31):** the focused editor regression passed **1/1** selected test. The accessibility-audit command passed **4/4** states. The Visual Editor scan reported **one** violation, `region` (AE-02), and `aria-valid-attr-value` remained incomplete; `aria-input-field-name` was absent. The other three scans retained their original violation and incomplete-check results.

This remediation closes AE-01. The fixture correction closes AE-02 as a test-harness artifact; it does not make a production portal/landmark change or alter any other audit finding.

### Incomplete results

`aria-prohibited-attr` was incomplete in populated My Workspaces and the Live reader; `aria-valid-attr-value` was incomplete in the visual editor. axe did not provide a confirmed violation for those checks in jsdom. They require browser accessibility-tree confirmation if they remain reproducible there.

## Relationship to RR-022 source audit

This automated result provides updated evidence for the earlier source findings:

- The named workspace search control now yields no violation in both scanned My Workspaces states.
- Existing task-list accessible-name behavior yields no violation in the live-reader state.
- The editor scan includes the keyboard-opened Block Actions menu and its Move up/Move down menu items. axe can inspect their names and roles, but it cannot prove actual browser key traversal or movement behavior.

These are scoped automated observations, not closure of any accessibility requirement.

## Evidence limitations and required browser follow-up

jsdom/axe checks cannot independently establish WCAG 2.2 AA conformance. This audit does **not** verify actual browser focus behavior or keyboard traversal, visible focus indicators, color contrast, zoom/reflow or viewport clipping, screen-reader announcements, or Shadow DOM/portal behavior that jsdom cannot model reliably. It also does not replace browser verification of ProseMirror's `contenteditable` behavior, overlay focus restoration, or installed Direct UI Page landmark ownership.

Follow-up browser checks should validate AE-01's computed accessible name after remediation and run the RR-022 keyboard/screen-reader checklist for the four core workflows. Installed-browser inspection already established the relevant AE-02 landmark ownership; this jsdom fixture does not replace broader browser accessibility verification.
