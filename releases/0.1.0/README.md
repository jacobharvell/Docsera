# Docsera 0.1.0

Install these ServiceNow update sets in order:

1. Import, preview, and commit `docsera_application_0.1.0.xml` (564 updates).
2. Import, preview, and commit `docsera_global_companion_0.1.0.xml` (24 updates).

| Artifact | SHA-256 |
| --- | --- |
| `docsera_application_0.1.0.xml` | `90ef34afdcf48a8b54655b0e60437130120de8b4681bd99cbaa7dd2e75277cc0` |
| `docsera_global_companion_0.1.0.xml` | `adae62031698b7b1596b71474defa7fb9889ffa40e30d40ad5ccfd01b64a0c50` |

The scoped package is the RR-096 corrected `0.1.0` candidate: its two retired editor-spike UX Assets are represented only by targeted DELETE customer updates, so existing installations converge without retaining the diagnostic payloads. The Global payload is the unchanged RR-074 artifact. RR-079/RR-080 receiving-instance acceptance applies to the earlier scoped artifact and unchanged Global artifact; the corrected scoped artifact has not independently undergone receiving-instance qualification. Outer update-set metadata is consumer-facing.
