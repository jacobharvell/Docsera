import { fromMarkdown } from "mdast-util-from-markdown";
import { directiveFromMarkdown, directiveToMarkdown } from "mdast-util-directive";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import type { Root as MdastRoot } from "mdast";
import { directive } from "micromark-extension-directive";
import { gfm } from "micromark-extension-gfm";
import { parseDocument as parseYamlDocument } from "yaml";
import { validatePageSettingsTitle } from "../pages/domain";
import {
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  isDocseraAllowedLinkHref,
  parseDocseraDocument,
  type DocseraDocumentEnvelope,
  type DocseraTiptapDocument
} from "../../server/pages/serverEditorDocument";
import {
  DOCSERA_IMAGE_DEFAULTS,
  validateDocseraImageAttrs,
  type DocseraImageAlignment
} from "../../server/pages/serverImageContract";
import {
  isDocseraNonDefaultTextAlignment,
  isDocseraPaletteKey,
  isDocseraTextAlignment
} from "../../server/editor/colorContract";

type RecordValue = Record<string, unknown>;

type CanonicalNode = Record<string, unknown>;

type LinkAttrs = {
  href: string;
  target: string | null;
  rel: string | null;
  class: string | null;
  title: string | null;
};

type MarkdownInlineMark = { type: string; attrs?: Record<string, unknown> };

export type DocseraMarkdownConversionFailureReason =
  | "invalid-frontmatter"
  | "invalid-title"
  | "invalid-markdown"
  | "unsupported-html"
  | "unknown-directive"
  | "invalid-directive"
  | "invalid-canonical-document";

export type DocseraMarkdownConversionFailure = {
  ok: false;
  reason: DocseraMarkdownConversionFailureReason;
  message: string;
  range?: { from: number; to: number };
};

export type SerializeDocseraMarkdownResult =
  | {
      ok: true;
      markdown: string;
      title: string;
      envelope: DocseraDocumentEnvelope;
    }
  | DocseraMarkdownConversionFailure;

export type ParseDocseraMarkdownResult =
  | {
      ok: true;
      markdown: string;
      title: string;
      envelope: DocseraDocumentEnvelope;
    }
  | DocseraMarkdownConversionFailure;

const DOCSERA_DEFAULT_LINK_TARGET = "_blank";
const DOCSERA_DEFAULT_LINK_REL = "noopener noreferrer nofollow";
const DOCSERA_ALLOWED_ORDERED_LIST_TYPES = new Set(["1", "a", "A", "i", "I"]);
const DOCSERA_ALLOWED_HTML_TAGS = new Set(["u", "mark", "sup", "sub", "a", "span"]);
const DOCSERA_ALLOWED_TABLE_CELL_ALIGNMENTS = new Set(["left", "center", "right"]);
const DOCSERA_ALLOWED_CALLOUT_TYPES = new Set(["info", "warning", "success", "error"]);
const DOCSERA_DIRECTIVE_NAMES = new Set([
  "docsera-empty-document",
  "docsera-empty-paragraph",
  "docsera-image",
  "docsera-text-align",
  "docsera-ordered-list",
  "docsera-accordion",
  "docsera-accordion-item",
  "docsera-callout",
  "docsera-columns",
  "docsera-column",
  "docsera-table",
  "docsera-table-row",
  "docsera-table-header",
  "docsera-table-cell"
]);

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createFailure(
  reason: DocseraMarkdownConversionFailureReason,
  message: string
): DocseraMarkdownConversionFailure {
  return { ok: false, reason, message };
}

function withNodeRange(failure: DocseraMarkdownConversionFailure, node: unknown): DocseraMarkdownConversionFailure {
  if (failure.range || !isRecord(node) || !isRecord(node.position) || !isRecord(node.position.start) || !isRecord(node.position.end)) return failure;
  const from = node.position.start.offset;
  const to = node.position.end.offset;
  return typeof from === "number" && typeof to === "number" && Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to > from
    ? { ...failure, range: { from, to } } : failure;
}

