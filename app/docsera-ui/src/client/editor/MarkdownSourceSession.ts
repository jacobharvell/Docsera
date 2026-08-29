import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
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

function createEditorState(text: string, onDocChanged: () => void): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      EditorState.allowMultipleSelections.of(false),
      EditorView.lineWrapping,
      markdown(),
      history(),
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
    state: createEditorState(cleanText, emitSnapshot)
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
        view.setState(createEditorState(cleanText, emitSnapshot));
        currentSnapshot = createSnapshot(cleanText, cleanText);
        for (const listener of listeners) {
          listener(currentSnapshot);
        }
        return nextSerialized;
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
