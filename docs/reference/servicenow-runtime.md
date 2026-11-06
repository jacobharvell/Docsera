# ServiceNow runtime reference

This reference describes Docsera's implemented ServiceNow application composition and runtime boundary. It is an architectural reference, not a setup guide, API schema, or release-qualification claim. For workspace access, group ownership, provisioning, and membership rules, see the [access and provisioning reference](access-and-provisioning.md). For the executable source-install procedure, see [development setup](../guides/development-setup.md); for the immutable consumer package, see [0.1.0 update-set installation](../guides/update-set-installation.md).

## Application composition

Docsera is two cooperating ServiceNow applications.

- The **scoped Docsera application** has canonical source scope `x_2300756_docsera`. It owns the React runtime, scoped Direct UI Page, `docsera_runtime` Scripted REST API, Docsera tables, roles, ACLs, server services, and durable Docsera data. It remains the authority for product behavior and authorization.
- The **Global companion** is a separately SDK-owned application whose artifacts execute in Global scope. It supplies the authenticated `docsera.do` host and the constrained native-group provisioning and membership work that is deliberately outside the scoped boundary.

The companion is not ServiceNow's platform-owned Global application, and it is not an independent Docsera backend or a second React application. Source installation builds and installs the scoped application first, then its dependent Global companion. The companion's cross-scope privileges, workers, and host rely on scoped artifacts already being present.

## Runtime entry points

The scoped application declares the Direct UI Page endpoint `x_2300756_docsera_docsera_sdk_runtime.do`. Its HTML supplies ServiceNow UX globals, the `docsera-root` mount element, and the shared runtime configuration before loading the scoped client entry module.

The Global companion declares the friendly endpoint `docsera.do`, accessible to authenticated ServiceNow users. Its HTML supplies the same mount element and API-path configuration, then its small host module directly dynamically imports the installed scoped main module at the scoped UX-asset path. It does not navigate through the scoped UI Page or load a second bundle that implements Docsera.

Both hosts consequently run the same client application in the authenticated ServiceNow page context. The client resolves `docsera-root`, builds its ServiceNow client from the host configuration, injects runtime styling, and mounts React. When launched inside a ServiceNow navigator frame, the client attempts to replace the accessible top-level location with the current path, query, and hash; if that cannot be done, it renders a safe standalone-launch failure surface. This makes the runtime a standalone Direct UI experience rather than a UI Builder dependency.

## SDK runtime packaging

Fluent declarations under each package's `src/fluent/` are the source declarations for native ServiceNow metadata. The ServiceNow SDK builds the scoped client into installed UX assets. For the scoped package, the verified main asset is `main.jsdbx`, with its source map represented by `main.jsdbx.map`; generated update metadata stores the main bundle as a UX asset and the map as its attachment.

The main bundle owns application bootstrap and imports the editor host boundary. The editor host's runtime implementation is emitted as `PageEditorHostRuntime.jsdbx`; the build verifier checks that the main bundle retains the dynamic import to that chunk and that the editor runtime owns its child React-root lifecycle. Additional lazy chunks can be emitted for editor capabilities, so consumers should use the installed asset graph rather than assume one static list of all chunks.

`main.tsx` imports the shell stylesheet as inline source and passes it to a runtime style injector before mounting React. The inline-CSS build contract verifies that no `runtime-shell` CSS theme asset, generated runtime CSS file, generated runtime-shell key, or CSS-asset URL is used. Inline runtime styling is therefore distinct from any separately deployed ServiceNow CSS theme assets; it is part of the JavaScript runtime entry asset.

The SDK-generated `src/fluent/generated/keys.ts` files associate declared modules and generated native records with SDK identities. They are required packaging metadata and are checked by the scoped package's module-key verification contract, but they are generated output rather than the authoritative implementation source or standalone release artifacts. The scoped build also verifies generated bundle serialization; its editor-boundary and inline-CSS checks protect the corresponding asset contracts.

## Scoped REST boundary

The scoped Fluent REST declaration exposes the `docsera_runtime` Scripted REST API. The client uses same-origin paths under `/api/x_2300756_docsera/docsera_runtime/`; Fluent route declarations bind those paths to server handler modules under `app/docsera-ui/src/server/api/`, which in turn call scoped services.

Representative route families cover:

- workspace discovery, creation, settings, deletion, provisioning status, pending changes, and workspace edit leases;
- page listing, creation, draft save, settings, hierarchy movement, and deletion;
- workspace-wide publishing and discard operations;
- authorized workspace-member discovery and mutation;
- workspace image and icon upload, listing, and authorized file streaming; and
- a runtime ping endpoint used for installed-runtime verification.

The retained `POST /pages/publish` route is unavailable: its handler returns HTTP 405 with `publish_unavailable` and it does not provide page-level publishing. Publication is the active `POST /workspaces/publish` workspace-wide boundary.

Handlers validate input and current caller capability server-side. Scoped services evaluate authorization, own edit leases and mutation claims/generations, coordinate provisioning and membership commands, and persist authoritative records. Presentation state, unsaved editor input, and local recovery state remain client concerns; they cannot create workspace authority, manufacture server generations, or substitute for persisted ServiceNow state. Supported failures return safe route-level outcomes, and stale or obsolete mutation contexts are resolved by reloading the applicable server projection rather than replaying non-idempotent work. Domain contracts and payload behavior are documented in the workspace, page, publishing, and editor references instead of being duplicated here.

