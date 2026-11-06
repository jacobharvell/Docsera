# RR-012 Content Rendering and Input Security Review

## Executive summary

Evidence review of the current structured-document authoring and reader paths found **no confirmed reachable executable-content, unsafe-link, or externally sourced-media vulnerability**. User-authored content is persisted as a validated, canonical TipTap JSON envelope, not as author-supplied HTML. The published reader independently validates the document again and renders a closed set of React elements; it does not insert document content as HTML.

The one production `dangerouslySetInnerHTML` use in the reviewed path is the editor's drag-preview surface. Its input is cloned from the already rendered editor DOM, and its preview builder removes navigation attributes from links. It is a high-sensitivity sink, but this review found no route by which author-controlled raw HTML or executable attributes can reach it.

No production or test code was changed. The small coverage additions identified below are defense-in-depth regression work, not evidence of a material defect.

## Scope and method

Reviewed the requested content inputs and their direct persistence/rendering consumers. RR-008 media authorization and RR-009 mutation authorization were not re-investigated; media is discussed only as it affects rendering content security. This was a static, evidence-only review: no PDI/browser testing, injection probes, deployment, or broad test suite was run.

## Input-to-render trust-boundary matrix

| Input / source | Acceptance and canonicalization boundary | Persisted representation | Render boundary | Result |
| --- | --- | --- | --- | --- |
| Editor JSON/autosave | Server page save normalizes the record; `parseServerDocument` validates node, mark, attribute, and child structure before canonical serialization. | `draft_content_json` / `published_content_json` contain canonical JSON, not HTML. | Reader validates the document again before rendering. | Unsupported nodes/attributes cannot become stored canonical content. |
| Stored draft/published JSON | Page record parsing and domain normalization feed the structured document parser; invalid JSON/envelopes/documents fail rather than receiving a permissive interpretation. | Canonical envelope, schema version 1. | Invalid data produces unavailable/recovery UI. | Fail closed for malformed stored content. |
| Markdown source | `parseDocseraMarkdownDocument` parses Markdown to a canonical envelope, then calls `parseDocseraDocument`. | Same canonical JSON; Markdown is not rendered directly. | Same reader path as editor JSON. | Block HTML is rejected; only constrained inline formatting is accepted. |
| Pasted HTML | `transformPastedHTML` uses the DOM-based paste sanitizer before TipTap parses the paste. | TipTap JSON subsequently crosses the server validator before persistence. | No pasted HTML is directly rendered by the reader. | Active/embed tags and event attributes are removed; unsafe anchor URLs are removed. |
| Link href / metadata | Link mark accepts only `href`, `target`, `rel`, `class`, and `title`; `href` uses shared protocol validation. | Canonical link attrs. | Reader re-validates `href`, ignores stored target/rel/class, and writes fixed safe target/rel. | `javascript:` and whitespace-obfuscated forms are rejected; opener/tabnabbing attributes are not controlled by content. |
| Image content | Image node accepts a media identifier and presentational attributes only; it contains no `src`, URL, MIME, HTML, or SVG field. | Canonical media IDs plus text/presentation fields. | Reader asks the supplied media loader for a Blob and places a generated object URL in `<img>`. | No author-supplied external media URL or embedded active object is rendered by this path. |
| Drag preview | Preview HTML is cloned from the current editor DOM and inserted into an isolated drag-feedback surface. | Not persisted. | Preview sanitizer removes link navigation attributes before `dangerouslySetInnerHTML`. | Sensitive sink is bounded by schema/editor DOM; retain regression coverage. |

## Evidence and assessment

### Structured document validation, persistence, and published rendering

`serverEditorDocument.ts` defines closed allowlists for node types and mark types (lines 16-56 and 221-234), rejects unknown object keys (lines 556-569), validates recursive child layouts (lines 608-725), and rejects unsupported schema versions or invalid canonical envelopes before canonicalizing (lines 860-914). Link attrs are limited to five keys and their `href` is checked (lines 267-285); image attrs delegate to the dedicated closed contract (line 466).

Canonicalization occurs only after validation (`canonicalizeDocseraStructuredDocument`, lines 841-858). The persistence path normalizes page content before deriving plain text and serializes the normalized JSON (`serviceNowPagePersistence.ts` lines 79-98 and 101-121); publishing reparses the normalized draft content (`lines 200-214`). Stored record mapping starts from parsed JSON and proceeds through page normalization (`serviceNowPageRecords.ts` lines 17-24 and 40-54).

