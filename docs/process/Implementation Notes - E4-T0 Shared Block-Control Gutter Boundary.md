## Status

Draft. This note records the completed E4-T0 pointer-boundary proof and cleanup evidence as of Wednesday, July 29, 2026. The production gutter design is still unaccepted.

## Summary

E4-T0 is technically complete because an ordinary browser pointer click reached the temporary control in the PDI after the control was moved into host-owned reserved gutter space, the proof was exercised against paragraph, bulleted-list, and horizontal-rule cases, and the temporary proof UI was then removed again from the deployed runtime.

## Source Inspection

- Paused E4-T1A source inspection still establishes the useful durable findings:
  - top-level paragraph, list, and horizontal-rule identities can be resolved;
  - the top-level targeting contract was not the active failure;
  - selection churn was not the active failure;
  - the real unresolved boundary was host/layout hit testing around the editor surface.
- Source inspection alone was not treated as pointer proof.

## Automated Evidence

- Focused editor-host tests passed locally before the temporary proof deploy:
  - `npm --prefix app/docsera-ui run test -- src/client/editor/PageEditorHost.test.tsx src/client/editor/PageEditorHostRuntime.commands.test.tsx src/client/editor/PageEditorHostRuntime.core.test.tsx --reporter dot --maxWorkers 1`
- Local SDK build passed:
  - `npm --prefix app/docsera-ui run build`
- Temporary-proof deployment and runtime verification passed on Wednesday, July 29, 2026:
  - `npm run deploy:sdk-ui-page`
- The deployed runtime verifier confirmed the current live bundle on Wednesday, July 29, 2026:
  - `main.jsdbx` hash `b4bbe8ede4d80e73d551eb4c6163d7c612782f3758e7e57d99f1612882117f13`
  - `uxpcb=1785379347075`

## Initial Failed PDI Hit Testing

Workspace and page scenario:

- workspace: `task-32-jacob-smoke-populated`
- page: `editor-controls-smoke`
- route shape during proof: runtime page with `?docsera_block_control_proof=legacy` and `#/task-32-jacob-smoke-populated/editor-controls-smoke?mode=edit`

Legacy temporary geometry:

- visible button size: `34px x 34px`
- effective pointer hit area: `44px x 44px`
- reserved gutter width: `0px`
- placement: button rendered left of the editor host hit-test bounds

Representative measured legacy paragraph case:

- editor-host rect: `left 304`, `top 156.234375`, `width 712`, `height 838.09375`
- editor-content rect: `left 304`, `top 156.234375`, `width 712`, `height 838.09375`
- overlay-root rect: `left 304`, `top 994.328125`, `width 712`, `height 0`
- proof-button rect: `left 254`, `top 200.21875`, `width 44`, `height 44`
- workspace-navigation rect: `left 0`, `top 64`, `width 279`, `height 140`
- main-content-container rect: `left 280`, `top 64`, `width 760`, `height 1002.328125`
- proof-button center: `x 276`, `y 222.21875`

Before correction, hit testing at the proof-button center returned surrounding workspace layout rather than the proof control:

- `document.elementFromPoint(...)` returned an unnamed `div`
- `document.elementsFromPoint(...)` started with:
  - `div`
  - `button.docsera-workspace__nav-resizer`
  - `div.docsera-workspace__nav-frame`
  - `div.docsera-workspace`
  - `div.docsera-shell`
  - `div.docsera-app__body`
- composed-tree equivalent inside the editor host was `null`

This reproduces the actual failure boundary: the button was visible, but its center point was outside host-owned hit-test space and was owned by surrounding workspace layout.

## Exact Intercepting Elements

- The strongest direct pre-correction evidence from the paragraph legacy case on Wednesday, July 29, 2026 was:
  - top `document.elementsFromPoint(...)` entry: unnamed `div`
  - immediate surrounding workspace-owned entries:
    - `button.docsera-workspace__nav-resizer`
    - `div.docsera-workspace__nav-frame`
- This matches the previously observed manual/PDI finding that workspace-navigation chrome was intercepting left-of-host pointer hits before the control could receive them.

## Temporary Geometry Correction

The smallest successful correction was contract `1`: reserve gutter width inside the editor host's own layout and hit-test bounds.

Temporary corrected geometry:

- visible button size: `34px x 34px`
- effective pointer hit area: `44px x 44px`
- reserved gutter width: `52px`
- visible/control gap policy during the proof:
  - the hit area stayed inside the editor host;
  - the visible control sat inside that larger transparent hit area;
  - the content was shifted right by host-owned reserved gutter space rather than by pushing the button outside the host
