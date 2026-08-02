# Implementation Notes - Legacy Text Toolbar Evidence and Reconstruction Plan

Date: 2026-08-01

Status: spike / evidence note

## Purpose

This note captures repo-grounded evidence for reconstructing the compact selected-text toolbar in E4-T4C.

It is not an accepted product requirement. It records source inspection, test inventory, current-branch comparison, and a proposed reconstruction boundary for the next task.

Legacy Docsera evidence was found in `C:\Dev\docsera-editor-reference\studio`.

## Legacy Source Inventory

| Responsibility | Legacy file | Key symbol/component | Tests | Relevant behavior |
| --- | --- | --- | --- | --- |
| Selected-text toolbar render and commands | `studio/src/components/Editor.tsx` | `BubbleMenu`, `BLOCK_TYPE_OPTIONS`, `MAIN_BUBBLE_BLOCK_TYPE_OPTIONS`, `applyBlockType`, `applyBubbleOverflowBlockquote`, `toggle*FromBubble`, `openLinkPopup` | `studio/tests/e2e/table-content-block-v1.spec.ts` (`bubble toolbar appears for text selected in cells and formatting applies`, `link popup stays open when moving from toolbar trigger into popup in root blocks`, `link popup stays open when moving from toolbar trigger into popup in table cells`, `clicking inside selected text collapses selection and closes the main bubble`) | Renders the compact floating toolbar, the block-type trigger, the More menu trigger, inline mark buttons, and the toolbar-owned link trigger. |
| Selection timing and pointer-drag suppression | `studio/src/components/editor/useBubbleLinkMenuController.ts` | `shouldShowBubbleMenu`, `startMouseSelectionSession`, `onMouseSelectionPointerMove`, `endMouseSelectionSession`, `applyBubblePointerMovingVisibilityOverride`, `forceBubbleMenuRefreshForSelection`, `useFrozenBubbleAnchor` | `studio/tests/e2e/table-content-block-v1.spec.ts` and `studio/tests/e2e/gutter-selection-regressions.spec.ts` (`new A: post-drop bubble toolbar stays closed at immediate checkpoints`, `post-drop: multi-block drag leaves no text highlight or bubble toolbar`) | Hides the bubble while pointer motion is active, delays bubble updates during drag-selection, and re-shows after an idle pause or pointer release. |
| Link popup ownership, click-away, and selection preservation | `studio/src/components/editor/useBubbleLinkMenuController.ts` | `openLinkPopup`, `closeLinkPopup`, `suppressSpecificBubbleSelection`, `openLinkPopupFromEditorLinkClick`, `armContentClickAway`, `resolveContentClickAway` | `studio/tests/e2e/table-content-block-v1.spec.ts` (`creates, edits, removes, and follows safe links without navigating away`, `dismisses the link surface when the editor receives another pointer action and keeps the replacement selection`, `closes the link surface on an outside-shell pointerdown without changing content`, `rejects unsafe, invalid, blank, and cancelled link input`) | Keeps link controls interactive while focus moves into the popup, preserves the selected range, and suppresses stale bubble revival. |
| Overlay exclusion and drag-handle coexistence | `studio/src/components/editor/useBlockContextDragHandleController.ts` | `overlayExclusionRefs`, `dismissMainBubble`, `closeLinkPopup`, `setIsBlockContextMenuOpen` | `studio/tests/e2e/gutter-selection-regressions.spec.ts` (`scenario 4`, `scenario 5`, `scenario 6`, `post-drop...`, `flash stress...`) | Prevents gutter drag and block-context logic from stealing the selected-text toolbar or link popup interaction boundary. |
| Shared tooltip styling and non-toolbar icon controls | `studio/src/app/globals.css`; `studio/src/components/editor/DocseraImage.tsx`; `studio/src/components/editor/AccordionDetailsNodeView.tsx`; `studio/src/components/editor/TableControlsOverlay.tsx` | `.docsera-editor-tooltip`, `.docsera-editor-tooltip__bubble` | No toolbar-specific tooltip regression test found in the legacy tree | Shared tooltip bubble exists for other icon controls. The selected-text toolbar itself uses native `title` attributes with platform-aware shortcut labels instead of a custom tooltip component. |

## Legacy Test Inventory

### Toolbar and link behavior

