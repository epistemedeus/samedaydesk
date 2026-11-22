import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeReceiptSnapshot, qualifiedReceiptSnapshot } from "../server/lib/receipt-snapshot.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const deadlineMs = 27 * 60 * 1000;
const failure = (reason) => Object.assign(new Error(reason), { safeReason: reason });
const maxExportValueChars = 8192;
const maxExportBytes = 1024 * 1024;

function qualifiedPrivateExport(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxExportBytes) throw failure("invalid-private-export");
  let policy;
  try { policy = JSON.parse(bytes.toString("utf8")); } catch { throw failure("invalid-private-export"); }
  if (policy?.invalid !== 0 || !Array.isArray(policy.rows)) throw failure("invalid-private-export");
  return bytes;
}

// Preserve the original bytes. Root's broker encodes this buffer without wrapping.
export function gzipPrivateExport(bytes) {
  const compressed = gzipSync(qualifiedPrivateExport(bytes), { level: 9 });
  if (compressed.toString("base64").length > maxExportValueChars) throw failure("private-export-value-too-large");
  return compressed;
}

export function decodePrivateExport(env) {
  const plain = env.SDS_RECEIPTS_PRIVATE_EXPORT_BASE64;
  const compressed = env.SDS_RECEIPTS_PRIVATE_EXPORT_GZIP_BASE64;
  if ((plain !== undefined) === (compressed !== undefined)) throw failure("invalid-private-export");
  const encoded = plain ?? compressed;
  if (typeof encoded !== "string" || !encoded || encoded.length > maxExportValueChars) throw failure("invalid-private-export");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded) throw failure("invalid-private-export");
  try {
    return qualifiedPrivateExport(compressed === undefined ? bytes : gunzipSync(bytes, { maxOutputLength: maxExportBytes }));
  } catch { throw failure("invalid-private-export"); }
}

async function runBuilder({ env, signal }) {
  const child = spawn(process.execPath, [join(root, "scripts/build-receipts.mjs")], {
    cwd: root, env, signal, stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "", error;
  child.stderr?.on("data", (bytes) => { stderr = (stderr + bytes.toString()).slice(-8192); });
  child.on("error", (caught) => { error = caught.code; });
  return new Promise((resolve) => child.on("close", (code) => resolve({ code, stderr, error })));
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) {
    throw failure("private-directory-required");
  }
}

// One finite host invocation. The host secret never enters the builder's env.
// Only a complete, qualified candidate reaches the existing atomic publisher.
export async function refreshReceipts({ env = process.env, builder = runBuilder,
  timeoutMs = deadlineMs, signal } = {}) {
  const started = Date.now();
  const receipt = { event: "samedaydesk.receipts.refresh", ok: false, published: false };
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  signal?.addEventListener("abort", interrupt, { once: true });
  let temporary, lock, stage = "configuration", timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const target = env.SDS_RECEIPTS_REBUILD_PATH;
    if (!target || !isAbsolute(target) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > deadlineMs) {
      throw failure("invalid-rebuild-configuration");
    }
    stage = "policy";
    const bytes = decodePrivateExport(env);
    await privateDirectory(dirname(target));
    const current = await lstat(target).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (current && (!current.isFile() || current.uid !== process.getuid() || (current.mode & 0o777) !== 0o600)) {
      throw failure("private-snapshot-required");
    }
    const lockPath = join(dirname(target), ".rebuild.lock");
    try { await mkdir(lockPath, { mode: 0o700 }); } catch (error) {
      if (error.code === "EEXIST") throw failure("rebuild-already-running");
      throw error;
    }
    lock = lockPath;
    temporary = await mkdtemp(join(dirname(target), ".refresh-"));
    const policyPath = join(temporary, "private-export.json");
    const candidatePath = join(temporary, "candidate.json");
    await writeFile(policyPath, bytes, { mode: 0o600, flag: "wx" });
    stage = "build";
    if (signal?.aborted || controller.signal.aborted) throw failure(timedOut ? "deadline-exceeded" : "interrupted");
    const result = await builder({ signal: controller.signal, env: {
      BASE_RPC: "https://base-rpc.publicnode.com", BASE_HASH_RPC: "https://mainnet.base.org",
      RECEIPTS_RPC_INTERVAL_MS: "1000", RECEIPTS_PRIVATE_EXPORT: policyPath,
      SDS_RECEIPTS_SNAPSHOT_PATH: candidatePath,
    } });
    if (controller.signal.aborted) throw failure(timedOut ? "deadline-exceeded" : "interrupted");
    if (result.code !== 0 || result.error) {
      if (Number.isInteger(result.code)) receipt.builderExit = result.code;
      const http = result.stderr?.match(/RPC (eth_[A-Za-z]+): HTTP (\d{3})/);
      if (http) Object.assign(receipt, { rpcMethod: http[1], httpStatus: Number(http[2]) });
      const rpc = result.stderr?.match(/RPC (eth_[A-Za-z]+): code (-?\d+)/);
      if (rpc) Object.assign(receipt, { rpcMethod: rpc[1], rpcCode: Number(rpc[2]) });
      throw failure("builder-failed");
    }
    stage = "publish";
    const candidate = await readFile(candidatePath, "utf8");
    const { data } = qualifiedReceiptSnapshot(candidate);
    // Remove the decoded policy before publication; failures leave the old file.
    await rm(temporary, { recursive: true });
    temporary = undefined;
    if (controller.signal.aborted) throw failure(timedOut ? "deadline-exceeded" : "interrupted");
    await writeReceiptSnapshot(target, candidate);
    Object.assign(receipt, { ok: true, published: true, finalizedBlock: data.chainReadThroughBlock,
      paidCalls: data.classes.paidCalls, delivered: data.classes.delivered,
      snapshotSha256: createHash("sha256").update(candidate).digest("hex") });
  } catch (error) {
    Object.assign(receipt, { stage, reason: error.safeReason || `${stage}-failed` });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", interrupt);
    try {
      if (temporary) await rm(temporary, { recursive: true, force: true });
      if (lock) await rmdir(lock);
      receipt.cleanupComplete = true;
    } catch { receipt.cleanupComplete = false; }
    receipt.durationMs = Date.now() - started;
  }
  return receipt;
}

// Hostinger invokes through hbuilds/current; ESM resolves that directory symlink.
const entry = process.argv[1] && await realpath(process.argv[1]).catch(() => null);
if (entry && fileURLToPath(import.meta.url) === entry) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const receipt = await refreshReceipts({ signal: controller.signal });
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  console.log(JSON.stringify(receipt));
  if (!receipt.ok || !receipt.cleanupComplete) process.exitCode = 1;
}
