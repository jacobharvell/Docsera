/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createMarkdownSourceSession,
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

    expect(session.getSnapshot()).toEqual({
      kind: "invalid",
      isClean: false,
      text: invalidSource,
      failure: {
        ok: false,
        reason: "unsupported-html",
        message: "Markdown contains unsupported inline HTML."
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
