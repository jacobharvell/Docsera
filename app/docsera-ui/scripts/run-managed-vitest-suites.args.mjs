export function parseManagedVitestSuiteArgs(argv) {
  const result = {
    forwarded: [],
    help: false,
    stateDir: undefined,
    suites: [],
    workers: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      result.forwarded.push(...argv.slice(index + 1));
      break;
    }

    if (arg === "-h" || arg === "--help") {
      result.help = true;
      continue;
    }

    if (arg.startsWith("--state-dir=")) {
      result.stateDir = arg.slice("--state-dir=".length);
      continue;
    }

    if (arg === "--state-dir") {
      result.stateDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--workers=")) {
      result.workers = arg.slice("--workers=".length);
      continue;
    }

    if (arg === "--workers") {
      result.workers = argv[index + 1];
      index += 1;
      continue;
    }

    result.suites.push(arg);
  }

  return result;
}