- `studio/tests/e2e/table-content-block-v1.spec.ts`
  - `bubble toolbar appears for text selected in cells and formatting applies`
  - `link popup stays open when moving from toolbar trigger into popup in root blocks`
  - `link popup stays open when moving from toolbar trigger into popup in table cells`
  - `direct link click closes without reviving the main bubble on outside click`
  - `direct link click keeps main bubble hidden while interacting with popup input`
  - `direct link click opens only link popup across repeated interactions`
  - `returning focus to the editor from the link input does not revive the main bubble`
  - `clicking inside selected text collapses selection and closes the main bubble`

- `studio/tests/e2e/gutter-selection-regressions.spec.ts`
  - `new A: post-drop bubble toolbar stays closed at immediate checkpoints`
  - `post-drop: multi-block drag leaves no text highlight or bubble toolbar`
  - `post-drop: single-block drag then outside click never leaves selected artifact`
  - `flash stress: single-block reorder has no post-drop text selection or bubble flash`
  - `flash stress: multi-block reorder has no post-drop text selection or bubble flash`

- `studio/tests/e2e/slash-lifecycle-regressions.spec.ts`
  - Escape coverage for slash lifecycle and quick-add transitions

- `studio/tests/e2e/accordion-content-block-v1.spec.ts`
  - Escape coverage for accordion body slash flows and block-menu return paths

## Legacy Behavior Gaps

The legacy tests do not explicitly pin every behavior the reconstruction needs:

- toolbar centering over the selected range;
- pointer-drag idle timing as a standalone assertion;
- keyboard-created selection timing versus pointer-created selection timing;
- menu-shell height remaining constant while nested menus open;
- exact background opacity, radius, divider thickness, and button spacing as explicit regressions;
- same-type block no-op handling as a dedicated case.

Those behaviors are still evidenced by source, but not all of them are directly locked by a regression test.

## Behavior Comparison

| Behavior | Legacy | Current branch | Accepted target | Reconstruction action |
| --- | --- | --- | --- | --- |
| Drag suppression | Mouse-session state tracks drag intent, hides the bubble during active pointer motion, and only re-shows after idle or release. | `toolbarVisible` is derived directly from selection state; no pointer-session gate exists. | Toolbar should not appear as soon as click-drag begins. | Move pointer-session ownership into the toolbar controller and hide the surface until drag intent settles. |
| Idle appearance | `bubbleMouseIdleMs` delays bubble updates during mouse selection. | No equivalent idle gate. | Pointer-created selections should wait briefly before showing the toolbar. | Restore the idle window and keep keyboard selections on the immediate path. |
| Keyboard selection | Keyboard-created text selections are not treated as active mouse sessions. | No pointer-vs-keyboard distinction. | Keyboard-created selections should show without the pointer delay. | Separate pointer-session suppression from selection-only visibility. |
| Centering | BubbleMenu uses selection geometry and a frozen virtual anchor for stable positioning. | `getSelectionBounds()` feeds `clampSurfacePosition()`, which clamps from `rect.left` instead of centering on the range. | Toolbar should be centered over the selected text, then viewport-clamped. | Compute an anchor from the selection center or reuse BubbleMenu/Floating UI geometry. |
| Toolbar dimensions | Compact bubble shell stays compact; nested menus do not resize the shell. | `buildSurfaceStyle(..., openToolbarMenu ? 236 : 40, true)` changes the outer surface height. | Opening menus should not move the toolbar. | Keep the shell height fixed and render menus out of flow. |
| Background | Legacy shell is translucent but still a clearly bounded floating panel. | Current branch uses a very translucent editor-only panel with blur. | Toolbar should read as a solid Docsera surface, not glass. | Re-skin with current shell tokens and reduce translucency. |
| Radius | Legacy shell and menus use moderate radii, not pill-like corners. | Current branch uses 16px shell corners and 12px/10px menu/button corners. | Compact toolbar should feel tighter and more Docsera-native. | Reduce roundness to match current shell surfaces. |
| Dividers | Legacy uses a visible 1px divider in the compact row. | Current divider exists but is visually weak against the translucent shell. | Divider should visibly separate groups without adding space. | Use a stronger shell divider token and keep the row compact. |
| Menus | Block-type and More menus are nested overlays inside the toolbar and do not change the shell footprint. | The menus are nested, but the shell height changes when one opens. | Menus should be independent overlay surfaces that do not move the toolbar. | Give each nested menu its own geometry and keep the outer toolbar fixed. |
| Hover | Legacy uses blue-tinted hover/active states inside the floating editor shell. | Current branch also uses editor-specific blue states, but they do not match shell-level Docsera patterns. | Hover should match current Docsera rows, buttons, and menu items. | Rebase hover styling on existing shell components instead of inventing a new palette. |
| Selected state | Legacy active rows are blue-tinted and clearly marked. | Current branch active states are blue-tinted editor-only surfaces. | Selected and active states should match the rest of Docsera. | Use current shell selected-row and active-button tokens. |
| Tooltips | Toolbar shortcuts use native `title` labels with platform-aware modifier text. | Current branch also uses platform-aware titles. | Shortcut hints should stay platform-aware; custom tooltip chrome is optional. | Preserve label formatting and only add a custom tooltip surface if product wants hover/focus timing beyond native titles. |
| Focus | Legacy mousedown handlers prevent premature blur and restore selection before commands run. | Current branch restores selection before commands, but focus ownership is split across a manual overlay. | Controls must stay usable without collapsing selection. | Keep one owner for selection restoration and command execution. |
| Escape | Legacy Escape closes slash, bubble, link, block menus, and selection modes with explicit dismissal logic. | Current branch handles some Escape paths, but not through one unified toolbar owner. | Escape should dismiss the topmost surface first and preserve selection intent. | Centralize Escape layering with one toolbar-owned dismissal stack. |
| Click-away | Legacy click-away logic is explicit and stateful, including link-popup and toolbar-owned selection suppression. | Current branch uses overlay-root pointerdown for link surface dismissal, but the toolbar stack is not fully independent. | Click-away should close the intended surface without reviving stale selection. | Keep click-away within the toolbar controller and do not let nested surfaces own unrelated dismissal rules. |

