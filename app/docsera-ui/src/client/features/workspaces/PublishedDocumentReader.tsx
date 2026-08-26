import { Component, Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { type DocseraDocumentEnvelope } from "../../../shared/editor/document";
import { canonicalizeDocseraImageAttrs, type DocseraImageAttrs } from "../../../shared/editor/imageContract";
import {
  createCanonicalHeadingAnchorResolver,
  extractCanonicalHeadingText,
  extractCanonicalInlineText
} from "../../../shared/editor/headingAnchors";
import { useWorkspaceMediaObjectUrl } from "../../shared/media/useWorkspaceMediaObjectUrl";
import { ImageFullscreenViewer, createImageFullscreenViewerSession, type ImageFullscreenViewerSession } from "../../shared/media/ImageFullscreenViewer";
import {
  isDocseraAllowedLinkHref,
  validateDocseraStructuredDocument
} from "../../../server/pages/serverEditorDocument";
import type { WorkspaceMediaLoader } from "../../shared/types/docsera";

type PublishedDocumentReaderProps = {
  envelope: DocseraDocumentEnvelope;
  loadMedia?: WorkspaceMediaLoader;
  pageIdentity?: string;
  theme?: "dark" | "light";
};

type ReaderBoundaryProps = {
  children: ReactNode;
};

type ReaderBoundaryState = {
  hasError: boolean;
};

type ReaderContext = {
  accordionOpenItemIds: Record<string, string | null>;
  setAccordionOpenItemId: (accordionId: string, itemId: string | null) => void;
  resolveHeadingAnchor: (headingText: string) => string;
  loadMedia?: WorkspaceMediaLoader;
  openImageFullscreen: (input: {
    alt: string;
    imageElement: HTMLImageElement;
    restoreFocusElement: HTMLElement | null;
    sourceElement: HTMLElement;
  }) => void;
  theme: "dark" | "light";
};

const SAFE_LINK_ATTRIBUTES = {
  rel: "noopener noreferrer nofollow",
  target: "_blank"
} as const;

function getPublishedDocumentReaderIdentityKey(envelope: PublishedDocumentReaderProps["envelope"], pageIdentity?: string): string {
  const pageIdentityKey = typeof pageIdentity === "string" ? pageIdentity.trim() : "";

  let documentKey = "";
  if (envelope && typeof envelope === "object" && envelope.document && typeof envelope.document === "object") {
    try {
      documentKey = JSON.stringify(envelope.document);
    } catch {
      documentKey = "";
    }
  }

  return `${pageIdentityKey}::${documentKey}`;
}

class PublishedDocumentReaderBoundary extends Component<ReaderBoundaryProps, ReaderBoundaryState> {
  state: ReaderBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ReaderBoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? <PublishedDocumentReaderUnavailable /> : this.props.children;
  }
}

