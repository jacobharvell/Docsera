# Install Docsera 0.1.0

Use this route to install the Docsera 0.1.0 consumer package on a receiving ServiceNow instance. Do not use it for SDK development work; use [development setup](development-setup.md) when building from source. Obtain versioned release assets from [GitHub Releases](https://github.com/jacobharvell/Docsera/releases) when they are available.

## Release artifacts and integrity

The only supported consumer artifact pair is immutable and lives in [releases/0.1.0/](../../releases/0.1.0/):

- docsera_application_0.1.0.xml — the scoped Docsera application
- docsera_global_companion_0.1.0.xml — the narrow Global companion

Optional integrity verification: compute the SHA-256 hash of a downloaded file with a trusted local tool and compare it with the authoritative values in the [0.1.0 release README](../../releases/0.1.0/README.md). That README is the single authoritative checksum location; this guide intentionally does not duplicate the values. A matching checksum confirms file integrity against that published value; it does not by itself establish publisher authenticity or platform compatibility.

For example, in PowerShell from the directory that contains the downloaded XML files:

~~~powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\docsera_application_0.1.0.xml
Get-FileHash -Algorithm SHA256 -LiteralPath .\docsera_global_companion_0.1.0.xml
~~~

If a hash differs, do not import that file. Do not substitute generated XML from app/; it is development output, not a supported consumer artifact.

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

## Initial Docsera Admin access

Workspace creation requires effective `x_2300756_docsera.admin` access. This Docsera role is distinct from the unrestricted ServiceNow platform `admin` role. Before post-install checks, an authorized ServiceNow administrator must arrange this Docsera role through the instance's approved access-management process. Importing the update sets does not automatically grant the role, and Docsera does not provide an in-app first-admin assignment screen.

## Post-install checks

After both commits, sign in as an authorized ServiceNow user and verify the ordinary workflow for your role:

- the authenticated Docsera host is available at docsera.do;
- the Docsera application and its scoped records are present;
- effective Docsera Admin access can create or access a workspace and its page tree;
- an authorized editor can author and save page content, publish saved pending workspace changes through the Changes Center, verify the content in Live, and discard pending changes where appropriate;
- workspace administration is available to the appropriate administrator.

Record any preview conflict, commit error, or failed check rather than attempting ad hoc changes to the update-set XML or platform-wide security settings.

## Qualification and compatibility limits

The 0.1.0 package has receiving-instance installation evidence, with the validation boundary described in [Release Validation and Compatibility](../release/qualification.md). It does **not** establish general ServiceNow compatibility, upgrade safety, uninstall behavior, or complete qualification. It also does not authorize changing OOTB application access, ACLs, roles, or Global platform records to bypass an installation problem.

The Global companion is intentionally constrained: it provides the required Global boundary and authenticated host while the scoped application remains authoritative for Docsera runtime behavior and authorization. Do not import any other XML in this repository as a consumer installation artifact.

See the [consumer release index](../../releases/README.md) for the available 0.1.0 release pair.

