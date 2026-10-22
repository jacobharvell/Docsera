/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createMarkdownSourceSession,
  markdownSourceErrorTooltip,
  redoMarkdownSourceSession,
  undoMarkdownSourceSession,
  type MarkdownSourceSessionSnapshot
} from "./MarkdownSourceSession";
import { createCanonicalDocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";

function latestSnapshot(snapshots: MarkdownSourceSessionSnapshot[]): MarkdownSourceSessionSnapshot {
  const snapshot = snapshots[snapshots.length - 1];
  if (!snapshot) {
    throw new Error("Expected a source session snapshot.");
  }

  return snapshot;
}

describe("MarkdownSourceSession", () => {
  it("projects canonical title and body into an initially clean source session", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const snapshots: MarkdownSourceSessionSnapshot[] = [];
    const result = createMarkdownSourceSession({
      mount,
      onStateChange: (snapshot) => snapshots.push(snapshot),
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(latestSnapshot(snapshots)).toMatchObject({
      kind: "valid",
      isClean: true,
      title: "Overview"
    });
    expect(result.session.view.state.doc.toString()).toContain('title: "Overview"');
    expect(result.session.getSnapshot()).toEqual(latestSnapshot(snapshots));
    result.session.destroy();
  });

  it("mounts an editable CodeMirror content surface for normal source authoring", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope(),
      editable: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const content = mount.querySelector(".cm-content");
    expect(content).toBeInstanceOf(HTMLElement);
    expect(content).toHaveAttribute("contenteditable", "true");

    result.session.setEditable(false);
    expect(content).toHaveAttribute("contenteditable", "false");

    result.session.setEditable(true);
    expect(content).toHaveAttribute("contenteditable", "true");

    result.session.destroy();
  });

  it("layers Docsera source highlighting over GFM tokens without changing the raw source", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const source = [
      "---",
      'title: "Syntax coverage"',
      "---",
      "# Heading",
      "",
      "**bold** and *italic* and ~~struck~~.",
      "[Docsera](https://example.com/docs)",
      "",
      "- bullet",
      "1. numbered",
      "- [x] complete task",
      "> quoted",
      "",
      "`inline code`",
      "```ts",
      "const visible = true;",
      "```",
      "<span data-docsera-text-color=\"blue\">raw HTML</span>",
      ':::docsera-accordion[Getting started]{accordion-id="638d0f15-5298-4a38-a214-44fa5c571914"}',
      ':::docsera-accordion-item[Install the package]{item-id="52a4d9f1-7400-4e4d-8b5c-676c3e52e1f4"}',
      "Directive body stays visible",
      ":::",
      ":::"
    ].join("\n");
    const session = result.session;

    await act(async () => {
      session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: source } });
    });

    expect(session.view.state.doc.toString()).toBe(source);
    expect(mount.querySelector(".docsera-markdown-source-token--heading")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--heading-marker")).toHaveTextContent("#");
    expect(mount.querySelector(".docsera-markdown-source-token--strong")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--emphasis")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--strikethrough")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--link")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--url")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--structure")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--task-marker")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--inline-code")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--code-language")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--marker")).toBeInTheDocument();
    expect(mount.querySelector(".docsera-markdown-source-token--html")).toBeInTheDocument();
    expect(mount.querySelectorAll(".docsera-markdown-source-token--frontmatter-delimiter")).toHaveLength(2);
    expect([...mount.querySelectorAll(".docsera-markdown-source-token--frontmatter-delimiter")].map((element) => element.textContent)).toEqual(["---", "---"]);
    expect(mount.querySelectorAll(".docsera-markdown-source-token--frontmatter-neutral")).toHaveLength(3);
    expect(mount.querySelector(".docsera-markdown-source-token--frontmatter-title-value")).toHaveTextContent("Syntax coverage");
    expect(mount.querySelector(".docsera-markdown-source-token--strong-content")).toHaveTextContent("bold");
    expect(mount.querySelectorAll(".docsera-markdown-source-token--strong-delimiter")).toHaveLength(2);
    expect(mount.querySelectorAll(".docsera-markdown-source-token--structure-marker")).toHaveLength(4);
    expect(mount.querySelector(".docsera-markdown-source-token--directive-name")).toHaveTextContent("docsera-accordion");
    expect(mount.querySelectorAll(".docsera-markdown-source-token--directive-attribute-name")).toHaveLength(2);
    expect(mount.querySelector(".docsera-markdown-source-token--directive-identifier")).toHaveTextContent("638d0f15-5298-4a38-a214-44fa5c571914");
    const accordionLabel = mount.querySelector(".docsera-markdown-source-token--directive-label");
    expect(accordionLabel).toHaveTextContent("Getting started");
    expect(accordionLabel).not.toHaveClass("docsera-markdown-source-token--link");
    expect(mount.textContent).toContain("Directive body stays visible");
    result.session.destroy();
  });

  it("scans quoted source values linearly and keeps frontmatter chrome neutral", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const longUnclosedValue = `"${"\\\"".repeat(12_000)}`;
    const source = [
      "---",
      'title: "Escaped \\\"quote\\\" title"',
      "---",
      `:::docsera-accordion{label=${longUnclosedValue}`,
      ""
    ].join("\n");
    await act(async () => {
      result.session.view.dispatch({ changes: { from: 0, to: result.session.view.state.doc.length, insert: source } });
    });

    expect(result.session.view.state.doc.toString()).toBe(source);
    expect(mount.querySelector(".docsera-markdown-source-token--frontmatter-title-value")).toHaveTextContent('Escaped \\\"quote\\\" title');
    expect([...mount.querySelectorAll(".docsera-markdown-source-token--frontmatter-neutral")].map((element) => element.textContent)).toEqual(expect.arrayContaining(["title: ", "\"", "\""]));
    expect(mount.querySelectorAll(".docsera-markdown-source-token--directive-attribute-name")).toHaveLength(1);
    expect(mount.querySelector(".docsera-markdown-source-token--directive-attribute-value")).toBeInTheDocument();

    const unclosedFrontmatter = ["---", `title: ${longUnclosedValue}`, "---"].join("\n");
    await act(async () => {
      result.session.view.dispatch({ changes: { from: 0, to: result.session.view.state.doc.length, insert: unclosedFrontmatter } });
    });
    expect(result.session.view.state.doc.toString()).toBe(unclosedFrontmatter);
    expect(mount.querySelector(".docsera-markdown-source-token--frontmatter-title-value")).toBeInTheDocument();
    result.session.destroy();
  });

  it("does not apply Docsera or custom bold decorations in literal Markdown code regions", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const source = [
      "**outside bold**",
      ':::docsera-accordion[Outside]{item-id="638d0f15-5298-4a38-a214-44fa5c571914"}',
      "`**inline literal** :::docsera-accordion`",
      "```md",
      "**fenced literal**",
      ':::docsera-accordion[Literal]{item-id="638d0f15-5298-4a38-a214-44fa5c571914"}',
      ":::",
      "```"
    ].join("\n");
    await act(async () => {
      result.session.view.dispatch({ changes: { from: 0, to: result.session.view.state.doc.length, insert: source } });
    });

    expect(mount.querySelectorAll(".docsera-markdown-source-token--strong-content")).toHaveLength(1);
    expect(mount.querySelector(".docsera-markdown-source-token--strong-content")).toHaveTextContent("outside bold");
    expect(mount.querySelectorAll(".docsera-markdown-source-token--directive-name")).toHaveLength(1);
    expect(mount.querySelector(".docsera-markdown-source-token--directive-name")).toHaveTextContent("docsera-accordion");
    result.session.destroy();
  });

  it("marks each independent failure and associates tooltips through corrections", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope() });
    if (!result.ok) throw new Error("session creation failed");
    const { session } = result;
    const source = "---\ntitle: \"Test\"\n---\n\n::docsera-unknown\n\n::docsera-image";
    await act(async () => { session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: source } }); });
    const snapshot = session.getSnapshot();
    expect(snapshot.kind).toBe("invalid");
    if (snapshot.kind !== "invalid") throw new Error("expected invalid source");
    expect(snapshot.diagnostics).toHaveLength(2);
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(2);
    for (const diagnostic of snapshot.diagnostics) {
      const tooltip = markdownSourceErrorTooltip(session.view, diagnostic.range!.from);
      expect(tooltip?.create().dom.textContent).toContain(diagnostic.message);
    }
    await act(async () => { session.view.dispatch({ changes: { from: source.indexOf("::docsera-unknown"), to: source.indexOf("::docsera-unknown") + "::docsera-unknown".length, insert: "fixed" } }); });
    expect(session.getSnapshot()).toMatchObject({ kind: "invalid", diagnostics: [expect.objectContaining({ reason: "invalid-directive" })] });
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(1);
    const remaining = session.getSnapshot();
    if (remaining.kind !== "invalid") throw new Error("expected invalid source");
    expect(markdownSourceErrorTooltip(session.view, remaining.diagnostics[0].range!.from)?.create().dom.textContent).toContain(remaining.diagnostics[0].message);
    session.destroy();
  });

  it("shows the most specific nested diagnostic and retains the others after a correction", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope() });
    if (!result.ok) throw new Error("session creation failed");
    const { session } = result;
    const source = ["---", "title: \"Test\"", "---", "", ':::docsera-callout{type="bad"}', "::docsera-unknown", "", "::docsera-image", ":::"].join("\n");
    await act(async () => { session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: source } }); });
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== "invalid") throw new Error("expected invalid source");
    expect(snapshot.diagnostics).toHaveLength(3);
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(3);
    for (const diagnostic of snapshot.diagnostics) {
      expect(markdownSourceErrorTooltip(session.view, diagnostic.range!.from)?.create().dom.textContent).toContain(diagnostic.message);
    }
    const child = "::docsera-unknown";
    await act(async () => { session.view.dispatch({ changes: { from: source.indexOf(child), to: source.indexOf(child) + child.length, insert: "fixed" } }); });
    const remaining = session.getSnapshot();
    if (remaining.kind !== "invalid") throw new Error("expected invalid source");
    expect(remaining.diagnostics.map((item) => item.message)).toEqual([snapshot.diagnostics[0].message, snapshot.diagnostics[2].message]);
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(2);
    for (const diagnostic of remaining.diagnostics) {
      expect(markdownSourceErrorTooltip(session.view, diagnostic.range!.from)?.create().dom.textContent).toContain(diagnostic.message);
    }
    session.destroy();
  });

  it("lets mouse interaction focus the editable CodeMirror content surface", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope(),
      editable: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const content = mount.querySelector(".cm-content");
    expect(content).toBeInstanceOf(HTMLElement);
    fireEvent.pointerDown(content as HTMLElement, { bubbles: true, button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.mouseDown(content as HTMLElement, { bubbles: true, button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseUp(content as HTMLElement, { bubbles: true, button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(content as HTMLElement, { bubbles: true, button: 0, clientX: 10, clientY: 10 });

    expect(content).toHaveFocus();
    result.session.destroy();
  });

  it("keeps programmatic source synchronization out of source undo history", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const session = result.session;
    const originalText = session.view.state.doc.toString();
    const replacement = session.replaceFromCanonical({
      title: "Replacement",
      envelope: {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Replacement body" }] }]
        }
      }
    });

    expect(replacement.ok).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      kind: "valid",
      isClean: true,
      title: "Replacement"
    });

    await act(async () => {
      undoMarkdownSourceSession({ dispatch: session.view.dispatch.bind(session.view), state: session.view.state });
    });

    expect(session.view.state.doc.toString()).not.toBe(originalText);
    expect(session.view.state.doc.toString()).toContain("Replacement body");
    result.session.destroy();
  });

  it("uses normal text-editor undo and redo for user typing", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const session = result.session;
    const before = session.view.state.doc.toString();
    await act(async () => {
      session.view.dispatch({
        changes: {
          from: session.view.state.doc.length,
          insert: "\nAdditional source line\n"
        }
      });
    });

    expect(session.getSnapshot()).toMatchObject({
      kind: "valid",
      isClean: false
    });

    await act(async () => {
      undoMarkdownSourceSession({ dispatch: session.view.dispatch.bind(session.view), state: session.view.state });
    });
    expect(session.view.state.doc.toString()).toBe(before);

    await act(async () => {
      redoMarkdownSourceSession({ dispatch: session.view.dispatch.bind(session.view), state: session.view.state });
    });
    expect(session.view.state.doc.toString()).toContain("Additional source line");
    result.session.destroy();
  });

  it("resets source undo history on a same-text canonical synchronization", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const session = result.session;
    const canonicalText = session.view.state.doc.toString();

    await act(async () => {
      session.view.dispatch({
        changes: {
          from: session.view.state.doc.length,
          insert: "\nAdditional source line\n"
        }
      });
    });
    expect(session.getSnapshot()).toMatchObject({ isClean: false, kind: "valid" });

    await act(async () => {
      undoMarkdownSourceSession({ dispatch: session.view.dispatch.bind(session.view), state: session.view.state });
    });
    expect(session.view.state.doc.toString()).toBe(canonicalText);
    expect(session.getSnapshot()).toMatchObject({ isClean: true, kind: "valid" });

    const replacement = session.replaceFromCanonical({
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });
    expect(replacement.ok).toBe(true);
    expect(session.view.state.doc.toString()).toBe(canonicalText);

    await act(async () => {
      redoMarkdownSourceSession({ dispatch: session.view.dispatch.bind(session.view), state: session.view.state });
    });
    expect(session.view.state.doc.toString()).toBe(canonicalText);
    expect(session.view.state.doc.toString()).not.toContain("Additional source line");

    result.session.destroy();
  });

  it("exposes parsed title and canonical envelope for valid source text", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const session = result.session;
    const validSource = '---\ntitle: "Install Guide"\n---\n## Intro\n\nBody copy.\n';
    await act(async () => {
      session.view.dispatch({
        changes: { from: 0, to: session.view.state.doc.length, insert: validSource }
      });
    });

    expect(session.getSnapshot()).toMatchObject({
      kind: "valid",
      isClean: false,
      text: validSource,
      title: "Install Guide",
      envelope: {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Intro" }]
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Body copy." }]
            }
          ]
        }
      }
    });
    const snapshot = session.getSnapshot();
    if (snapshot.kind !== "valid") {
      throw new Error("Expected a valid source snapshot.");
    }
    expect(snapshot.normalizedMarkdown).toContain('title: "Install Guide"');
    expect(snapshot.normalizedMarkdown).toContain("## Intro");
    result.session.destroy();
  });

  it("keeps a lone markdown marker valid and editable in source mode", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const session = result.session;
    const source = '---\ntitle: "Standalone marker"\n---\n*\n';
    await act(async () => {
      session.view.dispatch({
        changes: { from: 0, to: session.view.state.doc.length, insert: source }
      });
    });

    expect(session.getSnapshot()).toMatchObject({
      kind: "valid",
      isClean: false,
      text: source,
      title: "Standalone marker",
      envelope: {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "*" }]
            }
          ]
        }
      }
    });
    const snapshot = session.getSnapshot();
    expect(snapshot.kind).toBe("valid");
    if (snapshot.kind !== "valid") {
      return;
    }

    expect(snapshot.normalizedMarkdown).toContain('title: "Standalone marker"');
    expect(snapshot.normalizedMarkdown).toContain("\\*");
    result.session.destroy();
  });

  it("retains exact invalid source text and the structured converter failure without canonical mutation", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const result = createMarkdownSourceSession({
      mount,
      title: "Overview",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const session = result.session;
    const invalidSource = '---\ntitle: "Broken"\n---\n<span>bad html</span>\n';
    await act(async () => {
      session.view.dispatch({
        changes: { from: 0, to: session.view.state.doc.length, insert: invalidSource }
      });
    });

    expect(session.getSnapshot()).toMatchObject({
      kind: "invalid",
      isClean: false,
      text: invalidSource,
      failure: {
        ok: false,
        reason: "unsupported-html",
        message: "Inline HTML color tags must provide exactly data-docsera-text-color.",
        range: { from: invalidSource.indexOf("<span>"), to: invalidSource.indexOf("<span>") + 6 }
      }
    });
    result.session.destroy();
  });

  it("clears stale source text, history, and callbacks when one session is replaced by another", async () => {
    const firstMount = document.createElement("div");
    const secondMount = document.createElement("div");
    document.body.append(firstMount, secondMount);
    const firstSnapshots: MarkdownSourceSessionSnapshot[] = [];
    const firstResult = createMarkdownSourceSession({
      mount: firstMount,
      onStateChange: (snapshot) => firstSnapshots.push(snapshot),
      title: "First",
      envelope: createCanonicalDocseraDocumentEnvelope()
    });

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) {
      return;
    }

    await act(async () => {
      firstResult.session.view.dispatch({
        changes: {
          from: firstResult.session.view.state.doc.length,
          insert: "\nfirst session edit\n"
        }
      });
    });
    expect(latestSnapshot(firstSnapshots)).toMatchObject({ isClean: false });
    firstResult.session.destroy();

    const secondSnapshots: MarkdownSourceSessionSnapshot[] = [];
    const secondResult = createMarkdownSourceSession({
      mount: secondMount,
      onStateChange: (snapshot) => secondSnapshots.push(snapshot),
      title: "Second",
      envelope: {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Second body" }] }]
        }
      }
    });

    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) {
      return;
    }

    expect(latestSnapshot(secondSnapshots)).toMatchObject({
      kind: "valid",
      isClean: true,
      title: "Second"
    });
    expect(secondResult.session.view.state.doc.toString()).not.toContain("first session edit");

    await act(async () => {
      undoMarkdownSourceSession({
        dispatch: secondResult.session.view.dispatch.bind(secondResult.session.view),
        state: secondResult.session.view.state
      });
    });

    expect(secondResult.session.view.state.doc.toString()).toContain("Second body");
    secondResult.session.destroy();
  });
});


