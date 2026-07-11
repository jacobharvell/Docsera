import { describe, expect, it } from "vitest";
import { EditorSessionGeneration } from "./editorSessionGeneration";

describe("editor session generation", () => {
  it("invalidates prior page tokens when a new page session begins", () => {
    const sessions = new EditorSessionGeneration();
    const first = sessions.begin("page-1", 3);
    const second = sessions.begin("page-2", 1);

    expect(sessions.isCurrent(first)).toBe(false);
    expect(sessions.isCurrent(second)).toBe(true);
  });

  it("accepts a revision advance only for the current generation", () => {
    const sessions = new EditorSessionGeneration();
    const current = sessions.begin("page-1", 4);
    const advanced = sessions.advanceRevision(current, 5);

    expect(advanced).toEqual({ pageSysId: "page-1", generation: current.generation, revision: 5 });
    expect(sessions.isCurrent(current)).toBe(true);
    expect(advanced && sessions.isCurrent(advanced)).toBe(true);
    expect(sessions.advanceRevision(current, 6)).toEqual({
      pageSysId: "page-1",
      generation: current.generation,
      revision: 6
    });
  });

  it("rejects missing page identity and invalidates on teardown", () => {
    const sessions = new EditorSessionGeneration();
    expect(() => sessions.begin(" ", 0)).toThrow("page sys_id");

    const token = sessions.begin("page-1", -1);
    expect(token.revision).toBe(0);
    sessions.invalidate();
    expect(sessions.isCurrent(token)).toBe(false);
  });
});
