import type { Editor, JSONContent } from "@tiptap/core";

export type EditorBlockCommandId =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "bulletedList"
  | "numberedList"
  | "codeBlock"
  | "horizontalRule"
  | "table";

export type EditorBlockCommand = {
  category: "Basic Blocks";
  description: string;
  id: EditorBlockCommandId;
  keywords: string[];
  label: string;
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
    id: "table",
    label: "Table",
    description: "Create a simple table",
    keywords: ["table", "grid", "cells", "rows", "columns"],
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

export function getEditorBlockCommandMatches(
  query: string
): EditorBlockCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return EDITOR_BLOCK_COMMANDS;
  }

  return EDITOR_BLOCK_COMMANDS.filter((command) => {
    const haystack = [command.label, command.description, ...command.keywords].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getGroupedEditorBlockCommandMatches(query: string): Array<{
  category: EditorBlockCommand["category"];
  commands: EditorBlockCommand[];
}> {
  const matches = getEditorBlockCommandMatches(query);
  return matches.length
    ? [
        {
          category: "Basic Blocks",
          commands: matches
        }
      ]
    : [];
}
