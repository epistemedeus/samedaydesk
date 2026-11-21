// Prove a discovery-log directory is private, writable, and still there after the probe is removed.
// The directory is the child discovery-log-v1 of the already enrolled FOUNDRY_PRIVATE_DIR.
// This command does not name an operator and does not read a secret.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { FILE_RE, absolutePrivatePath } from "./bounds.mjs";

export function prepareDiscoveryLogDir(dir) {
  if (!absolutePrivatePath(dir)) throw new Error("discovery_prepare_dir_refused");
  const parent = path.dirname(dir);
  let parentStat;
  try { parentStat = fs.lstatSync(parent); } catch { throw new Error("discovery_prepare_parent_missing"); }
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) throw new Error("discovery_prepare_parent_missing");
  let created = false;
  try {
    fs.lstatSync(dir);
  } catch (error) {
    if (error?.code !== "ENOENT") throw new Error("discovery_prepare_dir_refused");
    fs.mkdirSync(dir, { mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    created = true;
  }
  const dirStat = fs.lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory() || (dirStat.mode & 0o777) !== 0o700) {
    if (created) fs.rmdirSync(dir);
    throw new Error("discovery_prepare_mode_refused");
  }
  for (const name of fs.readdirSync(dir)) {
    if (!FILE_RE.test(name)) continue;
    const childStat = fs.lstatSync(path.join(dir, name));
    if (childStat.isSymbolicLink() || !childStat.isFile() || (childStat.mode & 0o777) !== 0o600) {
      throw new Error("discovery_prepare_mode_refused");
    }
  }
  const probe = path.join(dir, `.probe-${crypto.randomBytes(8).toString("hex")}`);
  const payload = Buffer.from("probe\n");
  try {
    fs.writeFileSync(probe, payload, { flag: "wx", mode: 0o600 });
    fs.chmodSync(probe, 0o600);
    const probeStat = fs.lstatSync(probe);
    if (probeStat.isSymbolicLink() || !probeStat.isFile() || (probeStat.mode & 0o777) !== 0o600) throw new Error("discovery_prepare_mode_refused");
    const back = fs.readFileSync(probe);
    if (!back.equals(payload)) throw new Error("discovery_prepare_probe_refused");
  } finally {
    try { fs.unlinkSync(probe); } catch { /* probe already removed */ }
  }
  if (!fs.existsSync(dir) || fs.existsSync(probe)) throw new Error("discovery_prepare_probe_refused");
  return {
    ok: true,
    schema: "samedaydesk.discovery-log.prepare.v1",
    directoryMode: "0700",
    fileMode: "0600",
    probe: "written-read-removed",
  };
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length || argv[index + 1].startsWith("--")) return "";
  return argv[index + 1];
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const receipt = prepareDiscoveryLogDir(flag(process.argv, "--dir"));
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    const code = /^discovery_prepare_/.test(error?.message || "") ? error.message : "discovery_prepare_refused";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
