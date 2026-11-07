# Install Docsera 0.1.0

Use this route to install the Docsera 0.1.0 consumer package on a receiving ServiceNow instance. Do not use it for SDK development work; use [development setup](development-setup.md) when building from source. The package remains a release candidate until a GitHub Release is published.

## Release artifacts and integrity

The only supported consumer artifact pair is immutable and lives in [releases/0.1.0/](../../releases/0.1.0/):

- docsera_application_0.1.0.xml — the scoped Docsera application
- docsera_global_companion_0.1.0.xml — the narrow Global companion

Before importing either file, compute its SHA-256 hash with a trusted local tool and compare it with the authoritative values in the [0.1.0 release README](../../releases/0.1.0/README.md). That README is the single authoritative checksum location; this guide intentionally does not duplicate the values.

For example, in PowerShell from the repository root:

~~~powershell
Get-FileHash -Algorithm SHA256 releases\0.1.0\docsera_application_0.1.0.xml
Get-FileHash -Algorithm SHA256 releases\0.1.0\docsera_global_companion_0.1.0.xml
~~~

Stop if either hash differs. Do not substitute generated XML from app/; it is release-engineering output, not a supported consumer artifact.

## Custom Tables and Subscription Mapping

Docsera creates **13 application-owned tables** in your ServiceNow instance.

Subscription mapping is not required for installation in non-production environments, including Personal Developer Instances (PDIs). However, ServiceNow may identify the application as unmapped in Subscription Management.

For production deployments, review your organization's custom table entitlements and map Docsera to an appropriate product subscription. Not all application tables necessarily consume billable custom table entitlements; applicable exemptions and licensing requirements depend on your ServiceNow agreement.

See [ServiceNow's subscription mapping documentation](https://www.servicenow.com/docs/r/platform-administration/map-custom-applications-v2.html) for details.

## Import in the required order

Install the two update sets separately through the ServiceNow update-set import workflow:

1. Import docsera_application_0.1.0.xml.
2. Preview the scoped application update set. Resolve or investigate every preview problem before committing; do not force through a conflict you do not understand.
3. Commit the scoped application update set and confirm the commit completes.
4. Import docsera_global_companion_0.1.0.xml.
5. Preview the Global companion update set with the scoped application already committed. Resolve or investigate every preview problem before committing.
6. Commit the Global companion update set.

Scoped-first, Global-second is required. The scoped application owns the Docsera runtime and authorizes the companion's narrow Global boundary; do not reverse the sequence or import them as an undifferentiated bundle.

## Post-install checks

After both commits, sign in as an authorized ServiceNow user and verify:

- the authenticated Docsera host is available at docsera.do;
- the Docsera application and its scoped records are present;
- a user with the appropriate Docsera access can create a workspace, author and save a page, publish it, view Live mode, discard pending changes, and navigate or refresh without losing the documented state;
- workspace administration is available to the appropriate administrator.

These checks mirror the receiving-instance scenarios exercised for the earlier scoped package and unchanged Global companion. The accepted RR-096 scoped candidate incorporates the main-runtime refresh that removed the diagnostic query path and updated runtime assets, followed by two targeted retired-asset deletion updates. Jacob accepted the corrected candidate without a repeat import, reinstall, or installation smoke; this is not a general compatibility or lifecycle guarantee. Record any preview conflict, commit error, or failed check rather than attempting ad hoc changes to the update-set XML or platform-wide security settings.

## Qualification and compatibility limits

The 0.1.0 package has been exercised through the documented receiving-instance sequence. That evidence does **not** establish general ServiceNow compatibility, upgrade safety, uninstall behavior, or complete release qualification. It also does not authorize changing OOTB application access, ACLs, roles, or Global platform records to bypass an installation problem.

The Global companion is intentionally constrained: it provides the required Global boundary and authenticated host while the scoped application remains authoritative for Docsera runtime behavior and authorization. Do not import any other XML in this repository as a consumer installation artifact.

See the [consumer release index](../../releases/README.md) for the available 0.1.0 release pair.

