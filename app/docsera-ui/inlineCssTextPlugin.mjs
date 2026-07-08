export function inlineCssTextPlugin({ fs, path }) {
  const prefix = "\0inline-asset:";
  const supportedExtensions = new Set([".css", ".png"]);

  const getSourcePath = (source) => {
    if (!source.endsWith("?inline")) {
      return null;
    }

    const sourcePath = source.slice(0, -"?inline".length);
    const extension = path.extname(sourcePath).toLowerCase();
    if (!supportedExtensions.has(extension)) {
      return null;
    }

    return sourcePath;
  };

  return {
    name: "inline-css-text",
    resolveId(source, importer) {
      const sourcePath = getSourcePath(source);
      if (!sourcePath) {
        return null;
      }

      if (!importer) {
        return `${prefix}${sourcePath}`;
      }

      if (sourcePath.startsWith(".")) {
        return `${prefix}${path.resolve(path.dirname(importer), sourcePath)}`;
      }

      return null;
    },
    load(id) {
      if (!id.startsWith(prefix)) {
        return null;
      }

      const assetPath = id.slice(prefix.length);
      const extension = path.extname(assetPath).toLowerCase();

      if (!fs.existsSync(assetPath)) {
        throw new Error(`Inline asset source is missing: ${assetPath}`);
      }

      if (extension === ".css") {
        const cssText = fs.readFileSync(assetPath, "utf8");
        return `export default ${JSON.stringify(cssText)};`;
      }

      if (extension === ".png") {
        const pngBytes = fs.readFileSync(assetPath);
        const dataUri = `data:image/png;base64,${pngBytes.toString("base64")}`;
        return `export default ${JSON.stringify(dataUri)};`;
      }

      return null;
    }
  };
}
