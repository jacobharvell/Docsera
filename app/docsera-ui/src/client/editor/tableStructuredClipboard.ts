import type { JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CellSelection, findTable, selectedRect, TableMap } from "@tiptap/pm/tables";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export type StructuredTableClipboardKind = "row" | "column";

export const STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_WEB_CUSTOM_FORMAT =
  "web application/x-docsera-structured-table-provenance";
export const STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME = STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_WEB_CUSTOM_FORMAT;

export type StructuredTableClipboardPayload = {
  cells: JSONContent[][];
  clipboardText: string;
  kind: StructuredTableClipboardKind;
  provenanceToken: string;
  timestampMsUtc: number;
};

export type StructuredTableClipboardDataLike = {
  getData(type: string): string;
} | null | undefined;

export const STRUCTURED_TABLE_CLIPBOARD_TTL_MS = 5 * 60 * 1000;

export function createStructuredTableClipboardProvenanceToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function cloneStructuredTableClipboardCells(cells: JSONContent[][]): JSONContent[][] {
  return JSON.parse(JSON.stringify(cells)) as JSONContent[][];
}

function collectPlainTextFromJsonContent(content: JSONContent[] | undefined): string {
  if (!Array.isArray(content) || content.length === 0) {
    return "";
  }

  return content
    .map((node) => {
      if (!node || typeof node !== "object" || typeof node.type !== "string") {
        return "";
      }

      if (node.type === "text") {
        return typeof node.text === "string" ? node.text : "";
      }

      if (node.type === "hardBreak") {
        return "\n";
      }

      const nestedContent = Array.isArray(node.content) ? collectPlainTextFromJsonContent(node.content as JSONContent[]) : "";
      if (!nestedContent) {
        return "";
      }

      if (node.type === "paragraph" || node.type === "heading" || node.type === "codeBlock") {
        return nestedContent;
      }

      return `${nestedContent}\n`;
    })
    .join("");
}

function decodeCellContent(view: EditorView, sourceContent: JSONContent[]): ProseMirrorNode[] {
  const nodes = sourceContent
    .map((jsonNode) => {
      try {
        return view.state.schema.nodeFromJSON(jsonNode);
      } catch {
        return null;
      }
    })
    .filter((node): node is ProseMirrorNode => Boolean(node));

  if (nodes.length > 0) {
    return nodes;
  }

  const paragraphType = view.state.schema.nodes.paragraph;
  return paragraphType ? [paragraphType.create()] : [];
}

function replaceCellContent(view: EditorView, tr: EditorState["tr"], cellPos: number, nextContent: JSONContent[]) {
  const mappedCellPos = tr.mapping.map(cellPos);
  const mappedCellNode = tr.doc.nodeAt(mappedCellPos);
  if (!mappedCellNode) {
    return tr;
  }

  const nextNodes = decodeCellContent(view, nextContent);
  if (nextNodes.length === 0) {
    return tr;
  }

  return tr.replaceWith(mappedCellPos + 1, mappedCellPos + mappedCellNode.nodeSize - 1, nextNodes);
}

function isWholeRowSelection(rect: { bottom: number; left: number; right: number; top: number }, map: TableMap): boolean {
  return rect.left === 0 && rect.right === map.width && rect.bottom - rect.top === 1;
}

function isWholeColumnSelection(rect: { bottom: number; left: number; right: number; top: number }, map: TableMap): boolean {
  return rect.top === 0 && rect.bottom === map.height && rect.right - rect.left === 1;
}

export function createStructuredTableClipboardPayload(
  kind: StructuredTableClipboardKind,
  cells: JSONContent[][],
  timestampMsUtc = Date.now(),
  provenanceToken = createStructuredTableClipboardProvenanceToken()
): StructuredTableClipboardPayload {
  const clipboardText = serializeStructuredTableClipboardCellsToPlainText(cells);
  return {
    cells: cloneStructuredTableClipboardCells(cells),
    clipboardText,
    kind,
    provenanceToken,
    timestampMsUtc
  };
}

