import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { Compartment, EditorState, type Range } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Decoration, EditorView, ViewPlugin, keymap, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { SyntaxNode } from "@lezer/common";
import type {
  DocseraMarkdownConversionFailure,
  ParseDocseraMarkdownResult,
  SerializeDocseraMarkdownResult
} from "../../shared/editor/markdown";
import {
  parseDocseraMarkdownDocument,
  serializeDocseraMarkdownDocument
} from "../../shared/editor/markdown";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";

type MarkdownSourceSessionSnapshot =
  | {
      isClean: boolean;
      kind: "invalid";
      text: string;
      failure: DocseraMarkdownConversionFailure;
    }
  | {
      envelope: DocseraDocumentEnvelope;
      isClean: boolean;
      kind: "valid";
      normalizedMarkdown: string;
      text: string;
      title: string;
    };

type MarkdownSourceSession = {
  destroy: () => void;
  getSnapshot: () => MarkdownSourceSessionSnapshot;
  replaceFromCanonical: (input: { envelope: DocseraDocumentEnvelope; title: string }) => SerializeDocseraMarkdownResult;
  setEditable: (editable: boolean) => void;
  subscribe: (listener: (snapshot: MarkdownSourceSessionSnapshot) => void) => () => void;
  view: EditorView;
};

type CreateMarkdownSourceSessionResult =
  | {
      ok: false;
      failure: DocseraMarkdownConversionFailure;
    }
  | {
      ok: true;
      session: MarkdownSourceSession;
    };

function createSnapshot(text: string, cleanText: string): MarkdownSourceSessionSnapshot {
  const parsed = parseDocseraMarkdownDocument(text);
  if (!parsed.ok) {
    return {
      kind: "invalid",
      text,
      isClean: text === cleanText,
      failure: parsed
    };
  }

  return {
    kind: "valid",
    text,
    title: parsed.title,
    envelope: parsed.envelope,
    normalizedMarkdown: parsed.markdown,
    isClean: text === cleanText
  };
}

const markdownSourceHighlightStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], class: "docsera-markdown-source-token--heading" },
  { tag: tags.strong, class: "docsera-markdown-source-token--strong" },
  { tag: tags.emphasis, class: "docsera-markdown-source-token--emphasis" },
  { tag: tags.strikethrough, class: "docsera-markdown-source-token--strikethrough" },
  { tag: tags.link, class: "docsera-markdown-source-token--link" },
  { tag: tags.url, class: "docsera-markdown-source-token--url" },
  { tag: tags.monospace, class: "docsera-markdown-source-token--inline-code" },
  { tag: [tags.list, tags.quote], class: "docsera-markdown-source-token--structure" },
  { tag: tags.atom, class: "docsera-markdown-source-token--task-marker" },
  { tag: tags.labelName, class: "docsera-markdown-source-token--code-language" },
  { tag: [tags.processingInstruction, tags.punctuation, tags.bracket, tags.angleBracket], class: "docsera-markdown-source-token--marker" },
  { tag: [tags.tagName, tags.attributeName], class: "docsera-markdown-source-token--html" },
  { tag: [tags.string, tags.attributeValue], class: "docsera-markdown-source-token--string" }
]);

const DOCSERA_DIRECTIVE_LINE = /^(:{3,})(docsera-[a-z-]+)(.*)$/;
const DOCSERA_DIRECTIVE_CLOSE = /^(:{3,})\s*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sourceMark(className: string) {
  return Decoration.mark({ class: className });
}

function quotedValueEnd(text: string, start: number): number {
  const quote = text[start];
  let position = start + 1;
  while (position < text.length) {
    if (text[position] === "\\") {
      position += 2;
    } else if (text[position] === quote) {
      return position + 1;
    } else {
      position += 1;
    }
  }
  return text.length;
}

function isLiteralCodeRegion(view: EditorView, position: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(view.state).resolve(position, 1); node; node = node.parent) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "InlineCode" || node.name === "CodeText") {
      return true;
    }
  }
  return false;
}

