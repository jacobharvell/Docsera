import { servicenowFrontEndPlugins, rollup, glob } from "@servicenow/isomorphic-rollup";

export default async ({ rootDir, config, fs, path, logger, registerExplicitId }) => {
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
    plugins: servicenowFrontEndPlugins({
      scope: config.scope,
      rootDir: clientDir,
      registerExplicitId
    })
  });

  const rollupOutput = await rollupBundle.write({
    dir: staticContentDir,
    sourcemap: true
  });

  rollupOutput.output.forEach((file) => {
    if (file.type === "asset") {
      logger.info(`Bundled asset: ${file.fileName} (${file.source.length} bytes)`);
      return;
    }

    logger.info(`Bundled chunk: ${file.fileName} (${file.code.length} bytes)`);
  });
};
