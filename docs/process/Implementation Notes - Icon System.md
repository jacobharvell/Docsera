# Implementation Notes - Icon System

## Scope

This note covers app UI outline icons in the active Direct UI Page runtime at `app/docsera-ui`.

It does not cover:

- workspace artwork and uploaded workspace icons
- the built-in Docsera default workspace icon PNG/data URI
- logos, brand marks, avatars, or decorative artwork
- future custom workspace icon modeling or persistence

## Chosen Source

Docsera UI outline icons now standardize on `lucide-react`.

`lucide-react` is consumed as React components inside the Vite/SDK runtime bundle, so the app does not rely on separate icon asset requests or ServiceNow runtime icon URLs.

## Shared Wrapper

Use `src/client/shared/icons/DocseraIcon.tsx` for app UI icons.

Wrapper defaults:

- `strokeWidth={2}`
- `absoluteStrokeWidth={false}`
- decorative by default with `aria-hidden="true"`
- labeled icons opt in through `label`
- caller-controlled `size` and `className`

Use `src/client/shared/icons/docseraIcons.ts` as the central Lucide import surface instead of scattering raw `lucide-react` imports through feature code.

## Styling Convention

Icon stroke weight is owned by the wrapper props, not by app-wide CSS path overrides.

Runtime CSS should keep:

- per-surface icon sizing rules
- color and hover/focus state rules
- layout rules for icon buttons and icon slots

Runtime CSS should not re-normalize icon `path` stroke width globally.

## Current Exceptions

The header sidebar toggle icon intentionally keeps the previous custom inline SVG geometry instead of a Lucide replacement.

Reason:

- the prior double-chevron left/right treatment reads more clearly in this header control than the Lucide panel-toggle alternatives

## Migration Completed In This Task

The current workspaces/runtime UI icon surfaces were migrated to the shared Lucide wrapper, including:

- global header icons
- recent workspaces menu footer icon
- My Workspaces launcher search, clear, pagination, and new-workspace icons
- workspace sidebar search and new-page icons
- page tree chevrons and row action icons
- page settings panel icons
- page delete and workspace-create dialog close icons

## Follow-ups

- Keep new UI outline icons on `DocseraIcon` plus `docseraIcons`
- Leave asset/image-based identity artwork on the existing image path unless product requirements explicitly change
