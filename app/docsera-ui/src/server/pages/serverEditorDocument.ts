const DOCSERA_INVALID_DOCUMENT_MESSAGE = "The stored page content does not contain a valid TipTap document.";
const DOCSERA_ALLOWED_LINK_ATTRS = ["href", "target", "rel", "class", "title"] as const;
const DOCSERA_ALLOWED_ORDERED_LIST_TYPES = [null, "1", "a", "A", "i", "I"] as const;
const DOCSERA_ALLOWED_LINK_PROTOCOLS = ["http", "https", "ftp", "ftps", "mailto", "tel", "callto", "sms", "cid", "xmpp"] as const;
const DOCSERA_UNICODE_WHITESPACE_PATTERN = "[\\u0000-\\u0020\\u00A0\\u1680\\u180E\\u2000-\\u2029\\u205F\\u3000]";
const DOCSERA_UNICODE_WHITESPACE_REGEX_GLOBAL = new RegExp(DOCSERA_UNICODE_WHITESPACE_PATTERN, "g");
const DOCSERA_BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "horizontalRule",
  "codeBlock",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader"
]);
const DOCSERA_INLINE_NODE_TYPES = new Set(["text", "hardBreak"]);
const DOCSERA_DOC_CHILD_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "horizontalRule",
  "codeBlock",
  "table"
]);
const DOCSERA_NESTED_BLOCK_CHILD_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "horizontalRule",
  "codeBlock"
]);
const DOCSERA_TABLE_CELL_TYPES = new Set(["tableCell", "tableHeader"]);

export const DOCSERA_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const DOCSERA_BODY_HEADING_LEVELS = [1, 2, 3] as const;
export const SERVER_DOCSERA_DOCUMENT_SCHEMA_VERSION = DOCSERA_DOCUMENT_SCHEMA_VERSION;

export type DocseraTiptapDocument = {
  type: "doc";
  content?: unknown[];
  [key: string]: unknown;
};

export type DocseraDocumentEnvelope = {
  schemaVersion: typeof DOCSERA_DOCUMENT_SCHEMA_VERSION;
  document: DocseraTiptapDocument;
};

export type ServerTiptapDocument = DocseraTiptapDocument;
export type ServerDocumentEnvelope = DocseraDocumentEnvelope;

export type DocseraDocumentParseFailureReason =
  | "invalid-json"
  | "invalid-envelope"
  | "invalid-document"
  | "unsupported-schema-version";

export type DocseraStructuredDocumentValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export type ParseDocseraDocumentResult =
  | {
      ok: true;
      envelope: DocseraDocumentEnvelope;
      migratedLegacyDocument: boolean;
    }
  | {
      ok: false;
      reason: DocseraDocumentParseFailureReason;
      message: string;
    };

export function createEmptyDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [{ type: "paragraph" }]
    }
  };
}

export function createEmptyServerDocumentEnvelope(): ServerDocumentEnvelope {
  return createEmptyDocseraDocumentEnvelope();
}

function createValidationFailure(message = DOCSERA_INVALID_DOCUMENT_MESSAGE): DocseraStructuredDocumentValidationResult {
  return {
    ok: false,
    message
  };
}