it("updates diagnostic decoration through edits, history and canonical replacement", () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope() });
  if (!result.ok) throw new Error("session failed");
  const { session } = result;
  const valid = session.view.state.doc.toString();
  const invalid = valid + "\n<bad>";
  act(() => session.view.dispatch({ changes: { from: 0, to: valid.length, insert: invalid } }));
  expect(session.view.state.doc.toString()).toBe(invalid);
  expect(mount.querySelector(".docsera-markdown-source-error")?.textContent).toBe("<bad>");
  expect(session.view.posAtDOM(mount.querySelector(".docsera-markdown-source-error-marker")!)).toBe(invalid.indexOf("<bad>"));
  act(() => undoMarkdownSourceSession({ state: session.view.state, dispatch: session.view.dispatch.bind(session.view) }));
  expect(mount.querySelector(".docsera-markdown-source-error")).toBeNull();
  act(() => redoMarkdownSourceSession({ state: session.view.state, dispatch: session.view.dispatch.bind(session.view) }));
  expect(mount.querySelector(".docsera-markdown-source-error")?.textContent).toBe("<bad>");
  act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: "plain text" } }));
  expect(mount.querySelector(".docsera-markdown-source-error")).toBeNull();
  expect(mount.querySelector(".docsera-markdown-source-error-marker")).toBeNull();
  act(() => { session.replaceFromCanonical({ title: "New", envelope: createCanonicalDocseraDocumentEnvelope() }); });
  expect(mount.querySelector(".docsera-markdown-source-error")).toBeNull();
  session.destroy();
  expect(mount.querySelector(".docsera-markdown-source-error")).toBeNull();
});