export function isFreshStructuredTableClipboardPayload(
  payload: StructuredTableClipboardPayload,
  nowMsUtc = Date.now()
): boolean {
  return nowMsUtc - payload.timestampMsUtc < STRUCTURED_TABLE_CLIPBOARD_TTL_MS;
}

export function serializeStructuredTableClipboardCellsToPlainText(cells: JSONContent[][]): string {
  return cells.map((cellContent) => collectPlainTextFromJsonContent(cellContent)).join("\n");
}

export function createStructuredTableClipboardItemData(payload: StructuredTableClipboardPayload): Record<string, Blob> {
  return {
    "text/plain": new Blob([payload.clipboardText], { type: "text/plain" }),
    [STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_WEB_CUSTOM_FORMAT]: new Blob([payload.provenanceToken], {
      type: STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_WEB_CUSTOM_FORMAT
    })
  };
}

export function doesStructuredTableClipboardDataMatchPayload(
  clipboardData: StructuredTableClipboardDataLike,
  payload: StructuredTableClipboardPayload
): boolean {
  if (!clipboardData) {
    return false;
  }

  return clipboardData.getData(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_WEB_CUSTOM_FORMAT) === payload.provenanceToken;
}

export function resolveStructuredTableClipboardDestination(
  state: EditorState
): { index: number; kind: StructuredTableClipboardKind; map: TableMap; tableStart: number } | null {
  if (!(state.selection instanceof CellSelection)) {
    return null;
  }

  const table = findTable(state.selection.$anchorCell);
  if (!table) {
    return null;
  }

  let rect: ReturnType<typeof selectedRect> | null = null;
  try {
    rect = selectedRect(state);
  } catch {
    rect = null;
  }

  if (!rect) {
    return null;
  }

  const map = TableMap.get(table.node);
  if (isWholeRowSelection(rect, map)) {
    return {
      index: rect.top,
      kind: "row",
      map,
      tableStart: table.start
    };
  }

  if (isWholeColumnSelection(rect, map)) {
    return {
      index: rect.left,
      kind: "column",
      map,
      tableStart: table.start
    };
  }

  return null;
}

export function tryApplyStructuredTableClipboardPaste(
  view: EditorView,
  payload: StructuredTableClipboardPayload | null,
  nowMsUtc = Date.now()
): boolean {
  if (!payload || !isFreshStructuredTableClipboardPayload(payload, nowMsUtc)) {
    return false;
  }

  const destination = resolveStructuredTableClipboardDestination(view.state);
  if (!destination || destination.kind !== payload.kind) {
    return false;
  }

  const targetCount = destination.kind === "row" ? destination.map.width : destination.map.height;
  const sourceCount = payload.cells.length;
  const copyCount = Math.min(targetCount, sourceCount);
  if (copyCount <= 0) {
    return false;
  }

  let tr = view.state.tr;

  if (destination.kind === "row") {
    for (let columnIndex = 0; columnIndex < copyCount; columnIndex += 1) {
      const relativeCellPos = destination.map.map[destination.index * destination.map.width + columnIndex];
      if (typeof relativeCellPos !== "number") {
        continue;
      }

      tr = replaceCellContent(view, tr, destination.tableStart + relativeCellPos, payload.cells[columnIndex] ?? []);
    }
  } else {
    for (let rowIndex = 0; rowIndex < copyCount; rowIndex += 1) {
      const relativeCellPos = destination.map.map[rowIndex * destination.map.width + destination.index];
      if (typeof relativeCellPos !== "number") {
        continue;
      }

      tr = replaceCellContent(view, tr, destination.tableStart + relativeCellPos, payload.cells[rowIndex] ?? []);
    }
  }

  view.dispatch(closeHistory(tr.scrollIntoView()));
  view.focus();
  return true;
}
