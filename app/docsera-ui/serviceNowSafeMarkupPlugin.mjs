import MagicString from "magic-string";

export const rawReactScriptElementLiteral = "<script>\\x3c/script>";
export const serializedReactScriptElementLiteral = "<\\x73cript>\\x3c/script>";
export const bundledRawReactScriptElementLiteral = "<script><\\/script>";
export const bundledSerializedReactScriptElementLiteral = "<\\x73cript><\\/script>";

export function serializeServiceNowSafeMarkup(code) {
  const occurrences = code.split(rawReactScriptElementLiteral).length - 1;

  if (occurrences !== 1) {
    throw new Error(
      `Expected exactly one React DOM inert script literal, found ${occurrences}. Review the React DOM bundle before updating this transform.`
    );
  }

  return code.replace(rawReactScriptElementLiteral, serializedReactScriptElementLiteral);
}

export function serviceNowSafeMarkupOutputPlugin() {
  return {
    name: "docsera-service-now-safe-markup-output",
    renderChunk(code, chunk) {
      if (chunk.fileName !== "main.jsdbx") {
        return null;
      }

      const occurrences = code.split(bundledRawReactScriptElementLiteral).length - 1;
      if (occurrences !== 1) {
        throw new Error(
          `Expected exactly one rendered React DOM inert script literal, found ${occurrences}. Review the React DOM bundle before updating this transform.`
        );
      }

      const literalStart = code.indexOf(bundledRawReactScriptElementLiteral);
      const magicString = new MagicString(code);
      magicString.overwrite(
        literalStart,
        literalStart + bundledRawReactScriptElementLiteral.length,
        bundledSerializedReactScriptElementLiteral
      );

      return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true, includeContent: true, source: chunk.fileName })
      };
    }
  };
}
