export type DocseraImageDisplayTheme = "dark" | "light";

export type DocseraImagePreviewState = {
  blockIndex: number;
  theme: DocseraImageDisplayTheme;
} | null;

export type DocseraImageDisplayState = Readonly<{
  preview: DocseraImagePreviewState;
  theme: DocseraImageDisplayTheme;
}>;

type Listener = () => void;

const listeners = new Set<Listener>();
const state: DocseraImageDisplayState = {
  preview: null,
  theme: "light"
};

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function arePreviewStatesEqual(left: DocseraImagePreviewState, right: DocseraImagePreviewState): boolean {
  return left?.blockIndex === right?.blockIndex && left?.theme === right?.theme;
}

export function getDocseraImageDisplayState(): DocseraImageDisplayState {
  return state;
}

export function subscribeDocseraImageDisplayState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDocseraImageDisplayTheme(theme: DocseraImageDisplayTheme): void {
  if (state.theme === theme) {
    return;
  }

  (state as { theme: DocseraImageDisplayTheme }).theme = theme;
  emit();
}

export function setDocseraImagePreviewState(nextPreview: DocseraImagePreviewState): void {
  if (arePreviewStatesEqual(state.preview, nextPreview)) {
    return;
  }

  (state as { preview: DocseraImagePreviewState }).preview = nextPreview;
  emit();
}

export function clearDocseraImagePreviewState(): void {
  setDocseraImagePreviewState(null);
}

export function resetDocseraImageDisplayState(): void {
  (state as { preview: DocseraImagePreviewState }).preview = null;
  (state as { theme: DocseraImageDisplayTheme }).theme = "light";
  emit();
}

export function resolveDocseraImageDisplayTheme(blockIndex: number | null | undefined): DocseraImageDisplayTheme {
  if (typeof blockIndex === "number" && state.preview?.blockIndex === blockIndex) {
    return state.preview.theme;
  }

  return state.theme;
}
