# RR-072 First-Use Developer Identity Setup Verification

Date: 2026-11-03
Reviewed source: `a1cba9ae1a5a1cbf07c2eaa17c6d4e88e277d4c7`
Verification checkout: `C:\Dev\Docsera-rr-072-first-use-verification`
SDK: `@servicenow/sdk` 4.8.1

## Result

The first real setup run succeeded against `https://dev468653.service-now.com`
using the encrypted SDK alias `docsera-dev468653`. The read-only SDK query
returned `glide.appcreator.company.code = 2301106`, and a preflight query found
no existing `sys_scope` with `scope=x_2301106_docsera`.

The resulting local-only application identities are:

| Project | Scope | SDK application identity |
| --- | --- | --- |
| `app/docsera-ui` | `x_2301106_docsera` | `2c48212d7bc94eefa2d821dbe8c1b17a` |
| `app/docsera-global-bridge` | `global` | `b009612d86264cbca6836528c0237edb` |

Both `src/fluent/generated/keys.ts` registries were generated. The scoped
registry and Global companion registry both exist after setup. The Global
companion keeps `scope: global` while using its own 32-character identity; it
does not use `scopeId: global`.

## Commands and validation

- `now-sdk auth --list` confirmed `docsera-dev468653` maps to the target URL
  and `admin` user. No credentials were printed or stored in the repository.
- `now-sdk query sys_properties --auth docsera-dev468653 -q
  'name=glide.appcreator.company.code' -f sys_id,name,value -o json` returned
  `2301106`.
- `now-sdk query sys_scope --auth docsera-dev468653 -q
  'scope=x_2301106_docsera' -f sys_id,scope,name -o json` returned no records.
- The accepted setup npm script completed with the verified URL, alias, and
  company code. It performed SDK candidate initialization and candidate/final
  builds only; no SDK install, update-set operation, or other PDI mutation was
  invoked.
- Post-setup `npm run build` passed in both `app/docsera-ui` and
  `app/docsera-global-bridge`. The scoped build also passed
  `verify:sdk-module-keys` and `verify:sdk-bundle-serialization`.
- A source-only search found no `x_82900_docsera` or
  `6997f092c3fd8310c569bf0d0501314d` references under either application's
  `src` tree.
- The frozen consumer artifact remained unchanged:
  `sys_remote_update_set_docsera_global_companion_0_1_0.xml` SHA-256
  `2C95B30E954A8E85038DBA6BE991A3836B6BCCD4EA6B06785ABA6BFB45391F26`;
  manifest SHA-256
  `08C3ECD90636B759ADAB0D3443A9AEB24ECE908BB309548CF35E50101A1CEA10`.

## Observed invocation issue

On this Windows/npm environment, the documented single-delimiter form
`npm run setup:developer-instance -- --instance ... --auth ... --company-code
...` let npm consume the named flags. The setup script received only the two
values and correctly returned its usage message before any conversion.

The equivalent npm-script invocation with a second delimiter forwarded all
arguments and completed:

```powershell
npm run setup:developer-instance -- -- --instance https://dev468653.service-now.com --auth docsera-dev468653 --company-code 2301106
```

This is a documented first-use verification finding only. RR-072 source was
not corrected in this verification task. A separate review should decide
whether the user-facing command and its automated coverage need an npm-version
specific adjustment.

## Scope and preservation

The converted application source and generated registries are deliberately
left uncommitted in the disposable verification checkout. No converted source,
registry, or frozen update-set artifact is committed to the upstream Docsera
branch by this record.
