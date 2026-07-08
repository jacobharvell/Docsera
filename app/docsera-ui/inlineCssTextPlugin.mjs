export function inlineCssTextPlugin({ fs, path }) {
  const prefix = "\0inline-css-text:";

  return {
    name: "inline-css-text",
    resolveId(source, importer) {
      if (!source.endsWith(".css?inline")) {
        return null;
      }

      const sourcePath = source.slice(0, -"?inline".length);

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

      const cssPath = id.slice(prefix.length);

      if (!fs.existsSync(cssPath)) {
        throw new Error(`Inline CSS source is missing: ${cssPath}`);
      }

      const cssText = fs.readFileSync(cssPath, "utf8");
      return `export default ${JSON.stringify(cssText)};`;
    }
  };
}