function isFailure<T>(value: T | DocseraMarkdownConversionFailure): value is DocseraMarkdownConversionFailure {
  return isRecord(value) && value.ok === false;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeMarkdownInput(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

function serializeFrontmatterTitle(title: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\n---\n`;
}

function parseFrontmatter(markdown: string): { title: string; body: string; bodyOffset: number } | DocseraMarkdownConversionFailure {
  const normalizedMarkdown = normalizeMarkdownInput(markdown);

  if (!normalizedMarkdown.startsWith("---\n")) {
    const failure = createFailure("invalid-frontmatter", "Markdown must begin with a YAML frontmatter opening delimiter: --- on its own line.");
    const firstLine = normalizedMarkdown.split("\n", 1)[0];
    return /^-{2,} *$/.test(firstLine) ? { ...failure, range: { from: 0, to: firstLine.trimEnd().length } } : failure;
  }

  const closingOffset = normalizedMarkdown.indexOf("\n---\n", 4);
  if (closingOffset < 0) {
    const failure = createFailure("invalid-frontmatter", "Markdown frontmatter must end with a closing delimiter: --- on its own line.");
    // The delimiter-like line immediately after the sole title field identifies the expected boundary.
    const candidate = /^title:[^\n]*\n(-{2,}) *(?:\n|$)/.exec(normalizedMarkdown.slice(4));
    if (!candidate) return failure;
    const from = 4 + candidate[0].indexOf("\n") + 1;
    return { ...failure, range: { from, to: from + candidate[1].length } };
  }

  const frontmatter = normalizedMarkdown.slice(4, closingOffset);
  const body = normalizedMarkdown.slice(closingOffset + 5);
  const yamlDocument = parseYamlDocument(frontmatter, {
    merge: false,
    prettyErrors: false,
    uniqueKeys: true
  });

  if (yamlDocument.errors.length > 0) {
    const [from, to] = yamlDocument.errors[0].pos;
    const failure = createFailure("invalid-frontmatter", "Markdown frontmatter is malformed.");
    return from >= 0 && to > from && to <= frontmatter.length ? { ...failure, range: { from: from + 4, to: to + 4 } } : failure;
  }

  const rawValue = yamlDocument.toJS();
  if (!isRecord(rawValue)) {
    return createFailure("invalid-frontmatter", "Markdown frontmatter must be an object containing only title.");
  }

  const keys = Object.keys(rawValue);
  if (keys.length !== 1 || keys[0] !== "title") {
    return createFailure("invalid-frontmatter", "Markdown frontmatter may contain only the title field.");
  }

  const titleValidation = validatePageSettingsTitle(rawValue.title);
  if (!titleValidation.valid) {
    const value = yamlDocument.get("title", true);
    const range = value && typeof value === "object" && "range" in value ? value.range : undefined;
    const failure = createFailure("invalid-title", titleValidation.error);
    return Array.isArray(range) && typeof range[0] === "number" && typeof range[1] === "number" && range[1] > range[0]
      ? { ...failure, range: { from: range[0] + 4, to: range[1] + 4 } } : failure;
  }

  return {
    bodyOffset: closingOffset + 5,
    title: titleValidation.normalizedValue,
    body
  };
}

function parseMarkdownAst(markdownBody: string): MdastRoot {
  return fromMarkdown(markdownBody, {
    extensions: [gfm(), directive()],
    mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown()]
  }) as unknown as MdastRoot;
}

function isDefaultLinkAttrs(attrs: LinkAttrs): boolean {
  return attrs.target === DOCSERA_DEFAULT_LINK_TARGET && attrs.rel === DOCSERA_DEFAULT_LINK_REL && attrs.class === null;
}

function createDefaultLinkAttrs(attrs: Pick<LinkAttrs, "href"> & Partial<Pick<LinkAttrs, "title">>): LinkAttrs {
  return {
    href: attrs.href,
    target: DOCSERA_DEFAULT_LINK_TARGET,
    rel: DOCSERA_DEFAULT_LINK_REL,
    class: null,
    title: attrs.title ?? null
  };
}

function serializeHtmlAttrValue(value: string | null): string {
  if (value === null) {
    return "null";
  }

  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u0008/g, "&#8;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;")
    .replace(/\f/g, "&#12;")
    .replace(/\\/g, "&#92;");

  return `"${escaped}"`;
}

function serializeHtmlHrefAttrValue(value: string): string {
  return serializeHtmlAttrValue(encodeURIComponent(value));
}

function decodeHtmlHrefAttrValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function decodeHtmlAttributeValue(value: string): string | null {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (character !== "&") {
      if (character === "<" || character === ">" || character === "\\" || character === "\u0008" || character === "\u0009" || character === "\u000A" || character === "\u000C" || character === "\u000D") {
        return null;
      }

      result += character;
      continue;
    }

    const entityMatch =
      value.startsWith("&amp;", index)
        ? { decoded: "&", length: 5 }
        : value.startsWith("&quot;", index)
          ? { decoded: "\"", length: 6 }
          : value.startsWith("&lt;", index)
            ? { decoded: "<", length: 4 }
            : value.startsWith("&gt;", index)
              ? { decoded: ">", length: 4 }
              : value.startsWith("&#8;", index)
                ? { decoded: "\u0008", length: 4 }
                : value.startsWith("&#9;", index)
                  ? { decoded: "\u0009", length: 4 }
                  : value.startsWith("&#10;", index)
                    ? { decoded: "\u000A", length: 5 }
                    : value.startsWith("&#12;", index)
                      ? { decoded: "\u000C", length: 5 }
                      : value.startsWith("&#13;", index)
                        ? { decoded: "\u000D", length: 5 }
                        : value.startsWith("&#92;", index)
                          ? { decoded: "\\", length: 5 }
                          : null;

    if (!entityMatch) {
      return null;
    }

    result += entityMatch.decoded;
    index += entityMatch.length - 1;
  }

  return result;
}

function escapeDirectiveAttributeValue(value: string): string {
  return JSON.stringify(value);
}

function normalizeMarkdownMarks(marks: MarkdownInlineMark[]): MarkdownInlineMark[] {
  return [...marks];
}

function serializeDirectiveAttributes(
  attrs: Record<string, string | number | boolean | null | undefined>,
  {
    omitNull = false
  }: {
    omitNull?: boolean;
  } = {}
): string {
  const entries = Object.entries(attrs).filter(([, value]) => value !== undefined && (!omitNull || value !== null));
  if (entries.length === 0) {
    return "";
  }

  const renderedEntries = entries.map(([key, value]) => {
    if (value === null) {
      return `${key}=null`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return `${key}=${JSON.stringify(value)}`;
    }

    const serialized = toMarkdown(
      {
        type: "root",
        children: [
          {
            type: "leafDirective",
            name: "docsera-attrs-probe",
            attributes: { [key]: String(value) },
            children: []
          }
        ]
      } as MdastRoot,
      {
        extensions: [directiveToMarkdown({ quoteSmart: true, quote: "\"" })]
      }
    ).trimEnd();
    const openBrace = serialized.indexOf("{");
    const closeBrace = serialized.lastIndexOf("}");
    if (openBrace < 0 || closeBrace < 0 || closeBrace <= openBrace) {
      return `${key}=${escapeDirectiveAttributeValue(String(value))}`;
    }
    return serialized.slice(openBrace + 1, closeBrace);
  });

  return `{${renderedEntries.join(" ")}}`;
}

function collectMaxDirectiveFenceDepth(markdown: string): number {
  let maxDepth = 0;
  for (const line of markdown.split("\n")) {
    const match = /^:+/.exec(line);
    if (match) {
      maxDepth = Math.max(maxDepth, match[0].length);
    }
  }
  return maxDepth;
}

function createContainerDirective(opening: string, body: string): string {
  const fenceLength = Math.max(3, collectMaxDirectiveFenceDepth(body) + 1);
  const fence = ":".repeat(fenceLength);
  return body ? `${fence}${opening}\n${body}\n${fence}` : `${fence}${opening}\n${fence}`;
}

function createLeafDirective(name: string, attrs: Record<string, string | number | boolean | null | undefined>): string {
  const attributes = Object.fromEntries(
    Object.entries(attrs)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value === null ? null : String(value)])
  );
  return toMarkdown(
    {
      type: "root",
      children: [
        {
          type: "leafDirective",
          name,
          attributes,
          children: []
        }
      ]
    } as MdastRoot,
    {
      extensions: [directiveToMarkdown({ quoteSmart: true, quote: "\"" })]
    }
  ).trimEnd();
}

function escapeTextContent(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!<>~])/g, "\\$1");
}

function escapeLinkTitle(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function serializeCodeSpan(value: string): string {
  const tickRuns = value.match(/`+/g) ?? [];
  const maxTicks = tickRuns.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(maxTicks + 1);
  const pad = /^[`]|[`]$/.test(value) || /^\s|\s$/.test(value) ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

function serializeInlineText(text: string, marks: MarkdownInlineMark[] = []): string {
  const normalizedMarks = normalizeMarkdownMarks(marks);
  const codeMark = normalizedMarks.find((mark) => mark.type === "code");
  const baseText = codeMark ? serializeCodeSpan(text) : escapeTextContent(text);

  let rendered = baseText;
  for (let index = normalizedMarks.length - 1; index >= 0; index -= 1) {
    const mark = normalizedMarks[index];
    switch (mark.type) {
      case "bold":
        rendered = `**${rendered}**`;
        break;
      case "italic":
        rendered = `_${rendered}_`;
        break;
      case "strike":
        rendered = `~~${rendered}~~`;
        break;
      case "underline":
        rendered = `<u>${rendered}</u>`;
        break;
      case "highlight":
        rendered = `<mark>${rendered}</mark>`;
        break;
      case "textColor": {
        const color = isRecord(mark.attrs) ? mark.attrs.color : null;
        if (!isDocseraPaletteKey(color)) {
          throw new TypeError("Unsupported Docsera text color.");
        }
        rendered = `<span data-docsera-text-color=${serializeHtmlAttrValue(color)}>${rendered}</span>`;
        break;
      }
      case "highlightColor": {
        const color = isRecord(mark.attrs) ? mark.attrs.color : null;
        if (!isDocseraPaletteKey(color)) {
          throw new TypeError("Unsupported Docsera highlight color.");
        }
        rendered = `<mark data-docsera-highlight-color=${serializeHtmlAttrValue(color)}>${rendered}</mark>`;
        break;
      }
      case "superscript":
        rendered = `<sup>${rendered}</sup>`;
        break;
      case "subscript":
        rendered = `<sub>${rendered}</sub>`;
        break;
      case "link": {
        const rawAttrs = isRecord(mark.attrs) ? mark.attrs : {};
        const attrs: LinkAttrs = {
          href: String(rawAttrs.href ?? ""),
          target: rawAttrs.target === null || typeof rawAttrs.target === "string" ? rawAttrs.target : null,
          rel: rawAttrs.rel === null || typeof rawAttrs.rel === "string" ? rawAttrs.rel : null,
          class: rawAttrs.class === null || typeof rawAttrs.class === "string" ? rawAttrs.class : null,
          title: rawAttrs.title === null || typeof rawAttrs.title === "string" ? rawAttrs.title : null
        };
        if (isDefaultLinkAttrs(attrs)) {
          rendered =
            attrs.title === null
              ? `[${rendered}](${attrs.href})`
              : `[${rendered}](${attrs.href} "${escapeLinkTitle(attrs.title)}")`;
        } else {
          rendered = `<a href=${serializeHtmlHrefAttrValue(attrs.href)} target=${serializeHtmlAttrValue(
            attrs.target
          )} rel=${serializeHtmlAttrValue(attrs.rel)} class=${serializeHtmlAttrValue(attrs.class)} title=${serializeHtmlAttrValue(
            attrs.title
          )}>${rendered}</a>`;
        }
        break;
      }
      case "code":
        break;
      default:
        throw new TypeError(`Unsupported mark type: ${mark.type}`);
    }
  }

  return rendered;
}

function serializeInlineContent(content: unknown[] | undefined): string {
  if (!Array.isArray(content) || content.length === 0) {
    return "";
  }

  return content
    .map((node) => {
      if (!isRecord(node) || typeof node.type !== "string") {
        throw new TypeError("Unsupported inline content.");
      }

      if (node.type === "hardBreak") {
        return "\\\n";
      }

      if (node.type !== "text" || typeof node.text !== "string") {
        throw new TypeError("Unsupported inline content.");
      }

      const marks = Array.isArray(node.marks)
        ? (node.marks.filter((mark): mark is MarkdownInlineMark => isRecord(mark) && typeof mark.type === "string") as MarkdownInlineMark[])
        : [];

      return serializeInlineText(node.text, marks);
    })
    .join("");
}

function indentBlock(markdown: string, prefix: string): string {
  return markdown
    .split("\n")
    .map((line) => (line.length > 0 ? `${prefix}${line}` : prefix.trimEnd()))
    .join("\n");
}

function serializeListItemContent(content: unknown[] | undefined, orderedDepth = 0): string {
  const blocks = serializeBlockNodes(content, orderedDepth + 1);
  if (blocks.length === 0) {
    return "";
  }

  const [first, ...rest] = blocks;
  return [first, ...rest.map((block) => indentBlock(block, "    "))].join("\n\n");
}

function isLosslessMarkdownTable(documentNode: RecordValue): boolean {
  const allowedMarks = new Set(["bold", "italic", "strike"]);
  const rows = Array.isArray(documentNode.content) ? documentNode.content : [];
  if (rows.length === 0) {
    return false;
  }

  const headerRow = rows[0];
  if (!isRecord(headerRow) || !Array.isArray(headerRow.content) || headerRow.content.length === 0) {
    return false;
  }

  const expectedColumnCount = headerRow.content.length;
  const alignments: Array<"left" | "center" | "right" | null> = [];
  const alignmentObserved: boolean[] = [];

  for (const row of rows) {
    if (!isRecord(row) || row.type !== "tableRow" || !Array.isArray(row.content) || row.content.length !== expectedColumnCount) {
      return false;
    }

    for (let columnIndex = 0; columnIndex < row.content.length; columnIndex += 1) {
      const cell = row.content[columnIndex];
      if (!isRecord(cell) || (cell.type !== "tableHeader" && cell.type !== "tableCell")) {
        return false;
      }

      if (row === headerRow && cell.type !== "tableHeader") {
        return false;
      }

      if (row !== headerRow && cell.type !== "tableCell") {
        return false;
      }

      const attrs = isRecord(cell.attrs) ? cell.attrs : {};
      const colspan = Number(attrs.colspan ?? 1);
      const rowspan = Number(attrs.rowspan ?? 1);
      const colwidth = attrs.colwidth ?? null;
      const align = attrs.align ?? null;

      if (colspan !== 1 || rowspan !== 1 || colwidth !== null) {
        return false;
      }

      if (align !== null && align !== "left" && align !== "center" && align !== "right") {
        return false;
      }

      if (!Array.isArray(cell.content) || cell.content.length !== 1) {
        return false;
      }

      const paragraph = cell.content[0];
      if (!isRecord(paragraph) || paragraph.type !== "paragraph" || !Array.isArray(paragraph.content)) {
        return false;
      }

      const paragraphAttrs = isRecord(paragraph.attrs) ? paragraph.attrs : {};
      if (isDocseraNonDefaultTextAlignment(paragraphAttrs.textAlign)) {
        return false;
      }

      for (const child of paragraph.content) {
        if (!isRecord(child) || child.type !== "text" || typeof child.text !== "string") {
          return false;
        }

        if (/[\r\n]/.test(child.text)) {
          return false;
        }

        const childMarks = Array.isArray(child.marks) ? child.marks : [];
        for (const mark of childMarks) {
          if (!isRecord(mark) || typeof mark.type !== "string" || !allowedMarks.has(mark.type)) {
            return false;
          }

          if (mark.attrs !== undefined && (!isRecord(mark.attrs) || Object.keys(mark.attrs).length > 0)) {
            return false;
          }
        }
      }

      if (!alignmentObserved[columnIndex]) {
        alignments[columnIndex] = align;
        alignmentObserved[columnIndex] = true;
      } else if (alignments[columnIndex] !== align) {
        return false;
      }
    }
  }

  return true;
}

function serializeMarkdownTable(node: RecordValue): string {
  const rows = Array.isArray(node.content) ? node.content : [];
  const headerRow = rows[0] as RecordValue;
  const columnCount = Array.isArray(headerRow.content) ? headerRow.content.length : 0;
  const alignments = Array.from({ length: columnCount }, (_, index) => {
    const cell = (headerRow.content as unknown[])[index];
    const attrs = isRecord(cell) && isRecord(cell.attrs) ? cell.attrs : {};
    return (attrs.align ?? null) as "left" | "center" | "right" | null;
  });

  const renderCell = (cell: unknown): string => {
    const paragraph = isRecord(cell) && Array.isArray(cell.content) ? cell.content[0] : null;
    const inline = isRecord(paragraph) ? serializeInlineContent(paragraph.content as unknown[] | undefined) : "";
    return inline.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  };

  const header = `| ${(headerRow.content as unknown[]).map(renderCell).join(" | ")} |`;
  const separator = `| ${alignments
    .map((alignment) => {
      switch (alignment) {
        case "left":
          return ":--";
        case "center":
          return ":-:";
        case "right":
          return "--:";
        default:
          return "---";
      }
    })
    .join(" | ")} |`;
  const bodyRows = rows.slice(1).map((row) => `| ${((row as RecordValue).content as unknown[]).map(renderCell).join(" | ")} |`);
  return [header, separator, ...bodyRows].join("\n");
}

function serializeRichTable(node: RecordValue, orderedDepth = 0): string {
  const rowBlocks = (Array.isArray(node.content) ? node.content : []).map((row) => {
    if (!isRecord(row)) {
      throw new TypeError("Unsupported table row.");
    }

    const cellBlocks = (Array.isArray(row.content) ? row.content : []).map((cell) => {
      if (!isRecord(cell)) {
        throw new TypeError("Unsupported table cell.");
      }

      const attrs = isRecord(cell.attrs) ? cell.attrs : {};
      const name = cell.type === "tableHeader" ? "docsera-table-header" : "docsera-table-cell";
      const body = serializeBlockNodes(cell.content as unknown[] | undefined, orderedDepth + 1).join("\n\n");
      return createContainerDirective(
        `${name}${serializeDirectiveAttributes({
          colspan: Number(attrs.colspan ?? 1),
          rowspan: Number(attrs.rowspan ?? 1),
          colwidth: attrs.colwidth === null ? null : JSON.stringify(attrs.colwidth ?? null),
          align: (attrs.align ?? null) as string | null
        })}`,
        body
      );
    });

    return createContainerDirective("docsera-table-row", cellBlocks.join("\n\n"));
  });

  return createContainerDirective("docsera-table", rowBlocks.join("\n\n"));
}

function serializeBlockNode(node: unknown, orderedDepth = 0): string {
  if (!isRecord(node) || typeof node.type !== "string") {
    throw new TypeError("Unsupported block content.");
  }

  switch (node.type) {
    case "paragraph": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const paragraphMarkdown = !Array.isArray(node.content) || node.content.length === 0
        ? createLeafDirective("docsera-empty-paragraph", {})
        : (() => {
        const rendered = serializeInlineContent(node.content);
        const htmlSafeRendered = rendered.startsWith("<") ? ` ${rendered}` : rendered;
        return /^(?::{3,}|::docsera-)/.test(htmlSafeRendered) ? `\\${htmlSafeRendered}` : htmlSafeRendered;
      })();
      return isDocseraNonDefaultTextAlignment(attrs.textAlign)
        ? createContainerDirective(
            `docsera-text-align${serializeDirectiveAttributes({ align: attrs.textAlign })}`,
            paragraphMarkdown
          )
        : paragraphMarkdown;
    }
    case "heading": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const headingMarkdown = `${"#".repeat(Number(attrs.level ?? 1))} ${serializeInlineContent(node.content as unknown[] | undefined)}`;
      return isDocseraNonDefaultTextAlignment(attrs.textAlign)
        ? createContainerDirective(
            `docsera-text-align${serializeDirectiveAttributes({ align: attrs.textAlign })}`,
            headingMarkdown
          )
        : headingMarkdown;
    }
    case "bulletList":
      return (Array.isArray(node.content) ? node.content : [])
        .map((item) => `* ${serializeListItemContent((item as RecordValue).content as unknown[] | undefined, orderedDepth)}`)
        .join("\n");
    case "orderedList": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const start = Number(attrs.start ?? 1);
      const listMarkdown = (Array.isArray(node.content) ? node.content : [])
        .map((item, index) => `${start + index}. ${serializeListItemContent((item as RecordValue).content as unknown[] | undefined, orderedDepth)}`)
        .join("\n");
      const type = attrs.type ?? null;
      if (type === null) {
        return listMarkdown;
      }
      return createContainerDirective(
        `docsera-ordered-list${serializeDirectiveAttributes({ start, type: String(type) })}`,
        listMarkdown
      );
    }
    case "taskList":
      return (Array.isArray(node.content) ? node.content : [])
        .map((item) => {
          const attrs = isRecord((item as RecordValue).attrs) ? ((item as RecordValue).attrs as RecordValue) : {};
          const checked = attrs.checked === true ? "x" : " ";
          return `- [${checked}] ${serializeListItemContent((item as RecordValue).content as unknown[] | undefined, orderedDepth)}`;
        })
        .join("\n");
    case "blockquote":
      return indentBlock(serializeBlockNodes(node.content as unknown[] | undefined, orderedDepth + 1).join("\n\n"), "> ");
    case "horizontalRule":
      return "---";
    case "codeBlock": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const language = typeof attrs.language === "string" ? attrs.language : "";
      const value = Array.isArray(node.content) ? node.content.map((child) => (isRecord(child) && typeof child.text === "string" ? child.text : "")).join("") : "";
      const tickRuns = value.match(/```+/g) ?? [];
      const fence = "`".repeat(Math.max(3, tickRuns.reduce((max, run) => Math.max(max, run.length + 1), 3)));
      return `${fence}${language}\n${value}\n${fence}`;
    }
    case "image": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      return createLeafDirective("docsera-image", {
        "media-id": String(attrs.mediaId ?? ""),
        "dark-media-id": attrs.darkMediaId === null ? undefined : String(attrs.darkMediaId ?? ""),
        alt: String(attrs.alt ?? DOCSERA_IMAGE_DEFAULTS.alt),
        caption: String(attrs.caption ?? DOCSERA_IMAGE_DEFAULTS.caption),
        frame: Boolean(attrs.frame ?? DOCSERA_IMAGE_DEFAULTS.frame),
        align: String(attrs.align ?? DOCSERA_IMAGE_DEFAULTS.align),
        "width-pct": Number(attrs.widthPct ?? DOCSERA_IMAGE_DEFAULTS.widthPct)
      });
    }
    case "accordion": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const items = (Array.isArray(node.content) ? node.content : []).map((item) => {
        const itemRecord = item as RecordValue;
        const itemAttrs = isRecord(itemRecord.attrs) ? itemRecord.attrs : {};
        const titleNode = Array.isArray(itemRecord.content) ? itemRecord.content[0] : null;
        const bodyNode = Array.isArray(itemRecord.content) ? itemRecord.content[1] : null;
        const titleContent = isRecord(titleNode) && Array.isArray(titleNode.content) ? serializeInlineContent(titleNode.content) : "";
        const bodyContent =
          isRecord(bodyNode) && Array.isArray(bodyNode.content)
            ? serializeBlockNodes(bodyNode.content, orderedDepth + 1).join("\n\n")
            : "";

        return createContainerDirective(
          `docsera-accordion-item[${titleContent}]${serializeDirectiveAttributes({
            "item-id": String(itemAttrs.accordionItemId ?? "")
          })}`,
          bodyContent
        );
      });

      return createContainerDirective(
        `docsera-accordion${serializeDirectiveAttributes({
          "accordion-id": String(attrs.accordionId ?? "")
        })}`,
        items.join("\n\n")
      );
    }
    case "callout": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const body = serializeBlockNodes(node.content as unknown[] | undefined, orderedDepth + 1).join("\n\n");
      return createContainerDirective(
        `docsera-callout${serializeDirectiveAttributes({
          type: String(attrs.type ?? "info"),
          title: attrs.title === null || attrs.title === undefined ? undefined : String(attrs.title)
        })}`,
        body
      );
    }
    case "columns": {
      const columns = (Array.isArray(node.content) ? node.content : []).map((column) =>
        createContainerDirective(
          "docsera-column",
          serializeBlockNodes((column as RecordValue).content as unknown[] | undefined, orderedDepth + 1).join("\n\n")
        )
      );
      return createContainerDirective("docsera-columns", columns.join("\n\n"));
    }
    case "table":
      return isLosslessMarkdownTable(node) ? serializeMarkdownTable(node) : serializeRichTable(node, orderedDepth + 1);
    default:
      throw new TypeError(`Unsupported block node: ${node.type}`);
  }
}

