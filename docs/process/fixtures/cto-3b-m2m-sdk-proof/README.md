# CTO-3B M2M SDK packaging fixture

This directory is a disposable, offline packaging fixture. It is not included
by `app/docsera-ui`, must not be installed, and produces ignored metadata only
when its own `npm run build` command is run.

It pins `@servicenow/sdk` 4.8.1 and tests a three-column Fluent link table,
the documented generic `Record` fallback for `sys_m2m`, and the only
documented Fluent index shape. See the accompanying feasibility report for
observed generated metadata and its conclusion.