## Visual-Token Mapping

| Surface/state | Legacy styling evidence | Current Docsera source/token | Recommended production treatment |
| --- | --- | --- | --- |
| Compact toolbar shell | `.docsera-editor-floating`, `.docsera-editor-floating--compact-toolbar` in `PageEditorHostRuntime.tsx`; translucent panel, blur, 16px shell radius | `runtime-shell.css` menus, pills, icon buttons, and row states; especially `docsera-header__menu`, `docsera-header__ghost-button`, `docsera-sidebar__icon-button`, `docsera-page-tree__row` | Rebuild the toolbar shell from the current shell tokens, not from a third editor-only visual language. |
| Button hover and active | `.docsera-editor-floating__compact-icon-button--active`, `.docsera-editor-floating__block-trigger:hover`, `.docsera-editor-floating__menu-item--active` | `docsera-sidebar__icon-button:hover`, `docsera-page-tree__row--selected`, `docsera-header__mode-segment--active`, `docsera-header__menu-item--current` | Use the shell's neutral hover and selected-row patterns for the toolbar buttons. |
| Block-type dropdown | `.docsera-editor-floating__menu`, `.docsera-editor-floating__menu-item`, `.docsera-editor-floating__menu-item-check` | `docsera-header__menu`, `docsera-header__menu-item`, `docsera-header__menu-item--current`, `docsera-header__menu-divider` | Keep menu density compact and use the shell menu/checkmark treatment as the production baseline. |
| More menu | Same menu classes as block-type dropdown; separate `More` trigger state | `docsera-header__menu` family and `docsera-page-tree__row--selected` for active state semantics | Keep the menu independent from toolbar height and mirror shell menu spacing and active-row semantics. |
| Divider | `.docsera-editor-floating__divider` | `docsera-main__divider`, `docsera-header__menu-divider` | Use a visible 1px divider contract, not a faint glass-panel rule. |
| Status/pill-like surfaces | `.docsera-editor-floating__chip`, `.docsera-editor-floating__action`, `.docsera-editor-floating__secondary` | `docsera-main__status-pill`, `docsera-header__mode-toggle`, `docsera-header__publish-button` | Compact toolbar action chips should borrow the current shell's pill/button proportions and border treatments. |
| Tooltip | Native `title` labels in `Editor.tsx`; shared `docsera-editor-tooltip` CSS in `globals.css` for other editor icon controls | `docsera-editor-tooltip`, `docsera-editor-tooltip__bubble` | Keep native shortcut labels for the toolbar unless a custom tooltip bubble is intentionally added for hover/focus timing. |
| Light/dark tokens | Legacy editor uses its own `--docsera-editor-*` panel/text tokens | `--docsera-surface-*`, `--docsera-border-*`, `--docsera-text-*`, `--docsera-primary`, `--docsera-secondary` in `runtime-shell.css` | Production toolbar styling should pull from the shell tokens so the editor does not invent a third palette. |