function serializeBlockNodes(content: unknown[] | undefined, orderedDepth = 0): string[] {
  return (Array.isArray(content) ? content : []).map((node) => serializeBlockNode(node, orderedDepth));
}

function createMarkdownFromCanonical(title: string, envelope: DocseraDocumentEnvelope): string {
  const bodyBlocks = Array.isArray(envelope.document.content)
    ? envelope.document.content.length === 1 &&
      isRecord(envelope.document.content[0]) &&
      envelope.document.content[0].type === "paragraph" &&
      !Array.isArray(envelope.document.content[0].content)
      ? []
      : serializeBlockNodes(envelope.document.content)
    : [];
  const body =
    Array.isArray(envelope.document.content) && envelope.document.content.length === 0
      ? createLeafDirective("docsera-empty-document", {})
      : bodyBlocks.join("\n\n");
  return `${serializeFrontmatterTitle(title)}${body}`;
}

function isDirectiveLabelParagraph(node: unknown): boolean {
  return isRecord(node) && node.type === "paragraph" && isRecord(node.data) && node.data.directiveLabel === true;
}

function parseCanonicalHtmlAttributes(rawAttrs: string): Record<string, string | null> | null {
  const attrs: Record<string, string | null> = {};
  let index = 0;

  const skipWhitespace = () => {
    while (index < rawAttrs.length && /\s/.test(rawAttrs[index] ?? "")) {
      index += 1;
    }
  };

  const readHtmlString = (): string | null => {
    if (rawAttrs[index] !== "\"") {
      return null;
    }

    index += 1;
    const start = index;
    while (index < rawAttrs.length && rawAttrs[index] !== "\"") {
      index += 1;
    }

    if (index >= rawAttrs.length) {
      return null;
    }

    const rawValue = rawAttrs.slice(start, index);
    index += 1;
    return decodeHtmlAttributeValue(rawValue);
  };

  skipWhitespace();
  while (index < rawAttrs.length) {
    const keyMatch = /^[A-Za-z_:][A-Za-z0-9_:\-.]*/.exec(rawAttrs.slice(index));
    if (!keyMatch) {
      return null;
    }

    const key = keyMatch[0];
    index += key.length;
    skipWhitespace();

    if (rawAttrs[index] !== "=") {
      return null;
    }

    index += 1;
    skipWhitespace();

    let value: string | null;
    if (rawAttrs.startsWith("null", index)) {
      const nextCharacter = rawAttrs[index + 4];
      if (nextCharacter !== undefined && !/\s/.test(nextCharacter)) {
        return null;
      }
      value = null;
      index += 4;
    } else {
      value = readHtmlString();
      if (value === null && rawAttrs[index - 1] !== "\"") {
        return null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(attrs, key)) {
      return null;
    }

    attrs[key] = value;
    skipWhitespace();
  }

  return attrs;
}

function parseHtmlTag(value: string): { closing: boolean; name: string; attrs: Record<string, string | null> } | null {
  const match = /^<\s*(\/)?\s*([a-zA-Z][\w-]*)([^>]*)>$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, closingSlash, rawName, rawAttrs] = match;
  const name = rawName.toLowerCase();
  if (!DOCSERA_ALLOWED_HTML_TAGS.has(name)) {
    return null;
  }

  if (closingSlash) {
    if (rawAttrs.trim().length > 0) {
      return null;
    }

    return { closing: true, name, attrs: {} };
  }

  const attrs = parseCanonicalHtmlAttributes(rawAttrs);
  if (!attrs) {
    return null;
  }

  return { closing: false, name, attrs };
}

