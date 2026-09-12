import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import pin from "../PIN.json" with { type: "json" };

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PKG_ROOT = join(HERE, "..");

export function incomplete(message) {
  const err = new Error(message);
  err.code = "engine-incomplete";
  return err;
}

function git(args, cwd) {
  return spawnSync("git", args, { encoding: "utf8", cwd, timeout: 120_000 });
}

function gitBytes(args, cwd) {
  return spawnSync("git", args, {
    encoding: "buffer",
    cwd,
    timeout: 120_000,
    maxBuffer: 12 * 1024 * 1024,
  });
}

function sdsRoot() {
  const r = git(["rev-parse", "--show-toplevel"], PKG_ROOT);
  if (r.status !== 0) {
    throw incomplete(`git repo required: ${(r.stderr || r.stdout || "").trim()}`);
  }
  return r.stdout.trim();
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fetchSha(cwd, remote, sha, label) {
  const waits = [0, 4000, 8000, 16000, 32000];
  let lastErr = "";
  for (const ms of waits) {
    if (ms) spawnSync("sleep", [String(ms / 1000)], { encoding: "utf8" });
    const r = git(["fetch", "--depth", "1", remote, sha], cwd);
    if (r.status === 0) return;
    lastErr = (r.stderr || r.stdout || "").trim();
  }
  throw incomplete(`${label} fetch ${sha} failed: ${lastErr}`);
}

function headIs(dir, sha) {
  const head = git(["rev-parse", "HEAD"], dir);
  return head.status === 0 && head.stdout.trim() === sha;
}

function cloneDetached(url, sha, dest) {
  if (headIs(dest, sha) && existsSync(join(dest, ".git"))) return dest;
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const init = git(["init"], dest);
  if (init.status !== 0) throw incomplete(`git init ${dest} failed: ${(init.stderr || "").trim()}`);
  const remote = git(["remote", "add", "origin", url], dest);
  if (remote.status !== 0) {
    throw incomplete(`git remote add failed: ${(remote.stderr || remote.stdout || "").trim()}`);
  }
  fetchSha(dest, "origin", sha, url);
  const co = git(["checkout", "--detach", "FETCH_HEAD"], dest);
  if (co.status !== 0) throw incomplete(`checkout ${sha} failed: ${(co.stderr || co.stdout || "").trim()}`);
  if (!headIs(dest, sha)) throw incomplete(`${dest} HEAD is not ${sha}`);
  return dest;
}

function ensureMerchantRoot() {
  if (process.env.MERCHANT_LOCKFILE_PIN_DELTA_ROOT) {
    const root = process.env.MERCHANT_LOCKFILE_PIN_DELTA_ROOT;
    if (!existsSync(join(root, pin.merchant.cli))) {
      throw incomplete(`merchant CLI missing at ${join(root, pin.merchant.cli)}`);
    }
    return root;
  }
  const candidates = [
    join(tmpdir(), "w5-m07-final-ro/merchant-ca382052"),
    join(tmpdir(), `w5-m07-final-merchant-${pin.merchant.sha.slice(0, 12)}`),
  ];
  for (const c of candidates) {
    const root = join(c, pin.merchant.ownedPath);
    if (existsSync(join(root, pin.merchant.cli)) && headIs(c, pin.merchant.sha)) return root;
  }
  const dest = candidates[1];
  cloneDetached(`https://github.com/${pin.merchant.repo}.git`, pin.merchant.sha, dest);
  const root = join(dest, pin.merchant.ownedPath);
  if (!existsSync(join(root, pin.merchant.cli))) {
    throw incomplete(`merchant CLI missing after fetch at ${join(root, pin.merchant.cli)}`);
  }
  return root;
}

function extractKitFromTarball(tarPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const kitRoot = join(destDir, "useful-jobs-1.2.0");
  const kitBin = join(kitRoot, "bin/useful-jobs.mjs");
  if (existsSync(kitBin)) return kitRoot;
  const hex = sha256File(tarPath);
  if (hex !== pin.publicKit.sha256) {
    throw incomplete(`kit tarball sha256 ${hex} is not ${pin.publicKit.sha256}`);
  }
  const st = spawnSync("tar", ["-xzf", tarPath, "-C", destDir], { encoding: "utf8", timeout: 60_000 });
  if (st.status !== 0) throw incomplete(`tar extract failed: ${(st.stderr || st.stdout || "").trim()}`);
  if (!existsSync(kitBin)) throw incomplete(`kit CLI missing at ${kitBin} after extract`);
  return kitRoot;
}

function ensureKitRoot() {
  if (process.env.USEFUL_JOBS_KIT_ROOT) {
    const root = process.env.USEFUL_JOBS_KIT_ROOT;
    if (!existsSync(join(root, "bin/useful-jobs.mjs"))) {
      throw incomplete(`kit CLI missing at ${join(root, "bin/useful-jobs.mjs")}`);
    }
    return root;
  }
  const cachedRoots = [
    join(tmpdir(), "w5-m07-final-ro/kit-1.2.0/useful-jobs-1.2.0"),
    join(tmpdir(), "w5-m07-final-kit-1.2.0/useful-jobs-1.2.0"),
  ];
  for (const c of cachedRoots) {
    if (existsSync(join(c, "bin/useful-jobs.mjs"))) return c;
  }
  const extractDir = join(tmpdir(), "w5-m07-final-kit-1.2.0");
  const tarCached = join(
    tmpdir(),
    "w5-m07-final-ro/pub-9ae0febd/client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz",
  );
  if (existsSync(tarCached)) return extractKitFromTarball(tarCached, extractDir);

  const repo = sdsRoot();
  const have = git(["cat-file", "-t", pin.publicKit.sha], repo);
  if (have.status !== 0 || String(have.stdout).trim() !== "commit") {
    fetchSha(repo, "origin", pin.publicKit.sha, "samedaydesk");
  }
  const tarPath = join(extractDir, "useful-jobs-1.2.0.tar.gz");
  mkdirSync(extractDir, { recursive: true });
  const shown = gitBytes(["show", `${pin.publicKit.sha}:${pin.publicKit.archive}`], repo);
  if (shown.status !== 0) {
    throw incomplete(`git show kit tarball failed: ${String(shown.stderr || "").slice(0, 400)}`);
  }
  writeFileSync(tarPath, shown.stdout);
  return extractKitFromTarball(tarPath, extractDir);
}

export function assertKernelBytes(engineRoot, label) {
  for (const [rel, expected] of Object.entries(pin.kernelSha256)) {
    const filePath = join(engineRoot, rel);
    if (!existsSync(filePath)) throw incomplete(`${label} missing ${rel} at ${filePath}`);
    const hex = sha256File(filePath);
    if (hex !== expected) {
      throw incomplete(`${label} ${rel} sha256 ${hex} is not shipped kernel ${expected}`);
    }
  }
}

export function ensureShippedEngines() {
  const merchantRoot = ensureMerchantRoot();
  const kitRoot = ensureKitRoot();
  assertKernelBytes(merchantRoot, "merchant");
  assertKernelBytes(join(kitRoot, pin.publicKit.enginePath), "kit");
  return {
    merchantRoot,
    kitRoot,
    merchantBin: join(merchantRoot, pin.merchant.cli),
    kitBin: join(kitRoot, "bin/useful-jobs.mjs"),
    pin,
  };
}

export { pin };
