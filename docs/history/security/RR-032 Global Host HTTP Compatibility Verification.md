# RR-032 — Global Host HTTP Compatibility Verification

Date: 2026-10-31
Status: bounded G3 evidence; **not** a G3 exit decision, browser-execution proof, interactive acceptance, or deployment qualification.

## Scope and method

This report closes the HTTP-resource evidence gap recorded in `RR-031` for the installed Global `docsera.do` host. It used the existing local `docsera-pdi` basic-auth alias to establish an authenticated session, then made bounded, read-only `GET` requests. It did not deploy, install, export, mutate PDI data, use browser automation, inspect application content, or add committed verification tooling.

The observation was made from source revision `e47461aa4c9da106b905aaa874d31a0b86cc8ce1` on `release/batch-g3-platform-compatibility`. The target is the same development PDI qualified in `RR-031`: ServiceNow Australia Patch 2 (`glide-australia-02-11-2026__patch2-04-17-2026`, build date `04-29-2026_2044`).

Authentication setup was successful using the existing alias. Request evidence below is sanitized: it records methods, statuses, response paths with query **names only**, fixed expected markers, and a bundle hash. It excludes credentials, tokens, cookies, cache-buster values, and response bodies.

## Results

| Surface | Classification | Sanitized request/result |
| --- | --- | --- |
| Authenticated Global host | **Verified** | `GET /docsera.do` returned HTTP 200. The final response URL and response body contained no `session_timeout.do` redirect/marker. The returned host contains `DOCSERA_RUNTIME_CONFIG`, all four expected configured REST-path keys, and `id="docsera-root"`. |
| Installed Global bootstrap resolution | **Verified** | The actual script source was extracted from the deployed host response, rather than inferred from source: `GET /uxasset/externals/global/docsera-friendly-url-proof.jsdbx?uxpcb` returned HTTP 200 with no session-timeout marker. The response contains the Global proof ownership marker, a dynamic `import(` expression, and the scoped-runtime asset path marker. |
| Bootstrap-to-scoped dependency | **Verified** | The deployed bootstrap directly references `/uxasset/externals/x_82900_docsera/main.jsdbx` (with the installed cache-buster query). This confirms the expected Global-to-scoped asset wiring at the HTTP resource level. |
| Authenticated scoped runtime delivery through that reference | **Verified** | `GET /uxasset/externals/x_82900_docsera/main.jsdbx?uxpcb` returned HTTP 200 with no session-timeout marker. The response contains the established `data-docsera-runtime-style="runtime-shell"` marker. |
| Scoped bundle identity compared with RR-031 | **Verified** | The fetched scoped asset SHA-256 was `c27c75e7a6a0a8113f35d8c27b16aa701c57d5fd3878ce253cefab349bced350`, exactly matching the authenticated scoped bundle hash recorded in RR-031. |

No HTTP status, asset-resolution, authentication, or dependency failure was observed in this bounded probe.

## Interpretation

The installed authenticated Global host can be fetched without a session-timeout response, exposes the expected Docsera mount/config contract, resolves its **deployed** Global bootstrap asset, and that bootstrap resolves the intended installed scoped runtime asset. The referenced scoped runtime is available in the same authenticated session and is identical to RR-031's previously verified bundle.

This supersedes only RR-031's narrow `docsera.do` HTTP/bundle-response gap. It does not change RR-031's other classifications or establish full Global-host behavior.

## Remaining limitations

The following are **Unverified** by this task:

- JavaScript module execution, dynamic-import execution, CSP behavior, DOM mounting, visual rendering, routing/deep links, and interactive workflows in `docsera.do`.
- Editor, publishing, reader, persistence, permission, and least-privilege behavior.
- Clean-instance installation, upgrade/cross-family behavior, and complete source-to-installed metadata parity.

No browser execution is reported as passed. A successful HTTP response demonstrates authenticated resource availability and dependency wiring only.

## Validation

- Focused authenticated read-only verification: passed (host, deployed bootstrap, bootstrap dependency, and scoped runtime each returned HTTP 200; no session-timeout marker; scoped hash matched RR-031).
- `npm run validate:docs`: completion-reported as passed after this report was written; not independently rerun as part of RR-033.
- `git diff --check`: completion-reported as passed after this report was written; not independently rerun as part of RR-033.

Intentionally not run: deployment, SDK installation/export/upgrade, PDI mutation, browser automation or interactive testing, and broad test suites.