it("decorates malformed frontmatter delimiters and clears the decoration after correction", () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope() });
  if (!result.ok) throw new Error("session failed");
  const { session } = result;
  const valid = session.view.state.doc.toString();
  for (const invalid of [valid.replace(/^---/, "--"), valid.replace(/\n---\n/, "\n--\n")]) {
    act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: invalid } }));
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(1);
    expect(markdownSourceErrorTooltip(session.view, 0)?.end).toBe(invalid.lastIndexOf("---") + 3 > 3 && invalid.startsWith("--\n") ? invalid.lastIndexOf("---") + 3 : invalid.indexOf("\n--\n") + 3);
    act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: valid } }));
    expect(mount.querySelector(".docsera-markdown-source-error")).toBeNull();
  }
  session.destroy();
});


it("exposes only the current ranged converter error to the hover tooltip", () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope() });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const { view } = result.session;
  view.dispatch({ changes: { from: view.state.doc.length, insert: "\n<bad>" } });
  const snapshot = result.session.getSnapshot();
  expect(snapshot.kind).toBe("invalid");
  if (snapshot.kind !== "invalid" || !snapshot.failure.range) throw new Error("Expected ranged failure");
  const range = snapshot.failure.range;
  const tooltip = markdownSourceErrorTooltip(view, range.from);
  expect(tooltip?.above).toBe(true);
  expect(tooltip?.create().offset).toEqual({ x: 0, y: 12 });
  const tooltipDom = tooltip?.create().dom;
  expect(tooltipDom?.querySelector(".docsera-markdown-source-error-badge")).toHaveTextContent("Error");
  expect(tooltipDom?.querySelector(".docsera-markdown-source-error-icon")).toHaveAttribute("aria-hidden", "true");
  expect(tooltipDom?.querySelector(".docsera-markdown-source-error-icon")).toHaveTextContent("×");
  expect(tooltipDom).toHaveTextContent(snapshot.failure.message);
  expect(markdownSourceErrorTooltip(view, range.to)).toBeNull();
  view.dispatch({ changes: { from: range.from, to: range.to, insert: "fixed" } });
  expect(markdownSourceErrorTooltip(view, range.from)).toBeNull();
  result.session.replaceFromCanonical({ title: "New", envelope: createCanonicalDocseraDocumentEnvelope() });
  expect(markdownSourceErrorTooltip(view, 0)).toBeNull();
  result.session.destroy();
});