## Global companion operational boundary

The companion has two distinct operational paths.

**Provisioning** is asynchronous. A scoped service writes a validated workspace-provision request in `requested` state. The Global companion's async insert Business Rule claims that request, validates its constrained payload and expected group-name pair, creates the Admin and Editor native groups, assigns their scoped roles, creates the workspace record, and records success. On failure it rolls back resources it created where possible and records a bounded safe failure. This worker is not a general group API.

**Membership and group lifecycle commands** use a different command boundary. A Global after-insert Business Rule processes validated requested membership-command records. Its membership bridge validates the referenced Admin/Editor pair as distinct Docsera-workspace-owned groups before setting, removing, validating deletion of, or deleting membership/group targets. The scoped side validates caller capability and command input, then rereads native membership before reporting the authoritative result. The provisioning Script Include is package-private; the membership Script Include has restricted caller access. Explicit cross-scope privileges grant the companion only the scoped request, command, workspace, and icon-asset operations it needs.

These narrow workers and Script Includes provide Global-only native operations. They do not replace the scoped application's capability evaluator or create a general-purpose authorization service. See the [access and provisioning reference](access-and-provisioning.md) for the detailed group-ownership and permission contract.

## Application identity and portability

The checked-in identities are canonical source identities, not contributor defaults. In particular, the scoped source scope and scope ID identify the canonical source application; the companion uses `global` scope with a separately owned SDK application identity. A contributor must establish a scoped identity owned by their own ServiceNow instance and a separately owned Global-companion identity before source installation.

The repository's developer identity setup and conversion utilities create a candidate from SDK-created instance identities, transform supported source references, omit generated key registries for regeneration, and build both packages for review. They deliberately refuse a dirty or already converted canonical checkout. Identity conversion alone does not install either application. Generated keys are regenerated and verified as part of the SDK workflow; they must not be copied between developers as an identity shortcut.

Contributors must not overwrite the platform-owned Global application records, reuse another developer's credentials or SDK alias, or treat canonical development-instance values as portable credentials. Follow [development setup](../guides/development-setup.md) for the verified procedure and its safeguards.

## Installation and verification architecture

Docsera supports two distinct routes.

**SDK/source development installation** uses instance-owned identities, builds both packages, installs the scoped application before the Global companion, and runs their installed-runtime verifiers. The Global installation procedure includes a friendly-URL ownership preflight so an existing non-Docsera `docsera.do` page is not overwritten. Scoped verification covers the generated/local runtime and installed UI Page plus authenticated REST ping; Global verification covers bridge records, cross-scope privileges, and Global runtime modules.

**Docsera 0.1.0 consumer update-set installation** uses the immutable 0.1.0 scoped and Global companion update sets. It verifies the published artifact hashes and imports, previews, and commits the scoped artifact before the companion artifact. It is separate from SDK-generated `app/` build output, which is not a qualified consumer release input. The [0.1.0 release README](../../releases/0.1.0/README.md) remains the source for the exact artifact sequence.

Local tests and build verification establish source and packaging contracts. Installed-instance verification establishes that the expected artifacts, service boundary, and bridge are present on the target instance. Live user acceptance is still required for browser interaction and visual behavior; neither a local build nor an installed verifier establishes that acceptance. Existing evidence does not claim general compatibility, upgrade safety, or uninstall qualification.

## Runtime invariants and limitations

- The scoped application owns Docsera product data, behavior, and authorization.
- The Global companion is deliberately restricted to its host and native operational boundary.
- The runtime does not depend on UI Builder.
- Both supported entry points load the same scoped client application.
- Client state cannot replace server-issued workspace, lease, generation, or mutation authority.
- SDK builds/installations and consumer release packaging are separate workflows.
- Installed runtime behavior must be verified on the target ServiceNow instance.

The implemented friendly URL and bridge are ServiceNow-instance features that depend on the stated ownership and installation order. This reference makes no broader migration, compatibility, or release-lifecycle claim beyond the existing installation and release evidence.

## Implementation evidence

Principal declarations and runtime sources:

- `app/docsera-ui/now.config.json`, `app/docsera-ui/src/fluent/ui-pages/docsera-runtime.now.ts`, and `app/docsera-ui/src/fluent/rest-api/docsera-runtime.now.ts`
- `app/docsera-ui/src/client/index.html`, `main.tsx`, `bootstrap.tsx`, `runtimeLaunch.ts`, `runtimeStylesheet.ts`, and `platform/servicenow/`
- `app/docsera-global-bridge/now.config.json`, its friendly URL UI Page and client host module, Business Rules, Script Includes, security declarations, and cross-scope privileges under `src/fluent/` and `src/server/`
- both packages' `src/fluent/generated/keys.ts` registries

Focused packaging and runtime evidence includes the scoped SDK bundle-serialization, editor-runtime-boundary, inline-runtime-CSS, module-key, and installed-runtime verification scripts and tests; the Global bridge, friendly-URL-host, package-contents, and generated-update-set verification scripts and tests; and the focused bootstrap, launch, ServiceNow-client, API, workspace, and bridge tests in their owning packages.
