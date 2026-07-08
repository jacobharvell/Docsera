#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

fs.rmSync(path.join(appRoot, "dist"), { force: true, recursive: true });

console.log("Removed SDK build output.");
