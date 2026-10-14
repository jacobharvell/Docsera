import { parseArgs } from "node:util";

export function parseRuntimeVerificationOptions(argv = []) {
  const parsedArgs = parseArgs({
    allowPositionals: false,
    options: {
      "auth-alias": { type: "string" },
      "instance-url": { type: "string" },
      "page-endpoint": { type: "string" },
      "ping-path": { type: "string" },
      browser: { type: "boolean" },
      "skip-browser": { type: "boolean" },
      help: { type: "boolean", short: "h" }
    },
    args: argv
  });

  return {
    browserProofEnabled:
      Boolean(parsedArgs.values.browser) && !Boolean(parsedArgs.values["skip-browser"]),
    help: Boolean(parsedArgs.values.help),
    values: parsedArgs.values
  };
}
