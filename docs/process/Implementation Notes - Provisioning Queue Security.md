# Implementation Notes - Provisioning Queue Security

The workspace provisioning request table (`x_82900_docsera_workspace_provision_request`) is a server-owned command queue. It is not a supported direct Table API surface.

Its scoped table definition disables web-service access. Source-controlled table ACLs deny generic `create`, `read`, `write`, and `delete` operations with `adminOverrides: false` and `return false;`. The table continues to declare cross-scope `read` and `update` actions, and the Global companion retains its explicit allowed `read` and `write` privileges for asynchronous provisioning.

The supported paths remain the scoped workspace-creation service, the Global provisioning worker, and the Docsera-admin-gated provisioning-status route. This source change does not itself establish installed effective ACL behavior.

## Required live PDI acceptance

After installation, verify that an authorized Docsera Admin can create a workspace and poll its provisioning status through the supported REST flow, and that the Global worker completes the request. Verify the installed table has `ws_access=false` and the four queue ACLs are present. With an ordinary authenticated user that has neither Admin nor Docsera Admin, make the approved read-only direct Table API list request (`sysparm_limit=1&sysparm_fields=sys_id`) and confirm it is denied before any queue data is returned. Do not probe direct queue mutations without separately approved controlled test authority.