function decorateDirectiveAttributes(text: string, offset: number, add: (from: number, to: number, className: string) => void) {
  let position = 0;
  while (position < text.length) {
    while (position < text.length && /\s/.test(text[position])) position += 1;
    const nameStart = position;
    if (!/[a-z]/i.test(text[position] ?? "")) {
      position += 1;
      continue;
    }
    position += 1;
    while (/[a-z0-9-]/i.test(text[position] ?? "")) position += 1;
    const nameEnd = position;
    if (text[position] !== "=") continue;

    add(offset + nameStart, offset + nameEnd, "docsera-markdown-source-token--directive-attribute-name");
    position += 1;
    const valueStart = position;
    if (text[position] === '"' || text[position] === "'") {
      position = quotedValueEnd(text, position);
    } else {
      while (position < text.length && !/[\s}\]]/.test(text[position])) position += 1;
    }
    const value = text.slice(valueStart, position);
    const unquotedValue = value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.endsWith(value[0])
      ? value.slice(1, -1)
      : value;
    add(offset + valueStart, offset + position, UUID.test(unquotedValue) || /(?:^|-)id$/i.test(text.slice(nameStart, nameEnd))
      ? "docsera-markdown-source-token--directive-identifier"
      : "docsera-markdown-source-token--directive-attribute-value");
  }
}

/**
 * The Markdown parser intentionally remains the editor's syntax authority. These
 * decorations cover Docsera's serialized envelope, whose directives are not part
 * of CodeMirror's GFM grammar, without changing the editable source text.
 */
function docseraSourceDecorations(view: EditorView) {
  const decorations: Range<Decoration>[] = [];
  let leadingFrontmatter = true;
  let frontmatterDelimiterCount = 0;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const text = line.text;
    const add = (from: number, to: number, className: string) => {
      if (from < to) decorations.push(sourceMark(className).range(line.from + from, line.from + to));
    };

    const lineIsLiteralCode = isLiteralCodeRegion(view, line.from);
    if (leadingFrontmatter && text === "---" && frontmatterDelimiterCount < 2) {
      add(0, text.length, "docsera-markdown-source-token--frontmatter-delimiter");
      frontmatterDelimiterCount += 1;
      if (frontmatterDelimiterCount === 2) leadingFrontmatter = false;
    } else if (leadingFrontmatter && frontmatterDelimiterCount === 1) {
      const title = /^title:\s*/.exec(text);
      const quoteStart = title?.[0].length ?? 0;
      if (title && (text[quoteStart] === '"' || text[quoteStart] === "'")) {
        const valueEnd = quotedValueEnd(text, quoteStart);
        const isClosed = valueEnd > quoteStart + 1 && text[valueEnd - 1] === text[quoteStart];
        add(0, quoteStart, "docsera-markdown-source-token--frontmatter-neutral");
        add(quoteStart, quoteStart + 1, "docsera-markdown-source-token--frontmatter-neutral");
        if (valueEnd > quoteStart + 1) add(quoteStart + 1, valueEnd - (isClosed ? 1 : 0), "docsera-markdown-source-token--frontmatter-title-value");
        if (isClosed) add(valueEnd - 1, valueEnd, "docsera-markdown-source-token--frontmatter-neutral");
      }
    } else if (leadingFrontmatter) {
      leadingFrontmatter = false;
    }

    const directive = DOCSERA_DIRECTIVE_LINE.exec(text);
    if (directive && !lineIsLiteralCode) {
      const delimiterLength = directive[1].length;
      add(0, delimiterLength, "docsera-markdown-source-token--directive-delimiter");
      add(delimiterLength, delimiterLength + directive[2].length, "docsera-markdown-source-token--directive-name");
      const attributes = directive[3];
      const attributesOffset = delimiterLength + directive[2].length;
      decorateDirectiveAttributes(attributes, attributesOffset, add);
      const label = /\[([^\]]*)\]/.exec(attributes);
      if (label && label[1]) {
        const labelStart = attributesOffset + (label.index ?? 0) + 1;
        add(labelStart, labelStart + label[1].length, "docsera-markdown-source-token--directive-label");
      }
    } else if (DOCSERA_DIRECTIVE_CLOSE.test(text) && !lineIsLiteralCode) {
      add(0, text.length, "docsera-markdown-source-token--directive-delimiter");
    }

    if (!lineIsLiteralCode) {
      const heading = /^(#{1,6})(?=\s)/.exec(text);
      if (heading) {
        add(0, heading[1].length, "docsera-markdown-source-token--heading-marker");
        add(heading[1].length, text.length, "docsera-markdown-source-token--heading");
      }

      const strong = /\*\*([^*]+)\*\*/g;
      for (const match of text.matchAll(strong)) {
        const start = match.index ?? 0;
        if (isLiteralCodeRegion(view, line.from + start)) continue;
        add(start, start + 2, "docsera-markdown-source-token--strong-delimiter");
        add(start + 2, start + match[0].length - 2, "docsera-markdown-source-token--strong-content");
        add(start + match[0].length - 2, start + match[0].length, "docsera-markdown-source-token--strong-delimiter");
      }
    }

    const structure = /^(\s*(?:[-+*]|\d+[.)]|>)(?:\s+))(.*)$/.exec(text);
    if (structure) {
      add(0, structure[1].length, "docsera-markdown-source-token--structure-marker");
      add(structure[1].length, text.length, "docsera-markdown-source-token--plain");
    }
  }

  return Decoration.set(decorations, true);
}