function createParseFailure(
  reason: DocseraDocumentParseFailureReason,
  message: string
): ParseDocseraDocumentResult {
  return {
    ok: false,
    reason,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function hasSchemaVersion(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "schemaVersion");
}

function isAllowedDocumentNodeType(type: string): boolean {
  return type === "doc" || DOCSERA_BLOCK_NODE_TYPES.has(type) || DOCSERA_INLINE_NODE_TYPES.has(type);
}

function isAllowedMarkType(type: string): boolean {
  return (
    type === "link" ||
    type === "bold" ||
    type === "italic" ||
    type === "strike" ||
    type === "code" ||
    type === "underline" ||
    type === "highlight" ||
    type === "superscript" ||
    type === "subscript"
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function normalizeAllowedProtocols(protocols: readonly string[] = []): string[] {
  return [...DOCSERA_ALLOWED_LINK_PROTOCOLS, ...protocols]
    .map((protocol) => (typeof protocol === "string" ? protocol.trim() : ""))
    .filter(Boolean);
}

function matchesDocseraAllowedUri(uri: string | undefined, protocols?: readonly string[]): boolean {
  const allowedProtocols = normalizeAllowedProtocols(protocols);

  return Boolean(
    !uri ||
      uri
        .replace(DOCSERA_UNICODE_WHITESPACE_REGEX_GLOBAL, "")
        .match(
          new RegExp(
            `^(?:(?:${allowedProtocols.map((protocol) => escapeRegExp(protocol)).join("|")}):|[^a-z]|[a-z0-9+.\\-]+(?:[^a-z+.\\-:]|$))`,
            "i"
          )
        )
  );
}

export function isDocseraAllowedLinkHref(href: unknown): href is string {
  return typeof href === "string" && matchesDocseraAllowedUri(href);
}

function validateLinkAttrs(attrs: unknown): DocseraStructuredDocumentValidationResult {
  if (!isRecord(attrs) || !hasOnlyAllowedKeys(attrs, DOCSERA_ALLOWED_LINK_ATTRS)) {
    return createValidationFailure();
  }

  if (!isDocseraAllowedLinkHref(attrs.href)) {
    return createValidationFailure();
  }

  if (
    !isNullableString(attrs.target) ||
    !isNullableString(attrs.rel) ||
    !isNullableString(attrs.class) ||
    !isNullableString(attrs.title)
  ) {
    return createValidationFailure();
  }

  return { ok: true };
}

function validateMark(mark: unknown): DocseraStructuredDocumentValidationResult {
  if (!isRecord(mark) || typeof mark.type !== "string" || !isAllowedMarkType(mark.type)) {
    return createValidationFailure();
  }

  if (!hasOnlyAllowedKeys(mark, ["type", "attrs"])) {
    return createValidationFailure();
  }

  if (mark.type === "link") {
    return validateLinkAttrs(mark.attrs);
  }

  if (mark.attrs !== undefined) {
    if (!isRecord(mark.attrs) || Object.keys(mark.attrs).length > 0) {
      return createValidationFailure();
    }
  }

  return { ok: true };
}

function validateTextNodeMarks(marks: unknown[]): DocseraStructuredDocumentValidationResult {
  let hasSuperscript = false;
  let hasSubscript = false;

  for (const mark of marks) {
    const markValidation = validateMark(mark);
    if (!markValidation.ok) {
      return markValidation;
    }

    if (!isRecord(mark) || typeof mark.type !== "string") {
      return createValidationFailure();
    }

    if (mark.type === "superscript") {
      hasSuperscript = true;
    }

    if (mark.type === "subscript") {
      hasSubscript = true;
    }
  }

  return hasSuperscript && hasSubscript ? createValidationFailure() : { ok: true };
}

function validateNodeAttrs(type: string, attrs: unknown): DocseraStructuredDocumentValidationResult {
  if (attrs === undefined) {
    if (type === "heading") {
      return createValidationFailure();
    }

    return { ok: true };
  }

  if (!isRecord(attrs)) {
    return createValidationFailure();
  }

  switch (type) {
    case "doc":
    case "paragraph":
    case "bulletList":
    case "listItem":
    case "taskList":
    case "blockquote":
    case "horizontalRule":
    case "hardBreak":
    case "table":
    case "tableRow":
      return Object.keys(attrs).length === 0 ? { ok: true } : createValidationFailure();
    case "tableCell":
    case "tableHeader": {
      if (!hasOnlyAllowedKeys(attrs, ["colspan", "rowspan", "colwidth"])) {
        return createValidationFailure();
      }

      const colspan = attrs.colspan ?? 1;
      const rowspan = attrs.rowspan ?? 1;
      const colwidth = attrs.colwidth ?? null;

      if (!Number.isInteger(colspan) || Number(colspan) < 1 || !Number.isInteger(rowspan) || Number(rowspan) < 1) {
        return createValidationFailure();
      }

      if (colwidth === null) {
        return { ok: true };
      }

      if (!Array.isArray(colwidth) || colwidth.length !== Number(colspan)) {
        return createValidationFailure();
      }

      return colwidth.every((width) => Number.isInteger(width) && Number(width) > 0)
        ? { ok: true }
        : createValidationFailure();
    }
    case "heading":
      return hasOnlyAllowedKeys(attrs, ["level"]) && DOCSERA_BODY_HEADING_LEVELS.includes(attrs.level as 1 | 2 | 3)
        ? { ok: true }
        : createValidationFailure();
    case "orderedList":
      if (!hasOnlyAllowedKeys(attrs, ["start", "type"])) {
        return createValidationFailure();
      }

      if (attrs.start !== undefined && (!Number.isInteger(attrs.start) || Number(attrs.start) < 1)) {
        return createValidationFailure();
      }

      return DOCSERA_ALLOWED_ORDERED_LIST_TYPES.some((candidate) => candidate === (attrs.type ?? null))
        ? { ok: true }
        : createValidationFailure();
    case "taskItem":
      return hasOnlyAllowedKeys(attrs, ["checked"]) && typeof attrs.checked === "boolean"
        ? { ok: true }
        : createValidationFailure();
    case "codeBlock":
      return hasOnlyAllowedKeys(attrs, ["language"]) && (attrs.language === undefined || isNullableString(attrs.language))
        ? { ok: true }
        : createValidationFailure();
    default:
      return createValidationFailure();
  }
}

function validateChildNodes(
  content: unknown[],
  {
    allowEmpty = true,
    allowedChildTypes,
    requireLeadingParagraph = false
  }: {
    allowEmpty?: boolean;
    allowedChildTypes: ReadonlySet<string>;
    requireLeadingParagraph?: boolean;
  }
): DocseraStructuredDocumentValidationResult {
  if (!allowEmpty && content.length === 0) {
    return createValidationFailure();
  }

  const firstChild = content[0];
  if (requireLeadingParagraph && (!isRecord(firstChild) || firstChild.type !== "paragraph")) {
    return createValidationFailure();
  }

  for (const child of content) {
    if (!isRecord(child) || typeof child.type !== "string" || !allowedChildTypes.has(child.type)) {
      return createValidationFailure();
    }

    const childValidation = validateStructuredNode(child);
    if (!childValidation.ok) {
      return childValidation;
    }
  }

  return { ok: true };
}

function validateStructuredNode(node: unknown): DocseraStructuredDocumentValidationResult {
  if (!isRecord(node) || typeof node.type !== "string" || !isAllowedDocumentNodeType(node.type)) {
    return createValidationFailure();
  }

  const allowedKeys =
    node.type === "text"
      ? ["type", "text", "marks"]
      : node.type === "horizontalRule" || node.type === "hardBreak"
        ? ["type", "attrs"]
        : ["type", "attrs", "content"];

  if (!hasOnlyAllowedKeys(node, allowedKeys)) {
    return createValidationFailure();
  }

  if (node.type === "text") {
    if (typeof node.text !== "string" || node.text.length === 0) {
      return createValidationFailure();
    }

    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) {
        return createValidationFailure();
      }

      const markValidation = validateTextNodeMarks(node.marks);
      if (!markValidation.ok) {
        return markValidation;
      }
    }

    return { ok: true };
  }

  const attrsValidation = validateNodeAttrs(node.type, node.attrs);
  if (!attrsValidation.ok) {
    return attrsValidation;
  }

  const content = Array.isArray(node.content) ? node.content : node.content === undefined ? undefined : null;
  if (content === null) {
    return createValidationFailure();
  }

  switch (node.type) {
    case "doc":
      return validateChildNodes(content ?? [], {
        allowEmpty: true,
        allowedChildTypes: DOCSERA_DOC_CHILD_TYPES
      });
    case "paragraph":
    case "heading":
      return validateChildNodes(content ?? [], {
        allowEmpty: true,
        allowedChildTypes: DOCSERA_INLINE_NODE_TYPES
      });
    case "blockquote":
      return validateChildNodes(content ?? [], {
        allowEmpty: false,
        allowedChildTypes: DOCSERA_NESTED_BLOCK_CHILD_TYPES
      });
    case "bulletList":
    case "orderedList":
      return validateChildNodes(content ?? [], {
        allowEmpty: false,
        allowedChildTypes: new Set(["listItem"])
      });
    case "taskList":
      return validateChildNodes(content ?? [], {
        allowEmpty: false,
        allowedChildTypes: new Set(["taskItem"])
      });
    case "listItem":
    case "taskItem":
      return validateChildNodes(content ?? [], {
        allowEmpty: false,
        allowedChildTypes: DOCSERA_NESTED_BLOCK_CHILD_TYPES,
        requireLeadingParagraph: true
      });
    case "table":
      return validateChildNodes(content ?? [], {
        allowEmpty: false,
        allowedChildTypes: new Set(["tableRow"])
      });
    case "tableRow":
      return validateChildNodes(content ?? [], {
        allowEmpty: false,
        allowedChildTypes: DOCSERA_TABLE_CELL_TYPES
      });
    case "tableCell":
    case "tableHeader":
      return validateChildNodes(content ?? [], {
        allowEmpty: false,
        allowedChildTypes: DOCSERA_NESTED_BLOCK_CHILD_TYPES
      });
    case "codeBlock":
      return validateChildNodes(content ?? [], {
        allowEmpty: true,
        allowedChildTypes: new Set(["text"])
      });
    case "horizontalRule":
    case "hardBreak":
      return content === undefined || content.length === 0 ? { ok: true } : createValidationFailure();
    default:
      return createValidationFailure();
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalizeMark(mark: Record<string, unknown>): Record<string, unknown> {
  const canonicalMark: Record<string, unknown> = {
    type: mark.type
  };

  if (mark.type === "link" && mark.attrs !== undefined) {
    canonicalMark.attrs = cloneJson(mark.attrs);
  }

  return canonicalMark;
}

function canonicalizeNode(node: Record<string, unknown>): Record<string, unknown> {
  if (node.type === "text") {
    const canonicalTextNode: Record<string, unknown> = {
      type: "text",
      text: node.text
    };

    if (Array.isArray(node.marks) && node.marks.length > 0) {
      canonicalTextNode.marks = node.marks.map((mark) => canonicalizeMark(mark as Record<string, unknown>));
    }

    return canonicalTextNode;
  }

  const canonicalNode: Record<string, unknown> = {
    type: node.type
  };

  if (node.type === "orderedList") {
    const attrs = isRecord(node.attrs) ? node.attrs : {};
    canonicalNode.attrs = {
      start: Number.isInteger(attrs.start) ? Number(attrs.start) : 1,
      type: attrs.type ?? null
    };
  } else if (node.type === "tableCell" || node.type === "tableHeader") {
    const attrs = isRecord(node.attrs) ? node.attrs : {};
    canonicalNode.attrs = {
      colspan: Number.isInteger(attrs.colspan) ? Number(attrs.colspan) : 1,
      rowspan: Number.isInteger(attrs.rowspan) ? Number(attrs.rowspan) : 1,
      colwidth: Array.isArray(attrs.colwidth) ? attrs.colwidth.map((width) => Number(width)) : null
    };
  } else if (node.attrs !== undefined) {
    canonicalNode.attrs = cloneJson(node.attrs);
  }

  if (Array.isArray(node.content) && node.content.length > 0) {
    canonicalNode.content = node.content.map((child) => canonicalizeNode(child as Record<string, unknown>));
  }

  return canonicalNode;
}

function normalizeDocument(document: DocseraTiptapDocument): DocseraTiptapDocument {
  const normalized = cloneJson(document);
  if (!Array.isArray(normalized.content) || normalized.content.length === 0) {
    normalized.content = [{ type: "paragraph" }];
  }
  return normalized;
}

export function validateDocseraStructuredDocument(
  document: unknown
): DocseraStructuredDocumentValidationResult {
  try {
    return validateStructuredNode(document);
  } catch {
    return createValidationFailure();
  }
}

export function canonicalizeDocseraStructuredDocument(document: unknown): DocseraTiptapDocument {
  const validationResult = validateDocseraStructuredDocument(document);
  if (validationResult.ok === false) {
    throw new TypeError(validationResult.message);
  }

  return normalizeDocument(canonicalizeNode(document as Record<string, unknown>) as DocseraTiptapDocument);
}

export function parseDocseraDocument(value: unknown): ParseDocseraDocumentResult {
  let parsedValue = value;

  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return createParseFailure("invalid-json", "The stored page content is not valid JSON.");
    }
  }

  if (!isRecord(parsedValue)) {
    return createParseFailure("invalid-envelope", "The stored page content does not use a supported document envelope.");
  }

  if (hasSchemaVersion(parsedValue)) {
    if (parsedValue.schemaVersion !== DOCSERA_DOCUMENT_SCHEMA_VERSION) {
      return createParseFailure(
        "unsupported-schema-version",
        "The stored page content uses an unsupported document schema version."
      );
    }

    const validationResult = validateDocseraStructuredDocument(parsedValue.document);
    if (validationResult.ok === false) {
      return createParseFailure("invalid-document", validationResult.message);
    }

    return {
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: canonicalizeDocseraStructuredDocument(parsedValue.document)
      },
      migratedLegacyDocument: false
    };
  }

  if (parsedValue.type === "doc") {
    const validationResult = validateDocseraStructuredDocument(parsedValue);
    if (validationResult.ok === false) {
      return createParseFailure("invalid-document", validationResult.message);
    }

    return {
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: canonicalizeDocseraStructuredDocument(parsedValue)
      },
      migratedLegacyDocument: true
    };
  }

  return createParseFailure("invalid-envelope", "The stored page content does not use a supported document envelope.");
}