- the control remained entirely inside editor-host bounds

This was proof-only measurement geometry, not an accepted production size decision.

## Successful Ordinary Pointer Evidence

After the temporary host-owned reserved gutter was applied, ordinary browser pointer clicks reached the proof control in the deployed PDI without DOM `.click()`, Playwright `force`, synthetic dispatch, retries, delayed replay, or document-level interception.

Verified block cases:

- paragraph
- bulleted list
- horizontal rule

Verified behavior in the successful reserved proof pass:

- real pointer click opened the proof panel for each case
- intended top-level identity was preserved for each case
- moving from the block into the control did not retarget the intended block
- selection did not move unintentionally
- document JSON did not mutate
- scrolling to the target block still preserved correct control alignment
- the sidebar and outer workspace surface no longer owned the control hit point

Representative successful paragraph reserved case:

- proof-button center click opened the panel with a normal browser pointer click
- selection before click: `{ from: 1, to: 1, role: "collapsed" }`
- selection after click: `{ from: 1, to: 1, role: "collapsed" }`
- actual event target: SVG `path` inside the proof button
- successful click composed path included:
  - `path`
  - `svg`
  - `span.docsera-editor-proof__button-face`
  - `button.docsera-editor-proof__button[data-docsera-block-control-proof-button="reserved"]`
  - `div.docsera-editor-floating-layer`
- this is the required composed-tree proof that the pointer click reached the control itself rather than outer workspace layout

## Keyboard And Focus Evidence

- Keyboard activation remained valid during the temporary proof.
- Escape dismissal was rechecked after the final temporary-proof correction on Wednesday, July 29, 2026.
- After Escape:
  - the proof panel closed;
  - the editor selection remained unchanged;
  - focus returned to the editor inside the host shadow root;
  - the ProseMirror surface was active again.

Representative recheck:

- after pointer-open on the paragraph case, Escape closed the panel and `root.activeElement.classList.contains("ProseMirror")` returned `true`

## Technical Gutter Constraint

- The viable boundary is not "place the control visually near the editor."
- The viable boundary is:
  - reserve enough interactive gutter width inside editor-host-owned layout and hit-test space;
  - keep the effective hit area fully inside that owned space;
  - allow the visible control to be smaller than the effective hit area if visual density requires it.
- The proof does not show that a large visible control is required.
- The proof does show that placing the hit target outside host-owned bounds is not viable.

## Compactness Notes

- Current Docsera floating editor controls are not compact enough for production.
- The current formatting toolbar and paused block-add control remain baseline evidence of the density problem, not accepted targets.
- Legacy Docsera and Mintlify remain the intended density references.
- The temporary `34px` visible proof control and `44px` hit area are evidence only.
- Final visible size, final effective hit area, final gutter width, and final visibility policy are still unresolved.

## Unresolved Product Decisions

- final visible control dimensions
- final effective transparent hit-area dimensions
- final reserved gutter width
- hover-only versus focus/selection/hybrid visibility policy
- whether production controls stay in the overlay root, a host-local wrapper, or another host-owned geometry surface after final design acceptance
- Jacob screenshot comparison and direct density acceptance against Legacy Docsera and Mintlify

## Proof Cleanup And Final PDI State

- The temporary proof interface was removed from source after the successful ordinary-pointer proof.
- The temporary proof query activation was removed.
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx` is identical to the stated base commit `b2f7f88c0e814122a9294aa24bff20c4fc1c16ae`.
- No runtime source file remains in the final branch diff.
- The final runtime was deployed after cleanup.
- The live `main.jsdbx` hash matched local: `32cedc17581e30083d3500dbf2f1d501d963998867abb29cd8dfccde9ef02b1b`.
- The authenticated normal route showed:
  - no proof button;
  - no proof panel;
  - one visible editor host;
  - one visible `.ProseMirror`.
- The normal editor rendered after cleanup.
- Temporary-proof deployment hashes are retained above for proof history and are distinct from the final cleanup deployment hash.

## Validation Notes

- Focused editor-host tests passed locally before the temporary proof deploy.
- SDK build passed locally.
- SDK deployment/runtime verification passed during the temporary proof deploy.
- Manual/PDI browser validation remains the authoritative proof for the pointer boundary.
- The final branch retains the documentation correction and proof evidence, not the temporary runtime UI.

## Next Step

- E4-T0 is technically complete.
- The next Jacob/ChatGPT step is not another hit-test proof.
- The next step is final compact editor-control acceptance:
  - settle visible size versus invisible hit area;
  - settle final gutter density against Legacy Docsera and Mintlify references;
  - then derive the smallest accepted production E4 task.
