# Implementation Notes - Global Friendly URL Host

Status: production integration candidate; the controlled PDI feasibility proof passed and
this candidate awaits independent remote review and final packaged PDI acceptance.

Task 185 promotes the tested Global Direct UI Page into the normal Global companion. The
direct Global `docsera.do` host is not a redirect: it retains fragment routes and imports
the installed scoped SDK runtime module. Client navigation therefore stays at
`/docsera.do#/...`, while same-origin scoped REST paths and their authorization remain
unchanged.

The host uses the proof's stable page, ACL, bootstrap-asset, and source-artifact identities
so an installed proof can upgrade in place. The temporary editor-role ACL binding is retired.
The supported Global `ui_page/read` ACL assigns `answer = gs.isLoggedIn();`, which lets
all authenticated viewers open published content without creating a Viewer role. Existing
scoped REST authorization remains authoritative for workspace administration, editing,
publishing, and other protected actions.

The scoped runtime page remains a supported fallback. The scoped application menu now opens
`docsera.do`. No React bundle, CSS, or server API is copied into Global. The Global companion
also continues to carry the existing provisioning and membership bridge records.

The companion's read-only collision preflight permits only no existing Global `docsera` page
or the exact stable Docsera-owned legacy/production identity; every unrelated page fails
closed. Installation order, upgrade behavior, and exact-record removal ownership are
documented in `app/docsera-global-bridge/update-set/README.md`. The disposable proof
artifact path and commands are retired so they cannot compete with the production host.