export function parseDocseraDocumentOrThrow(value: unknown): DocseraDocumentEnvelope {
  const parsed = parseDocseraDocument(value);
  if (parsed.ok === false) {
    throw new TypeError(parsed.message);
  }

  return parsed.envelope;
}

export function parseServerDocument(value: unknown): ServerDocumentEnvelope {
  return parseDocseraDocumentOrThrow(value);
}

export function serializeDocseraDocument(envelope: DocseraDocumentEnvelope): string {
  return JSON.stringify(parseDocseraDocumentOrThrow(envelope));
}

export function extractPlainTextFromServerDocument(value: unknown): string {
  const envelope = parseServerDocument(value);
  const paragraphs: string[] = [];

  function collectInlineText(content: unknown[] | undefined): string {
    if (!Array.isArray(content) || content.length === 0) {
      return "";
    }

    const fragments: string[] = [];
    for (const child of content) {
      if (!isRecord(child) || typeof child.type !== "string") {
        continue;
      }

      if (child.type === "text" && typeof child.text === "string") {
        fragments.push(child.text);
        continue;
      }

      if (child.type === "hardBreak") {
        fragments.push("\n");
      }
    }

    return fragments.join("");
  }

  function visitNode(node: unknown) {
    if (!isRecord(node) || typeof node.type !== "string") {
      return;
    }

    switch (node.type) {
      case "paragraph":
      case "heading":
      case "codeBlock": {
        paragraphs.push(collectInlineText(Array.isArray(node.content) ? node.content : []));
        return;
      }
      case "horizontalRule":
        paragraphs.push("");
        return;
      case "bulletList":
      case "orderedList":
      case "taskList":
      case "blockquote":
      case "listItem":
      case "taskItem":
      case "table":
      case "tableRow":
      case "tableCell":
      case "tableHeader":
      case "doc":
        if (Array.isArray(node.content)) {
          node.content.forEach(visitNode);
        }
        return;
      default:
        return;
    }
  }

  visitNode(envelope.document);
  return paragraphs.join("\n").trim();
}
