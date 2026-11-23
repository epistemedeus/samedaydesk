#!/usr/bin/env node
// node scripts/release/kit.mjs <check|sweep|visual|stripe|status|demand|path> [args]
//
// The site's launcher for the shared release kit (pilot repository, tools/release-kit). Each site keeps
// a copy of this file as scripts/release/kit.mjs and pins the kit in release/kit.json:
//   { "repository": "https://github.com/epistemedeus/pilot", "commit": "<40 hex>", "path": "tools/release-kit" }
// The pinned commit is fetched once into ~/.cache/pilot-release-kit/<commit> (that path only) and its
// browser tools are installed there on first use. RELEASE_KIT_DIR=<dir> runs a local kit instead.
// `path` prints the kit directory (for site scripts that load the kit's browser tools).
// On a Cursor VM the fetch goes through the VM's verified GitHub account: the host-wide URL rewrite
// carries an installation token that expires (RELEASE-EVIDENCE-TRANSPORT.md, Git credentials).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [command, ...rest] = process.argv.slice(2);
const files = { copy: "public-copy-check.mjs", check: "check.mjs", sweep: "sweep.mjs", visual: "visual.mjs", stripe: "stripe-matrix.mjs", status: "post-status.mjs", demand: "demand.mjs" };
if (!files[command] && command !== "path") {
  console.error(`usage: kit.mjs ${[...Object.keys(files), "path"].join("|")} [args]`);
  process.exit(2);
}
const pin = JSON.parse(readFileSync(join(root, "release/kit.json"), "utf8"));
if (!/^[0-9a-f]{40}$/.test(pin.commit)) throw new Error("release/kit.json must pin a full commit");
let dir = process.env.RELEASE_KIT_DIR;
if (!dir) {
  const cache = join(process.env.XDG_CACHE_HOME ?? join(os.homedir(), ".cache"), "pilot-release-kit", pin.commit);
  dir = join(cache, pin.path);
  if (!existsSync(join(dir, "check.mjs"))) {
    const partial = `${cache}.partial-${process.pid}`;
    rmSync(partial, { recursive: true, force: true });
    mkdirSync(partial, { recursive: true });
    const git = (...a) => execFileSync("git", a, { cwd: partial, stdio: ["ignore", "ignore", "inherit"] });
    git("init", "-q");
    git("remote", "add", "origin", pin.repository);
    const route = [join(os.homedir(), ".local/bin/cursor-native-git-route")].find(existsSync);
    if (route) execFileSync(route, ["bind", "--host-default", partial], { stdio: ["ignore", "ignore", "inherit"] });
    git("sparse-checkout", "set", pin.path);
    git("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", pin.commit);
    git("checkout", "-q", "FETCH_HEAD");
    rmSync(cache, { recursive: true, force: true });
    renameSync(partial, cache);
  }
}
if (!existsSync(join(dir, "node_modules", "puppeteer-core"))) {
  execFileSync("npm", ["ci", "--prefix", dir, "--ignore-scripts", "--no-audit", "--no-fund"], { stdio: ["ignore", "ignore", "inherit"] });
}
if (command === "path") { console.log(dir); process.exit(0); }
const run = spawnSync(process.execPath, [join(dir, files[command]), ...rest], {
  cwd: root, stdio: "inherit",
  env: { ...process.env, RELEASE_ROOT: root, RELEASE_KIT_COMMIT: process.env.RELEASE_KIT_DIR ? "local" : pin.commit },
});
process.exit(run.status ?? 1);