The reader does not trust its prop merely because it was server-produced: it requires an object document, an array content field, and `validateDocseraStructuredDocument` before rendering (`PublishedDocumentReader.tsx` lines 922-933). Its error boundary emits recovery UI rather than partial raw content (`lines 101-120`). It renders known node and mark cases as React elements, so text is React-escaped; no document-content `dangerouslySetInnerHTML` was found in the reader.

**Assessment:** confirmed defense in depth. Malformed canonical structures do not get a permissive/raw HTML fallback.

### Markdown and raw HTML

Markdown parsing uses `fromMarkdown` with GFM/directive extensions only (`markdown.ts` lines 213-217). Block-level HTML is explicitly rejected (`lines 1770-1773`). The inline HTML subset is constrained by `DOCSERA_ALLOWED_HTML_TAGS` and a parser that rejects unknown tags/invalid attributes (`lines 950-972`): anchors must supply exactly `href`, `target`, `rel`, `class`, and `title`, and the href receives the shared protocol check (`lines 987-1005`). Span/mark color forms require exactly the expected semantic color attribute; other allowed inline tags accept no attributes (`lines 1008-1020`, `1129-1160`). The generated document is then validated and canonicalized before returning (`lines 1780-1803`, `1891-1926`).

This subset intentionally permits formatting HTML in Markdown serialization (not arbitrary browser HTML). Stored `target`, `rel`, and `class` metadata are preserved for round-tripping, but the reader does not replay them.

**Assessment:** no raw-HTML execution route confirmed. Unsupported HTML is rejected atomically rather than escaped into a future renderer.

### Pasted HTML

`pasteSanitizer.ts` removes `script`, `style`, `noscript`, `iframe`, `object`, `embed`, `canvas`, and media-bearing `img`/`picture`/`source` nodes (lines 4 and 75-85). It removes all event-like attributes (`on*`) and `srcdoc`, strips all style except allowlisted text alignment on paragraph/headings, and removes a bad anchor `href` (lines 31-72). The editor installs these transforms for real pasted HTML/text (`PageEditorHostRuntime.tsx` lines 3525-3551), and its synthetic-paste fallback reuses the same sanitizer (lines 3221-3265).

The sanitizer intentionally retains ordinary non-active markup for TipTap to interpret, instead of attempting to be a universal HTML sanitizer. That is appropriate here because (1) active/embed content is removed, (2) the TipTap schema supplies another structural restriction, and (3) the server validator is authoritative for persisted content.

**Assessment:** no confirmed executable pasted-content path. SVG and MathML are not explicitly listed in the initial tag-removal set, but the focused integration test verifies they do not enter canonical JSON; they are unsupported input, not a reachable stored-XSS finding.

### Links and URL edge cases

The shared validator uses an allowlist (`http`, `https`, `ftp`, `ftps`, `mailto`, `tel`, `callto`, `sms`, `cid`, `xmpp`) and removes ASCII/Unicode whitespace/control ranges before testing the scheme (`serverEditorDocument.ts` lines 11-15 and 241-265). The TipTap extension uses that same validator for autolink and link-on-paste (`schema.ts` lines 2213-2218). Markdown uses it for ordinary and inline-HTML links (`markdown.ts` lines 994-996 and 1074-1082).

The reader repeats validation, then emits a fixed `target="_blank"` and `rel="noopener noreferrer nofollow"`; stored `target`, `rel`, and `class` are not rendered (`PublishedDocumentReader.tsx` lines 53-56 and 411-430). This protects against `javascript:` and the whitespace-obfuscated form and prevents reverse-tabnabbing. Encoded `%` strings that are not a browser-recognized scheme remain relative URLs under browser URL parsing; entity-encoded colons are decoded before the Markdown check or DOM attribute check and then rejected as `javascript:`.

`ftp`/`ftps` and application-handling protocols are intentionally accepted by the current shared policy. They can open external handlers but are not script-execution protocols. Restricting them would be a product-policy decision, not a confirmed rendering vulnerability.

**Assessment:** no confirmed unsafe-link execution or target/rel defect in published rendering.

### Media and embedded resources

The image contract accepts only `mediaId`, optional `darkMediaId`, text alt/caption, and bounded presentation values (`serverImageContract.ts` lines 15-100); canonicalization supplies these exact fields (`lines 103-125`). It has no author-controlled source URL, inline binary, HTML, SVG, iframe, object, or embed field. The reader resolves the selected ID through the provided loader and only assigns the loader-created object URL to `<img>` (`PublishedDocumentReader.tsx` lines 231-330). Editor image rendering follows the same Blob/object-URL pattern (`schema.ts` lines 1305-1366).