## Retain, Reject, Improve

| Legacy behavior or pattern | Classification | Reason | Required regression coverage |
| --- | --- | --- | --- |
| Mouse-session drag suppression with an idle window | Retain | This is the core behavior that prevents toolbar flash during click-drag selection. | Pointer movement suppression; pointer idle appearance; continued-drag hide/reappear. |
| Keyboard-created selection shows toolbar immediately | Retain | Keyboard selection is not a drag gesture and should not inherit pointer suppression. | Keyboard selection behavior; selection-centered geometry. |
| Selection-centered floating geometry | Retain | The toolbar should track the selected range, not the left edge of the first character. | Selection-centered geometry; no toolbar movement when a menu opens. |
| Block-type and More menus as separate nested surfaces | Retain | Menus must not resize or displace the toolbar shell. | Toolbar/menu independent positioning; menu exclusivity; click-away; Escape layering. |
| Selection restoration before toolbar commands | Retain | Commands must operate on the original range even when focus moves to controls. | Selection preservation; link integration; block conversion matrix. |
| Native `title` shortcut labels with platform-aware modifier text | Retain | This is already proven and lightweight. | Platform shortcut labels; hover/focus behavior if a custom tooltip is added later. |
| Current translucent, extra-rounded editor-only shell | Reject | It creates the wrong visual language and makes separators and menu structure hard to read. | Compact dimensions and token contracts; light/dark styling. |
| Shell height that changes when a nested menu opens | Reject | This is one of the visible regressions and breaks toolbar stability. | No toolbar movement when a menu opens; toolbar/menu independent positioning. |
| Left-edge clamped geometry instead of centered selection geometry | Reject | It explains the observed mis-centering. | Selection-centered geometry. |
| Same-type no-op behavior only as an implied command side effect | Improve | It should be explicit if the product wants true no-op behavior on same-type selections. | Block conversion matrix, including same-type cases. |
| Shared tooltip CSS outside the toolbar | Improve | Useful as a shell-consistent pattern, but not yet the toolbar's main tooltip contract. | Tooltip hover/focus behavior; platform shortcut labels. |

## Current Implementation Root Causes

- The toolbar appears immediately when click-drag begins because `toolbarVisible` in `PageEditorHostRuntime.tsx` is derived directly from the live selection role and emptiness, with no mouse-session suppression state.
- The toolbar does not center over selected text because `getSelectionBounds()` measures the selection, but `clampSurfacePosition()` anchors the surface from `rect.left` instead of the selection center.
- The background is too translucent and the corners are too rounded because the current floating shell is styled with an editor-only panel token, `backdrop-filter: blur(14px)`, `border-radius: 16px`, and similarly rounded nested menus and buttons.
- The divider is visually weak because it uses a softened panel-border mix inside a translucent shell rather than a stronger shell divider token.
- Opening the block-type or More menu moves the toolbar because `buildSurfaceStyle(..., openToolbarMenu ? 236 : 40, true)` changes the outer surface height instead of keeping the shell fixed.
- The menus are not independent overlay surfaces because they are rendered inside the same floating shell and do not own separate geometry.
- Hover and selected states do not match established Docsera patterns because the current toolbar invents its own editor-only blue-tinted palette instead of reusing shell token semantics from the rest of the app.
- The editor-pane colors do not align with the established Docsera styling because the runtime uses a separate `--docsera-editor-*` token family instead of the shell's existing surface, border, text, and active-state tokens.

## Proposed Reconstruction Architecture

Recommended next-step boundary for the reconstruction:

