import assert from "node:assert/strict";
import test from "node:test";
import {
  bundledRawReactScriptElementLiteral,
  bundledSerializedReactScriptElementLiteral,
  rawReactScriptElementLiteral,
  serializeServiceNowSafeMarkup,
  serializedReactScriptElementLiteral,
  serviceNowSafeMarkupOutputPlugin
} from "../serviceNowSafeMarkupPlugin.mjs";

test("serializes React DOM's inert script literal without changing its runtime value", () => {
  const originalExpression = `"${rawReactScriptElementLiteral}"`;
  const correctedExpression = `"${serializedReactScriptElementLiteral}"`;

  assert.equal(Function(`return ${originalExpression}`)(), Function(`return ${correctedExpression}`)());
  assert.equal(serializeServiceNowSafeMarkup(`innerHTML=${originalExpression}`), `innerHTML=${correctedExpression}`);
});

test("rejects a React DOM source that no longer has the expected unique literal", () => {
  assert.throws(() => serializeServiceNowSafeMarkup("const innerHTML = '';"), /Expected exactly one React DOM inert script literal/);
  assert.throws(
    () => serializeServiceNowSafeMarkup(`${rawReactScriptElementLiteral};${rawReactScriptElementLiteral}`),
    /Expected exactly one React DOM inert script literal/
  );
});

test("rewrites only main.jsdbx with a chained source map", () => {
  const plugin = serviceNowSafeMarkupOutputPlugin();
  const result = plugin.renderChunk(`prefix${bundledRawReactScriptElementLiteral}suffix`, { fileName: "main.jsdbx" });

  assert.equal(result.code, `prefix${bundledSerializedReactScriptElementLiteral}suffix`);
  assert.equal(result.map.version, 3);
  assert.ok(result.map.mappings.length > 0);
  assert.equal(plugin.renderChunk(bundledRawReactScriptElementLiteral, { fileName: "editor.jsdbx" }), null);
});
