import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

type IndexContract = {
  element: string;
  unique: boolean | null;
};

function readContracts() {
  const sourcePath = path.resolve(process.cwd(), "src/fluent/tables/docsera-page-edit-lock.now.ts");
  const sourceText = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fieldContracts = new Map<string, { columnFactory: string; maxLength: number | null }>();
  const indexContracts = new Map<string, IndexContract>();

  function readStringProperty(node: ts.ObjectLiteralExpression, propertyName: string): string | null {
    for (const property of node.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText(sourceFile) === propertyName &&
        ts.isStringLiteral(property.initializer)
      ) {
        return property.initializer.text;
      }
    }

    return null;
  }

  function readBooleanProperty(node: ts.ObjectLiteralExpression, propertyName: string): boolean | null {
    for (const property of node.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText(sourceFile) === propertyName &&
        (property.initializer.kind === ts.SyntaxKind.TrueKeyword || property.initializer.kind === ts.SyntaxKind.FalseKeyword)
      ) {
        return property.initializer.kind === ts.SyntaxKind.TrueKeyword;
      }
    }

    return null;
  }

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

    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === "index" &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
          continue;
        }

        const name = readStringProperty(element, "name");
        const contractElement = readStringProperty(element, "element");
        if (!name || !contractElement) {
          continue;
        }

        indexContracts.set(name, {
          element: contractElement,
          unique: readBooleanProperty(element, "unique")
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { fieldContracts, indexContracts };
}

describe("docsera page edit lock schema contract", () => {
  it("uses the production page-key unique index and persisted verifier contract", () => {
    const { fieldContracts, indexContracts } = readContracts();

    expect(fieldContracts.get("page_key")).toEqual({
      columnFactory: "StringColumn",
      maxLength: 40
    });
    expect(fieldContracts.get("verifier_digest")).toEqual({
      columnFactory: "StringColumn",
      maxLength: 64
    });
    expect(indexContracts.get("page_key_unique")).toEqual({
      element: "page_key",
      unique: true
    });
    expect(indexContracts.get("last_seen_on_idx")).toEqual({
      element: "last_seen_on",
      unique: false
    });
  });
});