const docseraSourceHighlighting = ViewPlugin.fromClass(class {
  decorations: ReturnType<typeof docseraSourceDecorations>;

  constructor(view: EditorView) {
    this.decorations = docseraSourceDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) this.decorations = docseraSourceDecorations(update.view);
  }
}, { decorations: (value) => value.decorations });

function createEditorState(text: string, onDocChanged: () => void, editableCompartment: Compartment, editable: boolean): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      EditorState.allowMultipleSelections.of(false),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(markdownSourceHighlightStyle),
      docseraSourceHighlighting,
      history(),
      editableCompartment.of(EditorView.editable.of(editable)),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.contentAttributes.of({
        "aria-label": "Markdown source",
        autocapitalize: "off",
        autocomplete: "off",
        spellcheck: "false"
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onDocChanged();
        }
      })
    ]
  });
}

export function createMarkdownSourceSession(input: {
  mount: HTMLElement;
  onStateChange?: (snapshot: MarkdownSourceSessionSnapshot) => void;
  title: string;
  envelope: DocseraDocumentEnvelope;
  editable?: boolean;
}): CreateMarkdownSourceSessionResult {
  const serialized = serializeDocseraMarkdownDocument(input.title, input.envelope);
  if (!serialized.ok) {
    return {
      ok: false,
      failure: serialized
    };
  }

  const listeners = new Set<(snapshot: MarkdownSourceSessionSnapshot) => void>();
  if (input.onStateChange) {
    listeners.add(input.onStateChange);
  }
  const editableCompartment = new Compartment();
  let currentEditable = input.editable ?? true;

  let cleanText = serialized.markdown;
  let currentSnapshot = createSnapshot(cleanText, cleanText);
  const emitSnapshot = () => {
    currentSnapshot = createSnapshot(view.state.doc.toString(), cleanText);
    for (const listener of listeners) {
      listener(currentSnapshot);
    }
  };

  const view = new EditorView({
    parent: input.mount,
    state: createEditorState(cleanText, emitSnapshot, editableCompartment, currentEditable)
  });

  currentSnapshot = createSnapshot(view.state.doc.toString(), cleanText);
  for (const listener of listeners) {
    listener(currentSnapshot);
  }

  return {
    ok: true,
    session: {
      destroy() {
        listeners.clear();
        view.destroy();
      },
      getSnapshot() {
        return currentSnapshot;
      },
      replaceFromCanonical(nextInput) {
        const nextSerialized = serializeDocseraMarkdownDocument(nextInput.title, nextInput.envelope);
        if (!nextSerialized.ok) {
          return nextSerialized;
        }

        cleanText = nextSerialized.markdown;
        view.setState(createEditorState(cleanText, emitSnapshot, editableCompartment, currentEditable));
        currentSnapshot = createSnapshot(cleanText, cleanText);
        for (const listener of listeners) {
          listener(currentSnapshot);
        }
        return nextSerialized;
      },
      setEditable(editable) {
        currentEditable = editable;
        view.dispatch({
          effects: editableCompartment.reconfigure(EditorView.editable.of(editable))
        });
      },
      subscribe(listener) {
        listeners.add(listener);
        listener(currentSnapshot);
        return () => {
          listeners.delete(listener);
        };
      },
      view
    }
  };
}

export {
  redo as redoMarkdownSourceSession,
  undo as undoMarkdownSourceSession,
  type CreateMarkdownSourceSessionResult,
  type MarkdownSourceSession,
  type MarkdownSourceSessionSnapshot,
  type ParseDocseraMarkdownResult
};
