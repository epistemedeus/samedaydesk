import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import {
  ERROR_CODES,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_REL,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_ROOT_NAME,
} from "./pins.mjs";
import { sha256Bytes } from "./hash-terms.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function cachedArchivePath(dest = cacheRoot()) {
  return join(dest, "useful-jobs-1.0.0.tar.gz");
}

export function verifyArchiveBuffer(buf) {
  if (!Buffer.isBuffer(buf) && !ArrayBuffer.isView(buf)) {
    throw Object.assign(new Error("archive buffer required"), { code: ERROR_CODES.ARCHIVE_PIN_MISMATCH });
  }
  const bytes = buf.length;
  const digest = sha256Bytes(buf);
  if (bytes !== USEFUL_JOBS_ARCHIVE_BYTES || digest !== USEFUL_JOBS_ARCHIVE_SHA256) {
    const err = new Error(
      `useful-jobs archive pin mismatch size ${bytes} sha256 ${digest}`,
    );
    err.code = ERROR_CODES.ARCHIVE_PIN_MISMATCH;
    err.bytes = bytes;
    err.sha256 = digest;
    throw err;
  }
  return { bytes, sha256: digest };
}

export async function fetchArchiveHttp(origin, archivePath = `/${USEFUL_JOBS_ARCHIVE_REL}`) {
  const url = `${String(origin).replace(/\/$/, "")}${archivePath.startsWith("/") ? archivePath : `/${archivePath}`}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`archive HTTP ${res.status}`);
    err.code = ERROR_CODES.ARCHIVE_PIN_MISMATCH;
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const pin = verifyArchiveBuffer(buf);
  return { ...pin, buf, url, via: "local-http" };
}

export function readArchiveFile(archivePath = USEFUL_JOBS_ARCHIVE_PATH) {
  const buf = readFileSync(archivePath);
  const pin = verifyArchiveBuffer(buf);
  return { ...pin, buf, path: archivePath, via: "local-file" };
}

export function cacheRoot(sha = USEFUL_JOBS_ARCHIVE_SHA256) {
  return join(tmpdir(), `sds-buyer-value-ledger-${sha.slice(0, 16)}`);
}

export function kitPath(root = cacheRoot()) {
  return join(root, USEFUL_JOBS_ROOT_NAME);
}

function cliFingerprint(kit) {
  const cli = join(kit, USEFUL_JOBS_CLI);
  const buf = readFileSync(cli);
  return { cliSha256: sha256Bytes(buf), cliBytes: buf.length };
}

function writeReady(dest, kit, kitSource) {
  const payload = {
    sha256: USEFUL_JOBS_ARCHIVE_SHA256,
    bytes: USEFUL_JOBS_ARCHIVE_BYTES,
    kitSource: kitSource || "local-file",
    ...cliFingerprint(kit),
  };
  writeFileSync(join(dest, ".ready"), `${JSON.stringify(payload)}\n`);
  return payload;
}

function readReady(dest) {
  try {
    const raw = readFileSync(join(dest, ".ready"), "utf8").trim();
    if (raw.startsWith("{")) return JSON.parse(raw);
    return { sha256: raw, legacy: true };
  } catch {
    return null;
  }
}

export function cacheIsTrusted(dest = cacheRoot(), kit = kitPath(dest)) {
  const tgz = cachedArchivePath(dest);
  const cli = join(kit, USEFUL_JOBS_CLI);
  if (!existsSync(join(dest, ".ready")) || !existsSync(cli) || !existsSync(tgz)) {
    return false;
  }
  try {
    verifyArchiveBuffer(readFileSync(tgz));
  } catch {
    return false;
  }
  const ready = readReady(dest);
  if (!ready || ready.legacy || !ready.cliSha256) return false;
  if (ready.sha256 !== USEFUL_JOBS_ARCHIVE_SHA256) return false;
  const { cliSha256 } = cliFingerprint(kit);
  if (cliSha256 !== ready.cliSha256) return false;
  return true;
}

function requestedArchive({ archivePath, buffer, kitSource }) {
  if (buffer) {
    const pin = verifyArchiveBuffer(buffer);
    return { ...pin, buf: buffer, via: kitSource || "local-http" };
  }
  return readArchiveFile(archivePath || USEFUL_JOBS_ARCHIVE_PATH);
}

/**
 * Extract the committed public useful-jobs archive. Reuses engines; does not
 * reimplement jobs. Requested archive bytes are verified before any cache hit.
 */
export function ensureUsefulJobsKit({
  archivePath = USEFUL_JOBS_ARCHIVE_PATH,
  buffer = null,
  kitSource = null,
} = {}) {
  const fetched = requestedArchive({ archivePath, buffer, kitSource });
  const dest = cacheRoot();
  const kit = kitPath(dest);
  const ready = join(dest, ".ready");
  const cli = join(kit, USEFUL_JOBS_CLI);

  if (cacheIsTrusted(dest, kit)) {
    return {
      kit,
      kitSource: kitSource || readReady(dest)?.kitSource || "local-file",
      cached: true,
      kitVerified: true,
    };
  }

  mkdirSync(dest, { recursive: true });
  const lockPath = join(dest, ".extracting");
  let gotLock = false;
  for (let i = 0; i < 120; i += 1) {
    if (cacheIsTrusted(dest, kit)) {
      return {
        kit,
        kitSource: kitSource || readReady(dest)?.kitSource || "local-file",
        cached: true,
        kitVerified: true,
      };
    }
    try {
      mkdirSync(lockPath);
      gotLock = true;
      break;
    } catch {
      sleep(250);
    }
  }
  if (!gotLock) {
    if (cacheIsTrusted(dest, kit)) {
      return {
        kit,
        kitSource: kitSource || readReady(dest)?.kitSource || "local-file",
        cached: true,
        kitVerified: true,
      };
    }
    throw new Error("timeout waiting for useful-jobs archive extract");
  }

  try {
    rmSync(kit, { recursive: true, force: true });
    rmSync(ready, { force: true });
    const tgz = cachedArchivePath(dest);
    writeFileSync(tgz, fetched.buf);
    const tar = spawnSync("tar", ["-xzf", tgz, "-C", dest], { encoding: "utf8" });
    if (tar.status !== 0) {
      throw new Error(String(tar.stderr || "tar extract failed"));
    }
    if (!existsSync(cli)) {
      throw new Error("useful-jobs CLI missing after extract");
    }
    const source = kitSource || fetched.via || "local-file";
    writeReady(dest, kit, source);
    return { kit, kitSource: source, cached: false, kitVerified: true };
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function serveArchive(archivePath = USEFUL_JOBS_ARCHIVE_PATH) {
  const payload = readFileSync(archivePath);
  verifyArchiveBuffer(payload);
  const path = `/${USEFUL_JOBS_ARCHIVE_REL}`;
  const server = http.createServer((req, res) => {
    if (req.url !== path) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/gzip",
      "content-length": String(payload.length),
    });
    res.end(payload);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        path,
        port,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

export function serveBytes(payload, archivePath = `/${USEFUL_JOBS_ARCHIVE_REL}`) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const server = http.createServer((req, res) => {
    if (req.url !== archivePath) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/gzip",
      "content-length": String(buf.length),
    });
    res.end(buf);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        path: archivePath,
        port,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
