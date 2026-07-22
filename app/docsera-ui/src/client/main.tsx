import runtimeShellCssText from "./styles/runtime-shell.css?inline";
import { initializeDocseraDiagnostics } from "./diagnostics";
import { mountDocseraApp } from "./bootstrap";
import { ensureRuntimeStylesheet } from "./runtimeStylesheet";
import { prepareStandaloneRuntimeLaunch, renderStandaloneLaunchFailure } from "./runtimeLaunch";

const launch = prepareStandaloneRuntimeLaunch();

if (launch.kind === "continue") {
  initializeDocseraDiagnostics();
  ensureRuntimeStylesheet(runtimeShellCssText);
  mountDocseraApp();
} else if (launch.kind === "failed") {
  renderStandaloneLaunchFailure(launch);
}
