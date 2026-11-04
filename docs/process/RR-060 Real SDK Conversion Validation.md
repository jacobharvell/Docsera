# RR-060 — Real SDK Conversion Validation

Date: 2026-11-03

## Target and conversion boundary

- Accepted SDK 4.8.1 scaffold: `C:\Dev\Docsera-rr-060-sdk-scaffold`.
- Target: `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e`.
- Final isolated conversion: `C:\Dev\Docsera-rr-060-converted-output-20261103-final`.
- The converter omitted both generated `keys.ts` registries and the frozen Global `update-set` directory. The output contains no reparse points, is outside the repository, and is not committed.
- Converter manifest: zero unsupported references and zero remaining canonical scope or canonical scope-ID references.

## Canonical asset identity contract

`verify-sdk-bundle-serialization.mjs` now applies two identity modes:

- Canonical `x_82900_docsera` requires `main` asset ID `1acd40f0fcb0422e8e047afac7546c60` and map asset ID `49074d350f4742d1a1dc581518fd6686`.
- Any converted scope resolves generated asset records by scoped asset name instead, never assuming canonical IDs.

The canonical sentinel is composed rather than a replaceable source-scope literal because the converter rewrites ordinary old-scope literals. Focused regression tests cover both modes.

## Clean build validation

Dependencies were installed sequentially with `npm ci` in the final isolated output: scoped first (817 packages), then Global (520 packages). Both dependency directories were real local directories, without junctions or symlinks.

- Scoped `npm run build`: passed SDK type check, SDK build, module-key verification, and all ten bundle serialization checks. The unmodified source-map check confirmed `../../node_modules/react-dom/cjs/react-dom.production.min.js`.
- Global `npm run build`: passed SDK type check and SDK build. The SDK emitted its existing informational warning that `src/client` has no `tsconfig.json` and used default client compiler options.
- Passed focused tests: `scripts/convert-sdk-identity.test.mjs` (7), and `verify-sdk-bundle-serialization.test.mjs` (2).
- The local Global package-content test intentionally cannot run against converter output because it reads the frozen update-set, which conversion deliberately excludes. Its three update-set-dependent cases failed only with `ENOENT` for that excluded file. The Global `verify:sdk` command was not a local verifier: it attempted a remote query with the stale `docsera-pdi` credential and failed authentication; no instance action was taken.
- The converted `shared-runtime` managed suite ran 186 tests successfully; two repository-context tests failed only because conversion intentionally supplies neither the repository-root `package.json` nor the frozen Global update-set. These are not scoped-build failures.

## Generated identity review

The final inventory is recorded in `docs/process/evidence/RR-060 generated-output-inventory.json`.

- Scoped build: 364 XML records; regenerated registry has 605 IDs, SHA-256 `EC4978C8CBC81C3829CBCD6E2672AF8DDF3CD6A9F61B77443F9FD28F0596784D`.
- Global build: 23 XML records; regenerated registry has 27 IDs, SHA-256 `85681AF257D9F26621D442DD3068E041667A8367B8CD51B1CA5D4B3FF4826B86`.
- Comparison against canonical registries found zero overlapping IDs in both projects (canonical scoped 644 / generated scoped 605; canonical Global 29 / generated Global 27). The count differences are expected because the converter excludes generated registries and frozen update-set material; the SDK regenerates only identities represented by converted source.
- Generated output and registries contain zero old-scope or canonical-scope-ID references, and both `deleted` registries are empty. No generated DELETE declarations were found.
- Representative generated records: scoped app `sys_app_application_b191909563744bdbaef60a8f381fff28`, runtime page `sys_ui_page_c7a040a2d7bb4148b8ce008bc1f8d6c9`, main asset `sys_ux_lib_asset_f058e74bbed44dbfad24e6b661817a56` named `x_2300756_docsera/main`, map asset `sys_ux_lib_asset_7fee0b502705422e8a9854324554faf8` named `x_2300756_docsera/main.js.map`, and Global host page `sys_ui_page_4bb3dc32dcfc4441a57bfce97db77529`.

## Canonical preservation and limitations

- Canonical generated registries and the frozen Global release artifact remain unchanged from the task base; their SHA-256 values are recorded in the evidence inventory.
- No `now-sdk install`, reinstall, update-set import, PDI metadata change, browser test, or remote verification was performed.
- The final output is a locally built installation candidate only. Independent metadata review and explicit installation approval remain required.
