import { getSchema, type Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { isAllowedUri, Link } from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import StarterKit from "@tiptap/starter-kit";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

export const DOCSERA_BODY_HEADING_LEVELS = [2, 3] as const;

const DOCSERA_INVALID_DOCUMENT_MESSAGE = "The stored page content does not contain a valid TipTap document.";
const DOCSERA_ALLOWED_ORDERED_LIST_TYPES = new Set([null, "1", "a", "A", "i", "I"]);
const DOCSERA_ALLOWED_LINK_ATTRS = ["href", "target", "rel", "class", "title"] as const;

let cachedDocseraEditorSchema: Schema | null = null;

type RawValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

function createValidationFailure(message = DOCSERA_INVALID_DOCUMENT_MESSAGE): RawValidationResult {
  return {
    ok: false,
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

function isDocumentNodeType(type: string): boolean {
  return (
    type === "doc" ||
    type === "paragraph" ||
    type === "heading" ||
    type === "bulletList" ||
    type === "orderedList" ||
    type === "listItem" ||
    type === "taskList" ||
    type === "taskItem" ||
    type === "blockquote" ||
    type === "horizontalRule" ||
    type === "codeBlock" ||
    type === "text" ||
    type === "hardBreak"
  );
}

function isDocumentMarkType(type: string): boolean {
  return type === "link" || type === "bold" || type === "italic" || type === "strike" || type === "code";
}

function validateLinkAttrs(attrs: unknown): RawValidationResult {
  if (!isRecord(attrs) || !hasOnlyAllowedKeys(attrs, DOCSERA_ALLOWED_LINK_ATTRS)) {
    return createValidationFailure();
  }

  const href = attrs.href;
  if (typeof href !== "string" || !isDocseraAllowedLinkHref(href)) {
    return createValidationFailure();
  }

  if (!isNullableString(attrs.target) || !isNullableString(attrs.rel) || !isNullableString(attrs.class) || !isNullableString(attrs.title)) {
    return createValidationFailure();
  }

  return { ok: true };
}

function validateNodeAttrs(type: string, attrs: unknown): RawValidationResult {
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
      return Object.keys(attrs).length === 0 ? { ok: true } : createValidationFailure();
    case "heading": {
      if (!hasOnlyAllowedKeys(attrs, ["level"])) {
        return createValidationFailure();
      }

      const level = attrs.level;
      return Number.isInteger(level) && DOCSERA_BODY_HEADING_LEVELS.includes(level as 2 | 3)
        ? { ok: true }
        : createValidationFailure();
    }
    case "orderedList": {
      if (!hasOnlyAllowedKeys(attrs, ["start", "type"])) {
        return createValidationFailure();
      }

      const start = attrs.start;
      if (start !== undefined && (typeof start !== "number" || !Number.isInteger(start) || start < 1)) {
        return createValidationFailure();
      }

      if (attrs.type !== undefined && !DOCSERA_ALLOWED_ORDERED_LIST_TYPES.has(attrs.type as null | string)) {
        return createValidationFailure();
      }

      return { ok: true };
    }
    case "taskItem":
      if (!hasOnlyAllowedKeys(attrs, ["checked"])) {
        return createValidationFailure();
      }

      return typeof attrs.checked === "boolean" ? { ok: true } : createValidationFailure();
    case "codeBlock":
      if (!hasOnlyAllowedKeys(attrs, ["language"])) {
        return createValidationFailure();
      }

      return attrs.language === undefined || isNullableString(attrs.language) ? { ok: true } : createValidationFailure();
    case "text":
      return createValidationFailure();
    default:
      return createValidationFailure();
  }
}

function validateMarkAttrs(type: string, attrs: unknown): RawValidationResult {
  if (attrs === undefined) {
    return type === "link" ? createValidationFailure() : { ok: true };
  }

  if (type === "link") {
    return validateLinkAttrs(attrs);
  }

  if (!isRecord(attrs) || Object.keys(attrs).length !== 0) {
    return createValidationFailure();
  }

  return { ok: true };
}

function validateMark(mark: unknown): RawValidationResult {
  if (!isRecord(mark) || typeof mark.type !== "string" || !isDocumentMarkType(mark.type)) {
    return createValidationFailure();
  }

  if (!hasOnlyAllowedKeys(mark, ["type", "attrs"])) {
    return createValidationFailure();
  }

  return validateMarkAttrs(mark.type, mark.attrs);
}

function materializeValidatedNode(node: unknown, schema: Schema): ProseMirrorNode {
  if (!isRecord(node) || typeof node.type !== "string") {
    throw new TypeError("Invalid node.");
  }

  if (node.type === "text") {
    const marks = Array.isArray(node.marks)
      ? node.marks.map((mark) => schema.markFromJSON(mark as { type: string; attrs?: Record<string, unknown> }))
      : [];

    return schema.text(node.text as string, marks);
  }

  const attrs = isRecord(node.attrs) ? node.attrs : null;
  const content = Array.isArray(node.content) ? node.content.map((child) => materializeValidatedNode(child, schema)) : [];

  return schema.node(node.type, attrs, content);
}

function validateNode(node: unknown): RawValidationResult {
  if (!isRecord(node) || typeof node.type !== "string" || !isDocumentNodeType(node.type)) {
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
    if (typeof node.text !== "string") {
      return createValidationFailure();
    }

    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) {
        return createValidationFailure();
      }

      for (const mark of node.marks) {
        const markValidation = validateMark(mark);
        if (!markValidation.ok) {
          return markValidation;
        }
      }
    }

    try {
      materializeValidatedNode(node, getDocseraEditorSchema());
      return { ok: true };
    } catch {
      return createValidationFailure();
    }
  }

  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) {
      return createValidationFailure();
    }

    for (const child of node.content) {
      const childValidation = validateNode(child);
      if (!childValidation.ok) {
        return childValidation;
      }
    }
  }

  try {
    const attrsValidation = validateNodeAttrs(node.type, node.attrs);
    if (!attrsValidation.ok) {
      return attrsValidation;
    }

    materializeValidatedNode(node, getDocseraEditorSchema());
    return { ok: true };
  } catch {
    return createValidationFailure();
  }
}

export function isDocseraAllowedLinkHref(href: unknown): href is string {
  return typeof href === "string" && Boolean(isAllowedUri(href, []));
}

export function createDocseraEditorExtensions(): Extensions {
  return [
    Document.extend({
      content: "block*"
    }),
    StarterKit.configure({
      document: false,
      heading: { levels: [...DOCSERA_BODY_HEADING_LEVELS] },
      link: false,
      orderedList: {
        keepAttributes: true,
        keepMarks: true
      },
      bulletList: {
        keepAttributes: false,
        keepMarks: true
      },
      underline: false
    }),
    Link.configure({
      autolink: true,
      linkOnPaste: true,
      openOnClick: false,
      isAllowedUri: (url, { defaultValidate }) => defaultValidate(url)
    }),
    TaskItem.configure({
      nested: true
    }),
    TaskList.configure({})
  ];
}

export function getDocseraEditorSchema(): Schema {
  if (!cachedDocseraEditorSchema) {
    cachedDocseraEditorSchema = getSchema(createDocseraEditorExtensions());
  }

  return cachedDocseraEditorSchema;
}

export function canonicalizeDocseraStructuredDocument(document: unknown): unknown {
  const schema = getDocseraEditorSchema();
  return materializeValidatedNode(document, schema).toJSON();
}

export function validateDocseraStructuredDocument(document: unknown): RawValidationResult {
  try {
    return validateNode(document);
  } catch {
    return createValidationFailure();
  }
}
