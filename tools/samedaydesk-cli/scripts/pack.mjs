#!/usr/bin/env node
// Builds a self-contained package for a clean-directory install. In the
// repository the CLI imports the machine-gateway client by relative path. This
// script stages the package, copies that exact closure (client-io.mjs,
// util.mjs, errors.mjs) byte for byte under vendor/machine-gateway/, rewrites
// only the import specifiers, records sha256 for every copied file in
// vendor/machine-gateway/CLOSURE.json, then runs `npm pack` on the stage.
// Usage: node scripts/pack.mjs --out ABS_DIR [--stage-only]
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "../..");
const FROM = "../../../server/vendor/machine-gateway/";
const TO = "../vendor/machine-gateway/";
export const CLOSURE = Object.freeze(["bin/client-io.mjs", "src/util.mjs", "src/errors.mjs"]);

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function stage(target = mkdtempSync(join(tmpdir(), "samedaydesk-cli-stage-"))) {
  for (const part of ["package.json", "README.md", "bin", "src", "vendor", "generated"]) cpSync(join(root, part), join(target, part), { recursive: true });
  const files = [];
  for (const file of CLOSURE) {
    const source = join(repo, "server/vendor/machine-gateway", file);
    const bytes = readFileSync(source);
    mkdirSync(dirname(join(target, "vendor/machine-gateway", file)), { recursive: true });
    writeFileSync(join(target, "vendor/machine-gateway", file), bytes);
    files.push({ path: `vendor/machine-gateway/${file}`, sourcePath: `server/vendor/machine-gateway/${file}`, sha256: sha256(bytes) });
  }
  const rewritten = [];
  for (const name of readdirSync(join(target, "src"))) {
    const path = join(target, "src", name);
    const text = readFileSync(path, "utf8");
    if (!text.includes(FROM)) continue;
    writeFileSync(path, text.split(FROM).join(TO));
    rewritten.push(`src/${name}`);
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(join(target, "vendor/machine-gateway/CLOSURE.json"), `${JSON.stringify({ schema: "samedaydesk.cli.pack-closure.v1", cliVersion: pkg.version, files, rewrittenImports: rewritten.sort(), from: FROM, to: TO }, null, 2)}\n`);
  return { target, files, rewritten };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : null;
  if (!out || !isAbsolute(out)) { process.stderr.write(`${JSON.stringify({ schema: "samedaydesk.cli.diagnostic.v1", code: "absolute_out_required", exit: 1 })}\n`); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const staged = stage();
  let tarball = null;
  if (!args.includes("--stage-only")) {
    const name = execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", out], { cwd: staged.target, encoding: "utf8" }).trim().split("\n").at(-1);
    tarball = join(out, name);
  }
  const result = { schema: "samedaydesk.cli.pack.v1", ok: true, stage: staged.target, tarball, tarballSha256: tarball ? sha256(readFileSync(tarball)) : null, closure: staged.files, rewrittenImports: staged.rewritten };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