function PublishedDocumentReaderUnavailable() {
  return (
    <section className="docsera-main__editor-recovery" role="status">
      <p className="docsera-main__eyebrow">Reader</p>
      <h2 className="docsera-main__recovery-title">Published content unavailable</h2>
      <p className="docsera-main__lede">The published page content could not be rendered safely.</p>
    </section>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNodeContent(node: Record<string, unknown>, allowMissing = false): unknown[] {
  if (Array.isArray(node.content)) {
    return node.content;
  }

  if (allowMissing && node.content === undefined) {
    return [];
  }

  if (!Array.isArray(node.content)) {
    throw new Error("The published page content contains an unsupported block structure.");
  }

  return [];
}

function getNodeAttrs(node: Record<string, unknown>): Record<string, unknown> {
  return isRecord(node.attrs) ? node.attrs : {};
}

function getImageNodeAttrs(node: Record<string, unknown>): DocseraImageAttrs {
  return canonicalizeDocseraImageAttrs(getNodeAttrs(node));
}

function getImageFigureStyle(attrs: DocseraImageAttrs): CSSProperties {
  if (attrs.align === "center") {
    return {
      display: "grid",
      gap: "12px",
      margin: 0,
      width: `${attrs.widthPct}%`,
      marginInlineStart: "auto",
      marginInlineEnd: "auto"
    };
  }

  return {
    display: "grid",
    gap: "12px",
    margin: 0,
    width: `${attrs.widthPct}%`,
    marginInlineStart: attrs.align === "right" ? "auto" : undefined,
    marginInlineEnd: attrs.align === "left" ? "auto" : undefined
  };
}

function getImageFigureClassName(attrs: DocseraImageAttrs): string {
  return [
    "docsera-main__media",
    attrs.frame ? "docsera-main__media--framed" : "docsera-main__media--plain",
    `docsera-main__media--align-${attrs.align}`
  ].join(" ");
}

function renderImageUnavailable(path: string, attrs: DocseraImageAttrs): ReactNode {
  return (
    <figure
      key={path}
      className={getImageFigureClassName(attrs)}
      data-docsera-image-align={attrs.align}
      data-docsera-image-frame={attrs.frame ? "true" : "false"}
      data-docsera-image-width-pct={String(attrs.widthPct)}
      style={getImageFigureStyle(attrs)}
    >
      <div className="docsera-main__editor-recovery docsera-main__media-unavailable" role="status">
        <p className="docsera-main__eyebrow">Media</p>
        <h3 className="docsera-main__recovery-title">Image unavailable</h3>
        <p className="docsera-main__lede">{attrs.alt || "The referenced image could not be resolved."}</p>
      </div>
    </figure>
  );
}

function renderImageLoading(path: string, attrs: DocseraImageAttrs): ReactNode {
  return (
    <figure
      key={path}
      className={getImageFigureClassName(attrs)}
      data-docsera-image-align={attrs.align}
      data-docsera-image-frame={attrs.frame ? "true" : "false"}
      data-docsera-image-width-pct={String(attrs.widthPct)}
      style={getImageFigureStyle(attrs)}
    >
      <div
        className="docsera-main__media-loading"
        role="status"
        aria-label="Loading image"
        aria-busy="true"
        style={{
          display: "block",
          minHeight: "8rem",
          padding: "0",
          borderRadius: "inherit",
          background: "color-mix(in srgb, var(--docsera-surface) 92%, var(--docsera-surface-muted) 8%)",
          boxShadow: "none"
        }}
      />
    </figure>
  );
}

function PublishedDocumentReaderImage({
  attrs,
  onOpenFullscreen,
  loadMedia,
  path,
  mediaId
}: {
  attrs: DocseraImageAttrs;
  onOpenFullscreen: ReaderContext["openImageFullscreen"];
  loadMedia?: WorkspaceMediaLoader;
  path: string;
  mediaId: string;
}) {
  const surfaceRef = useRef<HTMLButtonElement | null>(null);
  const mediaState = useWorkspaceMediaObjectUrl({
    loadMedia,
    mediaId,
    invalidateKey: path
  });
  const surfaceStyle: CSSProperties = attrs.frame
    ? {
        borderColor: "var(--docsera-border)",
        borderStyle: "solid",
        borderWidth: "1px"
      }
    : {
        borderStyle: "none",
        borderWidth: "0"
      };

  if (mediaState.status === "loading") {
    return renderImageLoading(path, attrs);
  }

  if (mediaState.status !== "ready" || !mediaState.objectUrl) {
    return renderImageUnavailable(path, attrs);
  }

  const handleOpenFullscreen = () => {
    const surfaceElement = surfaceRef.current;
    if (!(surfaceElement instanceof HTMLElement)) {
      return;
    }

    const imageElement = surfaceElement.querySelector("img");
    if (!(imageElement instanceof HTMLImageElement)) {
      return;
    }

    onOpenFullscreen({
      alt: attrs.alt,
      imageElement,
      restoreFocusElement: surfaceElement,
      sourceElement: surfaceElement
    });
  };

  return (
    <figure
      key={path}
      className={getImageFigureClassName(attrs)}
      data-docsera-image-align={attrs.align}
      data-docsera-image-frame={attrs.frame ? "true" : "false"}
      data-docsera-image-width-pct={String(attrs.widthPct)}
      style={getImageFigureStyle(attrs)}
    >
      <button
        ref={surfaceRef}
        type="button"
        className={`docsera-main__media-surface docsera-main__media-activation${attrs.frame ? " docsera-main__media-surface--framed" : " docsera-main__media-surface--plain"}`}
        data-docsera-image-surface="true"
        data-docsera-image-frame={attrs.frame ? "true" : "false"}
        style={surfaceStyle}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={handleOpenFullscreen}
        aria-label={attrs.alt ? `Open fullscreen viewer for ${attrs.alt}` : "Open fullscreen viewer"}
      >
        <img className="docsera-main__media-image" src={mediaState.objectUrl} alt={attrs.alt} />
      </button>
      {attrs.caption ? <figcaption className="docsera-main__media-caption">{attrs.caption}</figcaption> : null}
    </figure>
  );
}

function renderImage(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const attrs = getImageNodeAttrs(node);
  const resolvedMediaId =
    context.theme === "dark" && attrs.darkMediaId !== null ? attrs.darkMediaId : attrs.mediaId;
  return (
    <PublishedDocumentReaderImage
      key={path}
      attrs={attrs}
      loadMedia={context.loadMedia}
      mediaId={resolvedMediaId}
      onOpenFullscreen={context.openImageFullscreen}
      path={path}
    />
  );
}

function getReaderHeadingTag(level: 1 | 2 | 3): "h2" | "h3" | "h4" {
  if (level === 1) {
    return "h2";
  }

  return level === 2 ? "h3" : "h4";
}

function getReaderHeadingClassName(level: 1 | 2 | 3): string {
  if (level === 1) {
    return "docsera-main__body-heading";
  }

  return level === 2 ? "docsera-main__section-title" : "docsera-main__subsection-title";
}

function renderMark(child: ReactNode, mark: unknown, path: string): ReactNode {
  if (!isRecord(mark) || typeof mark.type !== "string") {
    throw new Error("The published page content contains an unsupported text mark.");
  }

  switch (mark.type) {
    case "bold":
      return <strong key={`${path}-bold`}>{child}</strong>;
    case "italic":
      return <em key={`${path}-italic`}>{child}</em>;
    case "strike":
      return <s key={`${path}-strike`}>{child}</s>;
    case "underline":
      return <u key={`${path}-underline`}>{child}</u>;
    case "superscript":
      return <sup key={`${path}-superscript`}>{child}</sup>;
    case "subscript":
      return <sub key={`${path}-subscript`}>{child}</sub>;
    case "highlight":
      return (
        <mark key={`${path}-highlight`} className="docsera-main__highlight">
          {child}
        </mark>
      );
    case "code":
      return (
        <code key={`${path}-code`} className="docsera-main__inline-code">
          {child}
        </code>
      );
    case "link": {
      const attrs = getNodeAttrs(mark);
      const href = typeof attrs.href === "string" ? attrs.href.trim() : "";
      if (!href || !isDocseraAllowedLinkHref(href)) {
        throw new Error("The published page content contains an unsafe link.");
      }

      return (
        <a
          key={`${path}-link`}
          className="docsera-main__link"
          href={href}
          rel={SAFE_LINK_ATTRIBUTES.rel}
          target={SAFE_LINK_ATTRIBUTES.target}
          title={typeof attrs.title === "string" && attrs.title.trim() ? attrs.title.trim() : undefined}
        >
          {child}
        </a>
      );
    }
    default:
      throw new Error("The published page content contains an unsupported text mark.");
  }
}

function renderInlineNode(node: unknown, path: string): ReactNode {
  if (!isRecord(node)) {
    throw new Error("The published page content contains an unsupported inline node.");
  }

  if (node.type === "text") {
    if (typeof node.text !== "string") {
      throw new Error("The published page content contains an invalid text node.");
    }

    const marks = Array.isArray(node.marks) ? Array.from(node.marks) : [];
    let element: ReactNode = node.text;

    marks.forEach((mark, index) => {
      element = renderMark(element, mark, `${path}-${index}`);
    });

    return element;
  }

  if (node.type === "hardBreak") {
    return <br key={path} />;
  }

  throw new Error(`The published page content contains an unsupported inline node: ${String(node.type)}.`);
}

function renderInlineContent(content: unknown[], path: string): ReactNode[] {
  return content.map((node, index) => {
    const childPath = `${path}-${index}`;
    if (!isRecord(node)) {
      throw new Error("The published page content contains an unsupported inline node: non-object.");
    }

    if (node.type === "text" || node.type === "hardBreak") {
      return <Fragment key={childPath}>{renderInlineNode(node, childPath)}</Fragment>;
    }

    throw new Error(`The published page content contains an unsupported inline node: ${String(node.type)}.`);
  });
}

function renderBlockChildren(content: unknown[], path: string, context: ReaderContext): ReactNode[] {
  return content.map((node, index) => renderBlockNode(node, `${path}-${index}`, context));
}

function renderParagraph(node: Record<string, unknown>, path: string): ReactNode {
  return (
    <p key={path} className="docsera-main__body">
      {renderInlineContent(getNodeContent(node, true), `${path}-inline`)}
    </p>
  );
}

function renderHeading(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const level = Number(getNodeAttrs(node).level);
  if (level !== 1 && level !== 2 && level !== 3) {
    throw new Error("The published page content contains an unsupported heading level.");
  }

  const title = extractCanonicalHeadingText(node);
  if (!title) {
    const EmptyHeadingTag = getReaderHeadingTag(level);
    return <EmptyHeadingTag key={path} className={getReaderHeadingClassName(level)} />;
  }

  const id = context.resolveHeadingAnchor(title);
  const HeadingTag = getReaderHeadingTag(level);
  const className = getReaderHeadingClassName(level);

  return (
    <HeadingTag key={path} id={id} className={className}>
      {renderInlineContent(getNodeContent(node, true), `${path}-inline`)}
    </HeadingTag>
  );
}

function renderCodeBlock(node: Record<string, unknown>, path: string): ReactNode {
  const text = getNodeContent(node, true)
    .map((child) => {
      if (!isRecord(child) || child.type !== "text") {
        throw new Error(`The published page content contains an unsupported code block node: ${isRecord(child) ? String(child.type) : "non-object"}.`);
      }

      return extractCanonicalInlineText(child);
    })
    .join("");

  return (
    <pre key={path} className="docsera-main__code">
      <code>{text}</code>
    </pre>
  );
}

function renderListItemChildren(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode[] {
  return renderBlockChildren(getNodeContent(node), `${path}-child`, context);
}

function renderBulletList(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const items = getNodeContent(node);
  return (
    <ul key={path} className="docsera-main__list docsera-main__list--bullet">
      {items.map((item, index) => {
        if (!isRecord(item) || item.type !== "listItem") {
          throw new Error("The published page content contains an unsupported list structure.");
        }

        const itemPath = `${path}-${index}`;
        return (
          <li key={itemPath} className="docsera-main__list-item">
            {renderListItemChildren(item, itemPath, context)}
          </li>
        );
      })}
    </ul>
  );
}

function renderOrderedList(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const attrs = getNodeAttrs(node);
  const start = attrs.start === undefined ? undefined : Number(attrs.start);
  const type =
    attrs.type === undefined || attrs.type === null ? undefined : (attrs.type as "1" | "a" | "A" | "i" | "I");

  if (start !== undefined && (!Number.isInteger(start) || start < 1)) {
    throw new Error("The published page content contains an invalid ordered list start value.");
  }

  if (type !== undefined && !["1", "a", "A", "i", "I"].includes(type)) {
    throw new Error("The published page content contains an invalid ordered list style type.");
  }

  const items = getNodeContent(node);
  return (
    <ol key={path} className="docsera-main__list docsera-main__list--ordered" start={start} type={type}>
      {items.map((item, index) => {
        if (!isRecord(item) || item.type !== "listItem") {
          throw new Error("The published page content contains an unsupported list structure.");
        }

        const itemPath = `${path}-${index}`;
        return (
          <li key={itemPath} className="docsera-main__list-item">
            {renderListItemChildren(item, itemPath, context)}
          </li>
        );
      })}
    </ol>
  );
}

function renderTaskItem(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const attrs = getNodeAttrs(node);
  if (typeof attrs.checked !== "boolean") {
    throw new Error("The published page content contains an invalid task state.");
  }

  return (
    <li key={path} className="docsera-main__task-item" data-checked={attrs.checked ? "true" : "false"}>
      <div className="docsera-main__task-row">
        <input
          className="docsera-main__task-checkbox"
          type="checkbox"
          checked={attrs.checked}
          disabled
          readOnly
          aria-label={attrs.checked ? "Checked task" : "Unchecked task"}
        />
        <div className="docsera-main__task-content">{renderListItemChildren(node, path, context)}</div>
      </div>
    </li>
  );
}

function renderTaskList(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const items = getNodeContent(node);
  return (
    <ul key={path} className="docsera-main__task-list">
      {items.map((item, index) => {
        if (!isRecord(item) || item.type !== "taskItem") {
          throw new Error("The published page content contains an unsupported task list structure.");
        }

        return renderTaskItem(item, `${path}-${index}`, context);
      })}
    </ul>
  );
}

function renderBlockquote(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  return (
    <blockquote key={path} className="docsera-main__blockquote">
      {renderBlockChildren(getNodeContent(node), `${path}-child`, context)}
    </blockquote>
  );
}

function getPositiveIntegerAttr(attrs: Record<string, unknown>, key: "colspan" | "rowspan"): number | undefined {
  const value = Number(attrs[key]);
  return Number.isInteger(value) && value > 1 ? value : undefined;
}

function renderTableCell(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const attrs = getNodeAttrs(node);
  const Tag = node.type === "tableHeader" ? "th" : "td";
  const alignment = attrs.align === "left" || attrs.align === "center" || attrs.align === "right" ? attrs.align : null;

  return (
    <Tag
      key={path}
      className="docsera-main__table-cell"
      colSpan={getPositiveIntegerAttr(attrs, "colspan")}
      rowSpan={getPositiveIntegerAttr(attrs, "rowspan")}
      style={alignment ? { textAlign: alignment } : undefined}
    >
      {renderBlockChildren(getNodeContent(node), `${path}-child`, context)}
    </Tag>
  );
}

function renderTableRow(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const cells = getNodeContent(node);
  return (
    <tr key={path} className="docsera-main__table-row">
      {cells.map((cell, index) => {
        if (!isRecord(cell) || (cell.type !== "tableCell" && cell.type !== "tableHeader")) {
          throw new Error("The published page content contains an unsupported table structure.");
        }

        return renderTableCell(cell, `${path}-${index}`, context);
      })}
    </tr>
  );
}

function renderTable(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const rows = getNodeContent(node);
  return (
    <div key={path} className="docsera-main__table-wrapper">
      <table className="docsera-main__table">
        <tbody>{rows.map((row, index) => {
          if (!isRecord(row) || row.type !== "tableRow") {
            throw new Error("The published page content contains an unsupported table structure.");
          }

          return renderTableRow(row, `${path}-${index}`, context);
        })}</tbody>
      </table>
    </div>
  );
}

function renderColumn(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  return (
    <div key={path} className="docsera-main__column">
      {renderBlockChildren(getNodeContent(node, true), `${path}-child`, context)}
    </div>
  );
}

function renderColumns(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const columns = getNodeContent(node);
  if (columns.length < 2 || columns.length > 4) {
    throw new Error("The published page content contains an invalid columns structure.");
  }

  return (
    <div
      key={path}
      className="docsera-main__columns"
      data-docsera-columns-count={String(columns.length)}
      style={{ "--docsera-columns-count": String(columns.length) } as CSSProperties}
    >
      {columns.map((column, index) => {
        if (!isRecord(column) || column.type !== "column") {
          throw new Error("The published page content contains an unsupported columns structure.");
        }

        return renderColumn(column, `${path}-${index}`, context);
      })}
    </div>
  );
}

function renderAccordionItem(
  node: Record<string, unknown>,
  path: string,
  context: ReaderContext,
  accordionId: string,
  itemIndex: number
): ReactNode {
  const attrs = getNodeAttrs(node);
  const itemId = typeof attrs.accordionItemId === "string" ? attrs.accordionItemId.trim() : "";
  if (!itemId) {
    throw new Error("The published page content contains an invalid accordion item identity.");
  }

  const content = getNodeContent(node);
  if (content.length !== 2) {
    throw new Error("The published page content contains an invalid accordion item structure.");
  }

  const [titleNode, bodyNode] = content;
  if (!isRecord(titleNode) || titleNode.type !== "accordionTitle") {
    throw new Error("The published page content contains an invalid accordion title structure.");
  }

  if (!isRecord(bodyNode) || bodyNode.type !== "accordionContent") {
    throw new Error("The published page content contains an invalid accordion body structure.");
  }

  const titleText = extractCanonicalHeadingText(titleNode);
  const isOpen = context.accordionOpenItemIds[accordionId] === itemId;
  const panelId = `docsera-accordion-${accordionId}-${itemId}-panel`;
  const bodyContext: ReaderContext = {
    ...context,
    resolveHeadingAnchor: createCanonicalHeadingAnchorResolver(`docsera-accordion-${accordionId}-${itemId}`)
  };

  return (
    <div
      key={path}
      className={`docsera-main__accordion-item${isOpen ? " docsera-main__accordion-item--open" : ""}`}
      data-docsera-accordion-id={accordionId}
      data-docsera-accordion-index={String(itemIndex)}
      data-docsera-accordion-item="true"
      data-docsera-accordion-item-id={itemId}
      data-docsera-accordion-open={isOpen ? "true" : "false"}
    >
      <button
        type="button"
        className="docsera-main__accordion-toggle"
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={titleText || "Accordion item"}
        onClick={() => {
          context.setAccordionOpenItemId(accordionId, isOpen ? null : itemId);
        }}
      >
        <span aria-hidden="true" className="docsera-main__accordion-toggle-icon">
          <ChevronRight size={18} strokeWidth={2.2} focusable="false" />
        </span>
        <span className="docsera-main__accordion-title">{renderInlineContent(getNodeContent(titleNode, true), `${path}-title`)}</span>
      </button>
      <div
        id={panelId}
        className="docsera-main__accordion-panel"
        hidden={!isOpen}
      >
        {isOpen ? renderBlockChildren(getNodeContent(bodyNode), `${path}-body`, bodyContext) : null}
      </div>
    </div>
  );
}

function renderAccordion(node: Record<string, unknown>, path: string, context: ReaderContext): ReactNode {
  const attrs = getNodeAttrs(node);
  const accordionId = typeof attrs.accordionId === "string" ? attrs.accordionId.trim() : "";
  if (!accordionId) {
    throw new Error("The published page content contains an invalid accordion identity.");
  }

  const items = getNodeContent(node);
  return (
    <div
      key={path}
      className="docsera-main__accordion"
      data-docsera-accordion-group="true"
      data-docsera-accordion-id={accordionId}
    >
      {items.map((item, index) => {
        if (!isRecord(item) || item.type !== "accordionItem") {
          throw new Error("The published page content contains an unsupported accordion structure.");
        }

        return renderAccordionItem(item, `${path}-${index}`, context, accordionId, index);
      })}
    </div>
  );
}

function renderBlockNode(node: unknown, path: string, context: ReaderContext): ReactNode {
  if (!isRecord(node) || typeof node.type !== "string") {
    throw new Error("The published page content contains an unsupported block node: non-object.");
  }

  switch (node.type) {
    case "paragraph":
      return renderParagraph(node, path);
    case "heading":
      return renderHeading(node, path, context);
    case "blockquote":
      return renderBlockquote(node, path, context);
    case "horizontalRule":
      return <hr key={path} className="docsera-main__divider" />;
    case "codeBlock":
      return renderCodeBlock(node, path);
    case "bulletList":
      return renderBulletList(node, path, context);
    case "orderedList":
      return renderOrderedList(node, path, context);
    case "taskList":
      return renderTaskList(node, path, context);
    case "table":
      return renderTable(node, path, context);
    case "columns":
      return renderColumns(node, path, context);
    case "accordion":
      return renderAccordion(node, path, context);
    case "image":
      return renderImage(node, path, context);
    default:
      throw new Error(`The published page content contains an unsupported block node: ${String(node.type)}.`);
  }
}

function PublishedDocumentReaderContent({
  envelope,
  loadMedia,
  theme = "light"
}: PublishedDocumentReaderProps) {
  const [imageFullscreenSession, setImageFullscreenSession] = useState<ImageFullscreenViewerSession | null>(null);
  const [imageFullscreenOpen, setImageFullscreenOpen] = useState(false);
  const [accordionOpenItemIds, setAccordionOpenItemIds] = useState<Record<string, string | null>>({});
  const openImageFullscreen = useCallback<ReaderContext["openImageFullscreen"]>((input) => {
    setImageFullscreenOpen(true);
    setImageFullscreenSession(createImageFullscreenViewerSession(input));
  }, []);
  const setAccordionOpenItemId = (accordionId: string, itemId: string | null) => {
    setAccordionOpenItemIds((current) => ({
      ...current,
      [accordionId]: itemId
    }));
  };
  const overlayRoot = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    return () => {
      setImageFullscreenOpen(false);
      setImageFullscreenSession(null);
    };
  }, []);

  if (!envelope || typeof envelope !== "object" || !envelope.document || typeof envelope.document !== "object") {
    return <PublishedDocumentReaderUnavailable />;
  }

  if (!Array.isArray(envelope.document.content)) {
    return <PublishedDocumentReaderUnavailable />;
  }

  const validationResult = validateDocseraStructuredDocument(envelope.document);
  if (!validationResult.ok) {
    return <PublishedDocumentReaderUnavailable />;
  }

  const context: ReaderContext = {
    accordionOpenItemIds,
    setAccordionOpenItemId,
    resolveHeadingAnchor: createCanonicalHeadingAnchorResolver(),
    loadMedia,
    openImageFullscreen,
    theme
  };

  return (
    <>
      <div className="docsera-main__reader" aria-label="Published page content">
        {envelope.document.content.map((node, index) => renderBlockNode(node, `reader-${index}`, context))}
      </div>
      {overlayRoot && imageFullscreenSession ? (
        <ImageFullscreenViewer
          overlayRoot={overlayRoot}
          isOpen={imageFullscreenOpen}
          onDismissed={() => {
            setImageFullscreenSession(null);
          }}
          onRequestClose={() => {
            setImageFullscreenOpen(false);
          }}
          session={imageFullscreenSession}
          theme={theme}
        />
      ) : null}
    </>
  );
}

export function PublishedDocumentReader(props: PublishedDocumentReaderProps) {
  const readerIdentityKey = getPublishedDocumentReaderIdentityKey(props.envelope, props.pageIdentity);

  return (
    <PublishedDocumentReaderBoundary key={readerIdentityKey}>
      <PublishedDocumentReaderContent {...props} />
    </PublishedDocumentReaderBoundary>
  );
}
