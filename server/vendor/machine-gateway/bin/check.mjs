import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { schemas } from "../src/schemas.mjs";
import { sha256 } from "../src/util.mjs";
import { openapi } from "../src/contracts.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const dir of ["src", "bin"]) {
  for (const file of readdirSync(resolve(root, dir)).filter(f => f.endsWith(".mjs"))) {
    const check = spawnSync(process.execPath, ["--check", resolve(root, dir, file)], { encoding: "utf8" });
    if (check.status) throw new Error(`syntax check failed: ${file}`);
  }
}
if (JSON.stringify(JSON.parse(readFileSync(resolve(root, "schemas/contracts.json"), "utf8"))) !== JSON.stringify(schemas)) throw new Error("schema export drift");
if (JSON.stringify(JSON.parse(readFileSync(resolve(root, "openapi.json"), "utf8"))) !== JSON.stringify(openapi())) throw new Error("OpenAPI drift");
for (const file of JSON.parse(readFileSync(resolve(root, "SOURCE.json"), "utf8")).vendor.files) {
  if (sha256(readFileSync(resolve(root, file.path))) !== file.sha256) throw new Error(`vendor source drift: ${file.path}`);
}
console.log("Syntax, exported schemas and pinned source checked");
