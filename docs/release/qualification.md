# Release Validation and Compatibility

## Purpose and scope

This reference describes the available validation evidence for the Docsera 0.1.0 package and the boundaries of that evidence. It is not a release announcement, compatibility guarantee, or lifecycle guide. For package filenames, checksums, and import order, use the [0.1.0 package README](../../releases/0.1.0/README.md). For consumer steps, use the [update-set installation guide](../guides/update-set-installation.md).

## Release artifacts and validation

The package contains two separately owned update sets:

- `docsera_application_0.1.0.xml`, the scoped Docsera application (564 updates).
- `docsera_global_companion_0.1.0.xml`, the Global companion (24 updates).

The scoped application must be installed first and the Global companion second. The scoped application owns the runtime and authorization model; the companion provides the narrow Global boundary and authenticated host support.

The package artifacts were inspected for their distinct ownership, ordered dependency, update inventories, and integrity values. The package README is the authoritative checksum record. The scoped artifact contains 562 `INSERT_OR_UPDATE` updates and two targeted `DELETE` updates; the Global artifact contains 24 updates. Artifact inspection and integrity checks establish properties of those package files, not platform compatibility or successful installation on every instance.

## Receiving-instance installation evidence

An earlier scoped artifact and the unchanged Global companion were installed on a clean receiving ServiceNow instance in the required scoped-first, Global-second sequence. The scoped import was previewed and committed; the companion was previewed after the scoped commit and then committed. Available retrieved-update-set evidence recorded the scoped installation as committed with 564 inserts and no updates, deletes, or collisions. The companion preview recorded 24 inserts and no updates, deletes, or collisions.

The final scoped artifact includes subsequent reviewed runtime and retired-asset corrections. Jacob Harvell confirmed that he installed the final Docsera 0.1.0 release package on a separate ServiceNow Brazil instance.

## Functional scenarios exercised

The earlier receiving-instance installation exercised these functional scenarios:

- Opening the authenticated Docsera host and My Workspaces.
- Creating a workspace and provisioning its Admins and Editors groups.
- Creating, authoring, and saving page content.
- Publishing and viewing Live content.
- Discarding pending changes.
- Refreshing, navigating the page tree, and using workspace administration.

These scenarios are useful installation evidence, not a requirement that every installation smoke test demonstrate every feature.

## Known compatibility and qualification limits

The available evidence does not establish:

- Universal ServiceNow family, patch-level, or arbitrary-instance compatibility.
- Supported upgrades, migrations, rollback, data preservation, or uninstall behavior.
- Comprehensive authorization or least-privilege verification across every access path.
- Physical unique-index enforcement for every declared unique field on every instance.
- Full accessibility conformance or comprehensive browser and assistive-technology testing.
- Comprehensive security certification or penetration-test coverage.

Do not bypass ServiceNow security controls, alter unrelated Global records, or force unexplained preview conflicts to make an installation proceed. Record the result and investigate within the documented package and platform boundaries instead.

## References

- [Consumer installation guide](../guides/update-set-installation.md)
- [Docsera 0.1.0 package README](../../releases/0.1.0/README.md)
- [ServiceNow runtime reference](../reference/servicenow-runtime.md)
- [Authorization boundaries](../security/authorization-boundaries.md)
- [Testing and maintenance](../guides/testing-and-maintenance.md)