function createInlineTextNode(text: string, marks: MarkdownInlineMark[]): CanonicalNode {
  const node: CanonicalNode = {
    type: "text",
    text
  };
  const normalizedMarks = normalizeMarkdownMarks(marks);
  if (normalizedMarks.length > 0) {
    node.marks = normalizedMarks.map((mark) => (mark.attrs ? { type: mark.type, attrs: cloneJson(mark.attrs) } : { type: mark.type }));
  }
  return node;
}

function parseLinkAttrs(attrs: Record<string, string | null>): LinkAttrs | DocseraMarkdownConversionFailure {
  const keys = Object.keys(attrs).sort();
  const allowed = ["class", "href", "rel", "target", "title"].sort();
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    return createFailure("unsupported-html", "Inline HTML links must provide exactly href, target, rel, class, and title.");
  }

  const href = decodeHtmlHrefAttrValue(attrs.href ?? "");
  if (!isDocseraAllowedLinkHref(href)) {
    return createFailure("invalid-markdown", "Link href uses an unsupported URI.");
  }

  return {
    href,
    target: Object.prototype.hasOwnProperty.call(attrs, "target") ? (attrs.target ?? null) : null,
    rel: Object.prototype.hasOwnProperty.call(attrs, "rel") ? (attrs.rel ?? null) : null,
    class: attrs.class ?? null,
    title: attrs.title ?? null
  };
}

