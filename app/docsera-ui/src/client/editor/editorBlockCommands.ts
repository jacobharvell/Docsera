import type { Editor, JSONContent } from "@tiptap/core";

export type EditorBlockCommandId =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "callout"
  | "bulletedList"
  | "numberedList"
  | "taskList"
  | "accordion"
  | "columns2"
  | "columns3"
  | "columns4"
  | "codeBlock"
  | "horizontalRule"
  | "image"
  | "table";

export type EditorBlockCommandContext = {
  insertionContainerType: string;
  isInsideAccordion: boolean;
  isInsideAccordionContent: boolean;
  isInsideCallout: boolean;
  isInsideColumn: boolean;
  isInsideTableCellOrHeader: boolean;
  isTopLevelBlock: boolean;
};

export type EditorBlockCommand = {
  category: "Basic Blocks";
  description: string;
  id: EditorBlockCommandId;
  keywords: string[];
  label: string;
  isAvailable?: (context: EditorBlockCommandContext) => boolean;
  createQuickAddContent?: () => JSONContent[];
  quickAdd: {
    content: JSONContent[];
    selectionOffset: number | "continuation";
  };
  slashSelectionOffset?: number | "continuation";
  run: (editor: Editor) => void;
};

function createParagraphNode(): JSONContent {
  return {
    type: "paragraph"
  };
}

