import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, "../../client/src/pages/Mcp.module.css"), "utf8");

const preRule = css.match(/\.jobPre\s*\{([^}]*)\}/)?.[1] ?? "";
const codeRule = css.match(/\.jobPre\s+code\s*\{([^}]*)\}/)?.[1] ?? "";
const inlineRule = css.match(/\.jobCopy code,\s*\.flow code\s*\{([^}]*)\}/)?.[1] ?? "";

assert.match(preRule, /overflow-x:\s*auto\s*;/);
assert.match(preRule, /white-space:\s*pre\s*;/);
assert.match(preRule, /overflow-wrap:\s*normal\s*;/);
assert.match(codeRule, /overflow-wrap:\s*normal\s*;/);
assert.match(inlineRule, /overflow-wrap:\s*anywhere\s*;/);

console.log("for-agents code overflow: horizontal scrolling preserved");