it("renders logical line numbers and locates a parsed malformed directive without marking literal code", () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope() });
  if (!result.ok) throw new Error("session failed");
  const { session } = result;
  const prefix = '---\ntitle: "Overview"\n---\n';
  const invalid = prefix + ':docsera-callout';
  act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: invalid } }));
  expect(mount.querySelectorAll(".cm-lineNumbers .cm-gutterElement").length).toBeGreaterThanOrEqual(4);
  expect(mount.querySelector(".docsera-markdown-source-error")?.textContent).toContain(":docsera-callout");
  act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: prefix + '```\n:docsera-callout\n```' } }));
  expect(session.getSnapshot().kind).toBe("valid");
  expect(mount.querySelector(".docsera-markdown-source-error")).toBeNull();
  session.destroy();
});


it("decorates frontmatter errors independently and accepts a corrected title", () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const snapshots: MarkdownSourceSessionSnapshot[] = [];
  const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope(), onStateChange: (snapshot) => snapshots.push(snapshot) });
  if (!result.ok) throw new Error("session failed");
  const { session } = result;
  for (const [field, token] of [['titl: "Name"', 'titl'], ['title: "Name"\nextra: value', 'extra'], ['title: Name"', 'Name"'], ['title: "Name', '"'], ['title: Name', 'Name']]) {
    const source = `---\n${field}\n---\n\n::docsera-unknown\n\n::docsera-image`;
    act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: source } }));
    expect(latestSnapshot(snapshots).kind).toBe("invalid");
    const tooltip = markdownSourceErrorTooltip(session.view, 0)?.create().dom;
    expect(tooltip).toHaveTextContent("Malformed frontmatter");
    expect(tooltip).toHaveTextContent("Use the following format:");
    expect(tooltip?.querySelector("pre")?.textContent).toBe('---\ntitle: "your page title"\n---');
    expect(markdownSourceErrorTooltip(session.view, 0)?.end).toBe(source.indexOf("\n---\n") + 4);
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(3);
    const corrected = source.replace(field, 'title: "Updated"');
    act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: corrected } }));
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(2);
    const valid = corrected.replace("::docsera-unknown", "text").replace("::docsera-image", "text");
    act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: valid } }));
    expect(latestSnapshot(snapshots)).toMatchObject({ kind: "valid", title: "Updated" });
    expect(mount.querySelector(".docsera-markdown-source-error")).toBeNull();
  }
  session.destroy();
});

it("keeps body markers when a malformed opening and metadata are corrected independently", () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const result = createMarkdownSourceSession({ mount, title: "Overview", envelope: createCanonicalDocseraDocumentEnvelope(), onStateChange: () => {} });
  if (!result.ok) throw new Error("session failed");
  const { session } = result;
  const source = '--\ntitl: "untitled-page\n---\n\n::docsera-unknown\n\n::docsera-image';
  for (const candidate of [source, source.replace('--\n', '---\n'), source.replace('titl:', 'title:'), source.replace('untitled-page', 'untitled-page"')]) {
    act(() => session.view.dispatch({ changes: { from: 0, to: session.view.state.doc.length, insert: candidate } }));
    expect(mount.querySelectorAll(".docsera-markdown-source-error-marker")).toHaveLength(3);
    const tooltip = markdownSourceErrorTooltip(session.view, 0);
    expect(tooltip?.end).toBe(candidate.indexOf('\n---\n') + 4);
    expect(tooltip?.create().dom).toHaveTextContent("Malformed frontmatter");
  }
  session.destroy();
});
