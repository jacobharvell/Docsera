/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublishedDocumentReader } from "./PublishedDocumentReader";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";

const CALLOUT_COLORS = {
  info: { accent: "#3B82F6", lightIcon: "#2563EB" },
  warning: { accent: "#F59E0B", lightIcon: "#92400E" },
  success: { accent: "#10B981", lightIcon: "#047857" },
  error: { accent: "#EF4444", lightIcon: "#DC2626" }
} as const;

function createCalloutEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { type: "info", title: null },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Untitled info" }] }]
        },
        {
          type: "callout",
          attrs: { type: "warning", title: "Heads up" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Warning body" }] },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Nested supported list" }] }]
                }
              ]
            }
          ]
        },
        {
          type: "callout",
          attrs: { type: "success", title: "Complete" },
          content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted success" }] }] }]
        },
        {
          type: "callout",
          attrs: { type: "error", title: "Problem" },
          content: [{ type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "throw new Error();" }] }]
        }
      ]
    }
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number
  ];
}

function mixRgb(
  foregroundHex: string,
  foregroundPercent: number,
  backgroundHex: string,
  backgroundPercent: number
): [number, number, number] {
  const foreground = hexToRgb(foregroundHex);
  const background = hexToRgb(backgroundHex);
  const total = foregroundPercent + backgroundPercent;

  return foreground.map((channel, index) =>
    Math.round((channel * foregroundPercent + background[index] * backgroundPercent) / total)
  ) as [number, number, number];
}

function getRelativeLuminance(rgb: [number, number, number]): number {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastRatio(foregroundHex: string, backgroundRgb: [number, number, number]): number {
  const foregroundLuminance = getRelativeLuminance(hexToRgb(foregroundHex));
  const backgroundLuminance = getRelativeLuminance(backgroundRgb);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe("PublishedDocumentReader callouts", () => {
  it("keeps the reader callout CSS contract theme-aware", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );

    expect(source).toContain(".docsera-main__callout {");
    expect(source).toContain(
      "--docsera-callout-icon-row-offset: calc((var(--docsera-document-body-font-size) * var(--docsera-document-body-line-height) - 20px) / 2);"
    );
    expect(source).toContain("grid-template-columns: 20px minmax(0, 1fr);");
    expect(source).toContain("border-left: 4px solid var(--docsera-callout-accent);");
    expect(source).toContain("width: 20px;");
    expect(source).toContain("height: 20px;");
    expect(source).toContain("margin-top: var(--docsera-callout-icon-row-offset);");
    expect(source).toContain(".docsera-main__callout-icon svg {");
    expect(source).toContain("flex: 0 0 20px;");
    expect(source).toContain("color: var(--docsera-callout-icon-color);");
    expect(source).toContain("color-mix(in srgb, var(--docsera-callout-accent) 5%, var(--docsera-surface))");
    expect(source).toContain('html[data-docsera-theme="dark"] .docsera-main__callout');
    expect(source).toContain('html[data-docsera-theme="dark"] .docsera-main__callout-icon');
    expect(source).toContain("color: var(--docsera-callout-accent);");
  });

  it("renders all semantic callout types with semantic accessible names and nested supported content", () => {
    render(<PublishedDocumentReader envelope={createCalloutEnvelope()} pageIdentity="page-callouts" />);

    const reader = screen.getByLabelText("Published page content");
    const callouts = Array.from(reader.querySelectorAll(".docsera-main__callout"));

    expect(callouts).toHaveLength(4);
    expect(callouts.map((callout) => callout.getAttribute("data-docsera-callout-type"))).toEqual([
      "info",
      "warning",
      "success",
      "error"
    ]);
    expect(screen.getByRole("note", { name: "Info callout" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Warning callout: Heads up" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Success callout: Complete" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Error callout: Problem" })).toBeInTheDocument();
    expect(within(reader).getByText("Nested supported list")).toBeInTheDocument();
    expect(within(reader).getByText("Quoted success")).toBeInTheDocument();
    expect(within(reader).getByText("throw new Error();")).toBeInTheDocument();
  });

  it("keeps callout icon foregrounds at 3:1 contrast against light and dark callout backgrounds", () => {
    for (const colors of Object.values(CALLOUT_COLORS)) {
      const lightBackground = mixRgb(colors.accent, 5, "#ffffff", 95);
      const darkBackground = mixRgb(colors.accent, 12, "#161b22", 88);

      expect(getContrastRatio(colors.lightIcon, lightBackground)).toBeGreaterThanOrEqual(3);
      expect(getContrastRatio(colors.accent, darkBackground)).toBeGreaterThanOrEqual(3);
    }
  });

  it("falls back to the invalid-document recovery path for unsupported callout descendants", () => {
    render(
      <PublishedDocumentReader
        pageIdentity="page-bad-callout"
        envelope={{
          schemaVersion: 1,
          document: {
            type: "doc",
            content: [
              {
                type: "callout",
                attrs: { type: "info", title: null },
                content: [
                  {
                    type: "image",
                    attrs: {
                      mediaId: "workspace-media-001",
                      darkMediaId: null,
                      alt: "",
                      caption: "",
                      frame: false,
                      align: "center",
                      widthPct: 100
                    }
                  }
                ]
              }
            ]
          }
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Published content unavailable", level: 2 })).toBeInTheDocument();
  });
});
