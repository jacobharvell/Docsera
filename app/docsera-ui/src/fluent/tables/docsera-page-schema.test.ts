import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

type FieldContract = {
  columnFactory: string;
  maxLength: number | null;
};

function readFieldContracts() {
  const sourcePath = path.resolve(process.cwd(), "src/fluent/tables/docsera-page.now.ts");
  const sourceText = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fieldContracts = new Map<string, FieldContract>();

  function readMaxLength(argument: ts.Expression | undefined): number | null {
    if (!argument || !ts.isObjectLiteralExpression(argument)) {
      return null;
    }

    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property) || property.name.getText(sourceFile) !== "maxLength") {
        continue;
      }

      if (ts.isNumericLiteral(property.initializer)) {
        return Number(property.initializer.text);
      }
    }

    return null;
  }

  function visit(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression)
    ) {
      fieldContracts.set(node.name.text, {
        columnFactory: node.initializer.expression.text,
        maxLength: readMaxLength(node.initializer.arguments[0])
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return fieldContracts;
}

describe("docsera page schema contract", () => {
  it("uses the accepted bounded capacity for canonical JSON and leaves body-text compatibility fields unchanged", () => {
    const fieldContracts = readFieldContracts();

    expect(fieldContracts.get("draft_content_json")).toEqual({
      columnFactory: "StringColumn",
      maxLength: 262144
    });
    expect(fieldContracts.get("published_content_json")).toEqual({
      columnFactory: "StringColumn",
      maxLength: 262144
    });
    expect(fieldContracts.get("draft_body_text")).toEqual({
      columnFactory: "StringColumn",
      maxLength: 4000
    });
    expect(fieldContracts.get("published_body_text")).toEqual({
      columnFactory: "StringColumn",
      maxLength: 4000
    });
    expect(fieldContracts.get("published_at")).toEqual({
      columnFactory: "DateTimeColumn",
      maxLength: null
    });
    expect(fieldContracts.get("published_by")).toEqual({
      columnFactory: "ReferenceColumn",
      maxLength: null
    });
  });
});