The authenticity/authorization behavior of the loader endpoint is intentionally outside this review's scope (RR-008). Within the content-rendering boundary, document authors cannot direct a reader to fetch an arbitrary external URL or create an executable embedded resource.

**Assessment:** no confirmed external-media or active-content issue from document attributes.

### Editor drag preview sink

`PageEditorHostRuntime.tsx` line 8516 inserts `previewHtml` with `dangerouslySetInnerHTML`. This deserves explicit review. The producer clones selected top-level editor elements, does not accept an arbitrary author string, and removes `href`, `target`, `rel`, `download`, `ping`, and `referrerpolicy` from every anchor before returning preview HTML (`blockDragReorder.ts` lines 258-316). The normal editor document is bounded by its schema and server validation described above.

**Assessment:** a potentially dangerous sink exists, but no reachable attacker-controlled HTML/script source was established in this review. It is not a confirmed vulnerability. Preserve this narrow construction and add direct regression coverage if its data source changes.

## Existing focused regression evidence

- `schema.test.ts` lines 293-295 rejects a structured `javascript:` mark, and lines 1482-1488 exercise normal, file, JavaScript, whitespace-obfuscated JavaScript, and custom schemes against the TipTap URI policy.
- `markdown.test.ts` lines 671-673 and 1208-1237 cover disallowed inline HTML attributes and atomic rejection of unsupported/malformed HTML; its round-trip tests cover constrained anchor metadata.
- `PageEditorHostRuntime.core.test.tsx` lines 1836-1842 covers pasted script/style and JavaScript links, and lines 1931-1967 covers image event handlers, SVG, MathML, object/embed/iframe/srcdoc, and asserts their absence from canonical JSON.
- `PublishedDocumentReader.test.tsx` lines 1318-1320 supplies a `javascript:` link to the reader path; the reader's validation gate and error boundary provide the expected fail-safe behavior.
- `serviceNowPageRecords.test.ts` lines 253-270 covers invalid published envelopes/schema/document forms, and `document.test.ts` lines 338-342 covers malformed raw roots.

## Missing but meaningful security coverage

These are bounded test opportunities, not confirmed defects:

1. Add direct `pasteSanitizer.test.ts` cases for every security branch: `on*`, `srcdoc`, scriptable/embed tags, `javascript:` including Unicode whitespace/entity normalization, and `data:` links. Current coverage is primarily color/style behavior; the stronger active-content assertions live in editor integration tests.
2. Extend the shared link-policy corpus with URL-parser-observable encoded/control variants and run it through all three callers (structured JSON, Markdown inline anchors, and pasted DOM anchors). This protects consistency rather than addressing a demonstrated bypass.
3. Add an explicit drag-preview regression proving its `dangerouslySetInnerHTML` input contains no event attributes or navigable anchors for a representative marked block. The current source shows link stripping, but a targeted test makes the sink's invariant durable.
4. Add a reader test for unsupported top-level/block/mark structures beyond the JavaScript-link case, asserting recovery UI and no partial render. Validation already fails safely; this would protect the fail-safe contract directly.

## Findings and recommendation

### Confirmed material findings

None.

### Observations (non-findings)

- The link policy intentionally permits several non-web schemes. This is an external-handler/product-policy consideration, not script execution; retain only protocols needed by the accepted product requirements when policy is next reviewed.
- The drag-preview HTML sink is contained by its source and sanitization today. Treat any change that introduces new preview sources, raw HTML, or editor extensions as a security-sensitive change and require the focused regression noted above.
- HTTP response-level controls such as CSP, `X-Content-Type-Options`, and frame protections are not established by these source paths. They are useful defense in depth but cannot be confirmed from this static content-path review; verify them separately at the ServiceNow hosting boundary if in scope.

### Recommendation

Accept the reviewed content rendering boundary as having **no confirmed material defect**. Do not implement speculative production corrections from this report. Schedule the four focused test additions with the next bounded editor/content-security maintenance task, particularly before expanding raw HTML, image/source URL support, or drag-preview inputs.

## Review limitations

This report establishes behavior from repository source and existing tests only. It does not make claims about ServiceNow response headers, platform Blob MIME handling, external protocol handlers, third-party browser extensions, or the authorization semantics of media retrieval.