function parseDocseraColorAttrs(
  attrs: Record<string, string | null>,
  attributeName: "data-docsera-text-color" | "data-docsera-highlight-color"
): { color: string } | DocseraMarkdownConversionFailure {
  const keys = Object.keys(attrs);
  if (keys.length !== 1 || keys[0] !== attributeName) {
    return createFailure("unsupported-html", `Inline HTML color tags must provide exactly ${attributeName}.`);
  }

  const color = attrs[attributeName];
  return isDocseraPaletteKey(color)
    ? { color }
    : createFailure("invalid-markdown", "Docsera color values must use an accepted palette key.");
}

function parsePhrasing(nodes: unknown[] | undefined): CanonicalNode[] | DocseraMarkdownConversionFailure {
  const result: CanonicalNode[] = [];
  const activeMarks: MarkdownInlineMark[] = [];

  const appendText = (text: string, marks: MarkdownInlineMark[]) => {
    if (!text) {
      return;
    }
    result.push(createInlineTextNode(text, marks));
  };

  const visit = (node: unknown) => {
    if (!isRecord(node) || typeof node.type !== "string") {
      throw createFailure("invalid-markdown", "Markdown contains unsupported inline content.");
    }

    try {
    switch (node.type) {
      case "text":
        appendText(String(node.value ?? ""), activeMarks);
        return;
      case "break":
        result.push({ type: "hardBreak" });
        return;
      case "inlineCode":
        appendText(String(node.value ?? ""), [...activeMarks, { type: "code" }]);
        return;
      case "strong":
        activeMarks.push({ type: "bold" });
        try {
          (Array.isArray(node.children) ? node.children : []).forEach((child) => visit(child));
        } finally {
          activeMarks.pop();
        }
        return;
      case "emphasis":
        activeMarks.push({ type: "italic" });
        try {
          (Array.isArray(node.children) ? node.children : []).forEach((child) => visit(child));
        } finally {
          activeMarks.pop();
        }
        return;
      case "delete":
        activeMarks.push({ type: "strike" });
        try {
          (Array.isArray(node.children) ? node.children : []).forEach((child) => visit(child));
        } finally {
          activeMarks.pop();
        }
        return;
      case "link": {
        const attrs = createDefaultLinkAttrs({
          href: String(node.url ?? ""),
          title: typeof node.title === "string" ? node.title : null
        });
        if (!isDocseraAllowedLinkHref(attrs.href)) {
          throw createFailure("invalid-markdown", "Link href uses an unsupported URI.");
        }
        activeMarks.push({ type: "link", attrs });
        try {
          (Array.isArray(node.children) ? node.children : []).forEach((child) => visit(child));
        } finally {
          activeMarks.pop();
        }
        return;
      }
      case "html": {
        const parsedTag = parseHtmlTag(String(node.value ?? ""));
        if (!parsedTag) {
          throw createFailure("unsupported-html", "Markdown contains unsupported inline HTML.");
        }

        if (parsedTag.closing) {
          const expectedType =
            parsedTag.name === "a"
              ? "link"
              : parsedTag.name === "span"
                ? "textColor"
              : parsedTag.name === "u"
                ? "underline"
                : parsedTag.name === "mark"
                  ? "highlightOrHighlightColor"
                  : parsedTag.name === "sup"
                    ? "superscript"
                    : "subscript";
          const current = activeMarks.pop();
          const currentMatches =
            expectedType === "highlightOrHighlightColor"
              ? current?.type === "highlight" || current?.type === "highlightColor"
              : current?.type === expectedType;
          if (!currentMatches) {
            throw createFailure("unsupported-html", "Inline HTML nesting is malformed.");
          }
          return;
        }

        if (parsedTag.name === "a") {
          const linkAttrs = parseLinkAttrs(parsedTag.attrs);
          if (isFailure(linkAttrs)) {
            throw linkAttrs;
          }
          activeMarks.push({ type: "link", attrs: linkAttrs });
          return;
        }

        if (parsedTag.name === "span") {
          const attrs = parseDocseraColorAttrs(parsedTag.attrs, "data-docsera-text-color");
          if (isFailure(attrs)) {
            throw attrs;
          }
          activeMarks.push({ type: "textColor", attrs });
          return;
        }

        if (parsedTag.name === "mark" && Object.keys(parsedTag.attrs).length > 0) {
          const attrs = parseDocseraColorAttrs(parsedTag.attrs, "data-docsera-highlight-color");
          if (isFailure(attrs)) {
            throw attrs;
          }
          activeMarks.push({ type: "highlightColor", attrs });
          return;
        }

        if (Object.keys(parsedTag.attrs).length > 0) {
          throw createFailure("unsupported-html", `Inline HTML <${parsedTag.name}> tags do not allow attributes.`);
        }

        activeMarks.push({
          type:
            parsedTag.name === "u"
              ? "underline"
              : parsedTag.name === "mark"
                ? "highlight"
                : parsedTag.name === "sup"
                  ? "superscript"
                  : "subscript"
        });
        return;
      }
      case "textDirective":
        if (typeof node.name === "string" && String(node.name).startsWith("docsera-")) {
          throw createFailure("invalid-directive", "Single-colon Docsera directives are not supported.");
        }
        throw createFailure("invalid-markdown", "Markdown contains an unsupported text directive.");
      default:
        throw createFailure("invalid-markdown", `Markdown contains unsupported inline node type: ${node.type}`);
    }
    } catch (error) {
      throw isFailure(error) ? withNodeRange(error, node) : error;
    }
  };

  try {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      visit(node);
    }
  } catch (error) {
    return error as DocseraMarkdownConversionFailure;
  }

  if (activeMarks.length > 0) {
    return createFailure("unsupported-html", "Inline HTML nesting is not closed.");
  }

  return result;
}

function parseDirectiveAttributes(
  node: RecordValue,
  expectedKeys: readonly string[]
): Record<string, string | null> | DocseraMarkdownConversionFailure {
  const attrs = isRecord(node.attributes) ? (node.attributes as Record<string, string | null>) : {};
  const keys = Object.keys(attrs).sort();
  const sortedExpected = [...expectedKeys].sort();

  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) {
    return createFailure("invalid-directive", `${String(node.name)} requires exactly ${sortedExpected.join(", ")}.`);
  }

  return attrs;
}

