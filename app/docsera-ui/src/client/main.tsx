import runtimeShellCssText from "./styles/runtime-shell.css?inline";
import { initializeDocseraDiagnostics } from "./diagnostics";
import { mountDocseraApp } from "./bootstrap";
import { ensureRuntimeStylesheet } from "./runtimeStylesheet";

initializeDocseraDiagnostics();
ensureRuntimeStylesheet(runtimeShellCssText);
mountDocseraApp();
