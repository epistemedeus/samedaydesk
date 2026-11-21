// Release scripts execute outside Vite's TypeScript lint scope.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../client/package.json", import.meta.url));
const { ESLint } = require("eslint");
const globals = require("globals");
const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [{ files: ["scripts/release/*.mjs"],
  languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { "no-undef": "error" } }] });
const results = await lint.lintFiles(["scripts/release/*.mjs"]);
const format = await lint.loadFormatter("stylish");
const output = format.format(results);
if (output) console.log(output);
if (results.some(result => result.errorCount)) process.exitCode = 1;