function parseCalloutDirectiveAttributes(
  node: RecordValue
): { type: string; title: string | null } | DocseraMarkdownConversionFailure {
  const attrs = isRecord(node.attributes) ? (node.attributes as Record<string, string | null>) : {};
  const keys = Object.keys(attrs).sort();
  if (!keys.includes("type") || keys.some((key) => key !== "type" && key !== "title")) {
    return createFailure("invalid-directive", "docsera-callout requires type and optional title attributes.");
  }

  const type = attrs.type;
  if (typeof type !== "string" || !DOCSERA_ALLOWED_CALLOUT_TYPES.has(type)) {
    return createFailure("invalid-directive", "docsera-callout type is unsupported.");
  }

  const title = Object.prototype.hasOwnProperty.call(attrs, "title") ? attrs.title : null;
  if (title !== null && typeof title !== "string") {
    return createFailure("invalid-directive", "docsera-callout title is invalid.");
  }

  if (typeof title === "string" && /[\r\n]/.test(title)) {
    return createFailure("invalid-directive", "docsera-callout title must be single-line text.");
  }

  return { type, title };
}

function parseDirectiveLabel(node: RecordValue): CanonicalNode[] | DocseraMarkdownConversionFailure {
  const children = Array.isArray(node.children) ? node.children : [];
  const firstChild = children[0];
  if (!isDirectiveLabelParagraph(firstChild)) {
    return createFailure("invalid-directive", `${String(node.name)} requires a leading directive label.`);
  }

  if (children.slice(1).some(isDirectiveLabelParagraph)) {
    return createFailure("invalid-directive", `${String(node.name)} allows only one directive label.`);
  }

  return parsePhrasing((firstChild as RecordValue).children as unknown[] | undefined);
}

function parseDirectiveBody(node: RecordValue, skipLabel = false, sourceText?: string): CanonicalNode[] | DocseraMarkdownConversionFailure {
  const children = Array.isArray(node.children) ? node.children : [];
  const bodyChildren = skipLabel ? children.slice(1) : children;

  if (skipLabel) {
    if (!isDirectiveLabelParagraph(children[0])) {
      return createFailure("invalid-directive", `${String(node.name)} requires a leading directive label.`);
    }
  } else if (children.some(isDirectiveLabelParagraph)) {
    return createFailure("invalid-directive", `${String(node.name)} does not allow a directive label.`);
  }

  if (bodyChildren.length === 0) {
    return createFailure("invalid-directive", `${String(node.name)} requires a non-empty body.`);
  }

  return parseFlow(bodyChildren, sourceText);
}

function parseTableCellLike(
  node: RecordValue,
  type: "tableCell" | "tableHeader",
  sourceText?: string
): CanonicalNode | DocseraMarkdownConversionFailure {
  const attrs = parseDirectiveAttributes(node, ["align", "colspan", "colwidth", "rowspan"]);
  if (isFailure(attrs)) {
    return attrs;
  }

  const colspan = Number(attrs.colspan);
  const rowspan = Number(attrs.rowspan);
  let colwidth: unknown = null;
  if (attrs.colwidth !== "null") {
    try {
      colwidth = JSON.parse(String(attrs.colwidth));
    } catch {
      return createFailure("invalid-directive", `${String(node.name)} colwidth must be valid JSON array syntax or null.`);
    }
  }
  const align = attrs.align === "null" ? null : attrs.align;

  if (!Number.isInteger(colspan) || colspan < 1 || !Number.isInteger(rowspan) || rowspan < 1) {
    return createFailure("invalid-directive", `${String(node.name)} colspan and rowspan must be positive integers.`);
  }

  if (align !== null && !DOCSERA_ALLOWED_TABLE_CELL_ALIGNMENTS.has(align)) {
    return createFailure("invalid-directive", `${String(node.name)} align must be left, center, right, or null.`);
  }

  if (colwidth !== null) {
    if (!Array.isArray(colwidth) || colwidth.length !== colspan) {
      return createFailure("invalid-directive", `${String(node.name)} colwidth must be null or an array matching colspan.`);
    }

    if (!colwidth.every((width) => Number.isInteger(width) && Number(width) > 0)) {
      return createFailure("invalid-directive", `${String(node.name)} colwidth values must be positive integers.`);
    }
  }

  const content = parseDirectiveBody(node, false, sourceText);
  if (isFailure(content)) {
    return content;
  }

  return {
    type,
    attrs: {
      colspan,
      rowspan,
      colwidth,
      ...(align === null ? {} : { align })
    },
    content
  };
}

function getNodeSourceSlice(node: RecordValue, sourceText: string | undefined): string | null {
  if (typeof sourceText !== "string") {
    return null;
  }

  const rawPosition = (node as Record<string, unknown>).position;
  if (!isRecord(rawPosition) || !isRecord(rawPosition.start) || !isRecord(rawPosition.end)) {
    return null;
  }

  const start = Number(rawPosition.start.offset);
  const end = Number(rawPosition.end.offset);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > sourceText.length) {
    return null;
  }

  return sourceText.slice(start, end);
}

