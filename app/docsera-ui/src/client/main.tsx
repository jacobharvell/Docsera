import runtimeShellCssText from "./styles/runtime-shell.css?inline";
import { mountDocseraApp } from "./bootstrap";
import { ensureRuntimeStylesheet } from "./runtimeStylesheet";

ensureRuntimeStylesheet(runtimeShellCssText);
mountDocseraApp();
