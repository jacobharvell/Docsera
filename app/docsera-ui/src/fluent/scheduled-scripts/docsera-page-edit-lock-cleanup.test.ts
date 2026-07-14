import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

function readScheduledScriptContract() {
  const sourcePath = path.resolve(process.cwd(), "src/fluent/scheduled-scripts/docsera-page-edit-lock-cleanup.now.ts");
  const sourceText = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const contract = {
    advanced: false,
    frequency: "",
    usesDurationMinutes: false
  };

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "ScheduledScript" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const property of node.arguments[0].properties) {
        if (!ts.isPropertyAssignment(property)) {
          continue;
        }

        const propertyName = property.name.getText(sourceFile);
        if (propertyName === "advanced" && property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
          contract.advanced = true;
        }

        if (propertyName === "frequency" && ts.isStringLiteral(property.initializer)) {
          contract.frequency = property.initializer.text;
        }

        if (
          propertyName === "executionInterval" &&
          ts.isCallExpression(property.initializer) &&
          ts.isIdentifier(property.initializer.expression) &&
          property.initializer.expression.text === "Duration" &&
          property.initializer.arguments[0] &&
          ts.isObjectLiteralExpression(property.initializer.arguments[0])
        ) {
          contract.usesDurationMinutes = property.initializer.arguments[0].properties.some(
            (durationProperty) =>
              ts.isPropertyAssignment(durationProperty) &&
              durationProperty.name.getText(sourceFile) === "minutes" &&
              ts.isNumericLiteral(durationProperty.initializer) &&
              durationProperty.initializer.text === "1"
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return contract;
}

describe("docsera page edit lock cleanup schedule contract", () => {
  it("uses the SDK duration-based one-minute periodic schedule", () => {
    expect(readScheduledScriptContract()).toEqual({
      advanced: true,
      frequency: "periodically",
      usesDurationMinutes: true
    });
  });
});