function parseFlow(nodes: unknown[] | undefined, sourceText?: string): CanonicalNode[] | DocseraMarkdownConversionFailure {
  const result: CanonicalNode[] = [];

  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!isRecord(node) || typeof node.type !== "string") {
      return createFailure("invalid-markdown", "Markdown contains unsupported block content.");
    }

    const nodeFailure = (reason: DocseraMarkdownConversionFailureReason, message: string) => withNodeRange(createFailure(reason, message), node);
    switch (node.type) {
      case "paragraph": {
        const inline = parsePhrasing(node.children as unknown[] | undefined);
        if (isFailure(inline)) {
          return inline;
        }
        result.push(inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" });
        break;
      }
      case "heading": {
        const inline = parsePhrasing(node.children as unknown[] | undefined);
        if (isFailure(inline)) {
          return inline;
        }
        result.push({
          type: "heading",
          attrs: { level: Number(node.depth ?? 1) },
          ...(inline.length > 0 ? { content: inline } : {})
        });
        break;
      }
      case "list": {
        const items = Array.isArray(node.children) ? node.children : [];
        const sourceSlice = getNodeSourceSlice(node, sourceText);
        const loneEmptyItem =
          items.length === 1 &&
          isRecord(items[0]) &&
          items[0].type === "listItem" &&
          Array.isArray(items[0].children) &&
          items[0].children.length === 0;
        const rawMarkerText = sourceSlice?.trim() ?? "";

        if (loneEmptyItem && /^(?:[*+-]|\d+[.)])$/.test(rawMarkerText)) {
          result.push({
            type: "paragraph",
            content: [{ type: "text", text: rawMarkerText }]
          });
          break;
        }

        const checkedFlags = items.map((item) => (isRecord(item) && typeof item.checked === "boolean" ? item.checked : null));
        const isTaskList = checkedFlags.some((checked) => checked !== null);
        if (isTaskList && checkedFlags.some((checked) => checked === null)) {
          return nodeFailure("invalid-markdown", "Markdown list structure is malformed.");
        }
        const content: CanonicalNode[] = [];

        for (const item of items) {
          if (!isRecord(item) || item.type !== "listItem") {
            return nodeFailure("invalid-markdown", "Markdown list structure is malformed.");
          }

          const parsedChildren = parseFlow(item.children as unknown[] | undefined, sourceText);
          if (isFailure(parsedChildren)) {
            return parsedChildren;
          }

          if (isTaskList) {
            content.push({
              type: "taskItem",
              attrs: { checked: item.checked === true },
              content: parsedChildren
            });
          } else {
            content.push({
              type: "listItem",
              content: parsedChildren
            });
          }
        }

        if (isTaskList) {
          result.push({
            type: "taskList",
            content
          });
        } else {
          result.push({
            type: node.ordered === true ? "orderedList" : "bulletList",
            ...(node.ordered === true ? { attrs: { start: Number(node.start ?? 1), type: null } } : {}),
            content
          });
        }

        break;
      }
      case "blockquote": {
        const content = parseFlow(node.children as unknown[] | undefined, sourceText);
        if (isFailure(content)) {
          return content;
        }
        result.push({
          type: "blockquote",
          content
        });
        break;
      }
      case "thematicBreak":
        result.push({ type: "horizontalRule" });
        break;
      case "code":
        result.push({
          type: "codeBlock",
          attrs: { language: typeof node.lang === "string" ? node.lang : null },
          ...(String(node.value ?? "").length > 0 ? { content: [{ type: "text", text: String(node.value ?? "") }] } : {})
        });
        break;
      case "table": {
        const rows = Array.isArray(node.children) ? node.children : [];
        const align = Array.isArray(node.align) ? node.align : [];
        const tableRows: CanonicalNode[] = [];
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const cells = Array.isArray((row as RecordValue).children) ? ((row as RecordValue).children as unknown[]) : [];
          const parsedCells: CanonicalNode[] = [];
          for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
            const cell = cells[cellIndex];
            const inline = parsePhrasing((cell as RecordValue).children as unknown[] | undefined);
            if (isFailure(inline)) {
              return inline;
            }
            const cellAlignment = align[cellIndex];
            if (
              cellAlignment !== null &&
              cellAlignment !== undefined &&
              cellAlignment !== "left" &&
              cellAlignment !== "center" &&
              cellAlignment !== "right"
            ) {
              return nodeFailure("invalid-markdown", "GFM table alignment is malformed.");
            }
            parsedCells.push({
              type: rowIndex === 0 ? "tableHeader" : "tableCell",
              attrs: {
                colspan: 1,
                rowspan: 1,
                colwidth: null,
                ...(cellAlignment === "left" || cellAlignment === "center" || cellAlignment === "right"
                  ? { align: cellAlignment }
                  : {})
              },
              content: [{ type: "paragraph", ...(inline.length > 0 ? { content: inline } : {}) }]
            });
          }
          tableRows.push({
            type: "tableRow",
            content: parsedCells
          });
        }
        result.push({
          type: "table",
          content: tableRows
        });
        break;
      }
      case "leafDirective": {
        if (typeof node.name === "string" && !node.name.startsWith("docsera-")) {
          const literal = getNodeSourceSlice(node, sourceText);
          if (literal === null) {
            return nodeFailure("invalid-markdown", "Markdown contains unsupported block content.");
          }
          result.push({ type: "paragraph", content: [{ type: "text", text: literal }] });
          break;
        }
        if (typeof node.name !== "string" || !DOCSERA_DIRECTIVE_NAMES.has(node.name)) {
          return nodeFailure("unknown-directive", "Markdown contains an unknown Docsera directive.");
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
          return nodeFailure("invalid-directive", `${node.name} does not allow child content.`);
        }

        if (node.name === "docsera-empty-document") {
          const attrs = parseDirectiveAttributes(node, []);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          result.push({ type: "docsera-empty-document-sentinel" });
          break;
        }

        if (node.name === "docsera-empty-paragraph") {
          const attrs = parseDirectiveAttributes(node, []);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          result.push({ type: "paragraph" });
          break;
        }

        if (node.name === "docsera-image") {
          const rawAttrs = isRecord(node.attributes) ? (node.attributes as Record<string, string | null>) : {};
          const allowedKeys = ["align", "alt", "caption", "dark-media-id", "frame", "media-id", "width-pct"];
          const keys = Object.keys(rawAttrs).sort();
          if (keys.some((key) => !allowedKeys.includes(key))) {
            return nodeFailure("invalid-directive", "docsera-image contains unsupported attributes.");
          }
          const requiredKeys = ["align", "alt", "caption", "frame", "media-id", "width-pct"];
          if (requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(rawAttrs, key))) {
            return nodeFailure("invalid-directive", "docsera-image is missing required attributes.");
          }
          if (rawAttrs.frame !== "true" && rawAttrs.frame !== "false") {
            return nodeFailure("invalid-directive", "docsera-image frame must be true or false.");
          }
          const widthPct = Number(rawAttrs["width-pct"]);
          const imageAttrs = {
            mediaId: rawAttrs["media-id"] ?? "",
            darkMediaId: Object.prototype.hasOwnProperty.call(rawAttrs, "dark-media-id")
              ? (rawAttrs["dark-media-id"] ?? null)
              : null,
            alt: rawAttrs.alt ?? DOCSERA_IMAGE_DEFAULTS.alt,
            caption: rawAttrs.caption ?? DOCSERA_IMAGE_DEFAULTS.caption,
            frame: rawAttrs.frame === "true",
            align: rawAttrs.align,
            widthPct
          };
          if (!Number.isFinite(widthPct) || !Number.isInteger(widthPct) || !validateDocseraImageAttrs(imageAttrs)) {
            return nodeFailure("invalid-directive", "docsera-image attribute values are invalid.");
          }
          result.push({
            type: "image",
            attrs: imageAttrs
          });
          break;
        }

        return nodeFailure("invalid-directive", `${node.name} is not a supported leaf directive.`);
      }
      case "containerDirective": {
        if (typeof node.name !== "string" || !DOCSERA_DIRECTIVE_NAMES.has(node.name)) {
          return nodeFailure("unknown-directive", "Markdown contains an unknown Docsera directive.");
        }

        if (node.name === "docsera-text-align") {
          const attrs = parseDirectiveAttributes(node, ["align"]);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          if (!isDocseraTextAlignment(attrs.align)) {
            return nodeFailure("invalid-directive", "docsera-text-align align must be left, center, or right.");
          }
          const content = parseDirectiveBody(node, false, sourceText);
          if (isFailure(content)) {
            return content;
          }
          if (content.length !== 1 || (content[0].type !== "paragraph" && content[0].type !== "heading")) {
            return nodeFailure("invalid-directive", "docsera-text-align must wrap exactly one paragraph or heading.");
          }
          const alignedNode = cloneJson(content[0]);
          const alignedAttrs = isRecord(alignedNode.attrs) ? alignedNode.attrs : {};
          alignedNode.attrs = {
            ...alignedAttrs,
            textAlign: attrs.align
          };
          result.push(alignedNode);
          break;
        }

        if (node.name === "docsera-ordered-list") {
          const attrs = parseDirectiveAttributes(node, ["start", "type"]);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const start = Number(attrs.start);
          if (!Number.isInteger(start) || start < 1) {
            return nodeFailure("invalid-directive", "Docsera ordered list start must be a positive integer.");
          }
          if (!DOCSERA_ALLOWED_ORDERED_LIST_TYPES.has(attrs.type ?? "")) {
            return nodeFailure("invalid-directive", "Docsera ordered list type is unsupported.");
          }
          const content = parseDirectiveBody(node, false, sourceText);
          if (isFailure(content)) {
            return content;
          }
          if (content.length !== 1 || content[0].type !== "orderedList") {
            return nodeFailure("invalid-directive", "Docsera ordered list must wrap exactly one ordered list.");
          }
          const listNode = cloneJson(content[0]);
          if (Number((listNode.attrs as RecordValue).start ?? 1) !== start) {
            return nodeFailure("invalid-directive", "Docsera ordered list wrapper start must match the enclosed Markdown list start.");
          }
          (listNode.attrs as RecordValue).start = start;
          (listNode.attrs as RecordValue).type = attrs.type;
          result.push(listNode);
          break;
        }

        if (node.name === "docsera-accordion") {
          const attrs = parseDirectiveAttributes(node, ["accordion-id"]);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const items = parseDirectiveBody(node, false, sourceText);
          if (isFailure(items)) {
            return items;
          }
          result.push({
            type: "accordion",
            attrs: { accordionId: attrs["accordion-id"] ?? "" },
            content: items
          });
          break;
        }

        if (node.name === "docsera-accordion-item") {
          const attrs = parseDirectiveAttributes(node, ["item-id"]);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const label = parseDirectiveLabel(node);
          if (isFailure(label)) {
            return withNodeRange(label, node);
          }
          const body = parseDirectiveBody(node, true, sourceText);
          if (isFailure(body)) {
            return body;
          }
          result.push({
            type: "accordionItem",
            attrs: { accordionItemId: attrs["item-id"] ?? "" },
            content: [
              { type: "accordionTitle", ...(label.length > 0 ? { content: label } : {}) },
              { type: "accordionContent", content: body }
            ]
          });
          break;
        }

        if (node.name === "docsera-columns") {
          const attrs = parseDirectiveAttributes(node, []);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const columns = parseDirectiveBody(node, false, sourceText);
          if (isFailure(columns)) {
            return columns;
          }
          result.push({
            type: "columns",
            content: columns
          });
          break;
        }

        if (node.name === "docsera-column") {
          const attrs = parseDirectiveAttributes(node, []);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const content = parseDirectiveBody(node, false, sourceText);
          if (isFailure(content)) {
            return content;
          }
          result.push({
            type: "column",
            content
          });
          break;
        }

        if (node.name === "docsera-callout") {
          const attrs = parseCalloutDirectiveAttributes(node);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const content = parseDirectiveBody(node, false, sourceText);
          if (isFailure(content)) {
            return content;
          }
          result.push({
            type: "callout",
            attrs,
            content
          });
          break;
        }

        if (node.name === "docsera-table") {
          const attrs = parseDirectiveAttributes(node, []);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const rows = parseDirectiveBody(node, false, sourceText);
          if (isFailure(rows)) {
            return rows;
          }
          result.push({
            type: "table",
            content: rows
          });
          break;
        }

        if (node.name === "docsera-table-row") {
          const attrs = parseDirectiveAttributes(node, []);
          if (isFailure(attrs)) {
            return withNodeRange(attrs, node);
          }
          const cells = parseDirectiveBody(node, false, sourceText);
          if (isFailure(cells)) {
            return cells;
          }
          result.push({
            type: "tableRow",
            content: cells
          });
          break;
        }

        if (node.name === "docsera-table-header" || node.name === "docsera-table-cell") {
          const cell = parseTableCellLike(node, node.name === "docsera-table-header" ? "tableHeader" : "tableCell", sourceText);
          if (isFailure(cell)) {
            return withNodeRange(cell, node);
          }
          result.push(cell);
          break;
        }

        return nodeFailure("invalid-directive", `${node.name} is not supported in this position.`);
      }
      case "html":
        return nodeFailure("unsupported-html", "Block HTML is not supported by the Docsera Markdown contract.");
      default:
        return nodeFailure("invalid-markdown", `Markdown contains unsupported block node type: ${node.type}`);
    }
  }

  return result;
}

