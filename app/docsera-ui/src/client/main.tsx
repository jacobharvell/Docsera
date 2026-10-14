import runtimeShellCssText from "./styles/runtime-shell.css?inline";
import paperMonoVariableFont from "./assets/fonts/PaperMono[wght].woff2?inline";
import { initializeDocseraDiagnostics } from "./diagnostics";
import { mountDocseraApp } from "./bootstrap";
import { ensureRuntimeStylesheet } from "./runtimeStylesheet";
import { prepareStandaloneRuntimeLaunch, renderStandaloneLaunchFailure } from "./runtimeLaunch";

const launch = prepareStandaloneRuntimeLaunch();

if (launch.kind === "continue") {
  initializeDocseraDiagnostics();
  ensureRuntimeStylesheet(runtimeShellCssText.replace("__DOCSERA_PAPER_MONO_VARIABLE_WOFF2__", paperMonoVariableFont));
  mountDocseraApp();
} else if (launch.kind === "failed") {
  renderStandaloneLaunchFailure(launch);
}
