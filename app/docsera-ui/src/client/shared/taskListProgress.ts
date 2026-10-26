const STORAGE_PREFIX = "docsera.task-list-progress.v1";

type StoredTaskProgress = Record<string, boolean>;
type TaskProgressNode = {
  attrs?: Record<string, unknown>;
  content?: unknown[];
  type?: string;
};

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isTaskProgressNode(value: unknown): value is TaskProgressNode {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withoutCheckedState(node: TaskProgressNode): TaskProgressNode {
  const { attrs: originalAttrs, content: originalContent, ...nodeWithoutAttrs } = node;
  const attrs = originalAttrs && typeof originalAttrs === "object"
    ? Object.fromEntries(Object.entries(originalAttrs).filter(([key, value]) => key !== "checked" && value !== undefined))
    : undefined;
  return {
    ...nodeWithoutAttrs,
    ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(Array.isArray(originalContent) ? { content: originalContent.filter(isTaskProgressNode).map(withoutCheckedState) } : {})
  };
}

function taskStructure(node: TaskProgressNode): unknown[] {
  if (!Array.isArray(node.content)) {
    return [];
  }

  return node.content.filter(isTaskProgressNode).flatMap((child) => {
    if (child.type === "taskList") {
      return [withoutCheckedState(child)];
    }
    return taskStructure(child);
  });
}

export function getTaskListProgressScope(document: TaskProgressNode): string {
  return stableHash(JSON.stringify(taskStructure(document)));
}

export function getTaskListProgressStorageKey(pageIdentity: string, document: TaskProgressNode): string {
  return `${STORAGE_PREFIX}:${pageIdentity}:${getTaskListProgressScope(document)}`;
}

export function readTaskListProgress(pageIdentity: string, document: TaskProgressNode): StoredTaskProgress {
  if (typeof window === "undefined" || !pageIdentity) {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(getTaskListProgressStorageKey(pageIdentity, document));
    const parsed = stored ? JSON.parse(stored) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "boolean")) as StoredTaskProgress;
  } catch {
    return {};
  }
}

export function writeTaskListProgress(pageIdentity: string, document: TaskProgressNode, progress: StoredTaskProgress): void {
  if (typeof window === "undefined" || !pageIdentity) {
    return;
  }

  try {
    window.localStorage.setItem(getTaskListProgressStorageKey(pageIdentity, document), JSON.stringify(progress));
  } catch {
    // Storage can be unavailable or full. Interaction remains useful in memory.
  }
}
