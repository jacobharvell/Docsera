import { servicenowFrontEndPlugins, rollup, glob } from "@servicenow/isomorphic-rollup";
import { inlineCssTextPlugin } from "./inlineCssTextPlugin.mjs";
import { serviceNowSafeMarkupOutputPlugin } from "./serviceNowSafeMarkupPlugin.mjs";

export default async ({ rootDir, config, fs, path, logger, registerExplicitId }) => {
  const registerNormalizedExplicitId = (table, key, guidOverride) => {
    const normalizedKey = typeof key === "string" ? key.replace(/\\/g, "/") : key;
    return registerExplicitId(table, normalizedKey, guidOverride);
  };
  const normalizeAssetQueryPaths = (rollupOutput, staticContentDir) => {
    const collapsedAssetPaths = rollupOutput.output
      .filter((file) => file.type === "asset" && file.fileName.includes("\\"))
      .map((file) => ({
        collapsed: file.fileName.replace(/\\/g, ""),
        normalized: file.fileName.replace(/\\/g, "/")
      }))
      .filter(({ collapsed, normalized }) => collapsed !== normalized);

    if (!collapsedAssetPaths.length) {
      return;
    }

    rollupOutput.output
      .filter((file) => file.type === "chunk")
      .forEach((file) => {
        const chunkPath = path.join(staticContentDir, file.fileName);
        const chunkSource = fs.readFileSync(chunkPath, "utf8");
        let normalizedChunkSource = chunkSource;

        for (const { collapsed, normalized } of collapsedAssetPaths) {
          normalizedChunkSource = normalizedChunkSource.replaceAll(
            `path=${collapsed}`,
            `path=${normalized}`
          );
        }

        if (normalizedChunkSource !== chunkSource) {
          fs.writeFileSync(chunkPath, normalizedChunkSource, "utf8");
        }
      });
  };
  const clientDir = path.join(rootDir, config.clientDir);
  const htmlFiles = await glob(path.join("**", "*.html"), { cwd: clientDir, fs });

  if (!htmlFiles.length) {
    logger.warn(`No HTML files found in ${clientDir}, skipping UI build.`);
    return;
  }

  const staticContentDir = path.join(rootDir, config.staticContentDir);
  fs.rmSync(staticContentDir, { recursive: true, force: true });

  const rollupBundle = await rollup({
    fs,
    input: path.join(clientDir, "**", "*.html"),
    plugins: [
      inlineCssTextPlugin({ fs, path }),
      servicenowFrontEndPlugins({
        scope: config.scope,
        rootDir: clientDir,
        registerExplicitId: registerNormalizedExplicitId
      })
    ]
  });

  const rollupOutput = await rollupBundle.write({
    dir: staticContentDir,
    plugins: [serviceNowSafeMarkupOutputPlugin()],
    sourcemap: true
  });

  normalizeAssetQueryPaths(rollupOutput, staticContentDir);

  rollupOutput.output.forEach((file) => {
    if (file.type === "asset") {
      logger.info(`Bundled asset: ${file.fileName} (${file.source.length} bytes)`);
      return;
    }

    logger.info(`Bundled chunk: ${file.fileName} (${file.code.length} bytes)`);
  });
};
