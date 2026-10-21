# Implementation Notes - Contained Shell Loading and Persistent Header Stability

Date: 2026-07-10

Status: implementation note

## Purpose

This note records the repo-side shell-loading and launcher/workspace stability behavior added in the current Docsera React runtime.

It documents verified repository behavior only. Accepted product requirements remain defined by the Obsidian notes and the active implementation brief.

## Persistent Shared Header

- The active app renders one shared `DocseraHeader` instance for both launcher and workspace routes.
- Launcher navigation and workspace navigation reuse the same header surface instead of swapping to a route-specific chrome tree.
- Workspace breadcrumbs are supplied from the current page path when the workspace tree is available.
- Parent breadcrumbs are rendered as buttons and the current page is rendered as the non-interactive final crumb.
- During active workspace-to-workspace transitions, the last committed Live/Edit presentation and Workspace Settings presentation stay visible in place while the destination workspace is unresolved.
- Those retained header controls are disabled until the destination workspace resolves, which keeps them from invoking stale workspace actions.
- Once destination capabilities resolve, the header replaces the retained presentation with the destination workspace's actual Live/Edit and Workspace Settings availability.

## Persistent Workspace Shell

- The workspace shell remains mounted across page changes, Live/Edit mode changes, and workspace switching.
- The sidebar search row, sidebar action row, main pane, ToC rail, and divider geometry stay mounted while workspace data is changing.
- Route transitions do not use a separate loading shell or a duplicated workspace frame.
- Navigation collapse keeps the stored/manual navigation width as the authoritative content-geometry value and uses a separate animated grid-track custom property for both the header and workspace grid. The header scopes that track value to the current workspace navigation width, while the workspace shell scopes the track and content-geometry values separately. This keeps Live and Edit document surfaces moving with the panel instead of recalculating their internal content lane before the panel transition finishes.

## Launcher Background Ownership

- The launcher route owns its own light-theme white surface through the launcher route class instead of inheriting the shared app tint.
- The launcher surface also keeps the accepted dark-theme background contract without changing the workspace shell background owner.

## Contained Loading Boundaries

- The previous global transition progress pill above the shell was removed.
- Loading feedback is delayed and stays inside the affected shell regions only.
- The sidebar now keeps the search row mounted and uses contained loading lines inside the tree region when loading is delayed.
- The main pane now keeps the content surface mounted and uses contained loading lines inside the surface when loading is delayed.
- The ToC rail continues to use contained loading lines inside the rail when loading is delayed.
- Fast transitions do not show visible loading feedback.

## Error Placement And Launcher Return

- Workspace load errors are rendered inside the stable main pane.
- The workspace error state uses `Return to My Workspaces` to navigate back to the launcher path.
- The error action does not route through the Live-return handler.

## Draft Containment And Live Projection

- Edit-to-Live transitions continue to suppress the editor host and do not expose draft content while the workspace is loading or switching modes.
- Live mode still uses the published projection path and keeps the editor host lazy.
- The shell does not rely on route-dependent keys to remount the header or workspace frame.

## Content Reveal Transitions

- Successful Live/Edit, workspace-entry, and launcher-entry destination changes use a 400 ms fade-up reveal. Visual/Markdown switches reveal only the destination editor content with opacity over the same duration.
- Workspace entry and Live/Edit reveals coordinate main content, navigation rows, and ToC links from 16 px below their final position with the same timing and easing. Editor mode reveals animate relative top instead of transform to preserve fixed overlay geometry. Breadcrumbs and the persistent application header do not animate.
- My Workspaces entry reveals apply to the loaded launcher content region as one unit, including the intro, toolbar, list states, and pagination. Delayed launcher loading feedback remains visible while the loaded content waits for its reveal.
- Empty workspaces count as ready workspace-entry destinations once their page list has successfully resolved. The empty-state surface consumes the entry intent so creating the first page later does not replay the prior workspace-entry animation.
- The reveal state is driven by explicit destination-aware intents for committed mode/surface changes, workspace navigation entry, launcher navigation entry, and initial route load. Workspace entry intents survive asynchronous workspace/page loading and Edit/editor readiness, and are consumed only by the intended destination surface, including empty workspace surfaces.
- Ordinary page navigation within one workspace, launcher search/pagination/background refreshes, blocked transitions, failed/rejected/canceled/superseded transitions, and lease/readiness progression without a user or initial-load reveal intent remain animation-free.
- Pending destination reveals keep the destination surface visually concealed while workspace records, page records, the editor, or a Markdown source session initialize. Markdown source errors and recovery states still report ready immediately so they are presented without delayed hiding.
- Reduced-motion preferences suppress the reveal animations while preserving the same mounted shell and editor-session behavior.

## Reduced Motion

- Existing reduced-motion handling still disables non-essential transition and loading animations where those styles are present.
- The contained loading-line treatment remains purely structural and does not add decorative motion.

## Classic Wrapper Limitation

- This runtime note does not change the ServiceNow Classic wrapper boundary.
- The Classic wrapper remains outside the active React shell path for this task.
