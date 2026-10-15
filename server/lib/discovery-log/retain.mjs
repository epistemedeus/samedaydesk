// Delete only allowlisted daily discovery files older than an explicit retain-days value.
// There is no timer. The hosted route runs this once, after the caller says the records
// were received, and only for 30 days. The local file check below is a precondition for
// the host command, not export authentication.
// Fixture runs are not hosted retention proof.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FILE_RE, absolutePrivatePath, assertEnrolledAuthFile, shiftDate, validDate } from "./bounds.mjs";

export function retainDiscoveryLogs({ dir, retainDays, asOf, authFile, preauthorized = false }) {
  if (preauthorized) {
    if (authFile) throw new Error("discovery_export_unauthenticated");
  } else {
    assertEnrolledAuthFile(authFile);
  }
  if (!absolutePrivatePath(dir)) throw new Error("discovery_export_traversal");
  if (!Number.isInteger(retainDays) || retainDays < 1 || retainDays > 3650) throw new Error("discovery_retain_days_required");
  if (!validDate(asOf)) throw new Error("discovery_retain_days_required");
  let dirStat;
  try { dirStat = fs.lstatSync(dir); } catch { throw new Error("discovery_prepare_parent_missing"); }
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory() || (dirStat.mode & 0o777) !== 0o700) throw new Error("discovery_prepare_mode_refused");
  const root = fs.realpathSync(dir);
  const oldestKept = shiftDate(asOf, -retainDays);
  let removed = 0;
  for (const name of fs.readdirSync(root)) {
    const match = FILE_RE.exec(name);
    if (!match || !validDate(match[1]) || match[1] >= oldestKept) continue;
    const file = path.join(root, name);
    const fileStat = fs.lstatSync(file);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error("discovery_export_traversal");
    const resolved = fs.realpathSync(file);
    if (path.dirname(resolved) !== root || path.basename(resolved) !== name) throw new Error("discovery_export_traversal");
    fs.unlinkSync(file);
    removed += 1;
  }
  return { ok: true, schema: "samedaydesk.discovery-log.retain.v1", retainDays, removed };
}

function flags(argv) {
  const out = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z-]{1,32}$/.test(key || "") || value === undefined || value.startsWith("--") || Object.hasOwn(out, key)) {
      throw new Error("discovery_export_unauthenticated");
    }
    out[key] = value;
  }
  return out;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = flags(process.argv);
    const known = ["--dir", "--retain-days", "--auth-file"];
    if (args["--as-of"]) known.push("--as-of");
    if (Object.keys(args).some(key => !known.includes(key)) || known.filter(key => key !== "--as-of").some(key => !Object.hasOwn(args, key))) {
      throw new Error("discovery_export_unauthenticated");
    }
    const retainDays = /^[0-9]{1,4}$/.test(args["--retain-days"]) ? Number(args["--retain-days"]) : Number.NaN;
    const asOf = args["--as-of"] || new Date().toISOString().slice(0, 10);
    const receipt = retainDiscoveryLogs({ dir: args["--dir"], retainDays, asOf, authFile: args["--auth-file"] });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    const code = /^discovery_(export|retain|prepare)_/.test(error?.message || "") ? error.message : "discovery_retain_refused";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
