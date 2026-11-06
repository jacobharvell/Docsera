import assert from "node:assert/strict";
import test from "node:test";
import {
  collectRetiredEditorSpikeAssetCleanup,
  deleteCallFor,
  retiredEditorSpikeAssets
} from "./verify-retired-editor-spike-assets.mjs";

test("targets exactly the two retired editor-spike UX Assets", () => {
  const source = `${deleteCallFor(retiredEditorSpikeAssets[0])}\n${deleteCallFor(retiredEditorSpikeAssets[1])}\n`;
  const result = collectRetiredEditorSpikeAssetCleanup({
    source
  });

  assert.deepEqual(retiredEditorSpikeAssets, [
    "c58dabe08ad142cca3f1909a68b0a713",
    "a03da8513bc94a398b3a3dafcca17dc8"
  ]);
  assert.deepEqual(result.deleteCalls, [true, true]);
  assert.deepEqual(result.scopedAssetDeletes, retiredEditorSpikeAssets);
});
