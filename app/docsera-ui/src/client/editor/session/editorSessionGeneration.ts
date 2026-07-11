export type EditorSessionToken = Readonly<{
  pageSysId: string;
  generation: number;
  revision: number;
}>;

function normalizePageSysId(value: string): string {
  return value.trim();
}

function normalizeRevision(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export class EditorSessionGeneration {
  private generation = 0;
  private current: EditorSessionToken | null = null;

  begin(pageSysId: string, revision: number): EditorSessionToken {
    const normalizedPageSysId = normalizePageSysId(pageSysId);
    if (!normalizedPageSysId) {
      throw new TypeError("An editor session requires a page sys_id.");
    }

    this.generation += 1;
    this.current = Object.freeze({
      pageSysId: normalizedPageSysId,
      generation: this.generation,
      revision: normalizeRevision(revision)
    });
    return this.current;
  }

  isCurrent(token: EditorSessionToken): boolean {
    return Boolean(
      this.current &&
        token.pageSysId === this.current.pageSysId &&
        token.generation === this.current.generation
    );
  }

  advanceRevision(token: EditorSessionToken, revision: number): EditorSessionToken | null {
    if (!this.isCurrent(token)) {
      return null;
    }

    this.current = Object.freeze({
      ...token,
      revision: normalizeRevision(revision)
    });
    return this.current;
  }

  invalidate(): void {
    this.generation += 1;
    this.current = null;
  }
}