export function createAccordionIdentity(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (typeof randomId === "string" && randomId.length > 0) {
    return `${prefix}-${randomId}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createHeadingNode(level: 1 | 2 | 3): JSONContent {
  return {
    type: "heading",
    attrs: { level }
  };
}

function createBlockquoteNode(): JSONContent {
  return {
    type: "blockquote",
    content: [createParagraphNode()]
  };
}

function createCalloutNode(): JSONContent {
  return {
    type: "callout",
    attrs: {
      type: "info",
      title: null
    },
    content: [createParagraphNode()]
  };
}

function createCalloutQuickAddContent(): JSONContent[] {
  return [createCalloutNode()];
}

function createListNode(type: "bulletList" | "orderedList"): JSONContent {
  return {
    type,
    content: [
      {
        type: "listItem",
        content: [createParagraphNode()]
      }
    ]
  };
}

function createTaskListNode(): JSONContent {
  return {
    type: "taskList",
    content: [
      {
        type: "taskItem",
        attrs: { checked: false },
        content: [createParagraphNode()]
      }
    ]
  };
}

function createAccordionNode(): JSONContent {
  return {
    type: "accordion",
    attrs: {
      accordionId: createAccordionIdentity("accordion")
    },
    content: [
      {
        type: "accordionItem",
        attrs: {
          accordionItemId: createAccordionIdentity("accordion-item")
        },
        content: [
          {
            type: "accordionTitle"
          },
          {
            type: "accordionContent",
            content: [createParagraphNode()]
          }
        ]
      }
    ]
  };
}

function createAccordionQuickAddContent(): JSONContent[] {
  return [createAccordionNode()];
}

function createColumnsNode(columnCount: 2 | 3 | 4): JSONContent {
  const content: JSONContent[] = [];

  for (let index = 0; index < columnCount; index += 1) {
    content.push({
      type: "column",
      content: [createParagraphNode()]
    });
  }

  return {
    type: "columns",
    content
  };
}

function createColumnsQuickAddContent(columnCount: 2 | 3 | 4): JSONContent[] {
  return [createColumnsNode(columnCount)];
}

function createCodeBlockNode(): JSONContent {
  return {
    type: "codeBlock"
  };
}

export function createDefaultTableNode(): JSONContent {
  return {
    type: "table",
    content: Array.from({ length: 3 }, () => ({
      type: "tableRow",
      content: Array.from({ length: 3 }, () => ({
        type: "tableCell",
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: null
        },
        content: [createParagraphNode()]
      }))
    }))
  };
}

export const EDITOR_BLOCK_COMMANDS: EditorBlockCommand[] = [
  {
    category: "Basic Blocks",
    id: "text",
    label: "Text",
    description: "Plain paragraph text",
    keywords: ["paragraph", "text", "body", "normal"],
    quickAdd: {
      content: [createParagraphNode()],
      selectionOffset: 1
    },
    slashSelectionOffset: 1,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).setParagraph().run();
    }
  },
  {
    category: "Basic Blocks",
    id: "heading1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["h1", "heading", "section", "title"],
    quickAdd: {
      content: [createHeadingNode(1)],
      selectionOffset: 1
    },
    slashSelectionOffset: 1,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 1 }).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "heading2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "heading", "section", "subtitle"],
    quickAdd: {
      content: [createHeadingNode(2)],
      selectionOffset: 1
    },
    slashSelectionOffset: 1,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 2 }).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "heading3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: ["h3", "heading", "subsection"],
    quickAdd: {
      content: [createHeadingNode(3)],
      selectionOffset: 1
    },
    slashSelectionOffset: 1,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 3 }).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "blockquote",
    label: "Blockquote",
    description: "Quoted block text",
    keywords: ["quote", "blockquote", "callout"],
    quickAdd: {
      content: [createBlockquoteNode()],
      selectionOffset: 2
    },
    slashSelectionOffset: 2,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).setParagraph().setBlockquote().run();
    }
  },
  {
    category: "Basic Blocks",
    id: "bulletedList",
    label: "Bulleted List",
    description: "Create a list with bullet points",
    keywords: ["bullet", "bulleted", "unordered", "list"],
    quickAdd: {
      content: [createListNode("bulletList")],
      selectionOffset: 3
    },
    slashSelectionOffset: 3,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run();
    }
  },
  {
    category: "Basic Blocks",
    id: "numberedList",
    label: "Numbered List",
    description: "Create an ordered list",
    keywords: ["numbered", "ordered", "list"],
    quickAdd: {
      content: [createListNode("orderedList")],
      selectionOffset: 3
    },
    slashSelectionOffset: 3,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run();
    }
  },
  {
    category: "Basic Blocks",
    id: "taskList",
    label: "Task List",
    description: "Create a checklist",
    keywords: ["task", "tasks", "checklist", "todo", "to-do", "list"],
    quickAdd: {
      content: [createTaskListNode()],
      selectionOffset: 3
    },
    slashSelectionOffset: 3,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleTaskList().run();
    }
  },
  {
    category: "Basic Blocks",
    id: "accordion",
    label: "Accordion",
    description: "Create a collapsible content block",
    keywords: ["accordion", "details", "expandable", "collapsible"],
    isAvailable: (context) =>
      !context.isInsideTableCellOrHeader &&
      (context.isTopLevelBlock || (context.insertionContainerType === "column" && !context.isInsideAccordion)),
    createQuickAddContent: createAccordionQuickAddContent,
    quickAdd: {
      content: [],
      selectionOffset: 3
    },
    slashSelectionOffset: 3,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertContent(createAccordionQuickAddContent()).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "callout",
    label: "Callout",
    description: "Highlight a note, warning, success, or error",
    keywords: ["callout", "note", "info", "warning", "success", "error", "admonition"],
    isAvailable: (context) =>
      !context.isInsideTableCellOrHeader &&
      !context.isInsideCallout &&
      (context.isTopLevelBlock || context.insertionContainerType === "column" || context.insertionContainerType === "accordionContent"),
    createQuickAddContent: createCalloutQuickAddContent,
    quickAdd: {
      content: [],
      selectionOffset: 2
    },
    slashSelectionOffset: 2,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertContent(createCalloutQuickAddContent()).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "columns2",
    label: "2 columns",
    description: "Insert a two-column layout",
    keywords: ["2 columns", "2 column", "two columns", "two column", "columns", "column", "layout"],
    isAvailable: (context) =>
      !context.isInsideTableCellOrHeader &&
      (context.isTopLevelBlock || (context.insertionContainerType === "accordionContent" && !context.isInsideColumn)),
    createQuickAddContent: () => createColumnsQuickAddContent(2),
    quickAdd: {
      content: [],
      selectionOffset: 3
    },
    slashSelectionOffset: 3,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertContent(createColumnsQuickAddContent(2)).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "columns3",
    label: "3 columns",
    description: "Insert a three-column layout",
    keywords: ["3 columns", "3 column", "three columns", "three column", "columns", "column", "layout"],
    isAvailable: (context) =>
      !context.isInsideTableCellOrHeader &&
      (context.isTopLevelBlock || (context.insertionContainerType === "accordionContent" && !context.isInsideColumn)),
    createQuickAddContent: () => createColumnsQuickAddContent(3),
    quickAdd: {
      content: [],
      selectionOffset: 3
    },
    slashSelectionOffset: 3,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertContent(createColumnsQuickAddContent(3)).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "columns4",
    label: "4 columns",
    description: "Insert a four-column layout",
    keywords: ["4 columns", "4 column", "four columns", "four column", "columns", "column", "layout"],
    isAvailable: (context) =>
      !context.isInsideTableCellOrHeader &&
      (context.isTopLevelBlock || (context.insertionContainerType === "accordionContent" && !context.isInsideColumn)),
    createQuickAddContent: () => createColumnsQuickAddContent(4),
    quickAdd: {
      content: [],
      selectionOffset: 3
    },
    slashSelectionOffset: 3,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertContent(createColumnsQuickAddContent(4)).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "codeBlock",
    label: "Code Block",
    description: "Insert a formatted code block",
    keywords: ["code", "code block", "snippet", "pre"],
    quickAdd: {
      content: [createCodeBlockNode()],
      selectionOffset: 1
    },
    slashSelectionOffset: 1,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).toggleCodeBlock().run();
    }
  },
  {
    category: "Basic Blocks",
    id: "horizontalRule",
    label: "Horizontal Rule",
    description: "Insert a horizontal divider",
    keywords: ["horizontal rule", "rule", "separator", "divider"],
    quickAdd: {
      content: [{ type: "horizontalRule" }, createParagraphNode()],
      selectionOffset: "continuation"
    },
    slashSelectionOffset: "continuation",
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertContent([{ type: "horizontalRule" }, { type: "paragraph" }]).run();
    }
  },
  {
    category: "Basic Blocks",
    id: "image",
    label: "Image",
    description: "Insert an image from the workspace media library",
    keywords: ["image", "media", "photo", "picture", "upload"],
    quickAdd: {
      content: [],
      selectionOffset: 1
    },
    slashSelectionOffset: 1,
    run: () => {
      // The runtime opens the image picker and inserts the canonical image block.
    }
  },
  {
    category: "Basic Blocks",
    id: "table",
    label: "Table",
    description: "Create a simple table",
    keywords: ["table", "grid", "cells", "rows", "columns"],
    isAvailable: (context) => !context.isInsideTableCellOrHeader,
    quickAdd: {
      content: [createDefaultTableNode()],
      selectionOffset: 4
    },
    slashSelectionOffset: 4,
    run: (editor) => {
      editor.chain().focus(undefined, { scrollIntoView: false }).insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run();
    }
  }
];

function isEditorBlockCommandAvailable(command: EditorBlockCommand, context: EditorBlockCommandContext): boolean {
  if (!(command.isAvailable?.(context) ?? true)) {
    return false;
  }

  if (
    context.isInsideCallout &&
    (command.id === "image" ||
      command.id === "table" ||
      command.id === "accordion" ||
      command.id === "callout" ||
      command.id === "columns2" ||
      command.id === "columns3" ||
      command.id === "columns4")
  ) {
    return false;
  }

  return true;
}

export function getEditorBlockCommandMatches(
  query: string,
  context: EditorBlockCommandContext = {
    insertionContainerType: "doc",
    isInsideAccordion: false,
    isInsideAccordionContent: false,
    isInsideCallout: false,
    isInsideColumn: false,
    isInsideTableCellOrHeader: false,
    isTopLevelBlock: true
  }
): EditorBlockCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return EDITOR_BLOCK_COMMANDS.filter((command) => isEditorBlockCommandAvailable(command, context));
  }

  return EDITOR_BLOCK_COMMANDS.filter((command) => {
    if (!isEditorBlockCommandAvailable(command, context)) {
      return false;
    }

    const haystack = [command.label, command.description, ...command.keywords].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getGroupedEditorBlockCommandMatches(
  query: string,
  context: EditorBlockCommandContext = {
    insertionContainerType: "doc",
    isInsideAccordion: false,
    isInsideAccordionContent: false,
    isInsideCallout: false,
    isInsideColumn: false,
    isInsideTableCellOrHeader: false,
    isTopLevelBlock: true
  }
): Array<{
  category: EditorBlockCommand["category"];
  commands: EditorBlockCommand[];
}> {
  const matches = getEditorBlockCommandMatches(query, context);
  return matches.length
    ? [
        {
          category: "Basic Blocks",
          commands: matches
      }
    ]
    : [];
}

export function getEditorBlockCommandQuickAddContent(command: EditorBlockCommand): JSONContent[] {
  return command.createQuickAddContent ? command.createQuickAddContent() : command.quickAdd.content;
}