function toCanonicalEnvelope(blocks: CanonicalNode[]): DocseraDocumentEnvelope | DocseraMarkdownConversionFailure {
  if (blocks.some((node) => node.type === "docsera-empty-document-sentinel") && blocks.length !== 1) {
    return createFailure("invalid-directive", "docsera-empty-document must be the only body node.");
  }

  const document: DocseraTiptapDocument =
    blocks.length === 1 && blocks[0].type === "docsera-empty-document-sentinel"
      ? { type: "doc", content: [] }
      : {
          type: "doc",
          content: blocks.length === 0 ? [{ type: "paragraph" }] : blocks
        };

  const parsed = parseDocseraDocument({
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document
  });

  if (!parsed.ok) {
    return createFailure("invalid-canonical-document", parsed.message);
  }

  return parsed.envelope;
}

export function serializeDocseraMarkdownDocument(title: unknown, envelope: unknown): SerializeDocseraMarkdownResult {
  const titleValidation = validatePageSettingsTitle(title);
  if (!titleValidation.valid) {
    return createFailure("invalid-title", titleValidation.error);
  }

  const parsedEnvelope = parseDocseraDocument(envelope);
  if (!parsedEnvelope.ok) {
    return createFailure("invalid-canonical-document", parsedEnvelope.message);
  }

  try {
    return {
      ok: true,
      title: titleValidation.normalizedValue,
      envelope: parsedEnvelope.envelope,
      markdown: createMarkdownFromCanonical(titleValidation.normalizedValue, parsedEnvelope.envelope)
    };
  } catch (error) {
    return createFailure(
      "invalid-canonical-document",
      error instanceof Error ? error.message : "The canonical document could not be serialized to Markdown."
    );
  }
}

export function parseDocseraMarkdownDocument(markdown: unknown): ParseDocseraMarkdownResult {
  if (typeof markdown !== "string") {
    return createFailure("invalid-markdown", "Markdown source must be a string.");
  }

  const frontmatter = parseFrontmatter(markdown);
  const originalRange = (failure: DocseraMarkdownConversionFailure, offset = 0): DocseraMarkdownConversionFailure => {
    if (!failure.range) return failure;
    const normalized = normalizeMarkdownInput(markdown);
    const from = failure.range.from + offset;
    const to = failure.range.to + offset;
    if (from < 0 || to <= from || to > normalized.length) return { ...failure, range: undefined };
    const originalOffset = (position: number) => {
      let original = 0;
      for (let index = 0; index < position; index++, original++) {
        if (markdown[original] === "\r" && markdown[original + 1] === "\n") original++;
      }
      return original;
    };
    return { ...failure, range: { from: originalOffset(from), to: originalOffset(to) } };
  };
  if (isFailure(frontmatter)) {
    return originalRange(frontmatter);
  }

  let ast: MdastRoot;
  let body = frontmatter.body;
  const insertedOffsets: number[] = [];
  try {
    // An unclosed unknown container consumes following blocks in the AST. Escape
    // only its opener and reparse so ordinary Markdown determines boundaries.
    while (true) {
      ast = parseMarkdownAst(body);
      const findUnknownContainer = (nodes: unknown[]): number | undefined => {
        for (const node of nodes) {
          if (!isRecord(node)) continue;
          if (node.type === "containerDirective" && typeof node.name === "string" && !node.name.startsWith("docsera-")) {
            const position = isRecord(node.position) && isRecord(node.position.start) ? node.position.start.offset : undefined;
            if (typeof position === "number") return position;
          }
          if (Array.isArray(node.children)) {
            const position = findUnknownContainer(node.children);
            if (position !== undefined) return position;
          }
        }
        return undefined;
      };
      const position = findUnknownContainer(ast.children);
      if (position === undefined) break;
      body = `${body.slice(0, position)}\\${body.slice(position)}`;
      for (let index = 0; index < insertedOffsets.length; index++) {
        if (insertedOffsets[index] >= position) insertedOffsets[index]++;
      }
      insertedOffsets.push(position);
    }
  } catch (error) {
    return createFailure(
      "invalid-markdown",
      error instanceof Error ? error.message : "Markdown source could not be parsed."
    );
  }
  if (!Array.isArray(ast.children)) {
    return createFailure("invalid-markdown", "Markdown source did not produce a valid document AST.");
  }

  const blocks = parseFlow(ast.children, body);
  if (isFailure(blocks)) {
    const range = blocks.range;
    const sourceOffset = (offset: number) => offset - insertedOffsets.filter((position) => position < offset).length;
    return originalRange(range ? { ...blocks, range: { from: sourceOffset(range.from), to: sourceOffset(range.to) } } : blocks, frontmatter.bodyOffset);
  }

  const envelope = toCanonicalEnvelope(blocks);
  if (isFailure(envelope)) {
    return envelope;
  }

  const normalized = serializeDocseraMarkdownDocument(frontmatter.title, envelope);
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    title: normalized.title,
    envelope: normalized.envelope,
    markdown: normalized.markdown
  };
}

export function normalizeDocseraMarkdownDocument(markdown: unknown): ParseDocseraMarkdownResult {
  return parseDocseraMarkdownDocument(markdown);
}

export function serializeDocseraMarkdownBodyPreview(title: string, envelope: DocseraDocumentEnvelope): string {
  return createMarkdownFromCanonical(title, envelope);
}

export function createDocseraMarkdownMdast(markdown: string): string {
  return toMarkdown(parseMarkdownAst(markdown), {
    extensions: [directiveToMarkdown(), gfmToMarkdown()]
  });
}