- Remove the current `PageEditorHostRuntime.tsx` compact-toolbar geometry and styling path rather than patching it incrementally.
- Recreate the toolbar as one owner for selection visibility timing, selection-centered geometry, and toolbar-owned nested surfaces.
- Keep the pointer-session state in that same owner so drag intent, idle delay, and keyboard-vs-pointer selection timing cannot race in separate hooks.
- Adapt the legacy selection model from `useBubbleLinkMenuController.ts`, but reimplement the geometry and overlay plumbing for the shadow-root child-host boundary used by the current runtime.
- Keep the block-type dropdown and More menu as independent overlay panels anchored to the toolbar trigger and toolbar shell, not as height-changing children that resize the shell.
- Preserve selection by restoring the saved range before every command and by freezing link-popup geometry when focus moves into the popup input.
- Apply current Docsera shell tokens to the production toolbar surface, buttons, menus, dividers, hover, and active states.
- Keep the shared tooltip contract lightweight: platform-aware labels remain required; a custom tooltip bubble is optional unless a product decision explicitly requires it.

## Revised E4-T4C / E4-T4D Boundary

This spike supports moving the following work into E4-T4C, not deferring it:

- pointer-drag idle behavior;
- keyboard-created selection timing;
- selection-centered toolbar positioning;
- independent block-type and More overlays;
- selection preservation while toolbar controls are used;
- current Docsera token alignment for the toolbar shell, buttons, menus, and dividers.

That boundary should be revised because the failures are not cosmetic-only. They are core toolbar behavior and the current code cannot be accepted while leaving them for a later task.

E4-T4D can still own later polish that is not required to restore the core toolbar contract, such as any optional extra tooltip styling refinement or secondary visual tuning after the core geometry and interaction behavior is stable.

## Validation Plan For The Future Reconstruction

### Pure helper tests

- selection geometry helper returns a centered anchor and stable viewport-clamped placement;
- pointer-session state transitions hide the toolbar while moving and re-show it after the idle threshold;
- block conversion mapping covers paragraph, heading 1/2/3, unordered list, numbered list, blockquote, and same-type no-op cases;
- menu state reducer keeps only one toolbar-owned nested surface open at a time;
- shortcut-label helper keeps `Ctrl`/`Command` mapping platform-aware.

### Component / runtime tests

- pointer movement suppression;
- pointer idle appearance;
- continued-drag hide/reappear behavior;
- keyboard selection behavior;
- selection-centered geometry;
- toolbar/menu independent positioning;
- no toolbar movement when a menu opens;
- exact control order;
- compact dimensions and token contracts;
- block conversion matrix;
- More-menu checked semantics;
- tooltip hover/focus behavior;
- menu exclusivity;
- selection preservation;
- link integration;
- click-away and Escape layering;
- light/dark styling;
- shadow-root child-host behavior for the production runtime.

### Generated CSS / token verification

- assert the toolbar shell uses the current shell token family rather than an editor-only palette;
- verify divider contrast, button radius, menu radius, and selected-state treatment against shell patterns;
- verify light and dark mode token selection;
- verify the toolbar does not regress to the old translucent/pill-like presentation.

### Existing SDK runtime verifier

- keep the current runtime verifier path for the mounted child host;
- do not add Playwright as a new dependency for this reconstruction spike;
- reuse the existing verifier implementation for any child-host smoke checks that already exist in the repo.

### Jacob manual PDI acceptance

- click-drag selection should not flash the toolbar immediately;
- toolbar should appear centered over the selected text after the idle window;
- opening block-type or More must not move the toolbar;
- block conversions and link interaction should preserve the intended selection;
- Escape and click-away should close the topmost surface first;
- light and dark themes should match the current Docsera shell language;
- shadow-root mounting should not change the toolbar ownership rules.

## Unresolved Questions And Missing Evidence

- The legacy implementation proves the core interaction model, but it does not explicitly assert every requested geometry measurement in tests.
- The toolbar tooltip contract is native-title based in the legacy source; if the product later wants a custom tooltip bubble for the toolbar, that would be a deliberate improvement rather than a legacy requirement.
- Same-type no-op behavior for block conversion is not explicitly locked by legacy regression coverage and should be clarified before it becomes a hard contract.
- The current reconstruction must still be verified against the shadow-root child-host runtime, because the legacy source was built around a different host arrangement.

## Scope And Authority Notes

- This note does not change accepted Docsera requirements.
- This note does not modify runtime code, styles, tests, ServiceNow records, or PDI state.
- This note records evidence only and is intended to guide the next implementation task.
