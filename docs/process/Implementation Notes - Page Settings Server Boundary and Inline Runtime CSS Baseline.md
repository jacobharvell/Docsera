# Implementation Notes - Page Settings Server Boundary and Inline Runtime CSS Baseline

## Scope

- Page settings validation and subtree/delete helper logic now live in `app/docsera-ui/src/server/pages/serverPageDomain.ts`.
- `app/docsera-ui/src/server/pages/serviceNowPageSettings.ts` no longer imports helper logic from `src/shared/pages/domain.ts`.
- A test guard in `app/docsera-ui/test/serverModuleBoundaries.test.ts` blocks server runtime imports from `../shared` and `../../shared`.
- The SDK runtime CSS path uses the inline-string baseline:
  - `src/client/styles/runtime-shell.css`
  - `src/client/main.tsx` imports `./styles/runtime-shell.css?inline`
  - `src/client/runtimeStylesheet.ts` injects one style tag
- The obsolete postbuild CSS asset patching path was removed.

## Delete Flow

- Delete success removes the page subtree from the workspace state and navigates to the next visible page.
- Delete failure leaves the current page tree intact and surfaces a safe error in the page settings delete dialog.

## Validation

- `npm --prefix app/docsera-ui run test`
- `npm --prefix app/docsera-ui run validate`
- `npm --prefix app/docsera-ui run install:sdk`
