# Implementation Notes - Authenticated Profile Avatar

Task 83 extends the existing runtime identity path instead of adding a second profile-image request lifecycle.

## Runtime Contract

- `/api/x_82900_docsera/docsera_runtime/ping` remains the authoritative authenticated-session probe for the Docsera header identity. It returns scoped-safe display name, username, and user sys_id fields only; it does not call `gs.getUser().getAvatar()`, which is unavailable in Docsera's scoped runtime.
- After a successful Docsera ping, the client makes a same-origin authenticated request to `/api/now/ui/user/current_user` to enrich the ping result with native ServiceNow profile values.
- The client prefers usable `current_user` values for `user_display_name`, `user_name`, `user_sys_id`, and `user_avatar`, with `/ping` identity values as fallback.
- ServiceNow avatar values are normalized to same-origin paths when needed, for example `a5d3c898c3222010ae17dd981840dd8b.iix?t=small` becomes `/a5d3c898c3222010ae17dd981840dd8b.iix?t=small`.
- If `current_user` fails or omits usable values, the existing `/ping` display name and username continue to drive deterministic initials.
- Missing identity fields remain empty/unavailable; the client must not synthesize visible `unknown` display name, username, or user sys_id placeholders.

## Header Rendering

- `DocseraHeader` renders the supplied avatar path inside the existing 32px circular account control.
- The account button accessible name and menu behavior continue to come from display name or username, not from the image.
- If no usable avatar path is available, the existing deterministic initials render unchanged.
- If the image fails to load, the failed path is suppressed and initials render instead.
- Before ping identity is available, the existing neutral loading placeholder remains the account control content.
