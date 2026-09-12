import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { install, npm, pack, writeJson } from "../../../test/helpers/npm-oracle.mjs";

// Writes an independent npm receipt, never imports the lockfile delta parser.
// Usage: node generate.mjs <new-output-directory>
if (!process.argv[2]) throw new Error("a new output directory is required");
const out = path.resolve(process.argv[2]);
if (fs.existsSync(out)) throw new Error("output directory must not already exist");
fs.mkdirSync(out, { recursive: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-npm-generated-"));
try {
  const spec = pack(root);
  const receipt = { oracle: "npm ci actual filesystem readback", node: process.version,
    npm: npm(root, ["--version"]).trim(), network: "offline", scripts: false,
    omit: ["dev", "peer", "optional"], cases: [] };
  for (const version of [2, 3]) {
    for (const kind of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const { dir } = install(root, version, kind, { [kind]: { "oracle-pin": spec } }, { omit: receipt.omit });
      const label = path.basename(dir);
      fs.mkdirSync(path.join(out, label));
      for (const file of ["package.json", "package-lock.json"]) fs.copyFileSync(path.join(dir, file), path.join(out, label, file));
      receipt.cases.push({ fixture: label, lockfileVersion: version,
        installed: fs.existsSync(path.join(dir, "node_modules/oracle-pin/package.json")) });
    }
  }
  writeJson(path.join(out, "receipt.json"), receipt);
  fs.copyFileSync(path.join(root, "oracle-pin/package.json"), path.join(out, "tarball-package.json"));
  process.stdout.write(`${JSON.stringify({ cases: receipt.cases.length, npm: receipt.npm, out })}\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
